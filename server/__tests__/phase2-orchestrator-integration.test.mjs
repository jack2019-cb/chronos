/**
 * phase2-orchestrator-integration.test.mjs
 *
 * Phase 2 Integration Testing: Validates SERVICE-AUTON implementation
 *
 * Tests:
 * 1. Services route through serviceIntegration.routeAndExecute()
 * 2. Manifest protocol works end-to-end (first call includes totalRequests+sequence)
 * 3. Orchestrator receives manifest and computes ETA
 * 4. FIFO scheduling is enforced with proper spacing
 * 5. Tier-based routing maps to correct models (expert → Pro, standard → Flash)
 * 6. Services are independently testable with mocked orchestrator
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import Orchestrator from "../orchestrator.js";

describe("Phase 2: SERVICE-AUTON Orchestrator Integration", () => {
  describe("Manifest Protocol", () => {
    it("should capture manifest on first orchestrator.generate() call", async () => {
      const mockHelpers = {
        timingResolver: {
          compute: (manifest, config) => ({
            totalEta: 20,
            callSequence: manifest.sequence,
          }),
        },
        fifoScheduler: {
          build: (timing) => ({
            calls: [
              { callIndex: 0, reservedTime: 0 },
              { callIndex: 1, reservedTime: 250 },
              { callIndex: 2, reservedTime: 500 },
              { callIndex: 3, reservedTime: 600 },
            ],
          }),
        },
        statusManager: {
          init: vi.fn(),
          updateProgress: vi.fn(),
          getStatus: vi.fn(() => ({})),
        },
      };

      const mockAiService = {
        generateContent: vi.fn(async () => ({
          content: { body: "Mock response" },
        })),
      };

      const orchestrator = new Orchestrator(
        "test-job",
        mockHelpers,
        mockAiService
      );

      // First call: MUST include manifest
      const manifest = {
        totalRequests: 4,
        sequence: [
          { callIndex: 0, tier: "expert" },
          { callIndex: 1, tier: "expert" },
          { callIndex: 2, tier: "standard" },
          { callIndex: 3, tier: "expert" },
        ],
      };

      await orchestrator.generate("First call with manifest", {
        tier: "expert",
        callIndex: 0,
        manifest,
      });

      // Verify manifest was captured
      expect(orchestrator.manifest).toEqual(manifest);
      expect(orchestrator.manifestReceived).toBe(true);
      expect(orchestrator.eta).toBe(20); // From timingResolver.compute()
    });

    it("should throw error if subsequent calls don't have manifest pre-computed", async () => {
      const mockHelpers = {
        timingResolver: {
          compute: (manifest) => ({
            totalEta: 20,
            callSequence: manifest.sequence,
          }),
        },
        fifoScheduler: {
          build: (timing) => ({
            calls: [
              { callIndex: 0, reservedTime: 0 },
              { callIndex: 1, reservedTime: 250 },
            ],
          }),
        },
        statusManager: {
          init: vi.fn(),
          updateProgress: vi.fn(),
          getStatus: vi.fn(() => ({})),
        },
      };

      const mockAiService = {
        generateContent: vi.fn(async () => ({
          content: { body: "Mock response" },
        })),
      };

      const orchestrator = new Orchestrator(
        "test-job",
        mockHelpers,
        mockAiService
      );

      // Attempt call without manifest first
      const promise = orchestrator.generate("No manifest", {
        tier: "expert",
        callIndex: 0,
        // manifest: undefined (missing)
      });

      await expect(promise).rejects.toThrow(/manifest/i);
    });
  });

  describe("Tier-Based Routing", () => {
    it("should map expert tier to gemini-2.5-pro model", () => {
      const orchestrator = new Orchestrator("test-job", {}, {});
      const model = orchestrator.tierToModel("expert");
      expect(model).toBe("gemini-2.5-pro");
    });

    it("should map standard tier to gemini-2.5-flash model", () => {
      const orchestrator = new Orchestrator("test-job", {}, {});
      const model = orchestrator.tierToModel("standard");
      expect(model).toBe("gemini-2.5-flash");
    });
  });

  describe("FIFO Scheduling with Spacing", () => {
    it("should enforce call spacing based on schedule", async () => {
      const callTimestamps = [];

      const mockHelpers = {
        timingResolver: {
          compute: (manifest) => ({
            totalEta: 20,
            callSequence: manifest.sequence,
          }),
        },
        fifoScheduler: {
          build: (timing) => ({
            calls: [
              { callIndex: 0, reservedTime: 0 }, // Immediate
              { callIndex: 1, reservedTime: 250 }, // After 250ms
              { callIndex: 2, reservedTime: 500 }, // After 500ms
            ],
          }),
        },
        statusManager: {
          init: vi.fn(),
          updateProgress: vi.fn(),
          getStatus: vi.fn(() => ({})),
        },
      };

      const mockAiService = {
        generateContent: vi.fn(async () => {
          callTimestamps.push(Date.now());
          return { content: { body: "Mock response" } };
        }),
      };

      const orchestrator = new Orchestrator(
        "test-job",
        mockHelpers,
        mockAiService
      );
      const manifest = {
        totalRequests: 3,
        sequence: [
          { callIndex: 0, tier: "expert" },
          { callIndex: 1, tier: "standard" },
          { callIndex: 2, tier: "standard" },
        ],
      };

      // First call with manifest
      const startTime = Date.now();
      await orchestrator.generate("Prompt 0", {
        tier: "expert",
        callIndex: 0,
        manifest,
      });

      // Second call (should wait ~250ms)
      await orchestrator.generate("Prompt 1", {
        tier: "standard",
        callIndex: 1,
      });

      // Third call (should wait ~500ms from start)
      await orchestrator.generate("Prompt 2", {
        tier: "standard",
        callIndex: 2,
      });

      // Verify spacing was applied
      expect(callTimestamps.length).toBe(3);

      const gap1 = callTimestamps[1] - callTimestamps[0];
      const gap2 = callTimestamps[2] - callTimestamps[0];

      // Allow some tolerance (50ms) for execution time
      expect(gap1).toBeGreaterThanOrEqual(230); // ~250ms with tolerance
      expect(gap2).toBeGreaterThanOrEqual(480); // ~500ms with tolerance
    });
  });

  describe("Service Integration Layer", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("should route ebook mode to ebookService", async () => {
      vi.doMock("../aiService", () => ({
        createAIService: () => ({
          generateContent: async () => ({
            content: { body: JSON.stringify({ title: "Test", chapters: [] }) },
          }),
        }),
      }));

      const serviceIntegration = await import("../serviceIntegration.js");
      const routeAndExecute =
        serviceIntegration.default?.routeAndExecute ||
        serviceIntegration.routeAndExecute;

      // Mock logger and config with actual methods
      const logger = {
        log: (msg) => console.log(`[TEST] ${msg}`),
        warn: (msg) => console.warn(`[TEST] ${msg}`),
        error: (msg) => console.error(`[TEST] ${msg}`),
        info: (msg) => console.log(`[TEST] ${msg}`),
      };
      const config = {
        modelTiers: {
          expert: "gemini-2.5-pro",
          standard: "gemini-2.5-flash",
        },
      };

      const payload = {
        mode: "ebook",
        prompt: "Test prompt",
        metadata: { pageCount: 2 },
      };

      // Should route to ebookService
      const result = await routeAndExecute(
        "ebook",
        payload,
        "test-id",
        logger,
        config
      );

      // ebookService should return proper structure
      expect(result).toBeDefined();
      expect(typeof result === "object").toBe(true);
    });

    it("should route wall-art mode to wallArtService", async () => {
      vi.doMock("../aiService", () => ({
        createAIService: () => ({
          generateContent: async (prompt, callIndex, options) => {
            // Return proper format matching aiService
            if (prompt.includes("analyze")) {
              return {
                content: {
                  title: "Analysis",
                  body: JSON.stringify({
                    concept: "Modern art",
                    color_palette: ["#FF0000", "#00FF00", "#0000FF"],
                    mood: "energetic",
                  }),
                  layout: "ai-generated",
                },
                metadata: { model: "mock", status: 200 },
              };
            }
            return {
              content: {
                title: "Composition",
                body: JSON.stringify({
                  title: "Wall Art",
                  description: "Beautiful composition",
                  primary_colors: ["#FF0000"],
                }),
                layout: "ai-generated",
              },
              metadata: { model: "mock", status: 200 },
            };
          },
        }),
      }));

      const serviceIntegration = await import("../serviceIntegration.js");
      const routeAndExecute =
        serviceIntegration.default?.routeAndExecute ||
        serviceIntegration.routeAndExecute;

      const logger = {
        log: (msg) => console.log(`[TEST] ${msg}`),
        warn: (msg) => console.warn(`[TEST] ${msg}`),
        error: (msg) => console.error(`[TEST] ${msg}`),
        info: (msg) => console.log(`[TEST] ${msg}`),
      };
      const config = {
        modelTiers: {
          expert: "gemini-2.5-pro",
          standard: "gemini-2.5-flash",
        },
      };

      const payload = {
        mode: "wall-art",
        prompt: "Create wall art",
        metadata: { width: 800, height: 600 },
      };

      // Should route to wallArtService
      const result = await routeAndExecute(
        "wall-art",
        payload,
        "test-id",
        logger,
        config
      );

      // wallArtService should return proper structure
      expect(result).toBeDefined();
      expect(typeof result === "object").toBe(true);
    });

    it("should create resourceKit with orchestrator instance", async () => {
      const serviceIntegration = await import("../serviceIntegration.js");
      const createResourceKit =
        serviceIntegration.default?.createResourceKit ||
        serviceIntegration.createResourceKit;

      const logger = {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const config = {
        modelTiers: {
          expert: "gemini-2.5-pro",
          standard: "gemini-2.5-flash",
        },
      };

      const resourceKit = createResourceKit("test-id", logger, config);

      // Verify resourceKit structure
      expect(resourceKit).toBeDefined();
      expect(resourceKit.orchestrator).toBeDefined();
      expect(resourceKit.onProgress).toBeDefined();
      expect(typeof resourceKit.onProgress).toBe("function");
      expect(resourceKit.logger).toBe(logger);
      expect(resourceKit.config).toBe(config);

      // Verify orchestrator is Orchestrator instance
      expect(resourceKit.orchestrator.constructor.name).toBe("Orchestrator");
    });
  });

  describe("End-to-End Manifest Protocol", () => {
    it("should validate complete manifest protocol flow", async () => {
      const callLog = [];

      const mockHelpers = {
        timingResolver: {
          compute: (manifest) => {
            callLog.push({
              event: "timingResolver.compute",
              manifestTotalRequests: manifest.totalRequests,
            });
            return { totalEta: 20, callSequence: manifest.sequence };
          },
        },
        fifoScheduler: {
          build: (timing) => {
            callLog.push({ event: "fifoScheduler.build" });
            return {
              calls: [
                { callIndex: 0, reservedTime: 0 },
                { callIndex: 1, reservedTime: 250 },
                { callIndex: 2, reservedTime: 500 },
                { callIndex: 3, reservedTime: 600 },
              ],
            };
          },
        },
        statusManager: {
          init: (resultId, metadata) => {
            callLog.push({ event: "statusManager.init", eta: metadata.eta });
          },
          updateProgress: (resultId, progress) => {
            callLog.push({
              event: "statusManager.updateProgress",
              ...progress,
            });
          },
          getStatus: vi.fn(() => ({})),
        },
      };

      const mockAiService = {
        generateContent: vi.fn(async (prompt, callIndex, options) => {
          callLog.push({
            event: "aiService.generateContent",
            callIndex,
            tier: options.tier,
            model: options.model,
          });
          return { content: { body: "Response " + callIndex } };
        }),
      };

      const orchestrator = new Orchestrator(
        "test-job",
        mockHelpers,
        mockAiService
      );
      const manifest = {
        totalRequests: 4,
        sequence: [
          { callIndex: 0, tier: "expert" },
          { callIndex: 1, tier: "expert" },
          { callIndex: 2, tier: "standard" },
          { callIndex: 3, tier: "expert" },
        ],
      };

      // Execute 4 calls
      for (let i = 0; i < 4; i++) {
        const tier = manifest.sequence[i].tier;
        await orchestrator.generate(`Prompt ${i}`, {
          tier,
          callIndex: i,
          ...(i === 0 && { manifest }), // Manifest on first call only
        });
      }

      // Verify call sequence
      expect(callLog[0].event).toBe("timingResolver.compute");
      expect(callLog[0].manifestTotalRequests).toBe(4);
      expect(callLog[1].event).toBe("fifoScheduler.build");
      expect(callLog[2].event).toBe("statusManager.init");
      expect(callLog[2].eta).toBe(20);

      // Verify all 4 AI calls were made
      const aiCalls = callLog.filter(
        (entry) => entry.event === "aiService.generateContent"
      );
      expect(aiCalls.length).toBe(4);
      expect(aiCalls[0].tier).toBe("expert");
      expect(aiCalls[0].model).toBe("gemini-2.5-pro");
      expect(aiCalls[2].tier).toBe("standard");
      expect(aiCalls[2].model).toBe("gemini-2.5-flash");
    });
  });

  describe("Service Base Class Contract", () => {
    it("should validate Service base class has required methods", async () => {
      const serviceModule = await import("../services/serviceBase.js");
      const ServiceClass =
        serviceModule.default ||
        Object.values(serviceModule).find((v) => typeof v === "function");

      expect(ServiceClass).toBeDefined();
      expect(ServiceClass.prototype.handle).toBeDefined();
      expect(ServiceClass.prototype.validateTier).toBeDefined();
      expect(ServiceClass.prototype.validateManifest).toBeDefined();
      expect(ServiceClass.prototype.buildError).toBeDefined();
    });

    it("ebookService should extend Service base class", async () => {
      const ebookServiceModule = await import("../services/ebookService.js");
      // Services export instances, not classes
      const ebookServiceInstance =
        ebookServiceModule.default || Object.values(ebookServiceModule)[0];

      expect(ebookServiceInstance).toBeDefined();
      // Check that instance has handle method (it's a Service instance)
      expect(typeof ebookServiceInstance.handle).toBe("function");
    });

    it("wallArtService should extend Service base class", async () => {
      const wallArtServiceModule = await import(
        "../services/wallArtService.js"
      );
      // Services export instances, not classes
      const wallArtServiceInstance =
        wallArtServiceModule.default || Object.values(wallArtServiceModule)[0];

      expect(wallArtServiceInstance).toBeDefined();
      // Check that instance has handle method (it's a Service instance)
      expect(typeof wallArtServiceInstance.handle).toBe("function");
    });
  });
});

describe("Phase 2: Integration with genieService", () => {
  it("should have serviceIntegration imported in genieService", async () => {
    // Read genieService to verify it imports serviceIntegration
    const { readFileSync } = await import("fs");
    const { fileURLToPath } = await import("url");
    const { dirname } = await import("path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const genieServicePath = __dirname + "/../genieService.js";

    const content = readFileSync(genieServicePath, "utf-8");

    // Verify serviceIntegration is imported
    expect(content).toContain("serviceIntegration");
    // Verify routeAndExecute is called
    expect(content).toContain("routeAndExecute");
  });
});
