/**
 * server/__tests__/ebook-response-format.test.js
 *
 * Tests for export 400 fix:
 * - Backend response normalization with canonical out_envelope
 * - Backwards compatibility with legacy chapters field
 * - Export endpoint validation with canonical pages field
 */

const request = require("supertest");
const serverModule = require("../index");
const app = serverModule;
const genieService = require("../genieService");

// Mock genieService to return predictable envelope
jest.mock("../genieService", () => ({
  process: jest.fn(),
}));

beforeAll(async () => {
  try {
    await serverModule.startServer({ listen: false });
  } catch (e) {
    // startServer may fail if already initialized, continue anyway
  }
});

describe("POST /api/ebook/generate response format", () => {
  it("returns canonical out_envelope with pages field", async () => {
    // Mock genieService to return envelope with pages array
    const mockEnvelope = {
      pages: [
        {
          id: "p1",
          title: "Chapter 1",
          blocks: [{ type: "text", content: "Content" }],
        },
      ],
      html: "<html><body>Chapter 1 Content</body></html>",
      metadata: {
        title: "Test Book",
        generatedAt: new Date().toISOString(),
      },
      actions: {
        persist_prompt: true,
        generate_pdf: true,
      },
    };

    genieService.process.mockResolvedValueOnce({
      resultId: "result-123",
      ...mockEnvelope,
    });

    const res = await request(app)
      .post("/api/ebook/generate")
      .send({
        prompt: "Test prompt",
        theme: "light",
        pageCount: 5,
      })
      .timeout({ deadline: 15000 });

    // Should return 202 (async acceptance)
    expect(res.status).toBe(202);

    // Response should include canonical out_envelope
    expect(res.body).toHaveProperty("out_envelope");
    expect(res.body.out_envelope).toHaveProperty("pages");
    expect(Array.isArray(res.body.out_envelope.pages)).toBe(true);
    expect(res.body.out_envelope.pages.length).toBe(1);

    // Should also include legacy chapters field for backwards compat
    expect(res.body).toHaveProperty("chapters");
    expect(Array.isArray(res.body.chapters)).toBe(true);
    expect(res.body.chapters).toEqual(mockEnvelope.pages);
  });

  it("wraps metadata in canonical structure", async () => {
    const mockEnvelope = {
      pages: [{ id: "p1", title: "Page 1" }],
      html: "<html></html>",
      metadata: { custom_field: "custom_value" },
      actions: {},
    };

    genieService.process.mockResolvedValueOnce({
      resultId: "result-456",
      ...mockEnvelope,
    });

    const res = await request(app)
      .post("/api/ebook/generate")
      .send({
        prompt: "Test",
        theme: "dark",
        pageCount: 3,
      })
      .timeout({ deadline: 15000 });

    // Metadata should be wrapped in out_envelope
    expect(res.body.out_envelope.metadata).toHaveProperty("title");
    expect(res.body.out_envelope.metadata).toHaveProperty("author");
    expect(res.body.out_envelope.metadata).toHaveProperty("theme");
    expect(res.body.out_envelope.metadata).toHaveProperty("pageCount");
    expect(res.body.out_envelope.metadata.custom_field).toBe("custom_value");

    // Legacy metadata field should also exist
    expect(res.body.metadata).toEqual(res.body.out_envelope.metadata);
  });

  it("includes actions in canonical out_envelope", async () => {
    const mockEnvelope = {
      pages: [{ id: "p1" }],
      html: "<html></html>",
      metadata: {},
      actions: {
        persist_prompt: true,
        generate_pdf: true,
      },
    };

    genieService.process.mockResolvedValueOnce({
      resultId: "result-789",
      ...mockEnvelope,
    });

    const res = await request(app)
      .post("/api/ebook/generate")
      .send({ prompt: "Test", theme: "light", pageCount: 5 })
      .timeout({ deadline: 15000 });

    expect(res.body.out_envelope).toHaveProperty("actions");
    expect(res.body.out_envelope.actions.persist_prompt).toBe(true);
    expect(res.body.out_envelope.actions.generate_pdf).toBe(true);

    // Legacy actions field should also exist
    expect(res.body.actions).toEqual(res.body.out_envelope.actions);
  });

  it("includes html in out_envelope for export compatibility", async () => {
    const mockHtml = "<html><body><h1>Title</h1><p>Content</p></body></html>";
    const mockEnvelope = {
      pages: [{ id: "p1", title: "Page 1" }],
      html: mockHtml,
      metadata: {},
      actions: {},
    };

    genieService.process.mockResolvedValueOnce({
      resultId: "result-101",
      ...mockEnvelope,
    });

    const res = await request(app)
      .post("/api/ebook/generate")
      .send({ prompt: "Test", theme: "light", pageCount: 5 })
      .timeout({ deadline: 15000 });

    expect(res.body.out_envelope.html).toBe(mockHtml);
    expect(res.body.html).toBe(mockHtml); // Legacy field
  });

  it("returns resultId for polling", async () => {
    genieService.process.mockResolvedValueOnce({
      resultId: "polling-123",
      pages: [{ id: "p1" }],
      html: "<html></html>",
      metadata: {},
      actions: {},
    });

    const res = await request(app)
      .post("/api/ebook/generate")
      .send({ prompt: "Test", theme: "light", pageCount: 5 })
      .timeout({ deadline: 15000 });

    expect(res.body).toHaveProperty("resultId");
    expect(res.body.resultId).toBe("polling-123");
  });

  it("returns id field for backwards compatibility", async () => {
    genieService.process.mockResolvedValueOnce({
      resultId: "result-999",
      pages: [{ id: "p1" }],
      html: "<html></html>",
      metadata: {},
      actions: {},
    });

    const res = await request(app)
      .post("/api/ebook/generate")
      .send({ prompt: "Test", theme: "light", pageCount: 5 })
      .timeout({ deadline: 15000 });

    // Should have legacy id field
    expect(res.body).toHaveProperty("id");
    expect(res.body.id).toMatch(/^ebook_/);
  });

  it("handles missing envelope.pages gracefully", async () => {
    genieService.process.mockResolvedValueOnce({
      resultId: "result-broken",
      // pages missing intentionally
      html: "<html></html>",
      metadata: {},
      actions: {},
    });

    const res = await request(app)
      .post("/api/ebook/generate")
      .send({ prompt: "Test", theme: "light", pageCount: 5 })
      .timeout({ deadline: 15000 });

    // Should still return 202 and include out_envelope
    expect(res.status).toBe(202);
    expect(res.body.out_envelope).toHaveProperty("pages");
    // pages should be undefined or empty array from missing envelope.pages
    expect(res.body.chapters).toEqual(undefined);
  });

  it("handles missing html gracefully", async () => {
    genieService.process.mockResolvedValueOnce({
      resultId: "result-no-html",
      pages: [{ id: "p1" }],
      // html missing intentionally
      metadata: {},
      actions: {},
    });

    const res = await request(app)
      .post("/api/ebook/generate")
      .send({ prompt: "Test", theme: "light", pageCount: 5 })
      .timeout({ deadline: 15000 });

    expect(res.status).toBe(202);
    expect(res.body.out_envelope.html).toBeNull();
  });
});

afterAll(async () => {
  try {
    const browser = serverModule.browser;
    if (browser && typeof browser.close === "function") {
      await browser.close();
    }
  } catch (e) {
    // ignore
  }
});
