import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Use CommonJS require to import the module under test (genieService is CJS)
import { createRequire } from "module";
const require = createRequire(import.meta.url);

describe("genieService idempotency (integration)", () => {
  let genie;
  beforeEach(() => {
    process.env.GENIE_PERSISTENCE_ENABLED = "1";
    process.env.GENIE_PERSISTENCE_AWAIT = "1";
    // Clear require cache to ensure fresh module state and injections
    try {
      delete require.cache[require.resolve("../genieService")];
    } catch (e) {}
    genie = require("../genieService");
  });

  afterEach(() => {
    delete process.env.GENIE_PERSISTENCE_ENABLED;
    delete process.env.GENIE_PERSISTENCE_AWAIT;
    if (genie && genie._resetDbUtils) genie._resetDbUtils();
    if (genie && genie._resetSampleService) genie._resetSampleService();
  });

  it("process() short-circuits to persisted result and avoids quota consumption", async () => {
    // Reset quota tracker to a clean window
    const qt = require("../utils/quotaTracker");
    qt._forceRotateForTesting();

    // Inject a dbUtils that claims a persisted prompt/result
    genie._setDbUtils({
      async getPrompts() {
        return [
          {
            id: 42,
            prompt: "Persistent Test Prompt",
          },
        ];
      },
      async getAIResultById(promptId) {
        if (promptId === 42) {
          return {
            id: 9001,
            result: JSON.stringify({
              content: {
                pages: [
                  {
                    id: "p1",
                    title: "P1",
                    blocks: [{ type: "text", content: "a" }],
                  },
                  {
                    id: "p2",
                    title: "P2",
                    blocks: [{ type: "text", content: "b" }],
                  },
                ],
              },
              metadata: { model: "cached-1" },
            }),
          };
        }
        return null;
      },
    });

    const res = await genie.process({
      mode: "ebook",
      prompt: "Persistent Test Prompt",
      metadata: { pageCount: 4 },
    });
    expect(res).toBeTruthy();
    expect(res.out_envelope).toBeTruthy();
    expect(Array.isArray(res.out_envelope.pages)).toBe(true);
    expect(res.out_envelope.pages.length).toBe(2);

    const status = qt.getStatus();
    // Ensure no API calls were recorded and no reservations exist
    expect(status.callCount).toBe(0);
    expect(status.reservedCount).toBe(0);
  });

  it("generate() returns persisted data and does not invoke service", async () => {
    // Inject a dbUtils with persisted entry
    genie._setDbUtils({
      async getPrompts() {
        return [{ id: 55, prompt: "Retry Prompt" }];
      },
      async getAIResultById(promptId) {
        if (promptId === 55) {
          return {
            id: 77,
            result: JSON.stringify({
              content: { title: "Cached", body: "cached" },
              metadata: { model: "cached-1" },
            }),
          };
        }
        return null;
      },
    });

    // Inject a sampleService that will throw if ever called (ensures we don't fallthrough)
    genie._setSampleService({
      async generateFromPrompt() {
        throw new Error(
          "sampleService should not be called when cached result exists"
        );
      },
    });

    const res = await genie.generate("Retry Prompt");
    expect(res).toBeTruthy();
    expect(res.success).toBe(true);
    expect(res.data).toBeTruthy();
    expect(res.data.promptId).toBe(55);
    expect(res.data.resultId).toBe(77);
    expect(res.data.content).toBeTruthy();
    expect(res.data.content.title).toBe("Cached");
  });
});
