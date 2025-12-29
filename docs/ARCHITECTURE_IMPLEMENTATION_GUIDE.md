# AetherPress Architecture Implementation Guide

**Date**: December 19, 2025 @ 5:20PM
**Branch**: `feat/ebook-nat-cont`

**Audience**: Engineers, Implementers, QA  
**Status**: Implementation Ready
**Related**: [ARCHITECTURE_ROADMAP_EXECUTIVE.md](ARCHITECTURE_ROADMAP_EXECUTIVE.md) (design guide)

---

## Table of Contents

1. [Overview](#overview)
2. [ASYNC-INFRA: Foundation](#async-infra-foundation)
3. [SERVICE-AUTON: Service Migration](#service-auton-service-migration)
4. [PERF-VALIDATE: Validation & Hardening](#perf-validate-validation--hardening)
5. [Component Specifications](#component-specifications)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Plan](#deployment-plan)

---

## Overview

This document provides detailed implementation specifications for the five architectural patterns:

1. **PART-A**: Async acceptance (dumb plumbing)
2. **SERVICE_MACHINE_PATTERN**: Autonomous services
3. **PART-B Orchestrator**: Waiter pattern for clean interfaces
4. **Helpers Framework**: Per-request computation
5. **Utilities Framework**: App-wide state management

---

## Branching Strategy: Feature Isolation

**Each phase is implemented in its own feature branch.** The base branch (`feat/ebook-nat-cont`) remains stable and serves as the foundation.

```
Base: feat/ebook-nat-cont (stable, tested foundation)
  ├─ Branch: ASYNC-INFRA
  │   └─ Implements PART-A, orchestrator, helpers, utilities
  │   └─ Tested independently
  │   └─ Merged to base when ready
  │
  ├─ Branch: SERVICE-AUTON
  │   └─ Refactors ebookService, adds new services
  │   └─ Tested independently
  │   └─ Merged to base when ready
  │
  └─ Branch: PERF-VALIDATE
      └─ Performance testing, load testing, hardening
      └─ Tested against merged base
      └─ Merged to base when ready
```

**Benefits of Feature Isolation**:

- If ASYNC-INFRA has issues → don't merge it. Base stays clean.
- If SERVICE-AUTON breaks → revert merge commit. Base recovers in minutes.
- Teams can work on different phases in parallel without conflict.
- Each merge gate has clear success criteria before integration.

**Pre-Merge Checklist** (applies to all feature branches):

- [ ] All tests passing (unit, integration, E2E)
- [ ] Code review approved (peer + lead)
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] No merge conflicts with base
- [ ] CI/CD checks green

---

## ASYNC-INFRA: Foundation (Weeks 1-2)

### ASYNC-INFRA.1: Implement PART-A (Async Acceptance)

**File**: `server/index.js` (HTTP handler for `/api/ebook/generate`)

**Current Code (Synchronous)**:

```javascript
app.post("/api/ebook/generate", async (req, res) => {
  const { prompt, theme, pageCount } = req.body;

  // Synchronous execution (blocks client)
  try {
    const result = await genieService.process({
      mode: "ebook",
      prompt,
      theme,
      pageCount,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**New Code (Asynchronous, PART-A)**:

```javascript
app.post("/api/ebook/generate", async (req, res) => {
  const { prompt, theme, pageCount } = req.body;

  // Input validation
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt required" });
  }

  // PART-A: Generate resultId immediately
  const resultId = generateUUID();
  const initialStatus = {
    resultId,
    status: "queued",
    eta: null,
    message: "Job queued, waiting to start",
  };

  // Store initial status
  statusMap.set(resultId, initialStatus);

  // Return 202 Accepted immediately (< 100ms)
  res.status(202).json({
    resultId,
    status: "queued",
    message: "Your request is queued. Use this ID to check status.",
  });

  // HAND OFF ASYNCHRONOUSLY (no waiting)
  genieService
    .process({
      resultId, // ← Pass resultId so service can enrich status
      mode: "ebook",
      prompt,
      theme,
      pageCount,
    })
    .then((result) => {
      // Success: update status
      statusMap.set(resultId, {
        resultId,
        status: "complete",
        result,
        completedAt: Date.now(),
      });
    })
    .catch((err) => {
      // Error: update status with error details
      statusMap.set(resultId, {
        resultId,
        status: "error",
        error: err.message,
        code: err.code || "GENERATION_ERROR",
        failedAt: Date.now(),
      });
    });
});
```

**Key Changes**:

- ✅ Return 202 immediately (no waiting for backend)
- ✅ Generate resultId as job identifier
- ✅ Hand off async via Promise.then/catch (no await)
- ✅ Update status map asynchronously

**Testing**:

```javascript
describe("PART-A: Async Acceptance", () => {
  it("should return 202 immediately", async () => {
    const start = Date.now();
    const res = await request(app).post("/api/ebook/generate").send({
      prompt: "Test prompt",
      theme: "dark",
      pageCount: 5,
    });

    const elapsed = Date.now() - start;
    assert.equal(res.status, 202);
    assert.ok(res.body.resultId);
    assert.ok(elapsed < 150); // Should be < 150ms
  });

  it("should hand off async (return before backend completes)", async () => {
    const res = await request(app).post("/api/ebook/generate").send({...});

    const resultId = res.body.resultId;
    const status = statusMap.get(resultId);

    // Status should be "queued" initially
    assert.equal(status.status, "queued");
  });
});
```

---

### ASYNC-INFRA.2: Create Orchestrator with Helpers

**File**: `server/orchestrator.js`

**Responsibilities**:

- Accept request from genieService
- Create fresh helper instances
- Route to service
- Enforce FIFO + spacing
- Track progress
- Coordinate utilities

**Structure**:

```javascript
class Orchestrator {
  constructor(resultId, helpers) {
    this.resultId = resultId;
    this.helpers = helpers; // timingResolver, fifoScheduler, etc.

    // State for this job
    this.manifestReceived = false;
    this.manifest = null;
    this.eta = null;
    this.schedule = null;
    this.callsCompleted = 0;
    this.errors = [];
  }

  async generate(prompt, options) {
    // FIRST CALL: Capture manifest, compute timing
    if (options.manifest && !this.manifestReceived) {
      this.manifestReceived = true;
      this.manifest = options.manifest;

      // Helper: Compute timing from manifest
      const timing = this.helpers.timingResolver.compute(this.manifest, {
        modelSpacing: { expert: 250, standard: 100 },
      });
      this.eta = timing.totalEta;

      // Helper: Build FIFO schedule with spacing
      this.schedule = this.helpers.fifoScheduler.build(timing);

      // Helper: Initialize status
      this.helpers.statusManager.init(this.resultId, {
        eta: this.eta,
        totalCalls: this.manifest.totalRequests,
      });

      logger.info(
        `Manifest captured: ${this.manifest.totalRequests} calls, ETA ${this.eta}s`
      );
    }

    // ALL CALLS: Enforce FIFO + spacing
    const callSlot = this.schedule.calls[options.callIndex];
    const now = Date.now();
    const waitMs = Math.max(0, callSlot.reservedTime - now);

    if (waitMs > 0) {
      logger.debug(
        `Call ${options.callIndex}: Waiting ${waitMs}ms for reserved slot`
      );
      await sleep(waitMs);
    }

    // Select tool (orchestrator decides, service doesn't know)
    const tool = this.selectTool(options.tier);
    const model = this.tierToModel(options.tier);

    logger.info(
      `Call ${options.callIndex}: Using ${tool.name} (${options.tier} → ${model})`
    );

    // Execute
    const result = await tool.generate(prompt, {
      tier: options.tier,
      model,
    });

    // Update progress
    this.callsCompleted++;
    this.helpers.statusManager.updateProgress(this.resultId, {
      callsCompleted: this.callsCompleted,
      currentCall: options.callIndex + 1,
    });

    return result;
  }

  selectTool(tier) {
    // Currently returns aiService
    // Future: could return claudeService, anthropicService, etc.
    return aiService;
  }

  tierToModel(tier) {
    return tier === "expert" ? "gemini-2.5-pro" : "gemini-2.5-flash";
  }
}

module.exports = Orchestrator;
```

**Testing**:

```javascript
describe("Orchestrator", () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator("test-id", helpers);
  });

  it("should capture manifest on first call", async () => {
    const manifest = {
      totalRequests: 4,
      sequence: [...]
    };

    await orchestrator.generate("prompt", {
      tier: "expert",
      callIndex: 0,
      manifest,
    });

    assert.equal(orchestrator.eta, 23);
    assert.ok(orchestrator.schedule);
  });

  it("should enforce FIFO spacing", async () => {
    // Call 0: immediate
    const start0 = Date.now();
    await orchestrator.generate("prompt", {
      tier: "expert",
      callIndex: 0,
      manifest: {...},
    });
    const elapsed0 = Date.now() - start0;

    // Call 1: should wait ~250ms (Pro spacing)
    const start1 = Date.now();
    await orchestrator.generate("prompt", {
      tier: "expert",
      callIndex: 1,
    });
    const elapsed1 = Date.now() - start1;

    assert.ok(elapsed1 >= 200); // At least 200ms of waiting
  });
});
```

---

### ASYNC-INFRA.3: Create Helpers Framework

**File**: `server/helpers/index.js`

**Helpers to Create**:

#### timingResolver

```javascript
// server/helpers/timingResolver.js
function compute(manifest, config) {
  const { modelSpacing = {}, modelLatencies = {} } = config;

  const spacingPro = modelSpacing.expert || 250;
  const spacingFlash = modelSpacing.standard || 100;
  const latencyPro = modelLatencies.expert || 6000;
  const latencyFlash = modelLatencies.standard || 5000;

  let totalTime = 0;
  const schedule = [];

  manifest.sequence.forEach((call, idx) => {
    const isExpert = call.tier === "expert";
    const latency = isExpert ? latencyPro : latencyFlash;
    const spacing = isExpert ? spacingPro : spacingFlash;

    const startTime = idx === 0 ? 0 : schedule[idx - 1].endTime + spacing;
    const endTime = startTime + latency;

    schedule.push({
      callIndex: call.callIndex,
      tier: call.tier,
      startTime,
      duration: latency,
      endTime,
      reservedTime: startTime, // When to actually execute
    });

    totalTime = Math.max(totalTime, endTime);
  });

  return {
    totalEta: Math.ceil(totalTime / 1000), // in seconds
    totalEtaMs: totalTime,
    schedule,
  };
}

module.exports = { compute };
```

#### fifoScheduler

```javascript
// server/helpers/fifoScheduler.js
function build(timing) {
  return {
    calls: timing.schedule.map((slot) => ({
      callIndex: slot.callIndex,
      reservedTime: slot.reservedTime, // milliseconds from job start
      tier: slot.tier,
      duration: slot.duration,
    })),
    totalEta: timing.totalEta,
  };
}

module.exports = { build };
```

#### statusManager

```javascript
// server/helpers/statusManager.js
function init(resultId, { eta, totalCalls }) {
  const status = {
    resultId,
    status: "in-progress",
    eta,
    totalCalls,
    callsCompleted: 0,
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
  };

  statusMap.set(resultId, status);
  return status;
}

function updateProgress(
  resultId,
  { callsCompleted, currentCall, errors = [] }
) {
  const status = statusMap.get(resultId);
  if (!status) return;

  status.callsCompleted = callsCompleted;
  status.currentCall = currentCall;
  status.errors = errors;
  status.lastUpdatedAt = Date.now();

  statusMap.set(resultId, status);
}

module.exports = { init, updateProgress };
```

**Testing**:

```javascript
describe("Helpers", () => {
  it("timingResolver should compute correct ETA for 4-call manifest", () => {
    const result = timingResolver.compute(
      {
        totalRequests: 4,
        sequence: [
          { tier: "expert" }, // Pro: 6s
          { tier: "expert" }, // Pro: 6s + 250ms spacing
          { tier: "standard" }, // Flash: 5s + 100ms spacing
          { tier: "expert" }, // Pro: 6s + 250ms spacing
        ],
      },
      {}
    );

    assert.equal(result.totalEta, 23); // ~23 seconds
    assert.equal(result.schedule.length, 4);
    assert.ok(result.schedule[1].startTime >= 6250); // 6s + 250ms spacing
  });
});
```

---

### ASYNC-INFRA.4: Create Utilities Framework (smartPoller)

**File**: `server/utilities/smartPoller.js`

**Responsibilities**:

- Accept task assignments from genieService
- Store status for multiple concurrent jobs
- Accept progress updates (enrichment)
- Return status to clients via HTTP

**Structure**:

```javascript
class SmartPoller {
  constructor() {
    this.tasks = new Map(); // resultId → status
  }

  assignTask(resultId, { eta, totalCalls }) {
    this.tasks.set(resultId, {
      resultId,
      status: "in-progress",
      eta,
      totalCalls,
      callsCompleted: 0,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      errors: [],
    });
  }

  updateProgress(
    resultId,
    { callsCompleted, nextEstimatedCompletion, errors = [] }
  ) {
    const task = this.tasks.get(resultId);
    if (!task) return;

    task.callsCompleted = callsCompleted;
    task.nextEstimatedCompletion = nextEstimatedCompletion;
    task.errors = errors;
    task.lastUpdatedAt = Date.now();
  }

  getStatus(resultId) {
    const task = this.tasks.get(resultId);
    if (!task) return null;

    const elapsedMs = Date.now() - task.startedAt;
    const remainingMs = Math.max(0, task.nextEstimatedCompletion - Date.now());
    const progressPercent = Math.round(
      (task.callsCompleted / task.totalCalls) * 100
    );

    return {
      status: task.status,
      eta: task.eta,
      calls_completed: task.callsCompleted,
      calls_total: task.totalCalls,
      progress_percent: progressPercent,
      estimated_remaining_seconds: Math.ceil(remainingMs / 1000),
      message: `Processing call ${task.callsCompleted + 1} of ${
        task.totalCalls
      }`,
      errors: task.errors.length > 0 ? task.errors : null,
    };
  }

  markComplete(resultId, result) {
    const task = this.tasks.get(resultId);
    if (!task) return;

    task.status = "complete";
    task.result = result;
    task.completedAt = Date.now();
  }

  markError(resultId, error) {
    const task = this.tasks.get(resultId);
    if (!task) return;

    task.status = "error";
    task.error = error;
    task.failedAt = Date.now();
  }
}

module.exports = new SmartPoller();
```

**HTTP Endpoint** (`server/index.js`):

```javascript
app.get("/api/status/:resultId", (req, res) => {
  const { resultId } = req.params;

  const status = smartPoller.getStatus(resultId);
  if (!status) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json(status);
});
```

**Testing**:

```javascript
describe("smartPoller", () => {
  it("should track task progress", () => {
    smartPoller.assignTask("job-1", { eta: 23, totalCalls: 4 });

    smartPoller.updateProgress("job-1", {
      callsCompleted: 1,
      nextEstimatedCompletion: Date.now() + 17000,
    });

    const status = smartPoller.getStatus("job-1");
    assert.equal(status.calls_completed, 1);
    assert.equal(status.progress_percent, 25);
  });
});
```

---

### ASYNC-INFRA.5: Integrate into genieService

**File**: `server/genieService.js` (refactored for PART-B)

**New Structure**:

```javascript
async process(payload) {
  const { resultId, mode, prompt, metadata } = payload;

  try {
    // Create fresh orchestrator with helpers
    const orchestrator = new Orchestrator(resultId, {
      timingResolver,
      fifoScheduler,
      statusManager,
      progressTracker,
      toolSelector,
      errorReporter,
    });

    // ASSIGN TASK to smartPoller utility
    // (smartPoller will get ETA from first call via orchestrator)

    // Route to service
    const service = this.selectService(mode);
    if (!service) {
      throw new Error(`Unknown mode: ${mode}`);
    }

    // Execute service with orchestrator interface
    const result = await service.handle(payload, {
      orchestrator,
      onProgress: (activity) => {
        // Enrich smartPoller with real activity
        smartPoller.updateProgress(resultId, activity);
      },
      logger,
      config,
    });

    // Mark complete in smartPoller
    smartPoller.markComplete(resultId, result);

    // Persist result
    await persistence.save(resultId, result);

    return result;
  } catch (err) {
    // Mark error in smartPoller
    smartPoller.markError(resultId, {
      message: err.message,
      code: err.code,
    });

    // Log error
    logger.error(`Generation failed for ${resultId}:`, err);

    throw err;
  }
}

selectService(mode) {
  switch (mode) {
    case "ebook":
      return ebookService;
    // Add other services as implemented
    default:
      return null;
  }
}
```

**Key Changes**:

- ✅ Fresh orchestrator per request
- ✅ Service receives orchestrator (not hard-coded tools)
- ✅ Callback to enrich smartPoller with progress
- ✅ Error handling updates smartPoller
- ✅ genieService stays small and focused

---

### ASYNC-INFRA.6: End-to-End Integration Test

```javascript
describe("ASYNC-INFRA: PART-A + Helpers + smartPoller", () => {
  it("should process async request end-to-end", async () => {
    // 1. Client sends request
    const postRes = await request(app).post("/api/ebook/generate").send({
      prompt: "Write a 3-page ebook about sustainable living",
      theme: "dark",
      pageCount: 3,
    });

    // 2. Should return immediately with resultId
    assert.equal(postRes.status, 202);
    const resultId = postRes.body.resultId;
    assert.ok(resultId);

    // 3. Status should be "queued" initially
    await sleep(50); // Let async handler start
    let statusRes = await request(app).get(`/api/status/${resultId}`);
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.status, "in-progress");
    assert.ok(statusRes.body.eta); // ETA computed
    assert.ok(statusRes.body.calls_total); // Manifest received

    // 4. Job should eventually complete
    let completed = false;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      statusRes = await request(app).get(`/api/status/${resultId}`);
      if (statusRes.body.status === "complete") {
        completed = true;
        break;
      }
    }

    assert.ok(completed, "Job should complete within 15 seconds");
    assert.ok(statusRes.body.result);
  });
});
```

---

## SERVICE-AUTON: Service Migration (Weeks 3-4)

### SERVICE-AUTON.1: Create SERVICE_MACHINE_PATTERN Interface

**File**: `server/services/serviceBase.js`

**Base Class for All Services**:

```javascript
class Service {
  // All services implement this interface
  async handle(payload, resourceKit) {
    // payload: { prompt, metadata, ... }
    // resourceKit: { orchestrator, onProgress, logger, config }

    // Service MUST:
    // 1. Use orchestrator.generate() for all AI calls
    // 2. Send manifest on first call
    // 3. Return { pages, html, metadata }
    // 4. Throw { error, message, missing, attempted } on failure

    throw new Error("Subclass must implement handle()");
  }
}

module.exports = Service;
```

---

### SERVICE-AUTON.2: Refactor ebookService

**File**: `server/services/ebookService.js`

**Current Code** (using orchestratorProxy - coupled):

```javascript
async function handle(payload, orchestratorProxy) {
  // Uses orchestratorProxy which is bound to genieService
  // Hard to test independently
  // Doesn't declare manifest upfront
}
```

**New Code** (using orchestrator interface - autonomous):

```javascript
class EbookService extends Service {
  async handle(payload, resourceKit) {
    const { orchestrator, onProgress, logger, config } = resourceKit;
    const { prompt, theme, pageCount } = payload;

    try {
      // Calculate cost (for manifest)
      const cost = 1 + Math.ceil(pageCount / 2);

      // FIRST CALL: Send manifest
      const structure = await orchestrator.generate(
        this.generateStructurePrompt(prompt),
        {
          tier: "expert",
          callIndex: 0,
          manifest: {
            totalRequests: cost,
            sequence: this.buildSequence(pageCount),
          },
        }
      );

      if (!structure) {
        throw {
          error: "ASSEMBLY_FAILED",
          message: "Structure generation returned empty",
          missing: { structure: true },
        };
      }

      // SUBSEQUENT CALLS: No manifest
      const opening = await orchestrator.generate(
        this.generateOpeningPrompt(prompt, structure),
        { tier: "expert", callIndex: 1 }
      );

      const chapters = [];
      for (let i = 0; i < cost - 2; i++) {
        const chapter = await orchestrator.generate(
          this.generateChapterPrompt(prompt, i),
          { tier: "standard", callIndex: i + 2 }
        );

        if (!chapter) {
          throw {
            error: "ASSEMBLY_FAILED",
            message: `Chapter ${i} generation returned empty`,
            missing: { chapters: [i] },
          };
        }

        chapters.push(chapter);
      }

      const closing = await orchestrator.generate(
        this.generateClosingPrompt(prompt, structure),
        { tier: "expert", callIndex: cost - 1 }
      );

      // Compose HTML
      const html = this.composeHTML({
        structure,
        opening,
        chapters,
        closing,
        theme,
      });

      // Notify progress (optional, orchestrator already tracks)
      onProgress({
        callsCompleted: cost,
        nextEstimatedCompletion: Date.now(),
      });

      return {
        type: "ebook",
        pages: [structure, opening, ...chapters, closing],
        html,
        metadata: {
          cost,
          theme,
          pageCount,
          model: "gemini-2.5",
        },
      };
    } catch (err) {
      logger.error("ebookService error:", err);
      throw err;
    }
  }

  buildSequence(pageCount) {
    const cost = 1 + Math.ceil(pageCount / 2);
    const sequence = [];

    sequence.push({ callIndex: 0, tier: "expert" }); // Structure
    sequence.push({ callIndex: 1, tier: "expert" }); // Opening
    for (let i = 2; i < cost - 1; i++) {
      sequence.push({ callIndex: i, tier: "standard" }); // Chapters
    }
    sequence.push({ callIndex: cost - 1, tier: "expert" }); // Closing

    return sequence;
  }

  generateStructurePrompt(prompt) {
    return `Generate a table of contents for: ${prompt}`;
  }

  generateOpeningPrompt(prompt, structure) {
    return `Write opening chapter for: ${prompt}\n\nTOC:\n${JSON.stringify(
      structure
    )}`;
  }

  generateChapterPrompt(prompt, chapterIndex) {
    return `Write chapter ${chapterIndex + 1} for: ${prompt}`;
  }

  generateClosingPrompt(prompt, structure) {
    return `Write conclusion for: ${prompt}`;
  }

  composeHTML({ structure, opening, chapters, closing, theme }) {
    // Compose HTML from components
    // ... (existing HTML composition logic)
    return `<html>...</html>`;
  }
}

module.exports = new EbookService();
```

**Key Changes**:

- ✅ Extends Service base class
- ✅ Uses `orchestrator.generate()` only (no hard-coded tools)
- ✅ Sends manifest on first call
- ✅ Declares tiers (expert/standard) without knowing Pro/Flash
- ✅ Independently testable with mocked orchestrator

**Testing**:

```javascript
describe("ebookService (SERVICE_MACHINE_PATTERN)", () => {
  let mockOrchestrator;

  beforeEach(() => {
    mockOrchestrator = {
      generate: sinon.stub().resolves("generated content"),
    };
  });

  it("should send manifest on first call", async () => {
    await ebookService.handle(
      { prompt: "test", theme: "dark", pageCount: 3 },
      { orchestrator: mockOrchestrator, onProgress: () => {}, logger, config }
    );

    // Verify manifest was sent
    const firstCall = mockOrchestrator.generate.firstCall;
    assert.ok(firstCall.args[1].manifest);
    assert.equal(firstCall.args[1].manifest.totalRequests, 3); // 1 + ceil(3/2)
  });

  it("should return structured ebook", async () => {
    const result = await ebookService.handle(
      { prompt: "test", theme: "dark", pageCount: 3 },
      { orchestrator: mockOrchestrator, onProgress: () => {}, logger, config }
    );

    assert.equal(result.type, "ebook");
    assert.ok(result.pages);
    assert.ok(result.html);
    assert.ok(result.metadata);
  });

  it("should throw descriptive error on assembly failure", async () => {
    mockOrchestrator.generate.onCall(0).rejects(new Error("API error"));

    try {
      await ebookService.handle(...);
      assert.fail("Should throw error");
    } catch (err) {
      assert.equal(err.error, "ASSEMBLY_FAILED");
      assert.ok(err.missing);
    }
  });
});
```

---

### SERVICE-AUTON.3: Add Additional Services (wallArtService)

**File**: `server/services/wallArtService.js`

**Demonstrates Reusability**:

```javascript
class WallArtService extends Service {
  async handle(payload, resourceKit) {
    const { orchestrator, logger } = resourceKit;
    const { prompt, style } = payload;

    // Same pattern, different business logic
    const styleAnalysis = await orchestrator.generate(
      `Analyze art style for: ${prompt}`,
      {
        tier: "standard",
        callIndex: 0,
        manifest: {
          totalRequests: 2,
          sequence: [{ tier: "standard" }, { tier: "expert" }],
        },
      }
    );

    const artDescription = await orchestrator.generate(
      `Generate art for: ${prompt}\n\nStyle: ${styleAnalysis}`,
      { tier: "expert", callIndex: 1 }
    );

    const html = this.composeArt(styleAnalysis, artDescription);

    return {
      type: "wall-art",
      html,
      metadata: { style, cost: 2 },
    };
  }

  composeArt(style, description) {
    // Art-specific composition
    return `<html>...</html>`;
  }
}

module.exports = new WallArtService();
```

**Key Points**:

- ✅ Identical orchestrator interface
- ✅ Different business logic
- ✅ Same manifest pattern
- ✅ Independently tested
- ✅ No infrastructure code duplication

---

## PERF-VALIDATE: Validation & Hardening (Weeks 5-6)

### PERF-VALIDATE.1: Performance Testing

**File**: `tests/performance.test.js`

```javascript
describe("Performance Validation", () => {
  it("should complete 3-page ebook in < 30 seconds", async function () {
    this.timeout(35000); // Allow 35s for test

    const start = Date.now();
    const res = await request(app).post("/api/ebook/generate").send({
      prompt: "Write a 3-page ebook about solar energy",
      theme: "dark",
      pageCount: 3,
    });

    const resultId = res.body.resultId;

    // Poll for completion
    let status;
    while (true) {
      await sleep(500);
      const statusRes = await request(app).get(`/api/status/${resultId}`);
      status = statusRes.body;

      if (status.status === "complete" || status.status === "error") {
        break;
      }
    }

    const elapsed = Date.now() - start;

    assert.equal(status.status, "complete");
    assert.ok(elapsed < 30000, `Should complete in < 30s, took ${elapsed}ms`);
  });

  it("should complete 10-page ebook in < 50 seconds", async function () {
    this.timeout(55000);

    const start = Date.now();
    const res = await request(app).post("/api/ebook/generate").send({
      prompt: "Write a 10-page ebook about machine learning",
      theme: "dark",
      pageCount: 10,
    });

    const resultId = res.body.resultId;

    // Poll for completion...
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50000, `Should complete in < 50s, took ${elapsed}ms`);
  });
});
```

---

### PERF-VALIDATE.2: Rate-Limit Compliance Testing

```javascript
describe("Rate-Limit Compliance", () => {
  it("should maintain Pro spacing (250ms between expert calls)", async () => {
    const mock = sinon.spy(aiService, "generate");

    // Create orchestrator and make two expert calls
    // Track timing between calls
    const timestamps = [];

    aiService.generate = async function (...args) {
      timestamps.push(Date.now());
      return "generated";
    };

    // Execute orchestrator with schedule
    // ...

    // Verify spacing
    const spacing = timestamps[1] - timestamps[0];
    assert.ok(
      spacing >= 240,
      `Pro spacing should be >= 240ms, was ${spacing}ms`
    );
  });

  it("should not trigger 429 errors on rapid requests", async function () {
    this.timeout(60000);

    // Send 5 requests rapidly
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(
        request(app)
          .post("/api/ebook/generate")
          .send({
            prompt: `Ebook ${i}`,
            theme: "dark",
            pageCount: 3,
          })
      );
    }

    const results = await Promise.all(requests);

    // All should return 202 (accepted)
    results.forEach((res) => {
      assert.equal(res.status, 202);
    });

    // Wait for all to complete
    const resultIds = results.map((r) => r.body.resultId);
    const completed = [];

    for (let i = 0; i < 120; i++) {
      // Poll for up to 60 seconds
      const statuses = await Promise.all(
        resultIds.map((id) =>
          request(app)
            .get(`/api/status/${id}`)
            .then((r) => r.body)
        )
      );

      completed.push(...statuses.filter((s) => s.status === "complete"));

      if (completed.length === 5) break;
      await sleep(500);
    }

    assert.equal(completed.length, 5, "All requests should complete");
  });
});
```

---

### PERF-VALIDATE.3: Manifest Protocol Validation

```javascript
describe("Manifest Protocol", () => {
  it("should validate manifest structure", async () => {
    const mockOrchestrator = {
      generate: async function (prompt, options) {
        if (options.manifest) {
          // Validate manifest
          assert.ok(options.manifest.totalRequests > 0);
          assert.ok(Array.isArray(options.manifest.sequence));
          options.manifest.sequence.forEach((s) => {
            assert.ok(["expert", "standard"].includes(s.tier));
          });
        }
        return "content";
      },
    };

    await ebookService.handle(
      { prompt: "test", pageCount: 3 },
      { orchestrator: mockOrchestrator, logger, config }
    );
  });

  it("should match sequence length to totalRequests", async () => {
    const mockOrchestrator = {
      generate: async function (prompt, options) {
        if (options.manifest) {
          assert.equal(options.manifest.sequence.length, options.manifest.totalRequests);
        }
        return "content";
      },
    };

    await ebookService.handle(...);
  });
});
```

---

### PERF-VALIDATE.4: ETA Accuracy Testing

```javascript
describe("ETA Accuracy", () => {
  it("should provide accurate ETA on first call", async () => {
    const res = await request(app).post("/api/ebook/generate").send({
      prompt: "test",
      pageCount: 3,
    });

    const resultId = res.body.resultId;

    // Check status immediately
    await sleep(100);
    const statusRes = await request(app).get(`/api/status/${resultId}`);
    const eta = statusRes.body.eta;

    assert.ok(eta > 0, "ETA should be computed");
    assert.ok(eta < 30, "ETA for 3-page ebook should be < 30s");

    // Actual completion should be close to ETA
    let completed = null;
    const startPoll = Date.now();

    while (Date.now() - startPoll < 60000) {
      const status = await request(app)
        .get(`/api/status/${resultId}`)
        .then((r) => r.body);
      if (status.status === "complete") {
        completed = Date.now();
        break;
      }
      await sleep(500);
    }

    const actualTime = (completed - startPoll) / 1000;
    const accuracy = Math.abs(eta - actualTime) / eta;

    assert.ok(
      accuracy < 0.2,
      `ETA should be within 20% of actual time. ETA: ${eta}s, Actual: ${actualTime}s`
    );
  });
});
```

---

## Component Specifications

### Detailed Specifications

[See detailed specifications document - to be generated from this template]

Each component should have:

- Input contract (what it receives)
- Output contract (what it returns)
- Error cases (what it throws)
- Performance characteristics
- Dependencies
- Testing examples

---

## Testing Strategy

### Unit Testing

- Each helper independently testable
- Each utility independently testable
- Service with mocked orchestrator
- ~80% code coverage target

### Integration Testing

- PART-A + Helpers + Orchestrator
- Service with real orchestrator
- smartPoller enrichment
- ~70% coverage of integration paths

### E2E Testing

- Full request lifecycle
- Frontend polling simulation
- Error scenarios
- Performance benchmarks
- ~60% critical path coverage

### Deployment Testing

- Staging environment validation
- Monitor for regressions
- Feature-branch isolation verified

---

## Deployment Strategy

### Branching Model

Each implementation phase runs in its own feature branch:

- **Base Branch**: `feat/ebook-nat-cont` (stable, tested foundation)
- **ASYNC-INFRA Branch**: Feature branch for async infrastructure (PART-A, Helpers, smartPoller)
- **SERVICE-AUTON Branch**: Feature branch for service autonomy (SERVICE_MACHINE_PATTERN, migrations)
- **PERF-VALIDATE Branch**: Feature branch for validation & hardening (performance testing, hardening)

**Isolation Benefit**: If a feature branch encounters issues during development, it simply does not merge. The base branch remains unaffected and usable. No rollback needed.

### Pre-Merge Checklist

For each feature branch before merging to base:

- [ ] All unit tests passing (>80% coverage)
- [ ] All integration tests passing (>70% coverage)
- [ ] All E2E tests passing (>60% critical path coverage)
- [ ] Performance benchmarks met (< 60s total)
- [ ] Rate-limit compliance verified
- [ ] Code review approved (peer + lead)
- [ ] Documentation updated and reviewed
- [ ] Staging environment validation complete

### Merge & Integration Steps

1. Code review passes (peer + lead required)
2. All CI checks green (tests, linting, coverage)
3. Merge feature branch to base branch
4. Verify base branch tests still pass
5. Tag merge commit with feature identifier (ASYNC-INFRA, etc.)
6. Document any conflicts resolved

### Deployment from Base Branch

Once base branch has accumulated merged features:

1. Create release branch from base (`release/v0.2.0`)
2. Deploy to staging environment
3. Run comprehensive smoke tests
4. Deploy to production
5. Monitor metrics for 48 hours

### Monitoring

- Request success rate (target: 99.5%)
- Average latency (target: < 30s for 3-page, < 50s for 10-page)
- 429 error count (target: 0)
- Infrastructure timeout count (target: 0)
- ETA accuracy (target: within 20% of actual)

### Isolation in Action

**If ASYNC-INFRA branch has issues**:

- Simply don't merge it
- Base branch remains stable
- Continue with SERVICE-AUTON or PERF-VALIDATE in their own branches
- Return to ASYNC-INFRA fixes later, isolated from other work

**If SERVICE-AUTON breaks during merge**:

- Revert the merge commit on base
- Continue work in SERVICE-AUTON branch
- Fix issues, test thoroughly
- Retry merge when ready

---

**Document Status**: Implementation Guide Complete  
**Next Phase**: Begin ASYNC-INFRA development
