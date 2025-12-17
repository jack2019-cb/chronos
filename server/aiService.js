// Mock AI service used in tests and local development.
// Behavior:
// - If process.env.SIMULATE_AI_FAILURE is set ("1" or "true"), generateContent throws.
// - Otherwise it returns a deterministic mock response matching tests' expectations.
class MockAIService {
  async generateContent(prompt) {
    const fail = String(process.env.SIMULATE_AI_FAILURE || "").toLowerCase();
    if (fail === "1" || fail === "true") {
      throw new Error("simulated-ai-failure");
    }

    const title =
      typeof prompt === "string" && prompt.length > 0
        ? `Mock: ${prompt.split(" ").slice(0, 5).join(" ")}`
        : "Mock Title";
    const body = `This is a mock response for prompt: ${String(prompt)}.`;
    const layout = "poem-single-column";
    const metadata = {
      model: "mock-1",
      tokens: Math.max(10, Math.min(200, String(prompt || "").length)),
    };

    return {
      content: { title, body, layout },
      metadata,
    };
  }

  // Support NAT-CONT model rotation (generateContentWithRotation)
  // callIndex parameter used for quota routing in real service, ignored in mock
  // options.model can override default model selection for complex strategies
  async generateContentWithRotation(prompt, callIndex = 0, options = {}) {
    return this.generateContent(prompt);
  }
}

// Real AI service - thin wrapper around geminiClient.callGemini
class RealAIService {
  constructor(options = {}) {
    this.options = options;
    // lazy require to avoid pulling network libs during tests
    this._gemini = null;
  }

  _ensureGemini() {
    if (!this._gemini) {
      // require at runtime to keep test/CI import paths light
      try {
        this._gemini = require("./geminiClient");
      } catch (e) {
        throw new Error("geminiClient unavailable: " + e.message);
      }
    }
    return this._gemini;
  }

  async generateContent(prompt, callIndex = 0, options = {}) {
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("Prompt must be a non-empty string");
    }

    const callGemini = this._ensureGemini().callGemini;
    // Default to TEXT modality. generationConfig can be passed via env or options.
    const generationConfig = this.options.generationConfig || {};

    // Determine which model to use based on:
    // 1. Routing map (if provided via options.routingMap from orchestrator)
    // 2. Explicit model override (if provided via options.model)
    // 3. Default callIndex-based routing (NAT-CONT_0):
    //    - callIndex=0: structure generation (Pro)
    //    - callIndex>=1: chapter/opening/closing (Pro for odd indices, Flash for even)
    const routingMap = options.routingMap || {};
    const modelFromMap = routingMap[callIndex];
    const model =
      modelFromMap ||
      options.model ||
      (callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash");

    const resp = await callGemini({
      prompt: String(prompt),
      modality: "TEXT",
      generationConfig,
      callIndex,
      model,
    });

    if (!resp || resp.ok === false) {
      const errMsg = resp && resp.error ? resp.error : "Unknown Gemini error";
      const status = resp && resp.status ? resp.status : 0;
      const e = new Error(`Gemini call failed: ${errMsg}`);
      try {
        Object.defineProperty(e, "status", {
          value: status,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      } catch (err) {
        // ignore if unable to define property
      }
      throw e;
    }

    // Prefer parsed text candidate, fall back to rawText or JSON.stringify
    let text =
      resp.text || resp.rawText || (resp.json ? JSON.stringify(resp.json) : "");
    if (!text) text = String(resp.rawText || "");

    // Simple heuristics for title/body: first line as title, rest as body
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const title =
      lines.length > 0
        ? lines[0].slice(0, 200)
        : `Result for: ${String(prompt).slice(0, 50)}`;
    const body = lines.length > 1 ? lines.slice(1).join("\n\n") : text;
    const layout = "ai-generated";

    const metadata = {
      model: resp.json?.model || "gemini",
      status: resp.status,
    };

    return {
      content: { title, body, layout },
      metadata,
    };
  }

  /**
   * Generate content with model rotation for NAT-CONT_0 quota distribution
   * Single API key accesses both models to distribute quota:
   * - Structure call (index=0): Gemini 2.5 Pro (expert tier)
   * - Opening chapter (index=1): Gemini 2.5 Pro (expert tier)
   * - Chapter batches (index>=2): Gemini 2.5 Flash (standard tier)
   * - Closing chapter (index=pageCount): Gemini 2.5 Pro (expert tier)
   *
   * @param {string} prompt - The prompt text
   * @param {number} callIndex - Index of the call (semantic tier routing)
   * @param {Object} options - Optional overrides { routingMap, model }
   *   - routingMap: { callIndex: model } mapping from orchestrator
   *   - model: explicit model override for complex strategies
   * @returns {Promise<Object>} Generated content
   */
  async generateContentWithRotation(prompt, callIndex = 0, options = {}) {
    // Delegate to generateContent which handles all routing logic
    return this.generateContent(prompt, callIndex, options);
  }
}

function createAIService() {
  // Priority 1: Explicit force-mock for CI/testing (highest priority)
  const forceMock =
    process.env.FORCE_MOCK_AI === "1" || process.env.FORCE_MOCK_AI === "true";
  if (forceMock) {
    console.log("AI service: MockAIService enabled (FORCE_MOCK_AI=1)");
    return new MockAIService();
  }

  // Priority 2: Explicit enable real AI
  const useReal =
    process.env.USE_REAL_AI === "1" || process.env.USE_REAL_AI === "true";
  if (useReal) {
    // sanity check for required env vars
    const apiUrl =
      process.env.GEMINI_API_URL || process.env.GEMINI_API_URL_TEXT;
    const apiKey =
      process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_TEXT;
    if (!apiUrl || !apiKey) {
      console.warn(
        "USE_REAL_AI=true but GEMINI_API_URL or GEMINI_API_KEY not set. Falling back to MockAIService."
      );
      return new MockAIService();
    }
    console.log("AI service: RealAIService enabled (Gemini)");
    return new RealAIService();
  }

  // Priority 3: Default to mock (backward compatible)
  console.log("AI service: MockAIService enabled (USE_REAL_AI not set)");
  return new MockAIService();
}

module.exports = { MockAIService, RealAIService, createAIService };
