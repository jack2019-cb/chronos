/**
 * client/__tests__/export-integration.test.js
 *
 * Integration tests for the complete export flow:
 * - Generate ebook with canonical out_envelope response
 * - Export button triggers PDF download
 * - Canonical envelope is sent to /export endpoint
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { submitPrompt, exportToPdf } from "../src/lib/api";

describe("Export integration flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("complete flow: generate ebook → export to PDF", async () => {
    // Step 1: Generate ebook - server returns canonical out_envelope
    const generationResponse = {
      out_envelope: {
        pages: [
          {
            id: "p1",
            title: "Chapter 1",
            blocks: [{ type: "text", content: "Once upon a time..." }],
          },
          {
            id: "p2",
            title: "Chapter 2",
            blocks: [{ type: "text", content: "The adventure began..." }],
          },
        ],
        html: "<html><body><h1>Chapter 1</h1><p>Once upon a time...</p></body></html>",
        metadata: {
          title: "My Story",
          author: "Aether AI",
          theme: "light",
          pageCount: 2,
        },
        actions: {
          persist_prompt: true,
          generate_pdf: true,
          can_export: true,
        },
      },
    };

    // Mock the POST /prompt response
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(generationResponse),
    });

    // Step 1: Call submitPrompt (simulates generation request)
    const envelope = await submitPrompt("Write a short story");

    // Verify we got the canonical envelope back
    expect(envelope).toEqual(generationResponse.out_envelope);
    expect(Array.isArray(envelope.pages)).toBe(true);
    expect(envelope.pages.length).toBe(2);
    expect(envelope.metadata.title).toBe("My Story");

    // Step 2: Export to PDF - use the envelope directly
    global.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () =>
        Promise.resolve(new Blob(["PDF content"], { type: "application/pdf" })),
    });

    // Mock createElement for anchor
    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);

    // Step 2: Call exportToPdf with the envelope
    await exportToPdf(envelope);

    // Verify PDF export was called with canonical envelope
    const exportCallArgs = global.fetch.mock.calls[1];
    expect(exportCallArgs[0]).toContain("/export");
    expect(exportCallArgs[1].method).toBe("POST");

    const exportedBody = JSON.parse(exportCallArgs[1].body);
    expect(exportedBody).toEqual(envelope);
    expect(exportedBody.pages).toHaveLength(2);

    // Verify download was triggered
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockAnchor.download).toMatch(/\.pdf$/);
  });

  it("handles legacy response format transparently in full flow", async () => {
    // Legacy response format (old backend)
    const legacyResponse = {
      chapters: [
        {
          id: "p1",
          title: "Page 1",
          blocks: [{ type: "text", content: "Content" }],
        },
      ],
      html: "<html><body>Content</body></html>",
      metadata: { title: "Test Book" },
      actions: { can_export: true },
    };

    // Mock submitPrompt with legacy response
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(legacyResponse),
    });

    // Should transform legacy to canonical
    const envelope = await submitPrompt("Test");

    expect(envelope).toEqual({
      pages: legacyResponse.chapters,
      html: legacyResponse.html,
      metadata: legacyResponse.metadata,
      actions: legacyResponse.actions,
    });

    // Now export using the transformed envelope
    global.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["PDF"])),
    });

    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);

    await exportToPdf(envelope);

    // Verify export was called with canonical-shaped envelope
    const exportCall = global.fetch.mock.calls[1];
    const exportedBody = JSON.parse(exportCall[1].body);
    expect(exportedBody.pages).toEqual(legacyResponse.chapters);
  });

  it("validates pages array before export", async () => {
    const generationResponse = {
      out_envelope: {
        pages: [], // Empty pages!
        html: "<html></html>",
        metadata: { title: "Empty Book" },
        actions: {},
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(generationResponse),
    });

    const envelope = await submitPrompt("Test");

    // Now try to export with empty pages
    // Frontend should validate this before calling exportToPdf
    expect(envelope.pages).toHaveLength(0);

    // exportToPdf itself accepts empty arrays - UI validation happens before
    // But this demonstrates the validation point
  });

  it("handles server errors gracefully", async () => {
    // Generation fails
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "SERVER_ERROR" }),
    });

    await expect(submitPrompt("Test")).rejects.toMatchObject({
      type: "server",
      code: "SERVER_ERROR",
    });

    // Export not attempted
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("handles export endpoint errors gracefully", async () => {
    // Generation succeeds
    const envelope = {
      pages: [{ id: "p1" }],
      html: "<html></html>",
      metadata: {},
      actions: {},
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ out_envelope: envelope }),
    });

    await submitPrompt("Test");

    // Export fails
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
    });

    await expect(exportToPdf(envelope)).rejects.toThrow();
  });

  it("preserves all envelope data through flow", async () => {
    const complexEnvelope = {
      out_envelope: {
        pages: [
          {
            id: "p1",
            title: "Title Page",
            blocks: [
              { type: "heading", content: "My Book" },
              { type: "text", content: "A wonderful story" },
            ],
          },
          {
            id: "p2",
            title: "Chapter 1",
            blocks: [
              { type: "text", content: "Once upon a time..." },
              { type: "image", url: "img.jpg" },
            ],
          },
        ],
        html: "<html><body>Full HTML content with all chapters</body></html>",
        metadata: {
          title: "Complex Book",
          author: "Test Author",
          theme: "dark",
          pageCount: 2,
          wordCount: 5000,
          customField: "custom value",
        },
        actions: {
          persist_prompt: true,
          generate_pdf: true,
          can_export: true,
          can_override: true,
        },
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(complexEnvelope),
    });

    const envelope = await submitPrompt("Test");

    // Verify all data is preserved
    expect(envelope.pages).toHaveLength(2);
    expect(envelope.pages[0].blocks).toHaveLength(2);
    expect(envelope.pages[1].blocks).toHaveLength(2);
    expect(envelope.metadata.customField).toBe("custom value");
    expect(envelope.actions.can_override).toBe(true);
    expect(envelope.html).toContain("Full HTML content");

    // Now export with all data preserved
    global.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["PDF"])),
    });

    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);

    await exportToPdf(envelope);

    // Verify all data was sent to export endpoint
    const exportCall = global.fetch.mock.calls[1];
    const exported = JSON.parse(exportCall[1].body);
    expect(exported).toEqual(envelope);
    expect(exported.pages).toHaveLength(2);
    expect(exported.metadata.customField).toBe("custom value");
  });
});
