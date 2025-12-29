````markdown
# Helpers & Assistants Framework: Freeing the Orchestrator

**Date**: December 19, 2025 @ 6:15PM
**Branch**: `feat/ebook-nat-cont`

**Status**: DRAFT (Foundational Concept)
**Purpose**: Define the general framework for helpers/assistants that genieService delegates to
**Related Documents**:

- [PART_B_ORCHESTRATOR_PATTERN_DRAFT.md](PART_B_ORCHESTRATOR_PATTERN_DRAFT.md) - Waiter pattern
- [SERVICE_MACHINE_PATTERN.md](SERVICE_MACHINE_PATTERN.md) - Service autonomy
- [PART_A_AND_PART_B_CONCEPTUAL_FRAMEWORK.md](PART_A_AND_PART_B_CONCEPTUAL_FRAMEWORK.md) - Async architecture

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Core Idea: Delegation vs. Monolithic](#the-core-idea-delegation-vs-monolithic)
3. [What Is a Helper/Assistant?](#what-is-a-helperassistant)
4. [The Waiter Metaphor (Applied to Helpers)](#the-waiter-metaphor-applied-to-helpers)
5. [Simple Example: The Timing-Resolver Helper](#simple-example-the-timing-resolver-helper)
6. [Simple Example: The Smart-Polling Helper](#simple-example-the-smart-polling-helper)
7. [The Helper Ecosystem (General View)](#the-helper-ecosystem-general-view)
8. [How This Frees genieService](#how-this-frees-genieservice)
9. [The Contract Between genieService and Helpers](#the-contract-between-genieservice-and-helpers)
10. [Benefits of the Helpers Framework](#benefits-of-the-helpers-framework)
11. [Status: Foundational Concept](#status-foundational-concept)
12. [Summary: The Vision](#summary-the-vision)

---

## Visual: Backend Architecture (PART-A + PART-B + Helpers)

```
┌────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND REQUEST                              │
│                                                                        │
│  POST /api/ebook/generate                                              │
│  { prompt, theme, pageCount }                                          │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│                      PART-A: DUMB PLUMBING                             │
│                    (index.js HTTP Handler)                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ✓ Accept request                                                      │
│  ✓ Generate resultId (UUID)                                            │
│  ✓ Return IMMEDIATELY with { resultId, message: “Working on it!”,      │
│       status: "queued" }                                               │
│  ✓ Hand off async to PART-B (NO WAITING)                               │
│                                                                        │
│  Solves: 🔓 BREAKS SYNCHRONOUS COUPLING                                │
│          └─ Client no longer blocks 50+ seconds                        │
│          └─ No infrastructure timeout hit                              │
│                                                                        │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                (HTTP Response: 202 Accepted)
      { resultId, message: “Working on it!”, status: "queued" }
                             │
              ┌──────────────┼──────────────┐
              ↓              ↓              ↓
          FRONTEND        PART-B       Job Status
         (Polling)       (Async)       (In Memory)
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│              PART-B: SMART ORCHESTRATION (genieService)                │
│                       (Waiter Pattern)                                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  SERVICE ROUTING:                                                      │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ Route by mode: if "ebook" → ebookService.handle()            │      │
│  │ Pass orchestrator interface (NOT aiService, quotaTracker)    │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                             │                                          |
|                             |                                          │
│                             ↓                                          │
│  SMART ORCHESTRATION (genieService) COORDINATES EXECUTION              │
│  (via HELPERS):                                                        │
│  ┌────────────────────────────────────────────────────────────┐        │
│  │ Service sends manifest on first call:                      │        │
│  │ { totalRequests: 4, sequence: [{tier, ...}, ...] }         │        │
│  └────────────────────────────────────────────────────────────┘        │
│                             │                                          │
│                             |                                          │
│                             | (genieService delegates to Helpers)      │
│                             ↓                                          │
│  ┌─ HELPERS ECOSYSTEM (Pure Logic) ─────────────────────────────┐      │
│  │                                                              │      │
│  │  manifest-processor: Validate & parse manifest               │      │
│  │      ↓                                                       │      │
│  │                                                              │      │
│  │  timing-resolver: Manifest → ETA + Schedule                  │      │
│  │      │ INPUT:  manifest, config                              │      │
│  │      │ OUTPUT: { eta: 23s, schedule: [...] }                 │      │
│  │      │                                                       │      │
│  │      │ Solves: 🚫 RAPID-FIRE (429 errors)                   │      │
│  │      │         └─ Enforces spacing (Pro 250ms, Flash 100ms)  │      │
│  │      │         🚫 QUOTA EXHAUSTION                          │      │
│  │      │         └─ Timing-based quota (no state tracking)     │      │
│  │      │         ✓ ACCURATE ETA                                │      │
│  │      │         └─ Client knows wait time upfront             │      │
│  │      ↓                                                       │      │
│  │                                                              │      │
│  │  fifo-scheduler: Build execution slots with spacing          │      │
│  │      ↓                                                       │      │
│  │                                                              │      │
│  │  statusManager: Initialize & track progress                  │      │
│  │      ↓                                                       │      │
│  │                                                              │      │
│  │  toolSelector: Pick which AI tool to use                     │      │
│  │      ↓                                                       │      │
│  │                                                              │      │
│  │  errorReporter: Correlate error details                      │      │
│  │      ↓                                                       │      │
│  │                                                              │      │
│  │  progressTracker: Calculate completion %                     │      │
│  │      ↓                                                       │      │
│  │                                                              │      │
│  │  (All pure logic, independently testable)                    │      │
│  │                                                              │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                        │
│  ORCHESTRATOR EXECUTION:                                               │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ For each call in schedule:                                   │      │
│  │   1. Wait until reserved slot time                           │      │
│  │      (Spacing enforced: Pro 250ms, Flash 100ms)              │      │
│  │   2. Select tool (via toolSelector)                          │      │
│  │   3. Execute: tool.generate(prompt, {tier})                  │      │
│  │   4. Update status (via statusManager)                       │      │
│  │                                                              │      │
│  │ Total execution time: ~24s (vs 49-50s current)               │      │
│  │ Well within 60s infrastructure limit                         │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                        │
│  UTILITIES (Side Effects):                                             │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ • smartPolling: Takes over polling responsibility            │      │
│  │ • aiService: Actual Gemini API calls                         │      │
│  │ • persistence: Database operations                           │      │
│  │ • logger: Logging                                            │      │
│  │ • config: Shared configuration                               │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                        │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                    (Async Background Execution)
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│                  FRONTEND: SMART POLLING                               │
│                  (Replaces dumb polling)                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  smart-polling-helper: Calculate intelligent polling strategy          │
│      INPUT:  eta (from PART-A response)                                │
│      OUTPUT: { wait_ms, poll_interval_ms, timeout_ms, messages }       │
│                                                                        │
│  Solves: 🔓 DUMB POLLING                                               │
│          └─ Wait ~80% of ETA before polling                            │
│          └─ No wasted polls early in job                               │
│          └─ Poll only when job can possibly be done                    │
│          └─ Exponential backoff with max interval                      │
│          └─ Show progress: "2 of 4 calls complete (est. 15s remain)"   │
│                                                                        │
│  Polling flow:                                                         │
│  1. Wait ~18s (80% of 23s ETA)                                         │
│  2. Poll /api/status/:resultId every 2s                                │
│  3. Display progress updates                                           │
│  4. Timeout if not done in ~53s total                                  │
│  5. Display result when complete                                       │
│                                                                        │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
                    ✅ RESULT TO USER
                    (HTML, PDF, etc.)


═══════════════════════════════════════════════════════════════════════════

CRITICAL PROBLEMS SOLVED:

  ❌ PROBLEM 1: Infrastructure Timeout (60s)
     ✅ SOLUTION: PART-A breaks sync coupling
        • Client no longer blocks waiting for response
        • PART-B executes async in background (~24s total)
        • No infrastructure timeout hit

  ❌ PROBLEM 2: Rapid-Fire Errors (429 Too Many Requests)
     ✅ SOLUTION: timing-resolver enforces spacing
        • Pro calls: 250ms apart (respects 2 RPM limit)
        • Flash calls: 100ms apart (respects 15 RPM limit)
        • FIFO queue naturally orders calls
        • No bursts possible → no 429 errors

  ❌ PROBLEM 3: Quota Exhaustion
     ✅ SOLUTION: Quota is timing-based, not state-based
        • No quotaTracker state tracking needed
        • Spacing automatically respects quota constraints
        • Deterministic and fair (FIFO order)
        • All calls succeed within quota

═══════════════════════════════════════════════════════════════════════════

KEY INNOVATION: HELPERS ENABLE SIMPLICITY

  Before (Monolithic genieService):
    500+ lines | Validation, quota, timing, scheduling, execution,
    error handling, status tracking all mixed together

  After (Orchestrator + Helpers):
    20 lines | Route → Create orchestrator with helpers → Execute service
    300+ lines | Each helper owns one concern, tested independently

═══════════════════════════════════════════════════════════════════════════
```

---

## Executive Summary

**genieService should be a PURE ORCHESTRATOR** that:

- ✅ Routes requests to services
- ✅ Coordinates execution flow
- ✅ Provides clean interfaces to services
- ✅ Delegates ALL menial work to helpers
- ✅ Oversees the entire domain

**Helpers/Assistants are SPECIALISTS** that:

- ✅ Solve one specific problem
- ✅ Operate independently
- ✅ Have clear, simple contracts
- ✅ Are tested in isolation
- ✅ Can be evolved without touching genieService

**Result**: genieService is **free to think big** while helpers handle the details.

---

## The Core Idea: Delegation vs. Monolithic

### What We're Escaping

```javascript
// MONOLITHIC GENIESERVICE (current anti-pattern)
async process(payload) {
  // Validation
  if (!payload.prompt) throw new Error(...);

  // Persistence check
  const cached = await db.findByPrompt(payload.prompt);
  if (cached) return cached;

  // Quota checking
  const quota = quotaTracker.getStatus();
  if (quota.availableQuota < cost) throw 202;
  quotaTracker.reserve(cost);

  // Service routing
  let result;
  if (mode === "ebook") {
    result = await ebookService.handle(payload, orchestratorProxy);
  }

  // Timing computation
  const eta = (payload.pageCount * 6) + (Math.ceil(payload.pageCount/2) * 5);

  // Scheduling
  const schedule = [];
  let time = 0;
  for (const call of manifest) {
    schedule.push({ callIndex, startTime: time, duration: latency });
    time += latency + spacing;
  }

  // Execution management
  for (const call of schedule) {
    await waitUntil(call.startTime);
    const result = await aiService.generate(...);
    quotaTracker.record(1);
  }

  // Status tracking
  statusMap.set(resultId, { status: "complete", result });

  // Error handling + correlation
  // ... lots of complex logic

  // Response building
  return buildResponse(result);
}
```

**Problem**: genieService is doing EVERYTHING. It's a monolith. Hard to test, hard to change, hard to understand.

### What We're Moving Toward

```javascript
// ORCHESTRATOR GENIESERVICE (goal state)
async process(payload) {
  const { resultId, mode, prompt, metadata } = payload;

  // Create orchestrator with helpers
  const orchestrator = new Orchestrator(resultId, {
    // Helpers (specialists)
    manifestProcessor,     // Parse manifests
    timingResolver,        // Compute timing
    fifoScheduler,         // Build schedules
    toolSelector,          // Pick tools
    statusManager,         // Track status
    errorReporter,         // Report errors
    progressTracker,       // Track progress

    // Utilities (side effects)
    smartPolling,
    aiService,
    persistence,
    logger,
    config
  });

  // Route to service with clean interface
  const service = this.selectService(mode);
  const result = await service.handle(payload, { orchestrator, logger, config });

  // Done. All helpers handled the details.
  return result;
}
```

**Benefit**: genieService is now just an orchestrator. All specialists are called through clean contracts.

---

## What Is a Helper/Assistant?

### Definition

A **helper** is a **specialized, independent component** that:

1. **Solves ONE problem** (single responsibility)
2. **Is testable in isolation** (pure logic, clear contracts)
3. **Has no hard-coded dependencies** (receives all inputs via parameters)
4. **Can be evolved independently** (changes don't ripple to genieService)
5. **Serves the orchestrator** (waiter provides what orchestrator needs)

### Properties of Good Helpers

| Property                  | Meaning                              | Example                                |
| ------------------------- | ------------------------------------ | -------------------------------------- |
| **Single Responsibility** | One reason to change                 | timingResolver: only computes timing   |
| **Clear Input Contract**  | Well-defined inputs                  | manifest → timing                      |
| **Clear Output Contract** | Well-defined outputs                 | { eta, schedule }                      |
| **No Side Effects**       | Doesn't modify external state        | Pure computation                       |
| **Composable**            | Can be combined with others          | timing → schedule → status → progress  |
| **Testable**              | Easy to unit test                    | Feed data, check output                |
| **Replaceable**           | Alternative implementations possible | Another timing algorithm could replace |

### Anti-Patterns to Avoid

```javascript
// ❌ BAD: Helper touches global state
const badHelper = {
  compute(manifest) {
    globalState.eta = calculateEta(manifest);  // Side effect!
    return globalState.eta;
  }
};

// ✅ GOOD: Helper returns computed value
const goodHelper = {
  compute(manifest) {
    return calculateEta(manifest);  // Pure output
  }
};

// ❌ BAD: Helper has hard-coded dependency
const badHelper = {
  select(tier) {
    return aiService.selectByTier(tier);  // Coupled to aiService!
  }
};

// ✅ GOOD: Helper receives dependencies
const goodHelper = {
  select(tier, availableTools) {
    return availableTools[tier];  // Flexible
  }
};

// ❌ BAD: Helper has multiple responsibilities
const badHelper = {
  process(manifest) {
    const eta = calculateEta(manifest);      // Timing
    const schedule = buildSchedule(eta);     // Scheduling
    const status = updateStatus(schedule);   // Status
    return { eta, schedule, status };        // Too many things!
  }
};

// ✅ GOOD: Each helper has one job
const timingHelper = { compute(manifest) { ... } };
const schedulingHelper = { build(timing) { ... } };
const statusHelper = { initialize(schedule) { ... } };
```

---

## The Waiter Metaphor (Applied to Helpers)

### Restaurant Analogy

```
Customer (Service) orders: "I need expert-tier content and standard-tier content"

Waiter (Orchestrator) has team of specialists:

  Timing Specialist:     "How long will that take?"
  Scheduling Specialist: "When will each dish be ready?"
  Tool Specialist:       "Which chef should make this?"
  Status Specialist:     "Is it done yet?"
  Progress Specialist:   "How much is ready?"
  Polling Specialist:    "When should customer check?"
  Error Specialist:      "What went wrong?"

Waiter coordinates:
  1. Timing specialist says: "23 seconds total"
  2. Scheduling specialist builds: [order 0 at T+0, order 1 at T+6.25, ...]
  3. Tool specialist picks chefs
  4. Status specialist tracks: "0 of 4 orders done"
  5. Waiter executes in order
  6. Progress specialist updates: "1 of 4 orders done"
  7. On completion, waiter gives customer the result

Customer doesn't see any of this. Just sees: "Here's your food!"
```

---

## Simple Example: The Timing-Resolver Helper

### The Problem It Solves

**Challenge**: Given a manifest (list of calls), compute:

- How long will this take? (ETA)
- When does each call execute? (Schedule)
- How do we respect rate limits? (Spacing)
- How do we avoid rapid-fire? (Spacing)
- How do we avoid quota exhaustion? (Timing)

### What It Receives

```javascript
manifest = {
  totalRequests: 4,
  sequence: [
    { callIndex: 0, tier: "expert" },
    { callIndex: 1, tier: "expert" },
    { callIndex: 2, tier: "standard" },
    { callIndex: 3, tier: "expert" },
  ],
};

config = {
  MODEL_SPACING: { expert: 250, standard: 100 }, // milliseconds
  MODEL_LATENCIES: { expert: 6000, standard: 5000 }, // milliseconds
};
```

### What It Returns

```javascript
{
  totalEta: 23,  // seconds

  schedule: [
    {
      callIndex: 0,
      tier: "expert",
      startTime: 0,
      duration: 6000,
      endTime: 6000
    },
    {
      callIndex: 1,
      tier: "expert",
      startTime: 6250,   // 250ms spacing
      duration: 6000,
      endTime: 12250
    },
    {
      callIndex: 2,
      tier: "standard",
      startTime: 12350,  // 100ms spacing
      duration: 5000,
      endTime: 17350
    },
    {
      callIndex: 3,
      tier: "expert",
      startTime: 17450,  // 100ms spacing (after flash call)
      duration: 6000,
      endTime: 23450
    }
  ]
}
```

### How Orchestrator Uses It

```javascript
// In orchestrator, on first call with manifest
if (manifestProcessor.hasManifest(options)) {
  const timing = timingResolver.compute(manifest, config);

  this.eta = timing.totalEta;
  this.schedule = timing.schedule;

  // Tell status helper
  statusManager.initialize(resultId, {
    eta: timing.totalEta,
    totalCalls: manifest.totalRequests,
  });
}

// On all calls
const slot = timingResolver.getSlot(schedule, callIndex);
await waitUntil(slot.startTime);
const result = await tool.generate(prompt);
```

### Why It's a Good Helper

✅ **Single responsibility**: Compute timing  
✅ **Clear inputs**: manifest + config  
✅ **Clear outputs**: { eta, schedule }  
✅ **No side effects**: Pure calculation  
✅ **Testable**: Feed data, check math  
✅ **Replaceable**: Alternative timing algorithms possible  
✅ **Solves three problems at once**:

- ETA computation (when will job finish?)
- Spacing enforcement (avoid rapid-fire)
- Quota compliance (timing = quota constraint)

---

## Simple Example: The Smart-Polling Helper

### The Problem It Solves

**Challenge**: Frontend currently polls dumbly ("Is it done?" every 1 second).

- Wastes network requests (polls before job can be done)
- No visibility into progress
- No smart timing

### What It Receives

```javascript
eta = 23; // seconds (from PART-A response)

// Frontend will call it once
const strategy = smartPollingHelper.calculateStrategy(eta);
```

### What It Returns

```javascript
{
  wait_before_first_poll_ms: 18400,  // Wait ~80% of ETA
  polling_interval_ms: 2000,         // Then poll every 2 seconds
  timeout_ms: 53000,                 // Give up if not done by this time

  ui_messages: {
    initial: "Generating... (est. 23s)",
    polling: "Checking progress...",
    timeout: "Taking longer than expected"
  },

  timeline: {
    job_starts_at: 0,
    start_polling_at: 18400,
    expected_completion: 23000,
    final_check_at: 25000,
    timeout_at: 53000
  }
}
```

### How Frontend Uses It

```javascript
// Frontend receives ETA from PART-A
const { resultId, eta } = await response.json();

// Use smart-polling helper
const strategy = smartPollingHelper.calculateStrategy(eta);

// Show initial message
showMessage(strategy.ui_messages.initial);

// Wait before polling
await sleep(strategy.wait_before_first_poll_ms);

// Poll intelligently
let pollCount = 0;
while (true) {
  try {
    const status = await fetch(`/api/status/${resultId}`).then((r) => r.json());
    pollCount++;

    if (status.status === "complete") {
      displayResult(status.result);
      break;
    }

    if (status.status === "in-progress") {
      showMessage(
        `Generating... (${status.calls_completed}/${status.calls_total} calls)`
      );
    }

    // Wait for next poll
    await sleep(strategy.polling_interval_ms);
  } catch (err) {
    // Retry
    await sleep(strategy.polling_interval_ms * 2);
  }

  // Check timeout
  if (Date.now() > strategy.timeout_ms) {
    showError("Job timeout");
    break;
  }
}
```

### Why It's a Good Helper

✅ **Single responsibility**: Calculate polling strategy  
✅ **Clear inputs**: ETA (seconds)  
✅ **Clear outputs**: { wait_ms, interval_ms, messages, timeline }  
✅ **No side effects**: Pure calculation  
✅ **Testable**: Feed eta, check strategy  
✅ **Replaceable**: Alternative polling strategies possible  
✅ **Solves the problem**:

- Reduces wasted polls (wait before starting)
- Improves UX (shows accurate timing)
- No infrastructure timeout (client not blocked)

---

## The Helper Ecosystem (General View)

### Categories of Helpers

| Category           | Purpose                | Examples                              |
| ------------------ | ---------------------- | ------------------------------------- |
| **Computation**    | Pure math/logic        | timing-resolver, progress-calculator  |
| **Validation**     | Check data integrity   | manifest-processor, payload-validator |
| **Selection**      | Pick from options      | tool-selector, tier-mapper            |
| **Transformation** | Convert data           | error-correlator, response-builder    |
| **Organization**   | Structure information  | schedule-builder, status-tracker      |
| **Guidance**       | Tell others what to do | polling-strategist, wait-calculator   |

### How They Connect

```
Service sends manifest
         ↓
manifest-processor (Validate manifest)
         ↓
timing-resolver (Compute ETA + schedule)
         ↓
fifo-scheduler (Build execution order)
         ↓
Orchestrator executes
         ↓
status-manager (Track progress)
         ↓
progress-tracker (Calculate completion %)
         ↓
On completion:
error-reporter (If error, correlate details)
response-builder (Format response)
         ↓
Frontend receives { resultId, status, eta, progress }
         ↓
smart-polling-helper (Calculate polling strategy)
         ↓
Frontend polls intelligently
```

Each helper knows one thing. Orchestrator coordinates.

---

## How This Frees genieService

### Before (Monolithic)

```javascript
async process(payload) {
  // Validate
  // Check quota
  // Compute timing
  // Build schedule
  // Execute
  // Track status
  // Handle errors
  // Correlate diagnostics
  // Build response

  // genieService is EVERYTHING
  // Hard to test, hard to change, hard to understand
}
```

**Result**: genieService is ~500 lines of tangled logic.

### After (Pure Orchestrator)

```javascript
async process(payload) {
  const { resultId, mode, prompt, metadata } = payload;

  // Create orchestrator with helpers
  const orchestrator = new Orchestrator(resultId, helpers);

  // Route to service
  const service = this.selectService(mode);

  // Service executes with orchestrator interface
  const result = await service.handle(payload, { orchestrator, logger, config });

  // That's it. Helpers did the work.
  return result;
}
```

**Result**: genieService is ~20 lines of clean orchestration.

### What genieService Can Now "Think" About

With menial work delegated, genieService can focus on:

- ✅ **Domain oversight**: "What's happening across all services?"
- ✅ **Cross-cutting concerns**: "How do all services flow together?"
- ✅ **Error recovery**: "If something fails, what's the right recovery?"
- ✅ **Performance**: "Is the system performing well? Should we add capacity?"
- ✅ **User experience**: "Are users getting fast, reliable results?"
- ✅ **Evolution**: "How should we add new services or capabilities?"
- ✅ **Monitoring**: "What metrics matter? What should we track?"

Instead of getting bogged down in: "How do I compute timing? How do I manage quota? How do I track progress?"

---

## The Contract Between genieService and Helpers

### How Helpers Are Called

```javascript
// Helpers are NOT imported directly
// They're provided as part of the resourceKit

const orchestrator = new Orchestrator(resultId, {
  timingResolver,
  fifoScheduler,
  statusManager,
  // ... other helpers
});

// Orchestrator calls them when needed
const timing = timingResolver.compute(manifest, config);
const schedule = fifoScheduler.build(timing);
statusManager.initialize(resultId, { eta: timing.totalEta });
```

### How Helpers Interact

```javascript
// Helpers are INDEPENDENT
// They don't call each other
// They don't share state
// They're only called by orchestrator

// ✅ GOOD: Orchestrator coordinates
timing = timingResolver.compute(manifest);
schedule = fifoScheduler.build(timing);
status = statusManager.init({ eta: timing.totalEta });

// ❌ BAD: Helper calls helper
timingResolver.compute() {
  return fifoScheduler.build(...);  // No! Coupling!
}
```

### How Helpers Are Tested

```javascript
// Each helper is tested independently
// No need to mock orchestrator or genieService

describe("timingResolver", () => {
  it("should compute correct ETA for 4-call manifest", () => {
    const manifest = { ... };
    const result = timingResolver.compute(manifest, config);

    assert.equal(result.totalEta, 23);  // Expected: 23 seconds
    assert.equal(result.schedule.length, 4);
  });
});

describe("smartPollingHelper", () => {
  it("should calculate wait time as 80% of ETA", () => {
    const strategy = smartPollingHelper.calculateStrategy(30);

    assert.equal(strategy.wait_before_first_poll_ms, 24000);  // 80% of 30s
  });
});
```

---

## Benefits of the Helpers Framework

### For Development

| Benefit         | Why It Matters                                |
| --------------- | --------------------------------------------- |
| **Clarity**     | Each helper has one clear job                 |
| **Testability** | Helpers are independently testable            |
| **Reusability** | Helpers can be used by multiple services      |
| **Evolution**   | Change a helper without touching genieService |
| **Debugging**   | Errors are isolated to specific helpers       |

### For genieService

| Benefit             | Why It Matters                               |
| ------------------- | -------------------------------------------- |
| **Simplicity**      | From 500 lines to 20 lines                   |
| **Focus**           | Can think about domain, not details          |
| **Flexibility**     | Helpers can be swapped/evolved independently |
| **Maintainability** | Less code = fewer bugs                       |
| **Scalability**     | New services plug in easily                  |

### For the Platform

| Benefit           | Why It Matters                                     |
| ----------------- | -------------------------------------------------- |
| **Consistency**   | All services use same helper contracts             |
| **Extensibility** | New helpers added without disrupting existing ones |
| **Reliability**   | Helpers are thoroughly tested in isolation         |
| **Performance**   | Helpers are optimized independently                |
| **Transparency**  | Each helper's behavior is clear and predictable    |

---

## Status: Foundational Concept

**What we've captured**:

- ✅ The general idea of helpers/assistants
- ✅ Properties of good helpers
- ✅ Simple examples (timing-resolver, smart-polling)
- ✅ How helpers free genieService
- ✅ How helpers interact
- ✅ Benefits to development, genieService, platform

**Next Phase**:

- ⏳ Pair each helper to the problem it solves
- ⏳ Detailed implementation specs for each helper
- ⏳ Integration guide: How helpers fit into PART-B orchestrator
- ⏳ Testing strategy for each helper

---

## Summary: The Vision

**genieService should be a CONDUCTOR, not a performer.**

Instead of doing everything:

```
genieService: "I'll validate, compute, schedule, execute, track, error-handle, build response..."
```

It should orchestrate specialists:

```
genieService: "Timing specialist, what's the ETA?"
             "Scheduling specialist, build the schedule."
             "Status specialist, track progress."
             "Service, execute with this orchestrator interface."
             "Helpers, you handle your domains. I handle coordination."
```

**Result**: A clean, scalable, maintainable platform where:

- ✅ genieService is simple and understandable
- ✅ Helpers are independently testable and evolvable
- ✅ Services are truly independent (only know orchestrator interface)
- ✅ New capabilities are added without touching existing code
- ✅ The entire system is transparent and predictable

This is the goal. Helpers/Assistants are the mechanism to achieve it.

---

## Document Status

**Status**: DRAFT (Foundational)
**Audience**: Architecture review, implementation planning
**Next Review**: After helpers-to-problems pairing is complete
**Related Work**: PART-B Orchestrator, SERVICE_MACHINE_PATTERN, PART_A_AND_PART_B
````
