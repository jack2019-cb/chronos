/// <reference types="vitest" />

/**
 * Service Autonomy Tests (Phase 2)
 *
 * Validate that Phase 2 services properly delegate to Phase 1.
 * Tests focus on: "Does this service use orchestrator correctly?"
 * Tests do NOT validate internal Phase 1 behavior (that's Phase 1's job).
 *
 * Note: describe, it, expect are available globally via vitest config (globals: true)
 */

const EbookService = require("../services/ebookService");
const WallArtService = require("../services/wallArtService");
const CalendarService = require("../services/calendarService");
const Orchestrator = require("../orchestrator");
const helpers = require("../helpers");

describe("Service Autonomy (Phase 2) - Delegation Validation", () => {
  // TEST 1: EbookService
  describe("EbookService", () => {
    it("should delegate to reference service without error", async () => {
      const service = new EbookService();
      const orchestrator = new Orchestrator("test-ebook", helpers);

      const result = await service.handle(
        {
          resultId: "test-ebook",
          prompt: "Test ebook",
          theme: "dark",
          pageCount: 2,
        },
        {
          orchestrator,
          onProgress: () => {},
        }
      );

      // VALIDATION: Result has expected structure (from reference service)
      expect(result).toBeDefined();
      expect(result.id).toBe("test-ebook");
      expect(result.title).toBeDefined();
      expect(result.chapters).toBeDefined();
      expect(Array.isArray(result.chapters)).toBe(true);
      expect(result.chapters.length).toBe(2);
      expect(result.metadata.totalRequests).toBeGreaterThan(0);
      expect(result.metadata.etaSeconds).toBeGreaterThan(0);
    });
  });

  // TEST 2: WallArtService
  describe("WallArtService", () => {
    it("should properly use orchestrator with manifest", async () => {
      const service = new WallArtService();
      const orchestrator = new Orchestrator("test-art", helpers);
      const progressUpdates = [];

      const result = await service.handle(
        {
          resultId: "test-art",
          prompt: "Modern abstract",
          style: "minimalist",
          dimensions: "3x4",
        },
        {
          orchestrator,
          onProgress: (u) => progressUpdates.push(u),
        }
      );

      // VALIDATION: Result structure
      expect(result).toBeDefined();
      expect(result.id).toBe("test-art");
      expect(result.style).toBe("minimalist");
      expect(result.styleAnalysis).toBeDefined();
      expect(result.description).toBeDefined();

      // VALIDATION: Metadata from orchestrator
      expect(result.metadata.totalRequests).toBe(2); // Manifest declares 2 calls
      expect(result.metadata.etaSeconds).toBeGreaterThan(0);

      // VALIDATION: Progress tracking worked
      expect(progressUpdates.length).toBe(2);
      expect(progressUpdates[0].callsCompleted).toBe(1);
      expect(progressUpdates[1].callsCompleted).toBe(2);
    });
  });

  // TEST 3: CalendarService
  describe("CalendarService", () => {
    it("should properly use orchestrator with manifest", async () => {
      const service = new CalendarService();
      const orchestrator = new Orchestrator("test-cal", helpers);
      const progressUpdates = [];

      const result = await service.handle(
        {
          resultId: "test-cal",
          prompt: "Tech industry events",
          year: 2025,
          theme: "tech",
        },
        {
          orchestrator,
          onProgress: (u) => progressUpdates.push(u),
        }
      );

      // VALIDATION: Result structure
      expect(result).toBeDefined();
      expect(result.id).toBe("test-cal");
      expect(result.year).toBe(2025);
      expect(result.content).toBeDefined();
      expect(result.events).toBeDefined();
      expect(result.layout).toBeDefined();

      // VALIDATION: Metadata from orchestrator
      expect(result.metadata.totalRequests).toBe(3); // Manifest declares 3 calls
      expect(result.metadata.etaSeconds).toBeGreaterThan(0);

      // VALIDATION: Progress tracking worked
      expect(progressUpdates.length).toBe(3);
      expect(progressUpdates[0].callsCompleted).toBe(1);
      expect(progressUpdates[1].callsCompleted).toBe(2);
      expect(progressUpdates[2].callsCompleted).toBe(3);
    });
  });

  // TEST 4: Service Pattern Consistency
  describe("Service Pattern Consistency", () => {
    it("all services should return consistent metadata structure", async () => {
      const services = {
        ebook: new EbookService(),
        art: new WallArtService(),
        calendar: new CalendarService(),
      };

      const results = await Promise.all([
        services.ebook.handle(
          { resultId: "test-1", prompt: "Test", theme: "dark", pageCount: 2 },
          {
            orchestrator: new Orchestrator("test-1", helpers),
            onProgress: () => {},
          }
        ),
        services.art.handle(
          {
            resultId: "test-2",
            prompt: "Test",
            style: "minimal",
            dimensions: "3x4",
          },
          {
            orchestrator: new Orchestrator("test-2", helpers),
            onProgress: () => {},
          }
        ),
        services.calendar.handle(
          { resultId: "test-3", prompt: "Test", year: 2025, theme: "tech" },
          {
            orchestrator: new Orchestrator("test-3", helpers),
            onProgress: () => {},
          }
        ),
      ]);

      // VALIDATION: All services return consistent metadata
      results.forEach((result) => {
        expect(result.id).toBeDefined();
        expect(result.generatedAt).toBeDefined();
        expect(result.metadata).toBeDefined();
        expect(result.metadata.totalRequests).toBeGreaterThan(0);
        expect(result.metadata.etaSeconds).toBeGreaterThan(0);
      });

      console.log("✅ All services use consistent orchestrator pattern");
    });
  });
});
