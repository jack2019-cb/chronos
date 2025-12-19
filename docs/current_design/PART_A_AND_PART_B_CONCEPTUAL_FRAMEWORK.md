# PART-A & PART-B: Conceptual Architecture Framework
 
**Date**: December 18, 2025  @ 5:10PM
**Branch**: `feat/ebook-nat-cont`  

**Status**: DRAFT (Base Document for Future Refinements) 
**Purpose**: Establish conceptual foundation for async execution + smart polling architecture  
**Related Documents**:

- [CONVERSATION_TRANSCRIPT.md](CONVERSATION_TRANSCRIPT.md) - Development journey to this design
- [FIFO_SMART_POLLING_DESIGN.md](FIFO_SMART_POLLING_DESIGN.md) - Technical implementation details (pending)
- [SERVICE_MACHINE_PATTERN.md](../SERVICE_MACHINE_PATTERN.md) - Service autonomy model
- [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md) - Current orchestration layer

---

## Executive Summary

The 60-second infrastructure timeout and quota/rapid-fire issues require **two complementary architectural components**:

- **PART-A (Dumb Plumbing)**: Breaks synchronous coupling; enables async execution
- **PART-B (Smart Orchestration)**: Manages scheduling, quotas, and rate-limiting

Together, they solve three critical problems:

1. ✅ **Infrastructure timeout** (currently: "Failed to fetch" after 60s)
2. ✅ **Rapid-fire prevention** (currently: 429 Too Many Requests errors)
3. ✅ **Quota exhaustion** (currently: unpredictable request failures)

---

## PART-A: Dumb Plumbing (index.js → resultId)

### Conceptual Role

The entry point (HTTP handler in index.js) performs **one responsibility only**: accept a request, generate a unique identifier (resultId), return it immediately, and asynchronously hand the job to genieService.

**"Dumb"** means: No intelligence about job content, duration, complexity, or execution strategy. Just mechanical hand-off.

### Goals

1. **Break Synchronous Coupling**

   - Currently: Frontend sends request → waits 50+ seconds → infrastructure kills connection
   - Solution: Frontend sends request → gets resultId immediately → polls for status
   - **Result**: No more "blocked waiting for response"

2. **Immediate Acknowledgment**

   - Client gets proof of acceptance (resultId)
   - Psychological benefit: "The backend heard me"
   - Foundation for polling

3. **Async Hand-Off**

   - Request accepted, job queued to genieService
   - No waiting for genieService completion
   - PART-A completes in <100ms; genieService continues in background

4. **Enable Polling Interface**
   - resultId becomes the handle for: "What's the status of my job?"
   - Frontend can poll: `GET /status/:resultId`
   - Backend can update: `PUT /status/:resultId` with progress

### Problems Solved

| Problem                          | Current State                                 | PART-A Solution                            |
| -------------------------------- | --------------------------------------------- | ------------------------------------------ |
| **Client blocks on 60s timeout** | Request hangs, connection drops at 60s        | Request returns immediately with resultId  |
| **"Failed to fetch" errors**     | Response arrives after infrastructure timeout | Client already moved to polling by then    |
| **No status visibility**         | Client has no way to know progress            | Client polls /status/:resultId for updates |
| **No recovery path**             | Failed request must be restarted manually     | Client can retry with same resultId        |

### What PART-A Enables

✅ Smart polling becomes possible (client has ID to poll)  
✅ genieService can take over asynchronously (PART-B)  
✅ Frontend UX improves (shows "Generating..." with polling)  
✅ Infrastructure timeout avoided (client isn't blocked)  
✅ Server-side scheduling becomes transparent (genieService manages it)

### Implementation Pattern

```javascript
// POST /api/ebook/generate
app.post("/api/ebook/generate", async (req, res) => {
  const { prompt, theme, pageCount } = req.body;

  // PART-A: Immediate response
  const resultId = generateUUID();
  const initialStatus = { resultId, status: "queued", eta: null };

  // Store initial state
  statusMap.set(resultId, initialStatus);

  // Return immediately
  res.status(202).json({ resultId, status: "queued" });

  // Hand off asynchronously (PART-B takes over)
  genieService
    .process({
      resultId,
      mode: "ebook",
      prompt,
      theme,
      pageCount,
    })
    .catch((err) => {
      statusMap.set(resultId, {
        ...initialStatus,
        status: "error",
        error: err,
      });
    });
});
```

---

## PART-B: Smart Orchestration (genieService → Scheduling & ETA)

### Conceptual Role

The orchestration layer (genieService + utilities) performs **strategic job management**: receive upfront information about the job scope, compute execution time, schedule all calls within quota limits, and execute with controlled pacing.

**"Smart"** means: Understanding the job, computing consequences, and controlling execution.

### Goals

1. **Understand Job Scope Upfront**

   - Service (ebookService) sends: "I need 4 calls total" (manifest)
   - genieService receives: Structure → Opening → Middle chapters → Closing
   - **Result**: No surprises; predictable resource requirements

2. **Compute Execution Time**

   - time-registry translates manifest to ETA
   - Example: 4 calls (2 Pro @ 6s each, 2 Flash @ 5s each) ≈ 42 seconds total
   - **Result**: Frontend knows accurate wait time upfront

3. **Schedule Within Quota Limits**

   - Pro: 2 RPM (250ms minimum spacing)
   - Flash: 15 RPM (100ms minimum spacing)
   - FIFO queue reserves time slots for each call
   - **Result**: No quota violations

4. **Enforce Rate-Limiting**

   - Space calls according to model quotas
   - Pro calls: 250ms apart (natural FIFO + spacing)
   - Flash calls: 100ms apart (natural FIFO + spacing)
   - **Result**: No rapid-fire 429 errors

5. **Execute with Control**
   - Run calls in FIFO order
   - Wait for spacing before next call
   - Track progress and update status
   - **Result**: Predictable, controlled execution

### Problems Solved

| Problem                            | Current State                               | PART-B Solution                               |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------- |
| **Rapid-fire model requests**      | Calls fire as fast as possible → 429 errors | FIFO queue + spacing enforced                 |
| **Unpredictable quota exhaustion** | Requests fail when quota runs out           | Upfront scheduling ensures quota availability |
| **Dumb polling**                   | Frontend polls blindly ("Is it done yet?")  | PART-B provides accurate ETA                  |
| **Backend chaos**                  | Services reinvent quota/scheduling logic    | PART-B handles it; services stay simple       |
| **Infrastructure timeout**         | 50s generation + 10s transmission → timeout | Controlled pacing keeps within time budget    |

### What PART-B Enables

✅ Quota prevention (scheduling respects limits)  
✅ Rapid-fire prevention (spacing enforced)  
✅ Infrastructure timeout prevention (paced execution)  
✅ Predictable UX (accurate ETA for frontend)  
✅ Service simplicity (no reinvention needed)  
✅ Platform scalability (same pattern for all services)

### Implementation Pattern

```javascript
// genieService.process(payload) - PART-B core
async process({ resultId, mode, ...payload }) {
  try {
    // 1. Receive service + manifest
    let service;
    if (mode === "ebook") {
      service = ebookService;
    }

    // 2. Kick off service (which will send manifest on first call)
    const resourceKit = { aiService, quotaTracker, logger, config };
    const jobPromise = service.handle(payload, resourceKit);

    // 3. Service sends manifest on first call via aiService.generate()
    // genieService intercepts (via orchestratorProxy)

    // 4. When manifest received:
    const manifest = await getManifestFromFirstCall(); // { totalRequests: 4, ... }
    const eta = timeRegistry.compute(manifest);  // → 42 seconds

    // 5. Update status with ETA
    statusMap.set(resultId, {
      status: "in-progress",
      eta,
      scheduledStart: Date.now(),
      calls_completed: 0,
      calls_total: manifest.totalRequests
    });

    // 6. Build FIFO schedule with spacing
    const schedule = buildFIFOSchedule(manifest);  // Reserves time slots

    // 7. Execute calls in order with spacing
    for (const call of schedule.calls) {
      await waitUntil(call.reservedTime);
      const result = await call.execute();

      // Update progress
      statusMap.update(resultId, {
        calls_completed: calls_completed + 1
      });
    }

    // 8. Finalize
    const result = await jobPromise;
    statusMap.set(resultId, {
      status: "complete",
      result,
      completed_at: Date.now()
    });

  } catch (err) {
    statusMap.set(resultId, {
      status: "error",
      error: err.message
    });
  }
}
```

---

## How PART-A & PART-B Work Together

### Request Lifecycle

```
FRONTEND REQUEST
    │
    ├─ POST /api/ebook/generate { prompt, theme, pageCount }
    │
    ▼
PART-A (index.js) ─────────────────────────────────
    │
    ├─ Accept request
    ├─ Generate resultId (UUID)
    ├─ Initialize status: { resultId, status: "queued", eta: null }
    ├─ Return 202 Accepted: { resultId }
    │
    └─ Hand to genieService ASYNCHRONOUSLY ─────────▶
                                                     │
                                        PART-B (genieService) ────────
                                                     │
                                                     ├─ Receive { resultId, mode, payload }
                                                     │
                                                     ├─ Route to service: ebookService.handle()
                                                     │
                                                     ├─ Service returns manifest on first call
                                                     │   { totalRequests: 4, ... }
                                                     │
                                                     ├─ Compute ETA: time-registry.compute(manifest)
                                                     │   → 42 seconds
                                                     │
                                                     ├─ Update status: { eta: 42, status: "in-progress" }
                                                     │
                                                     ├─ Build FIFO schedule with spacing
                                                     │
                                                     ├─ Execute calls:
                                                     │   Call 0 (Pro): T+0s → T+6s
                                                     │   Wait: 250ms spacing
                                                     │   Call 1 (Flash): T+6.25s → T+11.25s
                                                     │   Wait: 100ms spacing
                                                     │   Call 2 (Flash): T+11.35s → T+16.35s
                                                     │   Wait: 100ms spacing
                                                     │   Call 3 (Pro): T+16.45s → T+22.45s
                                                     │
                                                     ├─ Update status after each call
                                                     │
                                                     └─ Finalize: { status: "complete", result }

    ▼
FRONTEND SMART POLLING
    │
    ├─ GET /status/:resultId
    │   ↓ Response: { status: "in-progress", eta: 42, calls_completed: 2, calls_total: 4 }
    │
    ├─ Show UI: "Generating... 2 of 4 calls complete (est. 30s remaining)"
    │
    ├─ Poll again after 5s
    │   ↓ Response: { status: "in-progress", eta: 42, calls_completed: 3, calls_total: 4 }
    │
    ├─ Poll again after 10s
    │   ↓ Response: { status: "complete", result: { html, pages, metadata } }
    │
    └─ Display ebook to user
```

### Timeline Example: 3-Page Ebook

```
T+0.00s   Frontend: POST /api/ebook/generate
T+0.05s   PART-A: Returns { resultId: "abc-123", status: "queued" }
T+0.10s   Frontend: Shows "Generating... (retrieving info)"
T+0.10s   PART-B: Receives job, starts ebookService

T+0.15s   ebookService: First call (structure, Pro, callIndex=0)
T+0.15s   PART-B: Intercepts, computes manifest: { totalRequests: 4, ... }
T+0.15s   PART-B: Computes ETA via time-registry: 42 seconds
T+0.16s   PART-B: Updates status: { eta: 42, status: "in-progress" }

T+0.20s   Frontend: Polls /status/abc-123
T+0.20s   Response: { eta: 42, calls_completed: 0, calls_total: 4 }
T+0.21s   Frontend: Shows "Generating... (est. 42 seconds)"

T+6.20s   PART-B: Structure call completes
T+6.20s   PART-B: Updates status: { calls_completed: 1 }

T+6.45s   PART-B: Pro spacing: 250ms → wait until T+6.45s

T+6.45s   ebookService: Second call (opening, Pro, callIndex=1)
T+6.45s   PART-B: Executes (model already selected as Pro)

T+12.50s  PART-B: Opening call completes
T+12.50s  PART-B: Updates status: { calls_completed: 2 }

T+12.65s  PART-B: Flash spacing: 100ms → wait until T+12.65s

T+12.65s  ebookService: Third call (middle chapters, Flash, callIndex=2)
T+12.65s  PART-B: Executes (model selected as Flash)

T+17.70s  PART-B: Middle chapters complete
T+17.70s  PART-B: Updates status: { calls_completed: 3 }

T+17.80s  PART-B: Flash spacing: 100ms → wait until T+17.80s

T+17.80s  ebookService: Fourth call (closing, Pro, callIndex=3)
T+17.80s  PART-B: Executes (model selected as Pro)

T+23.90s  PART-B: Closing call completes
T+23.90s  PART-B: Composes HTML, finalizes result

T+24.00s  PART-B: Updates status: { status: "complete", result: {...} }

T+24.10s  Frontend: Polls /status/abc-123
T+24.10s  Response: { status: "complete", result: {...} }
T+24.15s  Frontend: Displays ebook to user

TOTAL TIME: 24 seconds (well within 60s infrastructure limit)
NO RAPID-FIRE: Spacing enforced between calls
NO QUOTA EXHAUSTION: All Pro calls honored (2 RPM limit)
```

---

## Core Design Principles

### 1. Separation of Concerns

| Layer                                       | Responsibility                       | Does NOT Handle                          |
| ------------------------------------------- | ------------------------------------ | ---------------------------------------- |
| **PART-A (Plumbing)**                       | Async acceptance + resultId          | Job scheduling, timing, quotas           |
| **PART-B (Orchestration)**                  | Scheduling, quotas, ETA, execution   | HTTP responses, client concerns          |
| **Services** (ebookService)                 | Business logic, manifest declaration | Scheduling, model selection, persistence |
| **Utilities** (time-registry, quotaTracker) | Specific concerns (timing, quota)    | Job execution, HTTP, services            |

### 2. Manifest-Driven Planning

Services declare upfront: "I will make N calls in this order with these tiers"

This enables PART-B to:

- Compute ETA before execution starts
- Reserve quota upfront
- Schedule all calls in advance
- No surprises mid-execution

### 3. FIFO + Spacing = Rate-Limiting

Instead of complex state machines:

- **FIFO**: Services already produce calls in order (semantic necessity)
- **Spacing**: Enforce delays between calls (250ms Pro, 100ms Flash)
- **Result**: Quota respected, no rapid-fire, no complex logic

### 4. Frontend Visibility

PART-B provides continuous status updates:

- `eta`: How long until completion?
- `calls_completed`: How many done?
- `calls_total`: How many total?
- `status`: "queued" → "in-progress" → "complete" | "error"

Frontend can show accurate progress, not guessing.

### 5. No Reinvention

Services don't:

- Compute timing
- Manage quota
- Handle spacing
- Decide retry strategy
- Manage persistence

All handled by PART-B infrastructure; services focus on business logic.

---

## Why This Design Solves the Problems

### Problem 1: Infrastructure Timeout (60s)

**Current**: Backend takes 50s + transmission takes 10s → 60s limit hit
**Solution**: PART-A breaks sync waiting (client doesn't block); PART-B controls pacing (keeps execution < 50s)
**Result**: Total time: ~24s (example) well within limit

### Problem 2: Rapid-Fire (429 errors)

**Current**: Calls fire as fast as aiService.generate() can execute
**Solution**: PART-B enforces spacing (250ms Pro, 100ms Flash) via FIFO queue
**Result**: No bursts; respects model rate limits

### Problem 3: Quota Exhaustion

**Current**: Requests fail unpredictably when quota runs out
**Solution**: PART-B schedules upfront (knows manifest); respects Pro 2 RPM limit
**Result**: All requests succeed within quota (or gracefully deferred)

---

## Future Reference Points

This document establishes the **conceptual foundation**. Future documents will detail:

1. **Manifest Schema** — Exact structure services send
2. **Time Registry** — Duration calculation for each call type
3. **FIFO Schedule** — How scheduling enforces spacing
4. **Status API** — `/status/:resultId` response contract
5. **Error Handling** — What happens when calls fail
6. **Service Integration** — How ebookService/wallArtService/calendarService integrate

---

## Document Status

**Status**: DRAFT  
**Last Updated**: December 18, 2025  
**Next Review**: After FIFO_SMART_POLLING_DESIGN.md technical details are finalized  
**Iteration**: This is the conceptual base; refinements expected as implementation proceeds

---
