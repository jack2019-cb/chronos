import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { exportToPdf } from "../src/lib/api";
import Logger from "../src/lib/logger";

describe("client api.exportToPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Mock window.URL and document for PDF download
    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports canonical envelope with pages, metadata, and actions", async () => {
    const envelope = {
      pages: [
        {
          id: "p1",
          title: "Page 1",
          blocks: [{ type: "text", content: "Content" }],
        },
        {
          id: "p2",
          title: "Page 2",
          blocks: [{ type: "text", content: "More" }],
        },
      ],
      html: "<html><body>content</body></html>",
      metadata: {
        title: "Test Book",
        author: "Test Author",
        theme: "dark",
      },
      actions: {
        persist_prompt: true,
        generate_pdf: true,
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () =>
        Promise.resolve(new Blob(["PDF content"], { type: "application/pdf" })),
    });

    await exportToPdf(envelope);

    // Verify fetch was called with correct endpoint and body
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/export"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    // Verify the body contains the canonical envelope
    const callArgs = global.fetch.mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body).toEqual(envelope);
  });

  it("throws error when pages field is missing", async () => {
    const invalidEnvelope = {
      html: "<html></html>",
      metadata: { title: "Test" },
    };

    await expect(exportToPdf(invalidEnvelope)).rejects.toThrow(
      "Export content must be a canonical envelope with pages array"
    );
  });

  it("throws error when pages is not an array", async () => {
    const invalidEnvelope = {
      pages: { id: "p1" }, // Should be array
      html: "<html></html>",
    };

    await expect(exportToPdf(invalidEnvelope)).rejects.toThrow(
      "Export content must be a canonical envelope with pages array"
    );
  });

  it("throws error when content is null or undefined", async () => {
    await expect(exportToPdf(null)).rejects.toThrow(
      "Export content must be a canonical envelope with pages array"
    );

    await expect(exportToPdf(undefined)).rejects.toThrow(
      "Export content must be a canonical envelope with pages array"
    );
  });

  it("handles export with empty pages array", async () => {
    const envelope = {
      pages: [],
      html: "<html></html>",
      metadata: { title: "Empty" },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () =>
        Promise.resolve(new Blob(["PDF"], { type: "application/pdf" })),
    });

    // Should not throw - validation happens at UI level
    await exportToPdf(envelope);
    expect(global.fetch).toHaveBeenCalled();
  });

  it("triggers PDF download with proper filename", async () => {
    const envelope = {
      pages: [{ id: "p1", title: "Page" }],
      html: "<html></html>",
    };

    // Mock createElement for anchor element
    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);

    global.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () =>
        Promise.resolve(new Blob(["PDF"], { type: "application/pdf" })),
    });

    await exportToPdf(envelope);

    expect(mockAnchor.download).toMatch(/^AetherPress-Export-\d+\.pdf$/);
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it("revokes blob URL after download", async () => {
    const envelope = {
      pages: [{ id: "p1" }],
      html: "<html></html>",
    };

    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);

    global.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["PDF"])),
    });

    await exportToPdf(envelope);

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("throws error when export endpoint returns 400", async () => {
    const envelope = {
      pages: [{ id: "p1" }],
      html: "<html></html>",
    };

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
    });

    await expect(exportToPdf(envelope)).rejects.toThrow();
  });

  it("throws error when export endpoint returns 500", async () => {
    const envelope = {
      pages: [{ id: "p1" }],
      html: "<html></html>",
    };

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(exportToPdf(envelope)).rejects.toThrow();
  });

  it("logs export request and success", async () => {
    const envelope = {
      pages: [{ id: "p1" }],
      html: "<html></html>",
    };

    const debugSpy = vi.spyOn(Logger, "debug");
    const infoSpy = vi.spyOn(Logger, "info");

    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);

    global.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["PDF"])),
    });

    await exportToPdf(envelope);

    expect(debugSpy).toHaveBeenCalledWith(
      "Exporting to PDF",
      expect.objectContaining({
        contentKeys: expect.arrayContaining(["pages", "html"]),
      })
    );

    expect(infoSpy).toHaveBeenCalledWith("PDF exported successfully");
  });

  it("logs error on export failure", async () => {
    const envelope = {
      pages: [{ id: "p1" }],
      html: "<html></html>",
    };

    const errorSpy = vi.spyOn(Logger, "error");

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(exportToPdf(envelope)).rejects.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      "PDF export error",
      expect.any(Object)
    );
  });
});
