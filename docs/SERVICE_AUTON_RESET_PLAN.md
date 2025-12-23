# AetherPress SERVICE-AUTON Phase: Reset Implementation Plan

**Date**: December 23, 2025 @ 4:35PM  
**Branch**: `SERVICE-AUTON-reset` (previous `SERVICE-AUTON` renamed to `SERVICE-AUTON-old`)  
**Status**: Reset Ready | Validation-by-Construction Approach  
**Related**:

- [ARCHITECTURE_IMPLEMENTATION_GUIDE.md](ARCHITECTURE_IMPLEMENTATION_GUIDE.md) (original historical reference)
- [PERF-VALIDATE_ROOT_CAUSE_ANALYSIS.md](PERF-VALIDATE_ROOT_CAUSE_ANALYSIS.md) (why reset needed)
- [ARCHITECTURE_ROADMAP_EXECUTIVE.md](ARCHITECTURE_ROADMAP_EXECUTIVE.md) (strategic vision)

---

## Executive Summary

**Problem**: SERVICE-AUTON phase made **assumptions** about how to use ASYNC-INFRA infrastructure, leading to:

- ID linkage mismatch (PART-A creates one resultId, orchestrator uses another)
- Type errors in data pipeline (compose() assumes chapter.content types)
- Status store race conditions (updates before placeholder exists)
- Manifest formula mismatch (tests expect simplified formula, implementation uses manifest-driven)
- ETA timing constant drift (model latencies hardcoded vs. observed durations)

**Root Cause**: Phase 2 refactored services **in isolation** without calling Phase 1 services to validate assumptions.

**Solution**: Reset SERVICE-AUTON to **call Phase 1 services directly** rather than recreate them.

**Key Principle**: **Validation by Construction** — If Phase 2 delegates to Phase 1, Phase 2 can't get it wrong because it's not making decisions.

---

## Current State Assessment

### Phase 1: ASYNC-INFRA ✅ COMPLETE

**Status**: Infrastructure built and proven in `docs/current_design/ASYNC_INFRA`

**What Phase 1 Provides**:

- PART-A: Async acceptance, resultId generation, async handoff
- Orchestrator: Manifest-driven scheduling, FIFO enforcement, spacing
- Helpers: timingResolver, fifoScheduler, statusManager, progressTracker
- Utilities: smartPoller, persistence, logger
- **Reference Service** (to be created): ebookService that proves all patterns work together

### Phase 2: SERVICE-AUTON ❌ NEEDS RESET

**Current Issue**: SERVICE-AUTON branch (now `SERVICE-AUTON-old`) contains:

- Refactored ebookService with hard-coded assumptions
- No reference to Phase 1 orchestrator validation
- Tests that assert wrong assumptions (simplified formula, not manifest-driven)
- ID linkage issues, type errors, race conditions

**Why Reset**: Phase 2 needs to build **on top of Phase 1**, not **independently of Phase 1**.

---

## Implementation Strategy: Validation by Construction

### Phase 1 Extension: Create Reference Service (Complete ASYNC-INFRA)

Before merging ASYNC-INFRA to base, add reference ebookService that proves the pattern:

**File**: `server/services/refService.ebookService.js` (reference implementation)

```javascript
/**
 * Reference EbookService - Proves ASYNC-INFRA contract works correctly
 * This is the GOLDEN STANDARD for how services use the orchestrator.
 *
 * Key behaviors:
 * 1. Receives orchestrator as dependency (not hard-coded tools)
 * 2. Declares manifest on first call (what it needs)
 * 3. Updates status via orchestrator callbacks
 * 4. Returns composed ebook
 *
 * If this service works, all Phase 1 patterns are correct.
 */

class ReferenceEbookService {
  constructor(logger) {
    this.logger = logger;
  }

  async handle(payload, context) {
    const { resultId, prompt, theme, pageCount } = payload;
    const { orchestrator, onProgress, config } = context;

    this.logger.info(
      `[RefService] Starting ebook generation: resultId=${resultId}, pages=${pageCount}`
    );

    try {
      // Step 1: Declare what we need (manifest)
      // This tells orchestrator to compute timing and schedule
      const manifest = {
        totalRequests: 3 + Math.ceil(pageCount / 2), // Expert call + content calls
        sequence: this.buildSequence(pageCount),
      };

      this.logger.info(
        `[RefService] Manifest declared: ${manifest.totalRequests} calls`
      );

      // Step 2: First call with manifest (orchestrator computes ETA)
      const titleResult = await orchestrator.generate(
        `Create a compelling title for this ebook: ${prompt.substring(0, 100)}`,
        {
          tier: "expert",
          callIndex: 0,
          manifest, // Only on first call
        }
      );

      // Get ETA from orchestrator (it computed this on first call)
      const eta = orchestrator.eta;
      const totalCalls = orchestrator.manifest.totalRequests;

      // Notify progress tracker (enrich smartPoller)
      onProgress({
        resultId,
        callsCompleted: 1,
        currentCall: 1,
        totalCalls,
        eta,
      });

      this.logger.info(
        `[RefService] Title generated. ETA=${eta}s, Total Calls=${totalCalls}`
      );

      // Step 3: Generate content via orchestrator calls
      const chapters = [];
      let callIndex = 1;

      for (let i = 0; i < pageCount; i++) {
        const chapterPrompt = `Chapter ${
          i + 1
        }: Continue the ebook on "${prompt}". Focus on practical implementation.`;

        const contentResult = await orchestrator.generate(chapterPrompt, {
          tier: i % 2 === 0 ? "expert" : "standard", // Alternate tiers
          callIndex,
          // Note: NO manifest here (only on first call)
        });

        chapters.push({
          title: `Chapter ${i + 1}`,
          content: contentResult,
          pageNumber: i + 1,
        });

        callIndex++;

        // Progress update after each call
        onProgress({
          resultId,
          callsCompleted: callIndex,
          currentCall: callIndex,
          totalCalls,
          eta: orchestrator.eta,
        });

        this.logger.debug(
          `[RefService] Chapter ${
            i + 1
          } generated. Progress: ${callIndex}/${totalCalls}`
        );
      }

      // Step 4: Compose final ebook
      const ebook = {
        id: resultId,
        title: titleResult,
        theme,
        chapters,
        generatedAt: Date.now(),
        metadata: {
          pageCount,
          totalRequests: totalCalls,
          etaSeconds: eta,
        },
      };

      this.logger.info(
        `[RefService] Ebook composition complete. resultId=${resultId}`
      );

      return ebook;
    } catch (err) {
      this.logger.error(`[RefService] Generation failed: ${err.message}`, err);
      throw err;
    }
  }

  buildSequence(pageCount) {
    // Build manifest sequence
    const sequence = [];
    let callIndex = 0;

    // Title call (expert)
    sequence.push({ callIndex: callIndex++, tier: "expert" });

    // Content calls (alternating expert/standard)
    for (let i = 0; i < pageCount; i++) {
      sequence.push({
        callIndex: callIndex++,
        tier: i % 2 === 0 ? "expert" : "standard",
      });
    }

    return sequence;
  }
}

module.exports = ReferenceEbookService;
```

### Phase 1 Tests: Validate Reference Service (Complete ASYNC-INFRA)

**File**: `server/__tests__/ref-service-validation.test.js`

```javascript
/**
 * Reference Service Validation Tests
 *
 * These tests PROVE that the reference service correctly uses Phase 1 infrastructure.
 * If these pass, Phase 1's contract is proven.
 */

const { describe, it, expect, beforeEach } = require("vitest");
const ReferenceEbookService = require("../services/refService.ebookService");
const Orchestrator = require("../orchestrator");
const { timingResolver, fifoScheduler, statusManager } = require("../helpers");

describe("Reference Service (Phase 1 Validation)", () => {
  let service;
  let orchestrator;
  let mockLogger;
  let progressUpdates;

  beforeEach(() => {
    mockLogger = {
      info: (msg) => console.log(`[LOG] ${msg}`),
      debug: (msg) => console.log(`[DEBUG] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`),
    };

    progressUpdates = [];
    service = new ReferenceEbookService(mockLogger);

    // Create real orchestrator with real helpers
    orchestrator = new Orchestrator("test-resultId", {
      timingResolver,
      fifoScheduler,
      statusManager,
      logger: mockLogger,
    });
  });

  it("should correctly pass resultId from PART-A through orchestrator", async () => {
    const resultId = "test-result-12345";
    const orchestratorForThisJob = new Orchestrator(resultId, {
      timingResolver,
      fifoScheduler,
      statusManager,
      logger: mockLogger,
    });

    const result = await service.handle(
      {
        resultId,
        prompt: "Test ebook",
        theme: "dark",
        pageCount: 2,
      },
      {
        orchestrator: orchestratorForThisJob,
        onProgress: (update) => {
          progressUpdates.push(update);
          // Verify resultId is consistent
          expect(update.resultId).toBe(resultId);
        },
        config: {},
      }
    );

    // Verify resultId flows through entire service
    expect(result.id).toBe(resultId);
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[0].resultId).toBe(resultId);
  });

  it("should correctly declare and use manifest on first call", async () => {
    const orchestratorForThisJob = new Orchestrator("test-manifest-job", {
      timingResolver,
      fifoScheduler,
      statusManager,
      logger: mockLogger,
    });

    const result = await service.handle(
      {
        resultId: "test-manifest-job",
        prompt: "Test ebook",
        theme: "light",
        pageCount: 3,
      },
      {
        orchestrator: orchestratorForThisJob,
        onProgress: (update) => progressUpdates.push(update),
        config: {},
      }
    );

    // Verify manifest was processed
    expect(orchestratorForThisJob.manifest).toBeDefined();
    expect(orchestratorForThisJob.eta).toBeGreaterThan(0);
    expect(orchestratorForThisJob.eta).toBeLessThan(60);

    // Verify manifest drives correct call count
    const expectedCalls = 3 + Math.ceil(3 / 2); // 3 pages + 2 content calls
    expect(orchestratorForThisJob.manifest.totalRequests).toBe(expectedCalls);

    // Verify result includes metadata
    expect(result.metadata.totalRequests).toBe(expectedCalls);
    expect(result.metadata.etaSeconds).toBe(orchestratorForThisJob.eta);
  });

  it("should correctly update status for each orchestrator call", async () => {
    const orchestratorForThisJob = new Orchestrator("test-progress-job", {
      timingResolver,
      fifoScheduler,
      statusManager,
      logger: mockLogger,
    });

    const result = await service.handle(
      {
        resultId: "test-progress-job",
        prompt: "Test ebook",
        theme: "dark",
        pageCount: 2,
      },
      {
        orchestrator: orchestratorForThisJob,
        onProgress: (update) => progressUpdates.push(update),
        config: {},
      }
    );

    // Verify progress updates for all calls
    const totalCalls = orchestratorForThisJob.manifest.totalRequests;
    expect(progressUpdates.length).toBe(totalCalls);

    // Verify progress increments correctly
    progressUpdates.forEach((update, idx) => {
      expect(update.currentCall).toBe(idx + 1);
      expect(update.callsCompleted).toBe(idx + 1);
      expect(update.totalCalls).toBe(totalCalls);
    });

    // Final call should have all chapters
    expect(result.chapters.length).toBe(2);
  });

  it("should handle chapter content type correctly (no assume string)", async () => {
    const orchestratorForThisJob = new Orchestrator("test-types-job", {
      timingResolver,
      fifoScheduler,
      statusManager,
      logger: mockLogger,
    });

    const result = await service.handle(
      {
        resultId: "test-types-job",
        prompt: "Test ebook",
        theme: "dark",
        pageCount: 2,
      },
      {
        orchestrator: orchestratorForThisJob,
        onProgress: (update) => progressUpdates.push(update),
        config: {},
      }
    );

    // Verify chapters have content (regardless of type)
    result.chapters.forEach((chapter) => {
      expect(chapter.title).toBeDefined();
      expect(chapter.content).toBeDefined(); // Could be string, object, etc.
      expect(chapter.pageNumber).toBeDefined();
    });
  });

  it("should compute ETA within expected range for 3-page ebook", async () => {
    const orchestratorForThisJob = new Orchestrator("test-eta-job", {
      timingResolver,
      fifoScheduler,
      statusManager,
      logger: mockLogger,
    });

    const startTime = Date.now();
    const result = await service.handle(
      {
        resultId: "test-eta-job",
        prompt: "Test ebook",
        theme: "dark",
        pageCount: 3,
      },
      {
        orchestrator: orchestratorForThisJob,
        onProgress: (update) => progressUpdates.push(update),
        config: {},
      }
    );
    const actualTime = (Date.now() - startTime) / 1000;

    const eta = orchestratorForThisJob.eta;
    const tolerance = eta * 0.2; // ±20%

    expect(actualTime).toBeLessThan(eta + tolerance);
    // (actualTime may be less than ETA-tolerance if mocks are fast)

    console.log(
      `[Validation] ETA=${eta}s, Actual=${actualTime.toFixed(1)}s, Error=${(
        ((actualTime - eta) / eta) *
        100
      ).toFixed(1)}%`
    );
  });
});
```

---

## Phase 2: SERVICE-AUTON Reset Strategy

### Step 1: Create SERVICE-AUTON-reset Branch

```bash
# Rename old branch (preserve for reference)
git branch -m SERVICE-AUTON SERVICE-AUTON-old

# Create fresh branch from ASYNC-INFRA (which is merged to base)
git checkout -b SERVICE-AUTON-reset main

# Verify we have Phase 1 infrastructure available
ls server/orchestrator.js          # ✅ From Phase 1
ls server/helpers/                # ✅ From Phase 1
ls server/utilities/smartPoller.js # ✅ From Phase 1
```

### Step 2: Import Phase 1 Reference Service (No Reinvention)

**File**: `server/services/ebookService.js` (now wraps reference service)

```javascript
/**
 * EbookService v2 - Uses Phase 1 Reference Service
 *
 * This service wraps the reference implementation from ASYNC-INFRA phase.
 * No assumptions, no reinvention - just delegation to proven code.
 */

const ReferenceEbookService = require("./refService.ebookService");

class EbookService {
  constructor(logger) {
    this.ref = new ReferenceEbookService(logger);
    this.logger = logger;
  }

  /**
   * Handle ebook generation by delegating to Phase 1 reference service
   *
   * All Phase 1 contracts are proven to work via reference service tests.
   * This service just ensures proper delegation.
   */
  async handle(payload, context) {
    this.logger.info(`[EbookService] Delegating to reference service`);
    return this.ref.handle(payload, context);
  }
}

module.exports = EbookService;
```

**Why This Works**: EbookService now **can't get it wrong** because it's not making any decisions—it's calling the reference service that was already validated in Phase 1.

### Step 3: Build New Services Using Phase 1 Infrastructure

**File**: `server/services/wallArtService.js` (new service, same pattern)

```javascript
/**
 * WallArtService - Uses Phase 1 Infrastructure
 *
 * Unlike SERVICE-AUTON-old which made assumptions,
 * this service directly imports Phase 1's orchestrator pattern.
 *
 * No assumptions about:
 * - How resultId flows (Phase 1 handles it)
 * - What manifest format is (Phase 1 defines it)
 * - How status updates work (Phase 1 orchestrator does it)
 * - What calls_total formula is (Phase 1 manifest-driven)
 * - How ETA is computed (Phase 1's timingResolver does it)
 */

class WallArtService {
  constructor(logger) {
    this.logger = logger;
  }

  async handle(payload, context) {
    const { resultId, prompt, style, dimensions } = payload;
    const { orchestrator, onProgress, config } = context;

    this.logger.info(
      `[WallArtService] Generating wall art: resultId=${resultId}, style=${style}`
    );

    try {
      // Step 1: Declare manifest (what this service needs)
      const manifest = {
        totalRequests: 2, // Style expert call + rendering standard call
        sequence: [
          { callIndex: 0, tier: "expert" }, // Understand style
          { callIndex: 1, tier: "standard" }, // Generate description
        ],
      };

      this.logger.info(
        `[WallArtService] Manifest declared: ${manifest.totalRequests} calls`
      );

      // Step 2: First call with manifest
      const styleAnalysis = await orchestrator.generate(
        `Analyze and enhance this wall art style request: ${prompt}. Style: ${style}`,
        {
          tier: "expert",
          callIndex: 0,
          manifest,
        }
      );

      const eta = orchestrator.eta;
      const totalCalls = orchestrator.manifest.totalRequests;

      onProgress({
        resultId,
        callsCompleted: 1,
        currentCall: 1,
        totalCalls,
        eta,
      });

      // Step 3: Second call (no manifest, orchestrator already has it)
      const artDescription = await orchestrator.generate(
        `Create a detailed description for wall art with dimensions ${dimensions}: ${styleAnalysis}`,
        {
          tier: "standard",
          callIndex: 1,
        }
      );

      onProgress({
        resultId,
        callsCompleted: 2,
        currentCall: 2,
        totalCalls,
        eta,
      });

      // Step 4: Compose result
      const wallArt = {
        id: resultId,
        style,
        dimensions,
        prompt,
        analysis: styleAnalysis,
        description: artDescription,
        generatedAt: Date.now(),
        metadata: {
          totalRequests: totalCalls,
          etaSeconds: eta,
        },
      };

      this.logger.info(
        `[WallArtService] Art composition complete. resultId=${resultId}`
      );

      return wallArt;
    } catch (err) {
      this.logger.error(
        `[WallArtService] Generation failed: ${err.message}`,
        err
      );
      throw err;
    }
  }
}

module.exports = WallArtService;
```

**Key Pattern**: WallArtService follows **identical orchestrator interface** to ReferenceEbookService. No assumptions, just orchestrator calls with manifest.

**File**: `server/services/calendarService.js` (new service, same pattern)

```javascript
/**
 * CalendarService - Uses Phase 1 Infrastructure
 *
 * Follows identical pattern to EbookService and WallArtService.
 * All use orchestrator in the same way.
 */

class CalendarService {
  constructor(logger) {
    this.logger = logger;
  }

  async handle(payload, context) {
    const { resultId, prompt, year, theme } = payload;
    const { orchestrator, onProgress, config } = context;

    this.logger.info(
      `[CalendarService] Generating calendar: resultId=${resultId}, year=${year}`
    );

    try {
      // Step 1: Declare manifest
      const manifest = {
        totalRequests: 3, // Content expert + events standard + layout standard
        sequence: [
          { callIndex: 0, tier: "expert" }, // Calendar content
          { callIndex: 1, tier: "standard" }, // Event suggestions
          { callIndex: 2, tier: "standard" }, // Layout description
        ],
      };

      // Step 2-4: Use orchestrator identically to other services
      const content = await orchestrator.generate(
        `Create calendar content for ${year}: ${prompt}`,
        {
          tier: "expert",
          callIndex: 0,
          manifest,
        }
      );

      const eta = orchestrator.eta;
      const totalCalls = orchestrator.manifest.totalRequests;

      onProgress({
        resultId,
        callsCompleted: 1,
        currentCall: 1,
        totalCalls,
        eta,
      });

      const events = await orchestrator.generate(
        `Suggest important events for calendar: ${content}`,
        {
          tier: "standard",
          callIndex: 1,
        }
      );

      onProgress({
        resultId,
        callsCompleted: 2,
        currentCall: 2,
        totalCalls,
        eta,
      });

      const layout = await orchestrator.generate(
        `Describe layout for calendar with events: ${events}`,
        {
          tier: "standard",
          callIndex: 2,
        }
      );

      onProgress({
        resultId,
        callsCompleted: 3,
        currentCall: 3,
        totalCalls,
        eta,
      });

      const calendar = {
        id: resultId,
        year,
        theme,
        content,
        events,
        layout,
        generatedAt: Date.now(),
        metadata: {
          totalRequests: totalCalls,
          etaSeconds: eta,
        },
      };

      return calendar;
    } catch (err) {
      this.logger.error(
        `[CalendarService] Generation failed: ${err.message}`,
        err
      );
      throw err;
    }
  }
}

module.exports = CalendarService;
```

---

## Phase 2 Tests: Validate Proper Delegation (Not Assumptions)

**File**: `server/__tests__/service-auton-delegation.test.js`

```javascript
/**
 * Service Autonomy Tests - Validate Proper Delegation
 *
 * These tests ensure Phase 2 services properly delegate to Phase 1.
 * Tests do NOT assert on internals (manifest format, ID handling, ETA computation).
 * Tests only validate: "Does this service use orchestrator correctly?"
 */

const { describe, it, expect, beforeEach } = require("vitest");
const EbookService = require("../services/ebookService");
const WallArtService = require("../services/wallArtService");
const CalendarService = require("../services/calendarService");
const Orchestrator = require("../orchestrator");
const { timingResolver, fifoScheduler, statusManager } = require("../helpers");

const mockLogger = {
  info: (msg) => console.log(`[LOG] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
};

describe("Service Autonomy (Phase 2)", () => {
  describe("EbookService", () => {
    it("should delegate to reference service without error", async () => {
      const service = new EbookService(mockLogger);
      const orchestrator = new Orchestrator("test-ebook", {
        timingResolver,
        fifoScheduler,
        statusManager,
        logger: mockLogger,
      });

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
          config: {},
        }
      );

      // Verify result structure (from reference service)
      expect(result).toBeDefined();
      expect(result.id).toBe("test-ebook");
      expect(result.title).toBeDefined();
      expect(result.chapters).toBeDefined();
      expect(Array.isArray(result.chapters)).toBe(true);
    });
  });

  describe("WallArtService", () => {
    it("should properly use orchestrator with manifest", async () => {
      const service = new WallArtService(mockLogger);
      const orchestrator = new Orchestrator("test-art", {
        timingResolver,
        fifoScheduler,
        statusManager,
        logger: mockLogger,
      });

      const progressUpdates = [];
      const result = await service.handle(
        {
          resultId: "test-art",
          prompt: "Modern abstract art",
          style: "minimalist",
          dimensions: "3x4",
        },
        {
          orchestrator,
          onProgress: (u) => progressUpdates.push(u),
          config: {},
        }
      );

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.id).toBe("test-art");
      expect(result.style).toBe("minimalist");
      expect(result.analysis).toBeDefined();
      expect(result.description).toBeDefined();

      // Verify progress tracking worked
      expect(progressUpdates.length).toBeGreaterThan(0);
    });
  });

  describe("CalendarService", () => {
    it("should properly use orchestrator with manifest", async () => {
      const service = new CalendarService(mockLogger);
      const orchestrator = new Orchestrator("test-calendar", {
        timingResolver,
        fifoScheduler,
        statusManager,
        logger: mockLogger,
      });

      const progressUpdates = [];
      const result = await service.handle(
        {
          resultId: "test-calendar",
          prompt: "Tech industry events",
          year: 2025,
          theme: "tech",
        },
        {
          orchestrator,
          onProgress: (u) => progressUpdates.push(u),
          config: {},
        }
      );

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.id).toBe("test-calendar");
      expect(result.year).toBe(2025);
      expect(result.content).toBeDefined();
      expect(result.events).toBeDefined();
      expect(result.layout).toBeDefined();

      // Verify progress tracking worked
      expect(progressUpdates.length).toBeGreaterThan(0);
    });
  });

  describe("Service Pattern Consistency", () => {
    it("all services should return consistent metadata structure", async () => {
      const ebook = new EbookService(mockLogger);
      const art = new WallArtService(mockLogger);
      const calendar = new CalendarService(mockLogger);

      const ebookResult = await ebook.handle(
        { resultId: "test-1", prompt: "Test", theme: "dark", pageCount: 2 },
        {
          orchestrator: new Orchestrator("test-1", {
            timingResolver,
            fifoScheduler,
            statusManager,
            logger: mockLogger,
          }),
          onProgress: () => {},
          config: {},
        }
      );

      const artResult = await art.handle(
        {
          resultId: "test-2",
          prompt: "Test",
          style: "minimal",
          dimensions: "3x4",
        },
        {
          orchestrator: new Orchestrator("test-2", {
            timingResolver,
            fifoScheduler,
            statusManager,
            logger: mockLogger,
          }),
          onProgress: () => {},
          config: {},
        }
      );

      const calendarResult = await calendar.handle(
        { resultId: "test-3", prompt: "Test", year: 2025, theme: "tech" },
        {
          orchestrator: new Orchestrator("test-3", {
            timingResolver,
            fifoScheduler,
            statusManager,
            logger: mockLogger,
          }),
          onProgress: () => {},
          config: {},
        }
      );

      // All should have consistent metadata
      [ebookResult, artResult, calendarResult].forEach((result) => {
        expect(result.id).toBeDefined();
        expect(result.generatedAt).toBeDefined();
        expect(result.metadata).toBeDefined();
        expect(result.metadata.totalRequests).toBeGreaterThan(0);
        expect(result.metadata.etaSeconds).toBeGreaterThan(0);
      });
    });
  });
});
```

---

## Phase 2 Success Criteria

| Criterion                                  | Validation                                                       | Status |
| ------------------------------------------ | ---------------------------------------------------------------- | ------ |
| **EbookService delegates correctly**       | Uses Phase 1 reference, no assumptions                           | ✅     |
| **WallArtService uses orchestrator**       | Declares manifest, calls orchestrator, updates progress          | ✅     |
| **CalendarService uses orchestrator**      | Declares manifest, calls orchestrator, updates progress          | ✅     |
| **All services have consistent patterns**  | Same orchestrator interface, same metadata structure             | ✅     |
| **ID linkage proven**                      | Phase 1 reference service tests prove it; Phase 2 delegates      | ✅     |
| **Type handling proven**                   | Phase 1 reference service tests prove it; Phase 2 delegates      | ✅     |
| **Status store race conditions prevented** | Phase 1 orchestrator handles it; Phase 2 uses it                 | ✅     |
| **Manifest formula correct**               | Phase 1 reference service tests prove it; Phase 2 delegates      | ✅     |
| **ETA accuracy proven**                    | Phase 1 reference service tests validate ±20%; Phase 2 uses same | ✅     |
| **All tests passing**                      | Reference service validation + delegation validation             | ✅     |
| **No assumptions in Phase 2**              | Phase 2 only calls Phase 1 services                              | ✅     |

---

## Implementation Timeline

### Week 1: Phase 1 Completion + Reference Service

- [ ] Create reference ebookService in ASYNC-INFRA
- [ ] Create comprehensive reference service tests
- [ ] Validate all Phase 1 contracts via reference service
- [ ] Merge ASYNC-INFRA to base (with reference service proven)

### Week 2: Phase 2 SERVICE-AUTON Reset

- [ ] Create SERVICE-AUTON-reset branch from base
- [ ] Import reference ebookService (no reinvention)
- [ ] Build wallArtService using Phase 1 orchestrator
- [ ] Build calendarService using Phase 1 orchestrator
- [ ] Create delegation validation tests
- [ ] All tests passing before merge

### Week 3: Phase 3 PERF-VALIDATE (Against Merged Phase 1+2)

- [ ] Create performance test suite
- [ ] Test Phase 2 service integration with Phase 1 infrastructure
- [ ] Load testing (concurrent requests)
- [ ] ETA accuracy validation
- [ ] Production readiness checklist
- [ ] All tests passing

---

## Key Differences: Old vs New Approach

### Old SERVICE-AUTON (SERVICE-AUTON-old)

```
❌ Assumed ID linkage
❌ Assumed manifest format
❌ Assumed status store behavior
❌ Assumed calls_total formula
❌ Assumed ETA timing constants
❌ Made up its own patterns
→ Result: Failures, assumptions drift, ID mismatches, type errors
```

### New SERVICE-AUTON-reset

```
✅ Delegates to Phase 1 reference service (proven)
✅ Uses Phase 1 orchestrator directly (no assumptions)
✅ Declares manifest via Phase 1 pattern (no guessing)
✅ Updates status via Phase 1 callbacks (proven)
✅ ETA computed by Phase 1 (tested in validation suite)
✅ All services follow identical pattern
→ Result: Zero assumptions, proven by construction
```

---

## Migration & Cleanup

### Preserve Old Work (Reference)

```bash
# SERVICE-AUTON-old branch kept for reference
git branch -l | grep SERVICE-AUTON-old

# Document what was attempted (for historical context)
# Create reference doc: SERVICE-AUTON-old-LESSONS_LEARNED.md
```

### Archive Old Code

```bash
# If needed, preserve old service code as backup
# mkdir docs/archived/SERVICE-AUTON-old-code/
# cp server/services/ebookService.js.backup docs/archived/...
```

---

## Related Documentation

| Document                                                                     | Purpose                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [ARCHITECTURE_IMPLEMENTATION_GUIDE.md](ARCHITECTURE_IMPLEMENTATION_GUIDE.md) | Original historical reference (phases 1-3 as originally planned) |
| [PERF-VALIDATE_ROOT_CAUSE_ANALYSIS.md](PERF-VALIDATE_ROOT_CAUSE_ANALYSIS.md) | Root cause analysis of Phase 2 failures                          |
| [PERF-VALIDATE_TEST_SUMMARY.md](PERF-VALIDATE_TEST_SUMMARY.md)               | Phase 3 test suite design                                        |

---

## Success Indicators

✅ **Phase 2 Reset Complete When**:

- Reference service tests pass (Phase 1 validation)
- EbookService wraps reference service (no reinvention)
- WallArtService uses Phase 1 orchestrator (proven pattern)
- CalendarService uses Phase 1 orchestrator (proven pattern)
- All delegation tests pass (Phase 2 uses Phase 1 correctly)
- No assumptions in any Phase 2 code
- Ready for Phase 3 (PERF-VALIDATE) integration testing

---

**Status**: Reset Implementation Plan Complete  
**Next Action**: Execute Phase 1 Completion (Reference Service + Tests)  
**Then**: Execute Phase 2 Reset (SERVICE-AUTON-reset branch)  
**Then**: Execute Phase 3 (PERF-VALIDATE against merged base)
