# Walk-Through: 3-Page Ebook Request (NAT-CONT_0)

**Scenario**: Frontend user submits a request for a 3-page ebook with proper inputs. The new architecture is fully implemented. This document traces exactly what happens.

---

## T=0ms: Frontend Submission

User clicks "Generate" in GenerateFlow.svelte with:

```json
{
  "prompt": "Write a 3-page ebook about sustainable gardening",
  "theme": "dark",
  "pageCount": 3
}
```

Frontend sends:

```javascript
POST /api/ebook/generate
Content-Type: application/json
{
  prompt: "Write a 3-page ebook about sustainable gardening",
  theme: "dark",
  pageCount: 3
}
```

---

## T≈50ms: PART-A - HTTP Handler (Dumb Plumbing)

`server/index.js` receives request:

```javascript
// 1. Validate input
// 2. Generate resultId (UUID)
resultId = "abc-123-def-456";

// 3. Store initial status
statusMap.set(resultId, {
  resultId: "abc-123-def-456",
  status: "queued",
  eta: null,
  message: "Job queued, waiting to start",
});

// 4. Return 202 IMMEDIATELY (< 100ms total)
res.status(202).json({
  resultId: "abc-123-def-456",
  status: "queued",
  message: "Your request is queued. Use this ID to check status.",
});

// 5. Hand off async (don't wait)
genieService
  .process({
    resultId,
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
```

**Frontend receives immediately**: `{ resultId: "abc-123-def-456", status: "queued" }`

---

## T≈60ms: Frontend Starts Polling

Frontend now knows resultId. It switches to polling mode:

```javascript
// Start polling every 500ms
pollStatus("abc-123-def-456");
GET / api / status / abc - 123 - def - 456;
// Response: { status: "in-progress", eta: 27, calls_completed: 0, calls_total: 4, ... }
```

**UI shows**: "Processing... ETA: 27 seconds | Progress: 0 of 4 calls"

Frontend is **no longer blocked**. User can navigate, refresh, close browser, come back later.

---

## T≈100ms: Backend - genieService.process() Starts

Asynchronously in backend:

```javascript
// 1. Create fresh Orchestrator with helpers
orchestrator = new Orchestrator("abc-123-def-456", {
  timingResolver,
  fifoScheduler,
  statusManager,
  progressTracker,
  toolSelector,
  errorReporter,
});

// 2. Route to ebookService
service = ebookService;

// 3. Assign task to smartPoller
// (Will be enriched with ETA after first call)
```

---

## T≈150ms: ebookService - First Call with Manifest

ebookService.handle() is called:

```javascript
// NAT-CONT_0 orchestration for 3 pages:
// Call sequence:
// 0: structure (expert)
// 1: opening (expert)
// 2: middle batch (standard) - 1 batch for 1 page of middle content
// 3: closing (expert)

// FIRST CALL: Include manifest
const structure = await orchestrator.generate(
  "Generate table of contents for: Write a 3-page ebook about sustainable gardening",
  {
    tier: "expert",
    callIndex: 0,
    manifest: {
      totalRequests: 4,
      sequence: [
        { callIndex: 0, tier: "expert" }, // structure
        { callIndex: 1, tier: "expert" }, // opening
        { callIndex: 2, tier: "standard" }, // middle batch
        { callIndex: 3, tier: "expert" }, // closing
      ],
    },
  }
);
```

---

## T≈200ms: Orchestrator - Manifest Received, Timing Calculated

Orchestrator.generate() receives manifest:

```javascript
// 1. Capture manifest
this.manifest = {
  totalRequests: 4,
  sequence: [
    { tier: "expert" },   // Pro model: 6s latency
    { tier: "expert" },   // Pro model: 6s latency
    { tier: "standard" }, // Flash model: 5s latency
    { tier: "expert" }    // Pro model: 6s latency
  ]
}

// 2. Helper: timingResolver.compute()
const timing = {
  totalEta: 27,  // ~27 seconds total
  schedule: [
    { callIndex: 0, reservedTime: 0ms, tier: "expert", duration: 6000ms },
    { callIndex: 1, reservedTime: 6250ms, tier: "expert", duration: 6000ms },     // 6s + 250ms Pro spacing
    { callIndex: 2, reservedTime: 12350ms, tier: "standard", duration: 5000ms },  // 6.25s + 6s + 100ms Flash spacing
    { callIndex: 3, reservedTime: 17450ms, tier: "expert", duration: 6000ms }     // 12.35s + 5s + 250ms Pro spacing
  ]
}

// 3. Helper: fifoScheduler.build()
const schedule = {
  calls: [
    { callIndex: 0, reservedTime: 0ms, tier: "expert" },
    { callIndex: 1, reservedTime: 6250ms, tier: "expert" },
    { callIndex: 2, reservedTime: 12350ms, tier: "standard" },
    { callIndex: 3, reservedTime: 17450ms, tier: "expert" }
  ],
  totalEta: 27
}

// 4. Helper: statusManager.init()
// Prepare to update status
statusInit = {
  eta: 27,
  totalCalls: 4,
  callsCompleted: 0,
  startedAt: Date.now()
}

// 5. Log for transparency
logger.info("Manifest captured: 4 calls, ETA 27s")
```

---

## T≈250ms: Frontend Polling Update #1

Frontend polls again:

```
GET /api/status/abc-123-def-456

Response (from smartPoller):
{
  status: "in-progress",
  eta: 27,
  calls_completed: 0,
  calls_total: 4,
  progress_percent: 0,
  estimated_remaining_seconds: 27,
  message: "Processing call 1 of 4"
}
```

**UI updates**: "Processing... ETA: 27 seconds | 0 of 4 calls | 0%"

---

## T≈800ms: Orchestrator - Call 0 (Structure) Executes

Back in orchestrator:

```javascript
// Schedule says Call 0 should start at 0ms → start immediately
const tool = this.selectTool("expert"); // → aiService
const model = this.tierToModel("expert"); // → "gemini-2.5-pro"

// Execute first call
const structure = await aiService.generate(
  "Generate table of contents for: Write a 3-page ebook about sustainable gardening",
  { tier: "expert", model: "gemini-2.5-pro" }
);

// ✅ Call 0 completed
// Update progress
this.callsCompleted = 1;
statusManager.updateProgress(resultId, {
  callsCompleted: 1,
  nextEstimatedCompletion: Date.now() + 21250, // Remaining time for calls 1, 2, 3
});
```

**Gemini Response** (~6 seconds):

```
"## Table of Contents

1. Introduction: Why Sustainable Gardening Matters
2. Soil Health: The Foundation
3. Water Wise: Conservation Techniques
4. Companion Planting Guide"
```

---

## T≈1500ms: Frontend Polling Update #2

```
GET /api/status/abc-123-def-456

Response:
{
  status: "in-progress",
  eta: 27,
  calls_completed: 1,
  calls_total: 4,
  progress_percent: 25,
  estimated_remaining_seconds: 20,
  message: "Processing call 2 of 4"
}
```

**UI updates**: "Processing... ETA: 27 seconds | 1 of 4 calls | 25%"

---

## T≈6250ms: Orchestrator - Call 1 (Opening) Executes

```javascript
// Schedule says Call 1 should start at 6250ms
// Current time: ~6800ms → within range

const opening = await orchestrator.generate(
  "Write opening chapter for: Write a 3-page ebook about sustainable gardening\n\nTOC:\n[structure from call 0]",
  { tier: "expert", callIndex: 1 }
);

// ✅ Call 1 completed at ~12800ms
// Update progress
this.callsCompleted = 2;
statusManager.updateProgress(resultId, {
  callsCompleted: 2,
  nextEstimatedCompletion: Date.now() + 4850, // Remaining time for calls 2, 3
});
```

**Gemini Response** (~6 seconds):

```
"# Chapter 1: Introduction - Why Sustainable Gardening Matters

Sustainable gardening is more than just a trend...
[content continues]"
```

---

## T≈2000ms, 3000ms: Frontend Polling Updates #3, #4

Each poll shows:

```
{
  status: "in-progress",
  eta: 27,
  calls_completed: 2,
  calls_total: 4,
  progress_percent: 50,
  estimated_remaining_seconds: 12,
  message: "Processing call 3 of 4"
}
```

**UI updates**: "Processing... ETA: 27 seconds | 2 of 4 calls | 50%"

---

## T≈12350ms: Orchestrator - Call 2 (Middle Batch) Executes

```javascript
// Schedule says Call 2 should start at 12350ms
// Current time: ~13100ms → within acceptable range

const middleContent = await orchestrator.generate(
  "Write the middle chapter for: Write a 3-page ebook about sustainable gardening\n\nTOC:\n[structure]\n\nContext: [opening]",
  { tier: "standard", callIndex: 2 }
);

// ✅ Call 2 completed at ~18100ms
// Update progress
this.callsCompleted = 3;
statusManager.updateProgress(resultId, {
  callsCompleted: 3,
  nextEstimatedCompletion: Date.now() + 6000, // Remaining time for final closing call
});
```

**Gemini Response** (~5 seconds):

```
"# Chapter 2: Soil Health - The Foundation

Your garden's success starts underground...
[content continues]"
```

---

## T≈4000ms, 5000ms: Frontend Polling Updates #5, #6

Each poll shows:

```
{
  status: "in-progress",
  eta: 27,
  calls_completed: 3,
  calls_total: 4,
  progress_percent: 75,
  estimated_remaining_seconds: 6,
  message: "Processing call 4 of 4"
}
```

**UI updates**: "Processing... ETA: 27 seconds | 3 of 4 calls | 75%"

---

## T≈17450ms: Orchestrator - Call 3 (Closing) Executes

```javascript
// Schedule says Call 3 should start at 17450ms
// Current time: ~18200ms → within range

const closing = await orchestrator.generate(
  "Write the closing chapter for: Write a 3-page ebook about sustainable gardening\n\nTOC:\n[structure]\n\nContext: [opening + middle]",
  { tier: "expert", callIndex: 3 }
);

// ✅ Call 3 completed at ~24200ms
// Update progress
this.callsCompleted = 4;
statusManager.updateProgress(resultId, {
  callsCompleted: 4,
  nextEstimatedCompletion: Date.now(),
});
```

**Gemini Response** (~6 seconds):

```
"# Chapter 3: Conclusion - Your Journey to Sustainable Gardening

As we've explored throughout this ebook...
[content continues]"
```

---

## T≈24000ms: ebookService - Composition Complete

```javascript
// All 4 calls done!
// Now compose HTML

const html = this.composeHTML({
  structure: [structure from call 0],
  opening: [opening from call 1],
  middleContent: [middleContent from call 2],
  closing: [closing from call 3],
  theme: "dark"
})

// Return result
return {
  type: "ebook",
  pages: [structure, opening, middleContent, closing],
  html: "<html>...</html>",
  metadata: {
    cost: 4,
    theme: "dark",
    pageCount: 3,
    model: "gemini-2.5"
  }
}
```

---

## T≈24100ms: genieService - Mark Complete

```javascript
// ebookService.handle() returned successfully

// 1. Mark complete in smartPoller
smartPoller.markComplete(resultId, result);

// 2. Persist result
await persistence.save(resultId, result);

// 3. Return from async handler
// (Nothing returned to original request; client will poll to get result)
```

---

## T≈24500ms: Frontend Polling Update - COMPLETE

Frontend continues polling:

```
GET /api/status/abc-123-def-456

Response:
{
  status: "complete",
  calls_completed: 4,
  calls_total: 4,
  progress_percent: 100,
  result: {
    type: "ebook",
    pages: [...],
    html: "<html>...</html>",
    metadata: {...}
  }
}
```

**UI shows**: "✅ Complete! 4 of 4 calls | 100%"

Frontend now:

- Displays the generated ebook
- Offers download button
- Shows generation metadata (took ~24 seconds, 4 API calls)

---

## Timeline Summary

```
T=0ms       ✅ Frontend POST /api/ebook/generate
T=50ms      ✅ HTTP returns 202 + resultId
T=60ms      ✅ Frontend starts polling
T=100ms     ✅ Backend starts async job
T=150ms     ✅ ebookService calls orchestrator with manifest
T=200ms     ✅ Orchestrator calculates timing (ETA: 27s)
T=250ms     ✅ Frontend polls, gets ETA + progress
T=800ms     ✅ Call 0 (structure) → Gemini (6s)
T=1500ms    ✅ Frontend polls, sees 1 of 4
T=6250ms    ✅ Call 1 (opening) → Gemini (6s)
T=12350ms   ✅ Call 2 (middle batch) → Gemini (5s)
T=4000ms    ✅ Frontend polls, sees 3 of 4
T=17450ms   ✅ Call 3 (closing) → Gemini (6s)
T=24000ms   ✅ Composition complete
T=24100ms   ✅ Mark complete in smartPoller
T=24500ms   ✅ Frontend polls, gets COMPLETE + result
T=24600ms   ✅ User sees ebook

Total: 24.6 seconds (vs. current 55-65 second timeout failure)
```

---

## Key Observations

1. **No Timeout**: Request was ~24 seconds total. User never had to wait for the full 60-second infrastructure limit. Client never blocked.

2. **Rate-Limit Compliance**:

   - Call 0 (expert): immediate
   - Call 1 (expert): 6250ms later (exceeds 250ms Pro requirement) ✅
   - Call 2 (standard): 12350ms later (exceeds 100ms Flash requirement) ✅
   - Call 3 (expert): 17450ms later (exceeds 250ms Pro requirement) ✅
   - **Zero rapid-fire violations**

3. **Complete NAT-CONT_0 Pattern**:

   - Structure (expert) → Opening (expert) → Middle Batch (standard) → Closing (expert)
   - Total 4 calls for 3-page ebook

4. **Transparency**: User saw progress in real-time (0 → 25% → 50% → 75% → 100%) with accurate ETA.

5. **Async Execution**: Frontend never blocked. User could navigate, refresh, close browser.

6. **Service Isolation**: ebookService only knew about orchestrator interface. Didn't import aiService, quotaTracker, etc.

7. **Reusability**: wallArtService would follow identical pattern, just different manifest and business logic.

---

**Document Status**: Walk-Through Complete (NAT-CONT_0 Corrected)  
**Date**: December 19, 2025
