import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

const { handle } = require("../ebookService");
const aiServiceModule = require("../aiService");

describe("ebookService - legacy sequential path", () => {
  let mockAi;
  let origCreate;

  beforeEach(() => {
    mockAi = {
      generateContentWithRotation: vi.fn(),
      generateContent: vi.fn(),
    };

    // stub createAIService to return our mock
    origCreate = aiServiceModule.createAIService;
    aiServiceModule.createAIService = () => mockAi;
  });

  afterEach(() => {
    // restore
    aiServiceModule.createAIService = origCreate;
    vi.resetAllMocks();
  });

  test("generates pages and sets processingTimeMs", async () => {
    // Structure response
    mockAi.generateContentWithRotation.mockResolvedValueOnce({
      content: {
        body: JSON.stringify({
          title: "Test",
          chapters: 4,
          outline: [1, 2, 3, 4],
        }),
      },
    });

    // Chapter responses (one per chapter)
    mockAi.generateContent.mockResolvedValue({
      content: {
        body: JSON.stringify({ chapter: 1, title: "C", content: "txt" }),
      },
    });

    const payload = {
      prompt: "Write an ebook about testing",
      metadata: { pageCount: 4, strategy: "legacy" },
    };

    const res = await handle(payload, null);

    expect(res).toBeDefined();
    expect(res.pages).toBeDefined();
    expect(Array.isArray(res.pages)).toBe(true);
    expect(res.pages.length).toBeGreaterThanOrEqual(1);
    expect(res.metadata).toBeDefined();
    expect(typeof res.metadata.processingTimeMs).toBe("number");
    expect(res.metadata.processingTimeMs).toBeGreaterThan(0);
  });
});
