/**
 * NAT-CONT Test Suite with Mocked AI Service
 *
 * Tests for NAT-CONT_0 (Narrative Continuity Zero) implementation
 * Using Vitest mocks for AI service to avoid external API calls
 *
 * Test strategy:
 * - Unit tests for helper functions (isolated)
 * - Integration tests for main handler flow
 * - Edge case tests for small page counts
 * - Timing tests (<45s threshold)
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

const {
  generateChapterBatch,
  generateOpeningChapter,
  generateClosingChapter,
  tryParseChapterResponse,
  tryParseBatchResponse,
  handleNARRATIVE_CONT_0,
} = require("../ebookService");

// ============================================================================
// MOCK SETUP
// ============================================================================

/**
 * Create a mocked AI service for testing
 * Provides controlled responses without hitting real Gemini API
 */
function createMockAIService() {
  return {
    generateContentWithRotation: vi.fn(),
  };
}

/**
 * Helper to set up successful batch response mock
 */
function mockSuccessBatchResponse(chapters = 2) {
  const batchData = Array.from({ length: chapters }, (_, i) => ({
    chapter: i + 1,
    title: `Chapter ${i + 1}`,
    content: `Content for chapter ${
      i + 1
    }. This is test content for narrative continuity.`,
    summary: `Summary of chapter ${i + 1}`,
    image: {
      concept: `Visual concept for chapter ${i + 1}`,
      suggested_style: "contemporary",
      tone: "narrative",
    },
  }));

  return {
    content: {
      body: JSON.stringify(batchData),
    },
  };
}

/**
 * Helper to set up successful single chapter response mock
 */
function mockSuccessChapterResponse(chapterNum = 1) {
  const chapterData = {
    chapter: chapterNum,
    title: `Chapter ${chapterNum}`,
    content: `Content for chapter ${chapterNum}. This is test content establishing narrative.`,
    summary: `Summary of chapter ${chapterNum}`,
    image: {
      concept: `Visual concept for chapter ${chapterNum}`,
      suggested_style: "contemporary",
      tone: chapterNum === 1 ? "opening" : "conclusive",
    },
  };

  return {
    content: {
      body: JSON.stringify(chapterData),
    },
  };
}

/**
 * Helper to set up structure response mock
 */
function mockSuccessStructureResponse(chapterCount = 6) {
  const outline = Array.from({ length: chapterCount }, (_, i) => ({
    chapter: i + 1,
    title: `Chapter ${i + 1}`,
    estimated_topics: [`Topic ${i + 1}`],
  }));

  const structureData = {
    title: "Test Ebook Title",
    chapters: chapterCount,
    outline,
  };

  return {
    content: {
      body: JSON.stringify(structureData),
    },
  };
}

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe("NAT-CONT Helper Functions", () => {
  let mockAiSvc;

  beforeEach(() => {
    mockAiSvc = createMockAIService();
  });

  // --------
  // generateChapterBatch
  // --------

  describe("generateChapterBatch()", () => {
    test("generates batch of 2 chapters with context", async () => {
      // Create a batch mock that returns chapters 2 and 3
      const batchData = [
        {
          chapter: 2,
          title: "Chapter 2",
          content: "Content 2",
          summary: "Summary 2",
          image: {
            concept: "Concept 2",
            suggested_style: "contemporary",
            tone: "narrative",
          },
        },
        {
          chapter: 3,
          title: "Chapter 3",
          content: "Content 3",
          summary: "Summary 3",
          image: {
            concept: "Concept 3",
            suggested_style: "contemporary",
            tone: "narrative",
          },
        },
      ];
      mockAiSvc.generateContentWithRotation.mockResolvedValue({
        content: { body: JSON.stringify(batchData) },
      });

      const batchOutlines = [
        { chapter: 2, title: "Chapter 2", estimated_topics: ["Topic 2"] },
        { chapter: 3, title: "Chapter 3", estimated_topics: ["Topic 3"] },
      ];

      const result = await generateChapterBatch(
        mockAiSvc,
        "Test prompt",
        batchOutlines,
        "Chapter 1 summary here",
        2 // callIndex
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].chapter).toBe(2);
      expect(result[1].chapter).toBe(3);
    });

    test("includes previous chapter summary in prompt", async () => {
      mockAiSvc.generateContentWithRotation.mockResolvedValue(
        mockSuccessBatchResponse(2)
      );

      const batchOutlines = [
        { chapter: 2, title: "Chapter 2", estimated_topics: ["Topic 2"] },
        { chapter: 3, title: "Chapter 3", estimated_topics: ["Topic 3"] },
      ];
      const prevSummary = "Chapter 1 ended with a cliffhanger";

      await generateChapterBatch(
        mockAiSvc,
        "Test prompt",
        batchOutlines,
        prevSummary,
        2
      );

      // Verify prompt includes context
      const promptCall = mockAiSvc.generateContentWithRotation.mock.calls[0][0];
      expect(promptCall).toContain(prevSummary);
      expect(promptCall).toContain("Continue");
    });

    test("uses correct callIndex for quota routing", async () => {
      mockAiSvc.generateContentWithRotation.mockResolvedValue(
        mockSuccessBatchResponse(2)
      );

      const batchOutlines = [
        { chapter: 2, title: "Chapter 2", estimated_topics: ["Topic 2"] },
      ];

      await generateChapterBatch(
        mockAiSvc,
        "Test prompt",
        batchOutlines,
        "Previous summary",
        2 // Should be Flash (callIndex > 0)
      );

      const callIndex = mockAiSvc.generateContentWithRotation.mock.calls[0][1];
      expect(callIndex).toBe(2); // Flash model
    });

    test("handles JSON parsing failures gracefully", async () => {
      // Return non-JSON response
      mockAiSvc.generateContentWithRotation.mockResolvedValue({
        content: { body: "NOT JSON" },
      });

      const batchOutlines = [
        { chapter: 2, title: "Chapter 2", estimated_topics: ["Topic 2"] },
      ];

      const result = await generateChapterBatch(
        mockAiSvc,
        "Test prompt",
        batchOutlines,
        "Previous summary",
        2
      );

      // Should fallback to synthetic chapters
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].chapter).toBe(2);
    });
  });

  // --------
  // generateOpeningChapter
  // --------

  describe("generateOpeningChapter()", () => {
    test("generates chapter 1 using Pro model", async () => {
      mockAiSvc.generateContentWithRotation.mockResolvedValue(
        mockSuccessChapterResponse(1)
      );

      const structure = mockSuccessStructureResponse(6).content.body;
      const structureData = JSON.parse(structure);

      const result = await generateOpeningChapter(
        mockAiSvc,
        "Test prompt",
        structureData
      );

      expect(result.chapter).toBe(1);
      expect(result.title).toBeTruthy();
      expect(result.content).toBeTruthy();
      expect(result.summary).toBeTruthy();
    });

    test("uses callIndex=1 (Pro model)", async () => {
      mockAiSvc.generateContentWithRotation.mockResolvedValue(
        mockSuccessChapterResponse(1)
      );

      const structure = mockSuccessStructureResponse(6).content.body;
      const structureData = JSON.parse(structure);

      await generateOpeningChapter(mockAiSvc, "Test prompt", structureData);

      const callIndex = mockAiSvc.generateContentWithRotation.mock.calls[0][1];
      expect(callIndex).toBe(1); // Pro model
    });

    test("prompt includes narrative voice guidance", async () => {
      mockAiSvc.generateContentWithRotation.mockResolvedValue(
        mockSuccessChapterResponse(1)
      );

      const structure = mockSuccessStructureResponse(6).content.body;
      const structureData = JSON.parse(structure);

      await generateOpeningChapter(mockAiSvc, "Test prompt", structureData);

      const prompt = mockAiSvc.generateContentWithRotation.mock.calls[0][0];
      expect(prompt).toContain("narrative voice");
      expect(prompt).toContain("opening");
      expect(prompt).toContain("hook");
    });
  });

  // --------
  // generateClosingChapter
  // --------

  describe("generateClosingChapter()", () => {
    test("generates final chapter using Pro model", async () => {
      mockAiSvc.generateContentWithRotation.mockResolvedValue(
        mockSuccessChapterResponse(6)
      );

      const structure = mockSuccessStructureResponse(6).content.body;
      const structureData = JSON.parse(structure);

      const allChapters = Array.from({ length: 5 }, (_, i) => ({
        chapter: i + 1,
        summary: `Summary of chapter ${i + 1}`,
      }));

      const result = await generateClosingChapter(
        mockAiSvc,
        "Test prompt",
        structureData,
        allChapters
      );

      expect(result.chapter).toBe(6);
      expect(result.title).toBeTruthy();
      expect(result.content).toBeTruthy();
    });

    test("includes all previous chapter summaries in prompt", async () => {
      mockAiSvc.generateContentWithRotation.mockResolvedValue(
        mockSuccessChapterResponse(6)
      );

      const structure = mockSuccessStructureResponse(6).content.body;
      const structureData = JSON.parse(structure);

      const allChapters = [
        { chapter: 1, summary: "Opening chapter summary" },
        { chapter: 2, summary: "Second chapter summary" },
      ];

      await generateClosingChapter(
        mockAiSvc,
        "Test prompt",
        structureData,
        allChapters
      );

      const prompt = mockAiSvc.generateContentWithRotation.mock.calls[0][0];
      expect(prompt).toContain("Opening chapter summary");
      expect(prompt).toContain("Second chapter summary");
      expect(prompt.toLowerCase()).toContain("resolve");
      expect(prompt.toLowerCase()).toContain("closure");
    });
  });

  // --------
  // Parsing Helpers
  // --------

  describe("tryParseChapterResponse()", () => {
    test("parses valid JSON chapter", () => {
      const json = JSON.stringify({
        chapter: 1,
        title: "Test",
        content: "Content",
        summary: "Summary",
      });

      const result = tryParseChapterResponse(json);

      expect(result).toBeTruthy();
      expect(result.chapter).toBe(1);
      expect(result.title).toBe("Test");
    });

    test("extracts JSON from text with surrounding content", () => {
      const text = `Here is the chapter:
      
      {
        "chapter": 2,
        "title": "Chapter Two",
        "content": "Content here",
        "summary": "Summary"
      }
      
      End of response`;

      const result = tryParseChapterResponse(text);

      expect(result).toBeTruthy();
      expect(result.chapter).toBe(2);
    });

    test("returns null for non-JSON text", () => {
      const result = tryParseChapterResponse("This is not JSON at all");
      expect(result).toBeNull();
    });

    test("returns null for empty input", () => {
      const result = tryParseChapterResponse("");
      expect(result).toBeNull();
    });
  });

  describe("tryParseBatchResponse()", () => {
    test("parses valid JSON array", () => {
      const json = JSON.stringify([
        { chapter: 1, title: "Ch1", content: "Content", summary: "Sum" },
        { chapter: 2, title: "Ch2", content: "Content", summary: "Sum" },
      ]);

      const result = tryParseBatchResponse(json);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].chapter).toBe(1);
    });

    test("extracts JSON array from text with surrounding content", () => {
      const text = `Generated chapters:
      
      [
        {"chapter": 1, "title": "Ch1", "content": "C", "summary": "S"},
        {"chapter": 2, "title": "Ch2", "content": "C", "summary": "S"}
      ]
      
      End`;

      const result = tryParseBatchResponse(text);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    test("returns null for non-JSON text", () => {
      const result = tryParseBatchResponse("Not an array");
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// MAIN HANDLER TESTS
// ============================================================================

describe("handleNARRATIVE_CONT_0()", () => {
  let mockAiSvc;

  beforeEach(() => {
    mockAiSvc = createMockAIService();

    // Set up default mock responses for full flow
    mockAiSvc.generateContentWithRotation.mockImplementation(
      (prompt, callIndex) => {
        // Structure (callIndex 0)
        if (callIndex === 0) {
          return Promise.resolve(mockSuccessStructureResponse(6));
        }
        // Opening chapter (callIndex 1)
        if (callIndex === 1) {
          return Promise.resolve(mockSuccessChapterResponse(1));
        }
        // Batch chapters (callIndex 2+)
        if (callIndex >= 2 && callIndex < 100) {
          // Return 2-chapter batch
          return Promise.resolve(mockSuccessBatchResponse(2));
        }
        // Closing chapter (high callIndex)
        return Promise.resolve(mockSuccessChapterResponse(6));
      }
    );
  });

  test("generates complete ebook with structure, chapters, and composition", async () => {
    const payload = {
      prompt: "A story about adventure",
      metadata: {
        pageCount: 6,
        theme: "dark",
      },
    };

    const result = await handleNARRATIVE_CONT_0(payload, mockAiSvc);

    expect(result).toBeTruthy();
    expect(result.pages).toBeTruthy();
    expect(result.metadata).toBeTruthy();
    expect(result.html).toBeTruthy();
  });

  test("generates correct number of chapters", async () => {
    const payload = {
      prompt: "Test story",
      metadata: { pageCount: 6 },
    };

    const result = await handleNARRATIVE_CONT_0(payload, mockAiSvc);

    // Should have 6 chapters (Ch1 + 4 middle + Ch6)
    expect(result.pages.length).toBe(6);
  });

  test("processes in less than 45 seconds (timing threshold)", async () => {
    const payload = {
      prompt: "Test story",
      metadata: { pageCount: 6 },
    };

    const start = Date.now();
    await handleNARRATIVE_CONT_0(payload, mockAiSvc);
    const duration = (Date.now() - start) / 1000;

    expect(duration).toBeLessThan(45);
  });

  test("uses Pro model for structure (callIndex 0)", async () => {
    const payload = {
      prompt: "Test",
      metadata: { pageCount: 6 },
    };

    await handleNARRATIVE_CONT_0(payload, mockAiSvc);

    // First call should be structure with callIndex 0
    expect(mockAiSvc.generateContentWithRotation).toHaveBeenCalledWith(
      expect.stringContaining("structure"),
      0
    );
  });

  test("uses Pro model for opening chapter (callIndex 1)", async () => {
    const payload = {
      prompt: "Test",
      metadata: { pageCount: 6 },
    };

    await handleNARRATIVE_CONT_0(payload, mockAiSvc);

    // Second call should be opening chapter with callIndex 1 (Pro)
    const calls = mockAiSvc.generateContentWithRotation.mock.calls;
    const chapterCall = calls.find((c) => c[1] === 1);
    expect(chapterCall).toBeTruthy();
  });

  test("uses Flash model for middle batches (callIndex >= 2)", async () => {
    const payload = {
      prompt: "Test",
      metadata: { pageCount: 6 },
    };

    await handleNARRATIVE_CONT_0(payload, mockAiSvc);

    const calls = mockAiSvc.generateContentWithRotation.mock.calls;
    const flashCalls = calls.filter((c) => c[1] >= 2 && c[1] < 100);

    // Should have Flash batch calls
    expect(flashCalls.length).toBeGreaterThan(0);
  });

  test("includes metadata about execution", async () => {
    const payload = {
      prompt: "Test story",
      metadata: { pageCount: 6 },
    };

    const result = await handleNARRATIVE_CONT_0(payload, mockAiSvc);

    expect(result.metadata.model).toBe("nat-cont_0");
    expect(result.metadata.duration).toBeTruthy();
    expect(result.metadata.totalCalls).toBeTruthy();
    expect(result.metadata.totalChapters).toBeTruthy();
  });

  test("throws on invalid prompt", async () => {
    const payload = {
      prompt: "",
      metadata: { pageCount: 6 },
    };

    await expect(handleNARRATIVE_CONT_0(payload)).rejects.toThrow(
      /prompt is required/i
    );
  });

  test("throws on invalid pageCount", async () => {
    const payload = {
      prompt: "Test",
      metadata: { pageCount: 2 }, // Below minimum
    };

    await expect(handleNARRATIVE_CONT_0(payload)).rejects.toThrow(
      /pageCount must be between 3 and 20/i
    );
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe("NAT-CONT_0 Edge Cases", () => {
  let mockAiSvc;

  beforeEach(() => {
    mockAiSvc = createMockAIService();

    mockAiSvc.generateContentWithRotation.mockImplementation(
      (prompt, callIndex) => {
        // Return default response for all calls
        return Promise.resolve(mockSuccessChapterResponse(1));
      }
    );
  });

  test("handles pageCount=3 (three chapters, minimum)", async () => {
    mockAiSvc.generateContentWithRotation.mockResolvedValue(
      mockSuccessChapterResponse(1)
    );

    const payload = {
      prompt: "Test story",
      metadata: { pageCount: 3 },
    };

    const result = await handleNARRATIVE_CONT_0(payload, mockAiSvc);

    // Structure + Ch1 (Pro) + Ch2 (Flash) + Ch3 (Pro) = 4 calls
    expect(result.pages.length).toBe(3);

    // Verify no chapter appears twice
    const chapterNumbers = result.pages.map((p) => p.chapter);
    expect(new Set(chapterNumbers).size).toBe(chapterNumbers.length);
  });

  test("handles pageCount=4", async () => {
    mockAiSvc.generateContentWithRotation.mockResolvedValue(
      mockSuccessChapterResponse(1)
    );

    const payload = {
      prompt: "Test story",
      metadata: { pageCount: 4 },
    };

    const result = await handleNARRATIVE_CONT_0(payload, mockAiSvc);

    expect(result.pages.length).toBe(4);

    // Verify all chapters are unique
    const chapterNumbers = result.pages.map((p) => p.chapter);
    expect(new Set(chapterNumbers).size).toBe(chapterNumbers.length);
  });

  test("handles pageCount=5", async () => {
    mockAiSvc.generateContentWithRotation.mockResolvedValue(
      mockSuccessChapterResponse(1)
    );

    const payload = {
      prompt: "Test story",
      metadata: { pageCount: 5 },
    };

    const result = await handleNARRATIVE_CONT_0(payload, mockAiSvc);

    expect(result.pages.length).toBe(5);

    // No duplicates
    const chapterNumbers = result.pages.map((p) => p.chapter);
    expect(new Set(chapterNumbers).size).toBe(chapterNumbers.length);
  });

  test("loop boundary: final chapter not included in batches (6 chapters)", async () => {
    const capturedPrompts = [];
    mockAiSvc.generateContentWithRotation.mockImplementation(
      (prompt, callIndex) => {
        if (typeof prompt === "string") {
          capturedPrompts.push({ prompt, callIndex });
        }
        return Promise.resolve(mockSuccessChapterResponse(1));
      }
    );

    const payload = {
      prompt: "Test story",
      metadata: { pageCount: 6 },
    };

    await handleNARRATIVE_CONT_0(payload, mockAiSvc);

    // Find batch prompts (callIndex 2+, excluding final)
    const batchPrompts = capturedPrompts.filter(
      (c) => c.callIndex >= 2 && c.callIndex < 100
    );

    // Verify no batch mentions "chapter 6" (final chapter)
    batchPrompts.forEach(({ prompt }) => {
      expect(prompt).not.toContain("chapter 6");
    });
  });
});
