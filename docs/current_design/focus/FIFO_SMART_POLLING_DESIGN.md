# FIFO Smart Polling & Quota Management Design

**Status:** DRAFT for alignment review
**Date:** 2025-12-17 @ 5:50PM
**Branch:** feat/ebook-nat-cont
**See also:** [CONVERSATION_TRANSCRIPT.md](CONVERSATION_TRANSCRIPT.md) — design discussion and alignment notes

---

## Executive Summary

A system where ebookService declares **what** calls are needed in FIFO order (with no timing knowledge), and genieService computes **when** each will execute (based on rate limits, spacing, and quota), returning an accurate ETA immediately for smart frontend polling.

---

## PART-A: Dumb Plumbing

**Responsibility:** HTTP entry point, minimal state.

**Behavior:**

1. Frontend sends request (new or polling with resultId)
2. If no resultId provided: create UUID, store request, hand to genieService, return immediately
3. If resultId provided: check job status from store, return current result

**Return Contract:**

```json
{
  "resultId": "uuid-abc123",
  "eta": 41,
  "status": "pending|executing|complete",
  "result": {}
}
```

**Key:** Returns immediately. No computation, no waiting.

---

## PART-B: Smart Orchestration (genieService)

**Responsibility:** Compute ETA, schedule FIFO execution, enforce quota/rate limits.

**Workflow:**

1. **Receive manifest from ebookService:**

   ```javascript
   {
     callIndex: 0,
     tier: "expert",
     content: "...",
     totalRequests: [
       { tier: "expert", ... },
       { tier: "expert", ... },
       { tier: "flash", ... },
       { tier: "expert", ... }
     ]
   }
   ```

2. **Compute ETA (via time-registry module):**

   - Iterate through totalRequests in order (FIFO)
   - For each call, calculate earliest available slot based on:
     - Model spacing (Pro: 250ms, Flash: 100ms)
     - Global quota position (next available global slot for that model)
   - Sum all latencies + spacing = total ETA

3. **Return immediately:**

   ```javascript
   {
     resultId: "uuid-abc123",
     eta: 41,  // seconds
     position: 3  // in global queue (optional detail)
   }
   ```

4. **Execute asynchronously in background:**
   - For each call in totalRequests:
     - Wait until its computed slot time arrives
     - Make API call
     - Store result
     - Update job status
   - On final call completion: mark job complete

---

## ebookService: The "What" Provider

**Responsibility:** Define complete FIFO call sequence needed to build ebook.

**Does NOT know:**

- API latencies
- Rate limits
- Spacing requirements
- How long job will take
- Global quota state

**Does know:**

- Semantic structure: structure → opening → middles → closing
- Each call's tier (expert/flash) based on semantic importance
- Total number of calls needed

**On first request to genieService, sends:**

```javascript
{
  callIndex: 0,
  tier: "expert",
  content: "Generate structure for 3-page ebook...",
  totalRequests: [
    { tier: "expert", description: "Generate structure" },
    { tier: "expert", description: "Generate opening" },
    { tier: "flash", description: "Generate middle chapters (batched)" },
    { tier: "expert", description: "Generate closing" }
  ]
}
```

That's all. ebookService is **tier-agnostic** (doesn't say "Pro" or "Flash" model names).

---

## FIFO Scheduling & Quota Management

**Global Queue Model:**

- Single global FIFO queue for all Pro calls across all jobs/users
- 250ms minimum spacing enforced between consecutive Pro calls
- 100ms minimum spacing enforced between consecutive Flash calls
- Pro global quota: 2 RPM (enforced via slot reservation)

**ETA Computation Logic:**

```
For each call in FIFO order:
  if call.tier == "expert":
    slot_time = max(
      previous_call_end_time + 250ms,
      next_available_pro_slot
    )
  else if call.tier == "flash":
    slot_time = max(
      previous_call_end_time + 100ms,
      next_available_flash_slot
    )

  call_end_time = slot_time + api_latency
  update next_available_*_slot

total_eta = final_call_end_time
```

**Result:**

- No quota overruns (slots reserved upfront)
- No rapid-firing (spacing enforced)
- Deterministic and fair (FIFO order)
- Simple arithmetic (no complex scheduling logic)

---

## Time-Registry Module

**Responsibility:** Compute ETA and execution schedule from manifest.

**Input:**

```javascript
{
  totalRequests: [
    { tier: "expert", ... },
    { tier: "flash", ... },
    ...
  ],
  model_latencies: { expert: 12, flash: 5 },  // seconds (averages)
  spacing: { expert: 0.25, flash: 0.1 },      // seconds
  global_quota: { expert: 2, flash: 15 }      // calls per minute
}
```

**Output:**

```javascript
{
  totalEta: 41,
  schedule: [
    { tier: "expert", start: 0, end: 12 },
    { tier: "expert", start: 12.25, end: 24.25 },
    { tier: "flash", start: 24.35, end: 29.35 },
    { tier: "expert", start: 29.45, end: 41.45 }
  ]
}
```

**Key:** Pure deterministic arithmetic, no API calls.

---

## Frontend: Smart Polling

**Old Behavior (dumb plumbing):**

- Poll every 1-2 seconds indefinitely
- No idea when job will finish
- Wasted requests if polling too fast

**New Behavior (smart polling):**

- Receive ETA immediately: `eta: 41`
- Poll intelligently based on ETA:
  - Wait ~(eta - 5) seconds, then start polling every 2 seconds
  - Or: exponential backoff knowing the endpoint
- Fewer wasted polls, better UX

---

## Data Flow Diagram

```
Frontend
  ↓
  ├─ POST /generate (new request)
  │   ↓
  └─ [PART-A: Dumb Plumbing]
      ├─ Generate resultId
      ├─ Store request
      ├─ Hand to genieService
      │   ↓
      │   [PART-B: genieService.process()]
      │   ├─ Route to ebookService (if ebook request)
      │   │   ↓
      │   │   [ebookService generates manifest]
      │   │   ├─ Call 0: Structure (expert)
      │   │   ├─ Call 1: Opening (expert)
      │   │   ├─ Call 2: Middle (flash)
      │   │   └─ Call 3: Closing (expert)
      │   │       (returns totalRequests upfront)
      │   │
      │   ├─ time-registry.computeEta(manifest)
      │   │   ↓
      │   │   (arithmetic: 250ms + 250ms + 100ms + latencies = ~41s)
      │   │
      │   └─ Return { resultId, eta: 41 } to plumbing
      │
      └─ Return { resultId, eta: 41 } to Frontend
           (polling begins with eta guidance)

Meanwhile (async in background):
  genieService executes each call at its computed slot time
  Stores results incrementally
  Updates job status
```

---

## Request/Response Examples

### Initial Request

**Frontend → Backend:**

```json
{
  "type": "ebook",
  "pages": 3,
  "title": "My Story"
}
```

**Backend → Frontend (immediate):**

```json
{
  "resultId": "job-abc123",
  "eta": 41,
  "status": "pending"
}
```

### Polling Request

**Frontend → Backend:**

```json
{
  "resultId": "job-abc123"
}
```

**Backend → Frontend (while executing):**

```json
{
  "resultId": "job-abc123",
  "eta": 41,
  "status": "executing",
  "progress": {
    "completed": [
      { "callIndex": 0, "tier": "expert", "result": "..." },
      { "callIndex": 1, "tier": "expert", "result": "..." }
    ],
    "remaining": 2
  }
}
```

**Backend → Frontend (on completion):**

```json
{
  "resultId": "job-abc123",
  "eta": 41,
  "status": "complete",
  "result": {
    "ebook": "...",
    "chapters": [...]
  }
}
```

---

## Key Design Principles

1. **Separation of concerns:**

   - ebookService: **What** (semantic call sequence, tier routing)
   - genieService: **When** (timing, quota, scheduling)
   - Frontend: **How often** (smart polling based on eta)

2. **No reinvention:**

   - Use existing FIFO queue mechanism
   - Simple arithmetic for ETA (no complex logic)

3. **Deterministic & fair:**

   - FIFO order ensures fairness
   - Upfront reservation prevents overcommit
   - No quota surprises

4. **Fast response:**
   - eta computed in milliseconds
   - Frontend gets it immediately
   - Backend executes asynchronously

---

## Open Questions

1. **time-registry module location:** New file or part of quotaTracker?
2. **Global queue implementation:** Where does it currently live? API/interface?
3. **PART-A plumbing location:** Which file/router handles initial request?
4. **Job status storage:** Database schema or in-memory cache?

---

_End of draft._
