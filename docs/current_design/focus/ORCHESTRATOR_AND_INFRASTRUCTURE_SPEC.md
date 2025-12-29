# Orchestrator & Infrastructure Specification

**Date**: December 19, 2025  @ 3:10PM
**Branch**: feat/ebook-nat-cont

**Status**: REFERENCE (Consolidated Architecture Spec)  
**Purpose**: Unified specification for genieService orchestration, helper/utility framework, and PART-A/B execution model

**Related Documents**:

- [TWO_PART_BACKEND_EXECUTION.md](TWO_PART_BACKEND_EXECUTION.md) - HTTP contracts & execution flow
- [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md) - Scheduling details
- [SERVICE_MACHINE_PATTERN.md](../SERVICE_MACHINE_PATTERN.md) - Service autonomy

---

## Quick Reference: Problems & Solutions

| Problem                        | Root Cause                                                              | Solution                                                                          |
| ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **60s Infrastructure Timeout** | Client blocks 50s + transmission 10s = exceeds limit                    | PART-A: Return immediately with resultId; client polls                            |
| **429 Rapid-Fire Errors**      | Calls fire as fast as possible                                          | PART-B: Enforce spacing (250ms Pro, 100ms Flash)                                  |
| **Quota Exhaustion**           | Unpredictable request failures                                          | Schedule upfront via manifest; reserve slots                                      |
| **monolithic genieService**    | Does validation, routing, timing, scheduling, execution, status, errors | Separate: helpers (per-request), utilities (app-wide), orchestrator (coordinator) |

---

## Architecture Overview

```
REQUEST FLOW:

Client POST /api/ebook/generate
    ↓
[PART-A: Dumb Plumbing]
  - Accept request
  - Generate resultId
  - Return 202 Accepted { resultId, eta: null, status: "queued" }
  - Hand off async to genieService
    ↓
[PART-B: Smart Orchestration (genieService)]
  - Create fresh orchestrator with HELPERS
  - Assign task to UTILITIES (smartPoller)
  - Route to service (ebookService)
  - Service executes:
    * First call: sends manifest
    * Orchestrator intercepts: compute ETA, build schedule
    * Remaining calls: execute with spacing
    * Update utilities with progress
  - Finalize result
    ↓
Client Smart Polling: GET /api/status/:resultId
  - smartPoller responds with enriched status
  - { status, eta, calls_completed, calls_total, progress_percent }
    ↓
Complete: Status = "complete" with result
```

---

## PART-A: HTTP Plumbing

**Handler**: `POST /api/ebook/generate`

```javascript
async (req, res) => {
  const resultId = generateUUID();
  const initialStatus = { resultId, status: "queued", eta: null };

  statusMap.set(resultId, initialStatus);
  res.status(202).json({ resultId, status: "queued" }); // Return immediately

  // Hand off asynchronously (PART-B takes over)
  genieService
    .process({ resultId, mode: "ebook", ...payload })
    .catch((err) => statusMap.set(resultId, { status: "error", error: err }));
};
```

**Result**: Client gets resultId immediately; no blocking. PART-B executes in background.

---

## PART-B: Orchestrator Pattern

### Core Principle: Waiter Pattern

Services request via generic interface `orchestrator.generate()` → Orchestrator decides HOW/WHEN/WITH WHAT TOOL.

### Service Interface (What Services See)

```javascript
// Service receives orchestrator in resourceKit
async handle(payload, { orchestrator, logger, config }) {

  // FIRST CALL: Include manifest
  const structure = await orchestrator.generate(prompt, {
    tier: "expert",
    callIndex: 0,
    manifest: {
      totalRequests: 4,
      sequence: [
        { callIndex: 0, tier: "expert" },
        { callIndex: 1, tier: "expert" },
        { callIndex: 2, tier: "standard" },
        { callIndex: 3, tier: "expert" }
      ]
    }
  });

  // SUBSEQUENT CALLS: No manifest
  const opening = await orchestrator.generate(prompt, {
    tier: "expert",
    callIndex: 1
  });

  const middle = await orchestrator.generate(prompt, {
    tier: "standard",
    callIndex: 2
  });

  const closing = await orchestrator.generate(prompt, {
    tier: "expert",
    callIndex: 3
  });

  return { pages: [structure, opening, middle, closing], html: ..., metadata: ... };
}
```

**Service declares**: WHAT (tier, callIndex, manifest on first call)  
**Orchestrator decides**: WHEN (timing), HOW (tool), WITH WHAT SPACING (rate limit)

### Orchestrator Implementation

```javascript
class Orchestrator {
  constructor(resultId, helpers) {
    this.resultId = resultId;
    this.helpers = helpers; // { timingResolver, fifoScheduler, statusManager, ... }
    this.manifestReceived = false;
    this.manifest = null;
    this.eta = null;
    this.schedule = null;
  }

  async generate(prompt, options) {
    // ─── FIRST CALL: Capture manifest, compute ETA ───
    if (options.manifest && !this.manifestReceived) {
      this.manifestReceived = true;
      this.manifest = options.manifest;

      // HELPERS compute timing
      this.eta = this.helpers.timingResolver.compute(this.manifest);
      this.schedule = this.helpers.fifoScheduler.build(this.eta);

      // UTILITIES: Assign task to smartPoller
      smartPoller.assignTask(this.resultId, {
        eta: this.eta.totalEta,
        totalCalls: this.manifest.totalRequests,
      });

      // Initialize status
      this.helpers.statusManager.initialize(this.resultId, {
        eta: this.eta.totalEta,
      });
    }

    // ─── ALL CALLS: Enforce spacing ───
    const callSlot = this.schedule.calls[options.callIndex];
    await waitUntil(callSlot.reservedTime); // FIFO + spacing

    // ─── SELECT TOOL ───
    const tool = this.selectTool(options.tier); // aiService, claudeService, etc.

    // ─── EXECUTE ───
    const result = await tool.generate(prompt, {
      tier: options.tier,
      model: this.tierToModel(options.tier),
    });

    // ─── UPDATE UTILITIES ───
    smartPoller.updateProgress(this.resultId, {
      currentCall: options.callIndex,
      completedCalls: options.callIndex,
      nextEstimatedCompletion: Date.now() + this.eta.totalEta * 1000,
      errors: [],
    });

    return result;
  }

  selectTool(tier) {
    // Currently: aiService
    // Future: claudeService, anthropicService, load-balanced, etc.
    return aiService;
  }

  tierToModel(tier) {
    return tier === "expert" ? "pro" : "flash";
  }
}
```

**Key behaviors**:

1. Manifest captured on first call
2. ETA computed via `timeRegistry` (manifest → timing)
3. FIFO schedule built with rate-limit spacing
4. Task assigned to `smartPoller` utility
5. All calls execute with reserved timing
6. Utilities enriched with real progress during execution

---

## Helpers & Utilities Framework

### Helpers (Per-Request, Pure Logic)

Fresh instances created per orchestrator. Solve specific computation problems.

| Helper                 | Input               | Output                     | Purpose                  |
| ---------------------- | ------------------- | -------------------------- | ------------------------ |
| **manifest-processor** | raw manifest        | validated manifest         | Validate schema          |
| **timing-resolver**    | manifest, config    | { totalEta, schedule }     | Compute ETA + slot times |
| **fifo-scheduler**     | timing              | { calls: [...] }           | Build execution order    |
| **status-manager**     | resultId, timing    | initialized state          | Track progress           |
| **tool-selector**      | tier                | aiService \| claudeService | Pick AI backend          |
| **progress-tracker**   | current call, total | { percent, remaining }     | Calculate completion %   |
| **error-reporter**     | error object        | correlated details         | Format error response    |

### Utilities (App-Wide, Task-Assigned)

Long-lived services. genieService assigns tasks and enriches with real activity.

#### smartPoller (Status/Polling Utility)

```javascript
// genieService assigns task
smartPoller.assignTask(resultId, {
  eta: 23000,        // from timing-resolver
  totalCalls: 4      // from manifest
});

// genieService enriches during execution
smartPoller.updateProgress(resultId, {
  currentCall: 1,
  completedCalls: 0,
  nextEstimatedCompletion: Date.now() + 6000,
  errors: []
});

// Client polls
GET /api/status/:resultId
→ smartPoller.getStatus(resultId)
→ {
    status: "in-progress",
    eta: 23,
    calls_completed: 0,
    calls_total: 4,
    progress_percent: 0,
    estimated_remaining_seconds: 23,
    message: "Processing call 1 of 4..."
  }
```

#### aiService (Generation Utility)

```javascript
// genieService delegates to aiService via orchestrator
orchestrator.selectTool(tier) → aiService
aiService.generate(prompt, { tier: "expert", model: "pro" })
  → Result or error

// aiService responsibility:
// - Execute model calls
// - Handle retries, failures
// - Track tokens, cost
// - Respect quota limits
```

#### Other Utilities

- **persistence**: Store/retrieve results
- **logger**: Structured logging across execution
- **config**: Shared configuration

### Task Assignment Pattern

```javascript
// 1. ASSIGN: Initial task with timing info
smartPoller.assignTask(resultId, { eta, totalCalls });

// 2. ENRICH: Update utility with real activity
smartPoller.updateProgress(resultId, { currentCall, completedCalls, ... });

// 3. SURFACE: Utility decides what to show client
smartPoller.getStatus(resultId) → enriched response
```

**Why utilities, not helpers?**

- Long-lived (app-wide singleton-like)
- Handle multiple concurrent tasks (one per resultId)
- Maintain state across requests
- Enrich with real activity data
- Decide what to surface to clients

---

## Timing Computation (timingResolver)

```javascript
// Input: manifest
manifest = {
  totalRequests: 4,
  sequence: [
    { callIndex: 0, tier: "expert" },
    { callIndex: 1, tier: "expert" },
    { callIndex: 2, tier: "standard" },
    { callIndex: 3, tier: "expert" }
  ]
}

// config
config = {
  MODEL_LATENCY: { expert: 6000, standard: 5000 },  // ms
  MODEL_SPACING: { expert: 250, standard: 100 }     // ms
}

// Output: { totalEta, schedule }
{
  totalEta: 23,
  schedule: [
    { callIndex: 0, tier: "expert", startTime: 0, duration: 6000, endTime: 6000 },
    { callIndex: 1, tier: "expert", startTime: 6250, duration: 6000, endTime: 12250 },
    { callIndex: 2, tier: "standard", startTime: 12350, duration: 5000, endTime: 17350 },
    { callIndex: 3, tier: "expert", startTime: 17450, duration: 6000, endTime: 23450 }
  ]
}

// Spacing enforced:
// - After Call 0 (expert): +250ms before Call 1
// - After Call 1 (expert): +250ms before Call 2 (but standard, so 100ms is sufficient)
// - After Call 2 (standard): +100ms before Call 3
// - Result: All quotas respected (2 RPM expert = ~250ms, 15 RPM standard = ~100ms)
```

---

## Timeline Example: 3-Page Ebook

```
T+0.00s   Client: POST /api/ebook/generate
T+0.05s   PART-A: Return 202 { resultId, status: "queued" }
T+0.10s   PART-B: genieService.process() begins

T+0.15s   ebookService: First call (structure, expert, callIndex=0, manifest)
T+0.15s   Orchestrator: Intercept manifest
T+0.16s   timingResolver: Compute ETA = 23s, build schedule
T+0.17s   smartPoller: Assign task { eta: 23, totalCalls: 4 }
T+0.17s   Orchestrator: selectTool(expert) → aiService
T+0.17s   aiService.generate(...) starts (Pro model)

T+6.20s   Call 0 completes (Pro: 6s)
T+6.20s   smartPoller: updateProgress { calls_completed: 1 }
T+6.20s   ebookService: Second call (opening, expert, callIndex=1)

T+6.20s   Orchestrator: Get slot [1]
T+6.45s   Wait until T+6.45s (Expert spacing: 250ms)
T+6.45s   aiService.generate(...) starts (Pro model)

T+12.50s  Call 1 completes
T+12.50s  smartPoller: updateProgress { calls_completed: 2 }
T+12.50s  ebookService: Third call (middle, standard, callIndex=2)

T+12.50s  Orchestrator: Get slot [2]
T+12.65s  Wait until T+12.65s (Standard spacing: 100ms)
T+12.65s  aiService.generate(...) starts (Flash model)

T+17.70s  Call 2 completes
T+17.70s  smartPoller: updateProgress { calls_completed: 3 }
T+17.70s  ebookService: Fourth call (closing, expert, callIndex=3)

T+17.70s  Orchestrator: Get slot [3]
T+17.80s  Wait until T+17.80s (Standard spacing: 100ms)
T+17.80s  aiService.generate(...) starts (Pro model)

T+23.90s  Call 3 completes
T+23.90s  Result composed, finalized
T+24.00s  smartPoller: { status: "complete", result: {...} }

T+24.20s  Client: Polls GET /api/status/:resultId
T+24.20s  Response: { status: "complete", result: {...} }
T+24.25s  Client: Display ebook

TOTAL TIME: ~24 seconds (well within 60s infrastructure limit)
NO RAPID-FIRE: All calls spaced correctly (250ms/100ms enforced)
NO QUOTA VIOLATION: Pro calls 250ms apart, Standard 100ms apart
```

---

## Key Design Principles

### 1. Separation of Concerns

| Component                   | Owns                                          | Does NOT Own                             |
| --------------------------- | --------------------------------------------- | ---------------------------------------- |
| **PART-A**                  | HTTP acceptance, resultId                     | Scheduling, quotas, timing               |
| **Orchestrator (PART-B)**   | Coordination, timing, spacing, tool selection | HTTP, service logic, persistence         |
| **Services** (ebookService) | Business logic, manifest declaration          | Timing, quotas, spacing, tool selection  |
| **Helpers**                 | Per-request computation                       | State, app-wide decisions, utilities     |
| **Utilities**               | App-wide state, task assignment, enrichment   | Service logic, HTTP, per-job computation |

### 2. Manifest-First Coordination

Service declares upfront: "I will make N calls with these tiers in this order"

→ Orchestrator computes ETA before execution starts  
→ No surprises mid-execution  
→ All timing/quota decisions made upfront

### 3. FIFO + Spacing = Rate-Limiting

Services naturally produce calls FIFO (structure → opening → middle → closing)

→ Orchestrator adds spacing (250ms Pro, 100ms Flash)  
→ Result: Quota respected, rapid-fire prevented, no complex scheduling

### 4. Frontend Visibility

PART-A returns ETA immediately  
PART-B updates smartPoller continuously  
Client polls smartPoller with intelligent strategy

→ Result: No blocking, real progress visibility, deterministic UX

### 5. No Hard-Coded Dependencies

Services import only `orchestrator` interface  
Services never import `aiService`, `claudeService`, `quotaTracker`

→ Tool swapping invisible to services  
→ Adding claudeService: only change `orchestrator.selectTool()`  
→ All services work unchanged

---

## Platform Scaling

All services follow identical pattern:

```javascript
// ebookService
async handle(payload, { orchestrator, ... }) {
  const s0 = await orchestrator.generate(p0, {tier: "expert", callIndex: 0, manifest});
  const s1 = await orchestrator.generate(p1, {tier: "expert", callIndex: 1});
  const s2 = await orchestrator.generate(p2, {tier: "standard", callIndex: 2});
  const s3 = await orchestrator.generate(p3, {tier: "expert", callIndex: 3});
  return { pages: [s0,s1,s2,s3], ... };
}

// wallArtService (same pattern)
async handle(payload, { orchestrator, ... }) {
  const style = await orchestrator.generate(p0, {tier: "standard", callIndex: 0, manifest});
  const art = await orchestrator.generate(p1, {tier: "expert", callIndex: 1});
  return { html, ... };
}

// calendarService (same pattern)
async handle(payload, { orchestrator, ... }) {
  const themes = await orchestrator.generate(p0, {tier: "standard", callIndex: 0, manifest});
  const content = await orchestrator.generate(p1, {tier: "standard", callIndex: 1});
  const holidays = await orchestrator.generate(p2, {tier: "expert", callIndex: 2});
  return { html, ... };
}
```

**All use identical interface**: No service reinvention, maximum consistency, easy addition of new services.

---

## genieService: Pure Orchestrator

```javascript
// BEFORE (monolithic ~500 lines)
async process(payload) {
  // Validation, persistence, quota, routing, timing,
  // scheduling, execution, status, errors, response building
  // ...everything
}

// AFTER (pure orchestrator ~30 lines)
async process({ resultId, mode, prompt, metadata }) {
  const orchestrator = new Orchestrator(resultId, helpers);

  smartPoller.assignTask(resultId, { eta, totalCalls });

  const service = this.selectService(mode);  // ebookService, wallArtService, etc.

  const result = await service.handle(metadata, {
    orchestrator,
    onProgress: (activity) => smartPoller.updateProgress(resultId, activity),
    logger,
    config
  });

  return result;
}
```

**Result**:

- ✅ Simple, focused orchestration
- ✅ Helpers handle computation
- ✅ Utilities handle infrastructure
- ✅ Services handle domain logic
- ✅ Easy to understand, test, maintain

---

## Summary

**Three-Layer Solution**:

1. **PART-A**: Break sync coupling (return immediately, client polls)
2. **PART-B**: Smart orchestration (genieService with helpers/utilities)
3. **Waiter Pattern**: Generic service interface (no hard-coded dependencies)

**Result**: Solves 60s timeout, prevents 429 errors, eliminates quota exhaustion, provides real-time client visibility, scales to multiple services without reinvention.
