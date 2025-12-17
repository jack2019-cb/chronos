import { describe, it, expect, beforeEach, vi } from "vitest";

// We'll use doMock so the mock can be applied at runtime (non-hoisted)
describe("genieService.process() integration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("processes ebook mode and returns envelope with pages and metadata", async () => {
    // Mock aiService to control ebookService behavior
    vi.doMock("../aiService", () => ({
      createAIService: () => ({
        generateContent: async (p) => {
          const s = String(p || "");
          if (s.includes("Create a detailed structure")) {
            return {
              content: {
                body: JSON.stringify({
                  title: "Integration Title",
                  chapters: 2,
                  outline: [
                    { chapter: 1, title: "One", estimated_topics: ["a"] },
                    { chapter: 2, title: "Two", estimated_topics: ["b"] },
                  ],
                }),
              },
            };
          }
          if (s.includes("You are writing Chapter")) {
            const m = s.match(/Chapter (\d+)/);
            const n = (m && Number(m[1])) || 1;
            return {
              content: {
                body: JSON.stringify({
                  chapter: n,
                  title: `Title ${n}`,
                  content: `Content ${n}`,
                  summary: `Summary ${n}`,
                  image: {
                    concept: `Concept ${n}`,
                    suggested_style: "minimalist",
                    tone: "calm",
                  },
                }),
              },
            };
          }
          return { content: { body: "{}" } };
        },
      }),
    }));

    const mod = await import("../genieService.js");
    const genieService = mod.default || mod;

    const payload = {
      mode: "ebook",
      prompt: "Integration test prompt",
      metadata: {
        pageCount: 4,
        theme: "corporate",
        colorPalette: "muted",
        fontSizeScale: 1,
      },
    };
    const envelope = await genieService.process(payload);

    expect(envelope).toBeDefined();
    expect(envelope.out_envelope).toBeDefined();
    const out = envelope.out_envelope;
    expect(Array.isArray(out.pages)).toBe(true);
    // NAT-CONT_0: Structure + Opening + Middle (2 chapters batched) + Closing = 4 pages
    expect(out.pages.length).toBe(4);
    expect(out.metadata).toBeDefined();
    expect(out.metadata.mode).toBe("ebook");
    expect(out.metadata.generated_at).toBeDefined();
  });
});
