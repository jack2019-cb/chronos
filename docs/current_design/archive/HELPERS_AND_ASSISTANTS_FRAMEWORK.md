# Helpers & Assistants Framework: Freeing the Orchestrator

**Date**: December 19, 2025 @ 10:50AM (UPDATED)
**Branch**: `feat/ebook-nat-cont`

**Status**: DRAFT (Foundational Concept - Updated)
**Purpose**: Define the general framework for helpers/assistants that genieService delegates to, with distinction between per-request helpers and task-assigned utilities
**Related Documents**:

- [PART_B_ORCHESTRATOR_PATTERN_DRAFT.md](PART_B_ORCHESTRATOR_PATTERN_DRAFT.md) - Waiter pattern
- [SERVICE_MACHINE_PATTERN.md](SERVICE_MACHINE_PATTERN.md) - Service autonomy
- [PART_A_AND_PART_B_CONCEPTUAL_FRAMEWORK.md](PART_A_AND_PART_B_CONCEPTUAL_FRAMEWORK.md) - Async architecture
- [HELPERS_AND_ASSISTANTS_FRAMEWORK_REF0.md](HELPERS_AND_ASSISTANTS_FRAMEWORK_REF0.md) - Historical reference (original version)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Helpers vs. Utilities: Key Distinction](#helpers-vs-utilities-key-distinction)
3. [The Core Idea: Delegation vs. Monolithic](#the-core-idea-delegation-vs-monolithic)
4. [What Is a Helper/Assistant?](#what-is-a-helperassistant)
5. [What Is a Utility (Task-Assigned Service)?](#what-is-a-utility-task-assigned-service)
6. [The Waiter Metaphor (Applied to Helpers)](#the-waiter-metaphor-applied-to-helpers)
7. [Simple Example: The Timing-Resolver Helper](#simple-example-the-timing-resolver-helper)
8. [Simple Example: The smartPoller Utility (Task-Assigned)](#simple-example-the-smartpoller-utility-task-assigned)
9. [The Helper Ecosystem (General View)](#the-helper-ecosystem-general-view)
10. [How This Frees genieService](#how-this-frees-genieservice)
11. [The Contract Between genieService, Helpers, and Utilities](#the-contract-between-genieservice-helpers-and-utilities)
12. [Benefits of the Helpers & Utilities Framework](#benefits-of-the-helpers--utilities-framework)
13. [Status: Foundational Concept](#status-foundational-concept)
14. [Summary: The Vision](#summary-the-vision)

---

## Executive Summary

**genieService should be a PURE ORCHESTRATOR** that:

- ✅ Routes requests to services
- ✅ Coordinates execution flow via helpers
- ✅ Assigns tasks to utilities (like aiService, smartPoller)
- ✅ Provides clean interfaces to services
- ✅ Oversees the entire domain

**Helpers** are **per-request specialists** that:

- ✅ Solve one specific computation/validation problem
- ✅ Operate independently during job execution
- ✅ Have clear, simple contracts (pure logic)
- ✅ Are tested in isolation
- ✅ Die when job completes

**Utilities** are **task-assigned services** that:

- ✅ Accept task assignments from genieService
- ✅ Operate across multiple requests (long-lived)
- ✅ Maintain state for assigned tasks
- ✅ Enrich assignments with actualized activity data
- ✅ Decide what to surface to clients
- ✅ Like aiService, persistence, logger (shared infrastructure)

**Result**: genieService is **free to think big** while helpers handle per-job logic and utilities handle shared responsibilities.

---

## Helpers vs. Utilities: Key Distinction

### Helpers (Per-Request Specialists)

| Aspect             | Detail                                                    |
| ------------------ | --------------------------------------------------------- |
| **Creation**       | Fresh instance for each orchestrator                      |
| **Lifecycle**      | Duration of one generation job (tied to resultId)         |
| **Responsibility** | Pure computation/logic for THIS job                       |
| **Examples**       | timingResolver, manifestProcessor, progressTracker        |
| **Access**         | genieService → Orchestrator → Called per-request          |
| **State**          | Accumulates during job execution, discarded on completion |
| **Scope**          | Single job only                                           |

### Utilities (Task-Assigned Services)

| Aspect             | Detail                                                          |
| ------------------ | --------------------------------------------------------------- |
| **Creation**       | Once at application startup (singleton-like)                    |
| **Lifecycle**      | Application lifecycle                                           |
| **Responsibility** | Assigned specific tasks by genieService                         |
| **Examples**       | aiService, smartPoller, persistence, logger, config             |
| **Access**         | Direct injection; genieService assigns tasks                    |
| **State**          | Long-lived; tracks multiple concurrent tasks (one per resultId) |
| **Scope**          | App-wide; handles all jobs                                      |

### The Task Assignment Pattern

**Key Concept**: genieService **assigns tasks to utilities**, like delegating work in an organization.

```javascript
// Helper computes for THIS job
const timing = timingResolver.compute(manifest);
// Returns: { eta: 23s, schedule: [...] }

// genieService ASSIGNS TASK to utility for THIS job's resultId
smartPoller.assignTask(resultId, {
  eta: timing.totalEta,
  totalCalls: manifest.totalRequests,
});

// Utility now owns polling/status responsibility
// genieService periodically enriches it with actualized data
smartPoller.updateProgress(resultId, {
  currentCall: 2,
  completedCalls: 1,
  nextEstimatedCompletion: Date.now() + 17000,
  errors: [],
});

// Client polls: GET /api/status/:resultId
// smartPoller responds (decides what to surface)
// Returns: { status: "in-progress", calls_completed: 1, calls_total: 4, eta: 23, ... }
```

---

## Visual: Backend Architecture (PART-A + PART-B + Helpers + Utilities)

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
│  ✓ Return IMMEDIATELY with { resultId, eta: 23, status: "queued" }     │
│  ✓ Hand off async to PART-B (NO WAITING)                               │
│                                                                        │
│  Solves: 🔓 BREAKS SYNCHRONOUS COUPLING                                │
│          └─ Client no longer blocks 50+ seconds                        │
│          └─ No infrastructure timeout hit                              │
│                                                                        │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                (HTTP Response: 202 Accepted)
        { resultId, eta: 23, status: "queued" }
                             │
              ┌──────────────┼──────────────┐
              ↓              ↓              ↓
          FRONTEND        PART-B       Job Status
         (Smart Polling) (Async)       (In smartPoller)
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│              PART-B: SMART ORCHESTRATION (genieService)                │
│                       (Waiter Pattern)                                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  SERVICE ROUTING & ORCHESTRATION:                                      │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ 1. Create fresh orchestrator with HELPERS                    │      │
│  │ 2. Assign task to UTILITIES                                  │      │
│  │ 3. Route to service: if "ebook" → ebookService.handle()      │      │
│  │ 4. Pass orchestrator interface to service                    │      │
│  │ 5. As service executes, periodically update utilities        │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                             │                                          │
│                             ↓                                          │
│  ┌─ HELPERS ECOSYSTEM (Per-Request, Pure Logic) ────────────────┐      │
│  │                                                              │      │
│  │  manifest-processor: Validate & parse manifest               │      │
│  │      ↓                                                       │      │
│  │  timing-resolver: Manifest → ETA + Schedule                  │      │
│  │      ↓                                                       │      │
│  │  fifo-scheduler: Build execution slots with spacing          │      │
│  │      ↓                                                       │      │
│  │  statusManager: Initialize & track progress                  │      │
│  │      ↓                                                       │      │
│  │  toolSelector: Pick which AI tool to use                     │      │
│  │      ↓                                                       │      │
│  │  errorReporter: Correlate error details                      │      │
│  │      ↓                                                       │      │
│  │  progressTracker: Calculate completion %                     │      │
│  │      ↓                                                       │      │
│  │  (All pure logic, fresh per job, independently testable)     │      │
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
│  │   5. UPDATE UTILITY: smartPoller.updateProgress(resultId)    │      │
│  │      (Enriches utility with actualized activity)             │      │
│  │                                                              │      │
│  │ Total execution time: ~24s (vs 49-50s current)               │      │
│  │ Well within 60s infrastructure limit                         │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                        │
│  UTILITIES (Long-Lived, Task-Assigned):                                │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ BACK-END UTILITIES:                                          │      │
│  │  • aiService: Assigned "Generate content" tasks              │      │
│  │  • persistence: Assigned "Store/retrieve data" tasks         │      │
│  │  • logger: Shared logging across all tasks                   │      │
│  │  • config: Shared configuration                              │      │
│  │                                                              │      │
│  │ POLLING/STATUS UTILITY:                                      │      │
│  │  • smartPoller: Assigned "Manage polling/status for resultId"        │
│  │    - Receives task: assignTask(resultId, {eta, totalCalls})  │      │
│  │    - Receives updates: updateProgress(resultId, activity)    │      │
│  │    - Enriches with actualized data from execution            │      │
│  │    - Decides what to forward to client (filters/aggregates)  │      │
│  │                                                              │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                        │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                    (Async Background Execution)
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│                  FRONTEND: SMART POLLING                               │
│                  (Uses smartPoller via HTTP)                           │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Receives ETA from PART-A (202 response)                               │
│      ↓                                                                 │
│  Calculates intelligent polling strategy:                              │
│  • Wait ~80% of ETA before starting polls                              │
│  • Poll every 2s after that                                            │
│  • Timeout if not done in ~53s total                                   │
│      ↓                                                                 │
│  Polls: GET /api/status/:resultId                                      │
│      ↓                                                                 │
│  smartPoller responds with enriched status:                            │
│  { status: "in-progress", calls_completed: 1, calls_total: 4,          │
│    eta: 23, estimated_remaining: 17, progress_percent: 25 }            │
│      ↓                                                                 │
│  Display progress updates to user                                      │
│      ↓                                                                 │
│  On completion, display result                                         │
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
        • smartPoller manages status (no client blocking)

  ❌ PROBLEM 2: Rapid-Fire Errors (429 Too Many Requests)
     ✅ SOLUTION: timing-resolver enforces spacing
        • Pro calls: 250ms apart (respects 2 RPM limit)
        • Flash calls: 100ms apart (respects 15 RPM limit)
        • FIFO queue naturally orders calls

  ❌ PROBLEM 3: Quota Exhaustion
     ✅ SOLUTION: Quota is timing-based, not state-based
        • No quotaTracker state tracking needed
        • Spacing automatically respects quota constraints

  ❌ PROBLEM 4: Dumb Polling (client polls before job ready)
     ✅ SOLUTION: smartPoller enriches with actualized data
        • genieService provides real progress to smartPoller
        • Client gets intelligent polling strategy + real status
        • Visibility into job progress without blocking

═══════════════════════════════════════════════════════════════════════════
```

---

## The Core Idea: Delegation vs. Monolithic

### What We're Escaping

```javascript
// MONOLITHIC GENIESERVICE (current anti-pattern)
async process(payload) {
  // Validation
  // Persistence check
  // Quota checking
  // Service routing
  // Timing computation
  // Scheduling
  // Execution management
  // Status tracking
  // Error handling + correlation
  // Response building

  // genieService is EVERYTHING
  // Hard to test, hard to change, hard to understand
}
```

**Problem**: genieService is doing EVERYTHING. It's a monolith.

### What We're Moving Toward

```javascript
// ORCHESTRATOR GENIESERVICE (goal state)
async process(payload) {
  const { resultId, mode, prompt, metadata } = payload;

  // Create fresh orchestrator with HELPERS
  const orchestrator = new Orchestrator(resultId, {
    manifestProcessor, timingResolver, fifoScheduler,
    toolSelector, statusManager, errorReporter, progressTracker
  });

  // ASSIGN TASK to utility
  smartPoller.assignTask(resultId, { /* timing from helpers */ });

  // Route to service with clean interface
  const service = this.selectService(mode);

  // Service executes; genieService enriches smartPoller with progress
  const result = await service.handle(payload, {
    orchestrator,
    onProgress: (activity) => smartPoller.updateProgress(resultId, activity),
    logger,
    config
  });

  return result;
}
```

**Benefit**: genieService is clean orchestration. Helpers do computation. Utilities handle shared responsibilities.

---

## What Is a Helper/Assistant?

### Definition

A **helper** is a **per-request, specialized, independent component** that:

1. **Solves ONE problem** (single responsibility)
2. **Is testable in isolation** (pure logic, clear contracts)
3. **Has no hard-coded dependencies** (receives all inputs via parameters)
4. **Can be evolved independently** (changes don't ripple to genieService)
5. **Serves the orchestrator** (provides what orchestrator needs for THIS job)

### Properties of Good Helpers

| Property                  | Meaning                       | Example                               |
| ------------------------- | ----------------------------- | ------------------------------------- |
| **Single Responsibility** | One reason to change          | timingResolver: only computes timing  |
| **Clear Input Contract**  | Well-defined inputs           | manifest → timing                     |
| **Clear Output Contract** | Well-defined outputs          | { eta, schedule }                     |
| **No Side Effects**       | Doesn't modify external state | Pure computation                      |
| **Per-Request Scope**     | Fresh for each job            | New instance per resultId             |
| **Testable**              | Easy to unit test             | Feed data, check output               |
| **Composable**            | Can be combined with others   | timing → schedule → status → progress |

---

## What Is a Utility (Task-Assigned Service)?

### Definition

A **utility** is a **long-lived, app-wide service** that:

1. **Accepts task assignments** from genieService
2. **Maintains state** for multiple concurrent tasks (one per resultId)
3. **Enriches assignments** with actualized activity from execution
4. **Decides what to surface** to clients (filtering, aggregating)
5. **Serves across all jobs** (shared infrastructure)

### Examples & Responsibilities

| Utility         | Task Assignment                        | Enrichment                          | What It Surfaces          |
| --------------- | -------------------------------------- | ----------------------------------- | ------------------------- |
| **aiService**   | "Generate content for prompt X"        | Actual results, tokens used, timing | Success/error responses   |
| **smartPoller** | "Manage polling/status for resultId Y" | Progress updates from execution     | Real-time job status, ETA |
| **persistence** | "Store result Z"                       | Database operation results          | Confirmation, retrieval   |
| **logger**      | "Log events for this execution"        | Structured logs from entire job     | Application logs          |

### smartPoller: Deep Dive

**Task Assignment**:

```javascript
// genieService assigns task
smartPoller.assignTask(resultId, {
  eta: 23000, // ms (from timing-resolver helper)
  totalCalls: 4, // From manifest
  createdAt: Date.now(),
});

// smartPoller initializes internal state for this resultId
// {
//   resultId: "xyz-123",
//   eta: 23000,
//   totalCalls: 4,
//   status: "in-progress",
//   progress: { completedCalls: 0, currentCall: 0 },
//   startedAt: timestamp,
//   lastUpdate: timestamp,
//   errors: []
// }
```

**Enrichment (during execution)**:

```javascript
// As service executes, genieService periodically sends updates
smartPoller.updateProgress(resultId, {
  currentCall: 1,
  completedCalls: 0,
  nextEstimatedCompletion: Date.now() + 17000,
  errors: [],
});

smartPoller.updateProgress(resultId, {
  currentCall: 2,
  completedCalls: 1,
  nextEstimatedCompletion: Date.now() + 11000,
  errors: [],
});
```

**Surfacing to Client (what smartPoller decides)**:

```javascript
// Client polls: GET /api/status/:resultId
// smartPoller.getStatus(resultId) returns:
{
  status: "in-progress",
  eta: 23,                    // seconds
  calls_completed: 1,
  calls_total: 4,
  progress_percent: 25,
  estimated_remaining_seconds: 11,
  message: "Processing call 2 of 4..."
}

// smartPoller DECIDES what to expose
// - Hides internal details
// - Shows only relevant progress
// - Can filter errors (show only critical ones)
// - Can aggregate/summarize activity
```

---

## The Waiter Metaphor (Applied to Helpers)

```
Customer (Service) orders: "I need expert-tier content and standard-tier content"

Waiter (Orchestrator) has team of specialists:

  Timing Specialist:     "How long will that take?" [HELPER]
  Scheduling Specialist: "When will each dish be ready?" [HELPER]
  Tool Specialist:       "Which chef should make this?" [HELPER]
  Status Specialist:     "Is it done yet?" [HELPER]
  Progress Specialist:   "How much is ready?" [HELPER]

Waiter also coordinates with UTILITIES:

  Chef (aiService):      "Make this dish" [UTILITY - assigned task]
  Host (smartPoller):    "Track table status, tell customers when ready" [UTILITY - assigned task]
  Cashier (persistence): "Store this order" [UTILITY - assigned task]

Waiter coordinates:
  1. Timing specialist says: "23 seconds total"
  2. Scheduling specialist builds: [order 0 at T+0, order 1 at T+6.25, ...]
  3. Tool specialist picks chefs
  4. Status specialist tracks: "0 of 4 orders done"
  5. Waiter ASSIGNS Chef: "Make these in this order"
  6. Waiter ASSIGNS Host: "Track this table, tell customers when ready"
  7. As each dish finishes, Waiter UPDATES Host: "Dish 1 done, 3 remain"
  8. Host DECIDES what to tell customer: "2 of 4 ready (est. 10 min remain)"
  9. Customer doesn't see details. Just sees: "Your order is 50% ready"

Customer (Client) is happy: "I have visibility without blocking!"
```

---

## Simple Example: The Timing-Resolver Helper

### The Problem It Solves

**Challenge**: Given a manifest (list of calls), compute:

- How long will this take? (ETA)
- When does each call execute? (Schedule)
- How do we respect rate limits? (Spacing)
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
    { callIndex: 0, tier: "expert", startTime: 0, duration: 6000, endTime: 6000 },
    { callIndex: 1, tier: "expert", startTime: 6250, duration: 6000, endTime: 12250 },
    { callIndex: 2, tier: "standard", startTime: 12350, duration: 5000, endTime: 17350 },
    { callIndex: 3, tier: "expert", startTime: 17450, duration: 6000, endTime: 23450 }
  ]
}
```

### Why It's a Good Helper

✅ **Single responsibility**: Compute timing  
✅ **Per-request**: Fresh instance for each job  
✅ **Clear inputs/outputs**: manifest + config → { eta, schedule }  
✅ **No side effects**: Pure calculation  
✅ **Testable**: Feed data, check math  
✅ **Solves three problems**: ETA, Spacing, Quota compliance

---

## Simple Example: The smartPoller Utility (Task-Assigned)

### The Responsibility It Manages

**Role**: Back-end utility **assigned polling/status responsibility** for a specific resultId

**Why a Utility, not a Helper**:

- ✅ Long-lived (app-wide, not per-job)
- ✅ Handles many concurrent tasks (one per resultId)
- ✅ Enriched by genieService during execution
- ✅ Decides what to surface to client
- ✅ Like aiService (both are task-assigned services)

### Task Assignment (from genieService)

```javascript
// Helper computes
const timing = timingResolver.compute(manifest);

// genieService assigns task to utility
smartPoller.assignTask(resultId, {
  eta: timing.totalEta,
  totalCalls: manifest.totalRequests,
});

// smartPoller now owns polling/status for this resultId
```

### Enrichment (during execution)

```javascript
// As service executes, genieService enriches smartPoller
// Call 1 starts
smartPoller.updateProgress(resultId, {
  currentCall: 1,
  completedCalls: 0,
  nextEstimatedCompletion: Date.now() + 6000,
  errors: [],
});

// Call 1 completes
smartPoller.updateProgress(resultId, {
  currentCall: 2,
  completedCalls: 1,
  nextEstimatedCompletion: Date.now() + 11250,
  errors: [],
});

// ... and so on
```

### Surfacing to Client (smartPoller decides)

```javascript
// Client polls: GET /api/status/:resultId
// smartPoller responds:
{
  status: "in-progress",
  eta: 23,
  calls_completed: 1,
  calls_total: 4,
  progress_percent: 25,
  estimated_remaining_seconds: 17,
  message: "Generating (1 of 4 calls complete)"
}

// smartPoller DECIDES:
// - What to expose (hides internal details)
// - What to filter (only relevant info)
// - What to aggregate (clean presentation)
```

### Why It's a Good Utility Assignment

✅ **Clear task boundary**: Owns polling/status for specific resultId  
✅ **Similar to aiService**: Both accept task assignments from genieService  
✅ **Stateful responsibility**: Tracks progress as execution unfolds  
✅ **Enriched by execution**: genieService provides real activity data  
✅ **Client-facing**: Decides what to surface to users  
✅ **Testable**: Feed task + updates, verify responses  
✅ **Solves four problems**:

- Client has real-time visibility
- Backend manages progress transparently
- No dumb polling (client gets intelligent strategy + real status)
- Execution details hidden (client sees only relevant info)

---

## The Helper Ecosystem (General View)

### Helper Categories

| Category           | Purpose               | Examples                              |
| ------------------ | --------------------- | ------------------------------------- |
| **Computation**    | Pure math/logic       | timing-resolver, progress-calculator  |
| **Validation**     | Check data integrity  | manifest-processor, payload-validator |
| **Selection**      | Pick from options     | tool-selector, tier-mapper            |
| **Transformation** | Convert data          | error-correlator, response-builder    |
| **Organization**   | Structure information | schedule-builder, status-tracker      |

### How Helpers Connect

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
statusManager (Track progress)
         ↓
progressTracker (Calculate completion %)
         ↓
On completion:
errorReporter (If error, correlate details)
response-builder (Format response)
         ↓
genieService enriches smartPoller (UTILITY) with actualized activity
         ↓
Client polls smartPoller for status (UTILITY responds)
```

Each helper knows one thing. Orchestrator coordinates. Utilities maintain state across requests.

---

## How This Frees genieService

### Before (Monolithic)

```javascript
async process(payload) {
  // Validate + Persistence + Quota + Service routing +
  // Timing + Scheduling + Execution + Status tracking +
  // Error handling + Response building

  // genieService is EVERYTHING (~500 lines)
  // Hard to test, hard to change, hard to understand
}
```

### After (Pure Orchestrator)

```javascript
async process(payload) {
  const { resultId, mode, prompt, metadata } = payload;

  // Create orchestrator with HELPERS
  const orchestrator = new Orchestrator(resultId, helpers);

  // ASSIGN TASK to utility
  smartPoller.assignTask(resultId, { eta, totalCalls });

  // Route to service
  const service = this.selectService(mode);

  // Execute with callback to ENRICH utility
  const result = await service.handle(payload, {
    orchestrator,
    onProgress: (activity) => smartPoller.updateProgress(resultId, activity),
    logger,
    config
  });

  return result;
}
```

**Result**: genieService is ~30 lines of clean orchestration.

---

## The Contract Between genieService, Helpers, and Utilities

### How Helpers Are Called

```javascript
// Helpers provided to orchestrator (fresh per job)
const orchestrator = new Orchestrator(resultId, {
  timingResolver,
  fifoScheduler,
  statusManager,
  // ... other helpers
});

// Orchestrator calls them on demand
const timing = timingResolver.compute(manifest, config);
const schedule = fifoScheduler.build(timing);
statusManager.initialize(resultId, { eta: timing.totalEta });
```

### How Utilities Are Assigned

```javascript
// Utilities are long-lived
// genieService ASSIGNS tasks to them

// 1. Initial task assignment
smartPoller.assignTask(resultId, {
  eta: timing.totalEta,
  totalCalls: manifest.totalRequests,
});

// 2. Periodic enrichment during execution
smartPoller.updateProgress(resultId, {
  currentCall: callIndex,
  completedCalls: completedCount,
  nextEstimatedCompletion: futureTimestamp,
  errors: errorArray,
});

// 3. Client polls utility
const status = smartPoller.getStatus(resultId);
res.json(status);
```

### How Helpers Interact

```javascript
// Helpers are INDEPENDENT
// They don't call each other or utilities
// Only orchestrator coordinates

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
// Each helper independently testable
describe("timingResolver", () => {
  it("should compute correct ETA for 4-call manifest", () => {
    const result = timingResolver.compute(manifest, config);
    assert.equal(result.totalEta, 23);
  });
});

// Utilities tested with task assignments
describe("smartPoller", () => {
  it("should track progress correctly", () => {
    smartPoller.assignTask(id, { eta: 23000, totalCalls: 4 });
    smartPoller.updateProgress(id, { currentCall: 1, completedCalls: 0 });

    const status = smartPoller.getStatus(id);
    assert.equal(status.calls_completed, 0);
    assert.equal(status.progress_percent, 0);
  });
});
```

---

## Benefits of the Helpers & Utilities Framework

### For Development

| Benefit         | Why It Matters                                                       |
| --------------- | -------------------------------------------------------------------- |
| **Clarity**     | Each helper has one clear job; utilities have clear task boundaries  |
| **Testability** | Helpers & utilities independently testable                           |
| **Reusability** | Helpers used by multiple orchestrators; utilities shared across jobs |
| **Evolution**   | Change helper/utility without touching genieService                  |
| **Debugging**   | Errors isolated to specific components                               |

### For genieService

| Benefit             | Why It Matters                              |
| ------------------- | ------------------------------------------- |
| **Simplicity**      | From 500 lines to ~30 lines                 |
| **Focus**           | Domain thinking, not implementation details |
| **Flexibility**     | Helpers/utilities swappable independently   |
| **Maintainability** | Less code = fewer bugs                      |
| **Scalability**     | New services plug in easily                 |

### For the Platform

| Benefit           | Why It Matters                                                   |
| ----------------- | ---------------------------------------------------------------- |
| **Consistency**   | All services use same helper/utility patterns                    |
| **Extensibility** | New helpers/utilities without disrupting existing code           |
| **Reliability**   | Helpers/utilities thoroughly tested in isolation                 |
| **Performance**   | Components optimized independently                               |
| **Transparency**  | Behavior clear and predictable; client gets real-time visibility |

---

## Status: Foundational Concept (Updated)

**What we've captured**:

- ✅ Distinction between helpers (per-request) and utilities (app-wide)
- ✅ Task assignment pattern (genieService assigns tasks to utilities)
- ✅ Enrichment pattern (genieService updates utilities with real activity)
- ✅ smartPoller as example utility (manages polling/status with real data)
- ✅ Properties of good helpers
- ✅ How they free genieService

**Next Phase**:

- ⏳ Detailed implementation specs for each helper
- ⏳ Detailed implementation specs for utilities (smartPoller, aiService, etc.)
- ⏳ Integration guide: How helpers/utilities fit into PART-B orchestrator
- ⏳ Testing strategy for each component
- ⏳ Multi-user scaling considerations for utilities

---

## Summary: The Vision

**genieService should be a CONDUCTOR, not a performer.**

**Helpers** do **per-request logic** (pure computation):

```
"Timing specialist, what's the ETA?"
"Scheduling specialist, build the schedule."
"Status specialist, initialize for this job."
```

**Utilities** handle **app-wide responsibilities** (long-lived, task-assigned):

```
"aiService, I'm assigning you to generate content."
"smartPoller, I'm assigning you to manage polling/status for this job."
"As I execute, I'll update you with real progress data."
```

**Result**: A clean, scalable, observable platform:

- ✅ genieService is simple orchestration (~30 lines)
- ✅ Helpers are independently testable (pure logic)
- ✅ Utilities are long-lived, task-assigned services (like aiService)
- ✅ Clients get real-time visibility via enriched smartPoller
- ✅ Execution details tracked transparently (smart polling, not dumb)
- ✅ New capabilities added without touching existing code
- ✅ The entire system is transparent and predictable

This is the goal. **Helpers + Utilities** are the mechanism to achieve it.

---

## Document Status

**Status**: DRAFT (Foundational) - **Updated**
**Date Updated**: December 19, 2025 @ 8:30 PM
**Key Updates**:

- ✅ Renamed smartPollingHelper → smartPoller (consistent naming)
- ✅ Reclassified as Utility (task-assigned) not Helper (per-request)
- ✅ Added "Helpers vs. Utilities" section
- ✅ Added task assignment + enrichment pattern
- ✅ Explained genieService periodically enriches utilities with activity
- ✅ Clarified what utilities decide to surface to clients

**Audience**: Architecture review, implementation planning
**Related Work**: PART-B Orchestrator, SERVICE_MACHINE_PATTERN, PART_A_AND_PART_B
**Historical Reference**: [HELPERS_AND_ASSISTANTS_FRAMEWORK_REF0.md](HELPERS_AND_ASSISTANTS_FRAMEWORK_REF0.md)
