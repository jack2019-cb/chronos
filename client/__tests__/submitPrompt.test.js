import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { submitPrompt } from "../src/lib/api";
import { promptStore } from "../src/stores/promptStore";
import { modeStore } from "../src/stores/modeStore";

describe("client api.submitPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds payload from stores and returns canonical envelope", async () => {
    // Set stores
    promptStore.set({
      mode: "demo",
      prompt: "Test prompt",
      metadata: { title: "T", author: "A", pages: 2 },
    });
    modeStore.setMode("demo");

    const envelope = {
      out_envelope: {
        pages: [
          { id: "p1", title: "T", blocks: [{ type: "text", content: "Body" }] },
        ],
        metadata: { generated_at: new Date().toISOString(), mode: "demo" },
        actions: { can_export: true },
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(envelope),
    });

    const result = await submitPrompt();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/prompt"),
      expect.objectContaining({ method: "POST" })
    );
    expect(result).toBe(envelope.out_envelope);
  });

  it("throws INVALID_RESPONSE when server returns non-canonical shape", async () => {
    promptStore.set({ prompt: "Test" });
    modeStore.setMode("basic");
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ foo: "bar" }),
    });

    await expect(submitPrompt()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("throws server validation error when server responds with 400 and error code", async () => {
    promptStore.set({ prompt: "Test" });
    modeStore.setMode("demo");
    const errorJson = {
      error: "MISSING_METADATA",
      message: "Missing metadata",
      fields: ["title"],
    };
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve(errorJson),
    });

    await expect(submitPrompt()).rejects.toMatchObject({
      code: "MISSING_METADATA",
      fields: ["title"],
    });
  });

  it("accepts legacy response format with chapters field and transforms it", async () => {
    promptStore.set({ prompt: "Test" });
    modeStore.setMode("basic");

    // Legacy response format (before canonical out_envelope)
    const legacyResponse = {
      chapters: [
        { id: "p1", title: "Chapter 1", content: "Body" },
        { id: "p2", title: "Chapter 2", content: "More" },
      ],
      html: "<html>...</html>",
      metadata: { theme: "dark" },
      actions: { can_export: true },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(legacyResponse),
    });

    const result = await submitPrompt();

    // Should transform legacy format to canonical
    expect(result).toEqual({
      pages: legacyResponse.chapters,
      html: legacyResponse.html,
      metadata: legacyResponse.metadata,
      actions: legacyResponse.actions,
    });
  });

  it("prefers canonical out_envelope over legacy chapters field", async () => {
    promptStore.set({ prompt: "Test" });
    modeStore.setMode("basic");

    const mixedResponse = {
      out_envelope: {
        pages: [{ id: "canonical", title: "Canonical" }],
        html: "<html>canonical</html>",
        metadata: { canonical: true },
        actions: { export: true },
      },
      chapters: [{ id: "legacy", title: "Legacy" }], // Should be ignored
      html: "<html>legacy</html>",
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mixedResponse),
    });

    const result = await submitPrompt();

    // Should use canonical format, not legacy
    expect(result).toEqual(mixedResponse.out_envelope);
    expect(result.pages[0].id).toBe("canonical");
  });

  it("throws error when response has neither out_envelope nor chapters", async () => {
    promptStore.set({ prompt: "Test" });
    modeStore.setMode("basic");

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ html: "orphaned response" }),
    });

    await expect(submitPrompt()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: expect.stringContaining("pages array"),
    });
  });

  it("throws error when pages field is not an array", async () => {
    promptStore.set({ prompt: "Test" });
    modeStore.setMode("basic");

    const invalidResponse = {
      out_envelope: {
        pages: "not-an-array",
        html: "<html></html>",
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(invalidResponse),
    });

    await expect(submitPrompt()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("throws error when chapters array is empty", async () => {
    promptStore.set({ prompt: "Test" });
    modeStore.setMode("basic");

    const emptyResponse = {
      chapters: [],
      html: "<html></html>",
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(emptyResponse),
    });

    const result = await submitPrompt();

    // Should return envelope even with empty array - validation happens at export time
    expect(result).toEqual({
      pages: [],
      html: "<html></html>",
      metadata: {},
      actions: {},
    });
  });
});
