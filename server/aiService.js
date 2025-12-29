// Mock AI service used in tests and local development.
// Behavior:
// - If process.env.SIMULATE_AI_FAILURE is set ("1" or "true"), generateContent throws.
// - Otherwise it returns a deterministic mock response matching tests' expectations.
// - Phase 3: Enhanced with batch detection and chaos testing
class MockAIService {
  constructor(options = {}) {
    this.options = options;
    this.requestCount = 0;

    // Chaos testing configuration (via environment variables)
    this.batchFailureRate = parseFloat(
      process.env.MOCK_BATCH_FAILURE_RATE || "0.0"
    );
    this.rateLimitRate = parseFloat(process.env.MOCK_RATE_LIMIT_RATE || "0.0");
    this.timeoutRate = parseFloat(process.env.MOCK_TIMEOUT_RATE || "0.0");
    this.chaosEnabled =
      process.env.MOCK_CHAOS_ENABLED === "true" ||
      process.env.MOCK_CHAOS_ENABLED === "1";

    if (
      this.chaosEnabled &&
      (this.batchFailureRate > 0 ||
        this.rateLimitRate > 0 ||
        this.timeoutRate > 0)
    ) {
      console.log(
        `[MOCK] Chaos testing enabled: batch_failure=${this.batchFailureRate}, ` +
          `rate_limit=${this.rateLimitRate}, timeout=${this.timeoutRate}`
      );
    }
  }

  /**
   * Detect if prompt is a batch request by checking structure
   * @private
   */
  _isBatchRequest(prompt) {
    if (!prompt || typeof prompt !== "string") return false;
    // Extract the "Chapters to Generate" section specifically
    const match = prompt.match(
      /\*\*Chapters to Generate[^*]*\*\*(.+?)(?:\*\*|\n\n|$)/s
    );
    const chapterSection = match ? match[1] : prompt;
    // Count different chapter patterns in the chapters section
    const chapterMatches1 = (chapterSection.match(/Chapter \d+:/g) || [])
      .length;
    // JSON-like patterns: "chapter": 2
    const chapterMatches2 = (chapterSection.match(/"chapter"\s*:\s*\d+/g) || [])
      .length;
    // Array/object indicator such as "chapters": [ ... ]
    const chapterMatches3 = (chapterSection.match(/"chapters"\s*:\s*/g) || [])
      .length;

    const totalChapterMatches =
      chapterMatches1 + chapterMatches2 + chapterMatches3;

    return totalChapterMatches > 1 || prompt.includes("batch_request");
  }

  /**
   * Apply chaos testing - simulate failures for testing recovery
   * @private
   */
  _applyChaos() {
    if (!this.chaosEnabled) return null;

    const roll = Math.random();

    if (roll < this.rateLimitRate) {
      const error = new Error("Rate limit exceeded");
      error.status = 429;
      return error;
    }

    if (roll < this.rateLimitRate + this.timeoutRate) {
      return new Error("Request timeout");
    }

    // Batch-specific failures
    if (roll < this.rateLimitRate + this.timeoutRate + this.batchFailureRate) {
      return new Error("Batch processing failed");
    }

    return null;
  }

  /**
   * Generate mock batch response with multiple chapters
   * @private
   */
  _generateBatchResponse(prompt, chapterCount) {
    const chapters = [];

    // Extract chapter specs from prompt if possible
    const chapterPattern1 = /Chapter (\d+)[:\s]+([^,\n]+)/g;
    const chapterPattern2 = /"chapter"\s*:\s*(\d+)/g;
    let match;
    const extractedChapters = [];
    // First, try to extract "Chapter N: Title" patterns
    while ((match = chapterPattern1.exec(prompt)) !== null) {
      extractedChapters.push({
        number: parseInt(match[1]),
        title: match[2].trim(),
      });
    }
    // If not enough, also extract JSON-like "chapter": N patterns
    let match2;
    while ((match2 = chapterPattern2.exec(prompt)) !== null) {
      extractedChapters.push({
        number: parseInt(match2[1]),
        title: `Chapter ${match2[1]}: Mock Content`,
      });
    }

    // Remove duplicates by chapter number
    const seen = new Set();
    const uniqueChapters = extractedChapters.filter((ch) => {
      if (seen.has(ch.number)) return false;
      seen.add(ch.number);
      return true;
    });

    // Determine chapter count: use extracted, else fallback to argument
    const finalChapterCount = Math.max(chapterCount, uniqueChapters.length);

    for (let i = 0; i < finalChapterCount; i++) {
      const extracted = uniqueChapters[i] || {};
      const chapterNum = extracted.number || i + 1;
      const title = extracted.title || `Chapter ${chapterNum}: Mock Content`;

      chapters.push({
        chapter: chapterNum,
        title: title,
        summary: `Summary of ${title}`,
        content:
          `This is mock content for ${title}. ` +
          `It contains substantive narrative material with sufficient detail and length ` +
          `to pass validation requirements. The content demonstrates the progression ` +
          `of the narrative and character development throughout this chapter with ` +
          `realistic descriptive passages and dialogue.`,
        image: {
          concept: "Scene",
          style: "narrative",
          tone: "engaging",
        },
      });
    }

    return {
      chapters: chapters,
      metadata: {
        batchSize: finalChapterCount,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async generateContent(prompt) {
    this.requestCount++;

    const fail = String(process.env.SIMULATE_AI_FAILURE || "").toLowerCase();
    if (fail === "1" || fail === "true") {
      throw new Error("simulated-ai-failure");
    }

    // Apply chaos testing
    const chaosError = this._applyChaos();
    if (chaosError) {
      console.log(
        `[MOCK] Chaos: Simulating ${chaosError.message} (request #${this.requestCount})`
      );
      throw chaosError;
    }

    // Detect batch requests
    const isBatch = this._isBatchRequest(prompt);
    if (isBatch) {
      // Extract chapter count from the "Chapters to Generate" section
      const match = prompt.match(
        /\*\*Chapters to Generate[^*]*\*\*(.+?)(?:\*\*|\n\n|$)/s
      );
      const chapterSection = match ? match[1] : prompt;
      const chapterMatches = chapterSection.match(/Chapter \d+:/g) || [];
      const chapterCount = Math.max(1, chapterMatches.length);

      if (global.__DEBUG_BATCH__) {
        console.log(
          `[MOCK] Detected batch request with ${chapterCount} chapters`
        );
      }

      return {
        chapters: this._generateBatchResponse(prompt, chapterCount).chapters,
      };
    }

    // Individual chapter request
    const title =
      typeof prompt === "string" && prompt.length > 0
        ? `Mock: ${prompt.split(" ").slice(0, 5).join(" ")}`
        : "Mock Title";
    const body =
      `This is a mock response for prompt. ` +
      `The content contains substantive narrative material with sufficient detail and length ` +
      `to pass validation requirements. Mock chapters demonstrate proper structure with ` +
      `title, summary, content, and image information as expected by the batch processing pipeline.`;
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
