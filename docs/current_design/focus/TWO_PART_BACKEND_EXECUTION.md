# Two-Part Backend Execution Flow

**Date**: December 19, 2025 @ 2:45PM
**Branch**: feat/ebook-nat-cont

**Status:** DRAFT as preliminary design doc
**Purpose**: Text-only description of backend request lifecycle: PART-A (dumb plumbing) and PART-B (genieService orchestration)

**Related Documents**:

- [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md) — Parent design spec; overall architecture and principles
- [CONVERSATION_TRANSCRIPT.md](CONVERSATION_TRANSCRIPT.md) — Design discussion; how this solution converged
- [SERVICE_MACHINE_PATTERN.md](SERVICE_MACHINE_PATTERN.md) — Service contract and design principles
- [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md) — Current implementation (before refactoring)
- [ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md) — System goals and high-level context
- [CLIENT_SERVER_INTEGRATION.md](../CLIENT_SERVER_INTEGRATION.md) — HTTP contracts and timeout behavior
- [SPEC_VS_IMPLEMENTATION_GAP.md](../SPEC_VS_IMPLEMENTATION_GAP.md) — Why this refactoring is necessary

---

## Context & Design History

This design resolves architectural gaps identified in [SPEC_VS_IMPLEMENTATION_GAP.md](../SPEC_VS_IMPLEMENTATION_GAP.md) by implementing the [SERVICE_MACHINE_PATTERN.md](SERVICE_MACHINE_PATTERN.md) specification.

The two-part execution model (dumb plumbing + smart orchestration) emerged from the [CONVERSATION_TRANSCRIPT.md](CONVERSATION_TRANSCRIPT.md) discussion and is formalized in [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md).

**Quick navigation**:

- Want to understand WHY this design? → [SPEC_VS_IMPLEMENTATION_GAP.md](../SPEC_VS_IMPLEMENTATION_GAP.md)
- Want to understand the principles? → [SERVICE_MACHINE_PATTERN.md](SERVICE_MACHINE_PATTERN.md)
- Want to understand FIFO scheduling? → [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md)
- Want to see current implementation? → [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md)

---

## Table of Contents

1. [Overview](#overview)
2. [PART-A: Dumb Plumbing (HTTP Entry Point)](#part-a-dumb-plumbing-http-entry-point)
   - [Scenario 1: New Request from Frontend](#scenario-1-new-request-from-frontend)
   - [Scenario 2: Polling Request from Frontend](#scenario-2-polling-request-from-frontend)
3. [PART-B: Smart Orchestration (genieService)](#part-b-smart-orchestration-genieservice)
   - [Background Execution](#background-execution-started-by-part-a-runs-independently)
4. [Timeline Example: 3-Page Ebook](#timeline-example-3-page-ebook)
5. [Separation of Concerns](#separation-of-concerns)
6. [Key Principles](#key-principles)
7. [State Diagram](#state-diagram)
8. [Summary](#summary)
9. [Reference Terms & Related Concepts](#reference-terms--related-concepts)

---

## Overview

The backend executes in two sequential phases:

- **PART-A (Dumb Plumbing)**: HTTP entry point receives request, returns immediately with resultId and ETA, hands execution to genieService
- **PART-B (Smart Orchestration)**: genieService takes over, computes schedule, executes asynchronously in background, updates job status

Frontend interaction occurs only through PART-A at two moments:

1. Initial request (returns resultId + ETA)
2. Polling for status (returns current status + progress)

---

## PART-A: Dumb Plumbing (HTTP Entry Point)

### Scenario 1: New Request from Frontend

**Frontend sends**: New generation request (e.g., ebook with 3 pages)

See [CLIENT_SERVER_INTEGRATION.md](../CLIENT_SERVER_INTEGRATION.md) for HTTP request envelope details and status codes.

**Plumbing sequence**:

1. HTTP handler receives request at POST /api/ebook/generate
2. Extract payload: prompt, theme, pageCount, etc.
3. Validate input (basic schema check)
4. Generate unique resultId (UUID)
5. Store request in job registry with status "pending"
6. Create async task: Call genieService.process(payload, resultId) — do NOT wait for result
7. Return HTTP response immediately (within 100ms):
   - resultId: "job-abc123"
   - eta: 41 (seconds, computed by genieService)
   - status: "pending"

**Key point**: Plumbing does NOT wait for genieService. It spawns the task and returns immediately.

---

### Scenario 2: Polling Request from Frontend

**Frontend sends**: { resultId: "job-abc123" } (previously returned resultId)

**Plumbing sequence**:

1. HTTP handler receives request at GET /api/job/:resultId
2. Look up job in registry by resultId
3. Return current job status:

   If status is "pending":

   - Return { resultId, eta, status: "pending" }

   If status is "executing":

   - Return { resultId, eta, status: "executing", progress: { completed_calls: N, remaining_calls: M } }

   If status is "complete":

   - Return { resultId, eta, status: "complete", result: { ebook, chapters, html, ... } }

   If status is "error":

   - Return { resultId, eta, status: "error", error: { code, message, ... } }

4. Return HTTP response immediately

**Key point**: Plumbing just reads state. No computation, no API calls.

---

## PART-B: Smart Orchestration (genieService)

### Background Execution (Started by PART-A, runs independently)

**Triggered by**: Async task spawned by PART-A plumbing

**Execution sequence**:

1. **Route by mode**: Is this an ebook, wallArt, calendar, etc.?

   - For ebook: route to ebookService

2. **Call ebookService** (FIRST CALL ONLY):

   - Pass payload + resourceKit
   - See [SERVICE_MACHINE_PATTERN.md](SERVICE_MACHINE_PATTERN.md) for resourceKit contract and service responsibilities
   - ebookService.handle() returns:
     - callIndex: 0 (first call)
     - tier: "expert"
     - content: "Generated structure..."
     - totalRequests: [
       { tier: "expert", ... },
       { tier: "expert", ... },
       { tier: "flash", ... },
       { tier: "expert", ... }
       ]

3. **Extract totalRequests manifest**: Now genieService knows the complete sequence

4. **Compute ETA** (via time-registry module):

   - See [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md) for time-registry module specification
   - Input: totalRequests array + model latencies (pro: 12s, flash: 5s) + spacing (pro: 250ms, flash: 100ms)
   - Calculation: Iterate through calls in order
     - Call 0 (expert): slot 0s → 12s
     - Call 1 (expert): slot 12.25s → 24.25s (spacing added)
     - Call 2 (flash): slot 24.35s → 29.35s
     - Call 3 (expert): slot 29.45s → 41.45s
   - Output: totalEta = 41 seconds (approximately)

5. **Update job registry**: status = "pending", eta = 41

6. **Return to PART-A**: { resultId, eta: 41 } — PART-A immediately sends this to frontend

7. **Execute schedule asynchronously** (continues in background):

   For each call in totalRequests (in order, FIFO):

   a. Wait until computed slot time arrives

   - Call 0: wait 0ms (start immediately)
   - Call 1: wait 12.25s
   - Call 2: wait 24.35s
   - Call 3: wait 29.45s

   b. Update job registry: status = "executing", progress = { completed: N, remaining: M }

   c. Call aiService.generate(prompt, { tier, callIndex }):

   - If tier is "expert" → aiService routes to Pro model
   - If tier is "flash" → aiService routes to Flash model
   - aiService makes API call to Gemini
   - aiService returns { content, metadata }

   d. Store result in job registry: results[callIndex] = { content, metadata }

   e. Next iteration (repeat for each call)

8. **Post-execution** (when all calls complete):
   - Compose final result: assemble pages, generate HTML
   - Persist result to database (if enabled)
   - Update job registry: status = "complete", result = { ebook, chapters, html, ... }
   - Job is now ready for frontend to download/display

---

## Timeline Example: 3-Page Ebook

```
T=0ms:      Frontend sends POST /api/ebook/generate
            └─ Plumbing receives, validates, generates resultId
            └─ Plumbing spawns genieService task (async)
            └─ Plumbing returns { resultId, eta: 41 } to frontend

T=50ms:     Frontend receives response, stores resultId, begins polling

T=100ms:    genieService.process() executes in background
            ├─ Routes to ebookService
            └─ ebookService returns manifest with 4 calls (structure, opening, middle, closing)

T=110ms:    genieService computes ETA
            ├─ Call 0 (expert): 0s → 12s
            ├─ Call 1 (expert): 12.25s → 24.25s
            ├─ Call 2 (flash): 24.35s → 29.35s
            ├─ Call 3 (expert): 29.45s → 41.45s
            └─ Total ETA: 41s (already returned to frontend)

T=120ms:    genieService spawns execution schedule in background
            └─ Updates job status: pending → will execute

T=2000ms:   Frontend polls: GET /api/job/job-abc123
            └─ Plumbing returns { status: "pending", eta: 41 }

T=12100ms:  Call 0 (expert) executes
            ├─ Wait time elapsed (12.1s)
            ├─ Make Gemini API call (Pro model)
            ├─ Receive structure (12s latency)
            └─ Store result

T=12200ms:  genieService updates status: executing, progress = 1/4

T=14000ms:  Frontend polls: GET /api/job/job-abc123
            └─ Plumbing returns { status: "executing", progress: { completed: 1, remaining: 3 } }

T=24250ms:  Call 1 (expert) executes
            ├─ Wait time elapsed
            ├─ Make Gemini API call (Pro model)
            ├─ Receive opening (12s latency)
            └─ Store result

T=24350ms:  Call 2 (flash) executes
            ├─ Wait time elapsed
            ├─ Make Gemini API call (Flash model)
            ├─ Receive middle chapters (5s latency)
            └─ Store result

T=29450ms:  Call 3 (expert) executes
            ├─ Wait time elapsed
            ├─ Make Gemini API call (Pro model)
            ├─ Receive closing (12s latency)
            └─ Store result

T=41500ms:  All calls complete
            ├─ genieService composes final ebook
            ├─ Persists to database
            └─ Updates job status: complete, result = { ebook, chapters, html, ... }

T=42000ms:  Frontend polls: GET /api/job/job-abc123
            └─ Plumbing returns { status: "complete", result: { ebook, ... } }

T=42100ms:  Frontend receives complete ebook, displays to user
```

**Total elapsed time**: ~41.5 seconds (from frontend request to completion)
**Frontend hang time**: ~50ms (PART-A plumbing returns immediately)
**Frontend polling**: Every 2 seconds (intelligent based on ETA)

---

## Separation of Concerns

This architecture conforms to [SERVICE_MACHINE_PATTERN.md](SERVICE_MACHINE_PATTERN.md) design spec. For current implementation context, see [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md) and [SPEC_VS_IMPLEMENTATION_GAP.md](../SPEC_VS_IMPLEMENTATION_GAP.md).

### PART-A (Plumbing) Owns:

- ✓ HTTP request/response handling
- ✓ Request validation (basic schema)
- ✓ resultId generation and storage
- ✓ Job status registry reads
- ✓ Immediate response to frontend

### PART-B (genieService) Owns:

- ✓ Mode routing (ebook, wallArt, calendar, etc.)
- ✓ Service dispatch (which service to call)
- ✓ ETA computation (via time-registry)
- ✓ Quota/spacing enforcement (via FIFO scheduling)
- ✓ Background async execution
- ✓ Call sequencing and slot-time waiting
- ✓ Result composition and persistence
- ✓ Job status updates

### Service (ebookService) Owns:

- ✓ Business logic (composition strategy)
- ✓ Manifest generation (totalRequests array)
- ✓ Tier declarations (expert vs. standard, not model names)

### Utilities Own:

- ✓ aiService: Model routing (tier → Pro/Flash), API dispatch
- ✓ quotaTracker: Global quota state, slot reservation
- ✓ persistence: Database storage, retrieval

---

## Key Principles

These principles align with the overall [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md) architecture. For the design discussion that led here, see [CONVERSATION_TRANSCRIPT.md](CONVERSATION_TRANSCRIPT.md).

**Dumb Plumbing**: HTTP layer is stateless and minimal. It accepts requests, spawns tasks, and returns immediately.

**Smart Orchestration**: genieService is the decision-maker. It computes timing, enforces quota, schedules execution, and manages job lifecycle.

**Natural FIFO**: Scheduling leverages the natural FIFO structure of ebookService (already sequences calls semantically). No complex scheduling algorithm—just arithmetic.

**Deterministic Execution**: ETA is computed once, upfront, based on manifest. All timing is deterministic and fair.

**Async Execution**: PART-A returns immediately. PART-B executes in background with scheduled slot times. Frontend polls on its own schedule.

**No Reinvention**: Uses existing FIFO behavior, existing quota tracking, existing API calls. No new infrastructure—just organizing what already exists.

---

## State Diagram

```
Frontend                          PART-A Plumbing              PART-B genieService

Request
  ├──────────────────────────→    Validate
                                   Generate resultId
                                   Spawn async task ─────────→ Route to service
                                   Return immediately              Extract manifest
                                                              Compute ETA
                                   ↑───────────────────────  Update job status
                                   Return { resultId, eta }

                                   Job status: pending

Poll (every 2s)
  ├──────────────────────────→    Lookup job by resultId
                                   Read status: pending
                                   Return { status, eta }

                                                               [Waiting for slot 0]
Poll
  ├──────────────────────────→    Lookup job
                                   Read status: pending
                                   Return { status, eta }
                                                               [Execute call 0 - 12s]
                                                               Update status: executing
Poll
  ├──────────────────────────→    Lookup job
                                   Read status: executing
                                   Return { status, progress }

                                                               [Waiting for slot 1]
                                                               [Execute call 1 - 12s]
                                                               [Waiting for slot 2]
                                                               [Execute call 2 - 5s]
                                                               [Waiting for slot 3]
                                                               [Execute call 3 - 12s]
                                                               Compose result
                                                               Update status: complete
Poll
  ├──────────────────────────→    Lookup job
                                   Read status: complete
                                   Return { status, result }

Display ebook ←─────────────────────
```

---

## Summary

**PART-A (Dumb Plumbing)**:

- Receives HTTP request
- Returns immediately with resultId + ETA
- Spawns genieService task (async)
- Handles subsequent polling requests by reading job status

**PART-B (Smart Orchestration)**:

- Takes over after PART-A returns
- Routes to appropriate service (ebookService)
- Extracts manifest (totalRequests) from service
- Computes ETA via arithmetic
- Executes asynchronously with scheduled slot times
- Updates job status as execution progresses
- Composes final result and persists

**Result**: Frontend gets immediate response (no 50-second hang), knows accurate ETA, polls intelligently, receives complete result when ready.

---

## Reference Terms & Related Concepts

| Term                         | Defined In                                                      | Purpose                                     |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| **Service Machine**          | [SERVICE_MACHINE_PATTERN.md](SERVICE_MACHINE_PATTERN.md)        | Pattern for how services own business logic |
| **resourceKit**              | [SERVICE_MACHINE_PATTERN.md](SERVICE_MACHINE_PATTERN.md)        | Standard interface all services receive     |
| **FIFO Scheduling**          | [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md)    | How ETA is computed from manifest           |
| **Manifest (totalRequests)** | [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md)    | Complete call sequence sent by service      |
| **Slot Reservation**         | [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md)    | How quota is locked upfront                 |
| **Infrastructure Timeout**   | [CLIENT_SERVER_INTEGRATION.md](../CLIENT_SERVER_INTEGRATION.md) | 60-second limit problem this solves         |
| **Tier → Model Routing**     | [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md)           | expert → Pro, standard → Flash              |
| **Smart Polling**            | [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md)    | Frontend polling with accurate ETA          |
| **Dumb Plumbing**            | This document (PART-A)                                          | HTTP entry point with minimal logic         |
| **Smart Orchestration**      | This document (PART-B)                                          | genieService decision-making and scheduling |
