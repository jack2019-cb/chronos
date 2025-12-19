# Walk-Through: 3-Page Ebook Request

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
// Response: { status: "in-progress", eta: 22, calls_completed: 0, calls_total: 3, ... }
```

**UI shows**: "Processing... ETA: 22 seconds | Progress: 0 of 3 calls"

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
// ebookService knows: 3 pages → need 1 + ceil(3/2) = 2 calls
// Call sequence:
// 0: structure (expert)
// 1: opening (expert)
// 2: chapter 1 (standard)

// FIRST CALL: Include manifest
const structure = await orchestrator.generate(
  "Generate table of contents for: Write a 3-page ebook about sustainable gardening",
  {
    tier: "expert",
    callIndex: 0,
    manifest: {
      totalRequests: 3,
      sequence: [
        { callIndex: 0, tier: "expert" }, // structure
        { callIndex: 1, tier: "expert" }, // opening
        { callIndex: 2, tier: "standard" }, // chapters
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
  totalRequests: 3,
  sequence: [
    { tier: "expert" },   // Pro model: 6s latency
    { tier: "expert" },   // Pro model: 6s latency
    { tier: "standard" }  // Flash model: 5s latency
  ]
}

// 2. Helper: timingResolver.compute()
const timing = {
  totalEta: 23,  // ~23 seconds total
  schedule: [
    { callIndex: 0, reservedTime: 0ms, tier: "expert", duration: 6000ms },
    { callIndex: 1, reservedTime: 6250ms, tier: "expert", duration: 6000ms }, // 6s + 250ms Pro spacing
    { callIndex: 2, reservedTime: 12350ms, tier: "standard", duration: 5000ms } // 6.25s + 6s + 100ms Flash spacing
  ]
}

// 3. Helper: fifoScheduler.build()
const schedule = {
  calls: [
    { callIndex: 0, reservedTime: 0ms, tier: "expert" },
    { callIndex: 1, reservedTime: 6250ms, tier: "expert" },
    { callIndex: 2, reservedTime: 12350ms, tier: "standard" }
  ],
  totalEta: 23
}

// 4. Helper: statusManager.init()
// Prepare to update status
statusInit = {
  eta: 23,
  totalCalls: 3,
  callsCompleted: 0,
  startedAt: Date.now()
}

// 5. Log for transparency
logger.info("Manifest captured: 3 calls, ETA 23s")
```

---

## T≈250ms: Frontend Polling Update #1

Frontend polls again:

```
GET /api/status/abc-123-def-456

Response (from smartPoller):
{
  status: "in-progress",
  eta: 23,
  calls_completed: 0,
  calls_total: 3,
  progress_percent: 0,
  estimated_remaining_seconds: 23,
  message: "Processing call 1 of 3"
}
```

**UI updates**: "Processing... ETA: 23 seconds | 0 of 3 calls | 0%"

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
  nextEstimatedCompletion: Date.now() + 17250, // Remaining time for calls 1 & 2
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
  eta: 23,
  calls_completed: 1,
  calls_total: 3,
  progress_percent: 33,
  estimated_remaining_seconds: 17,
  message: "Processing call 2 of 3"
}
```

**UI updates**: "Processing... ETA: 23 seconds | 1 of 3 calls | 33%"

---

## T≈6250ms: Orchestrator - Call 1 (Opening) Executes

```javascript
// Schedule says Call 1 should start at 6250ms
// Current time: ~6800ms → wait until 6250ms reserved slot
// Actually: currentTime > reservedTime, so execute immediately

const opening = await orchestrator.generate(
  "Write opening chapter for: Write a 3-page ebook about sustainable gardening\n\nTOC:\n[structure from call 0]",
  { tier: "expert", callIndex: 1 }
);

// ✅ Call 1 completed at ~12800ms
// Update progress
this.callsCompleted = 2;
statusManager.updateProgress(resultId, {
  callsCompleted: 2,
  nextEstimatedCompletion: Date.now() + 5000, // Final call timing
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
  eta: 23,
  calls_completed: 2,
  calls_total: 3,
  progress_percent: 67,
  estimated_remaining_seconds: 5,
  message: "Processing call 3 of 3"
}
```

**UI updates**: "Processing... ETA: 23 seconds | 2 of 3 calls | 67%"

---

## T≈12350ms: Orchestrator - Call 2 (Chapters) Executes

```javascript
// Schedule says Call 2 should start at 12350ms
// Current time: ~12900ms → within acceptable range
// (Flash model uses 100ms spacing, so slightly flexible)

const chapters = await orchestrator.generate(
  "Write chapter 1 for: Write a 3-page ebook about sustainable gardening",
  { tier: "standard", callIndex: 2 }
);

// ✅ Call 2 completed at ~17900ms
// Update progress
this.callsCompleted = 3;
statusManager.updateProgress(resultId, {
  callsCompleted: 3,
  nextEstimatedCompletion: Date.now(),
});
```

**Gemini Response** (~5 seconds):

```
"# Chapter 2: Soil Health - The Foundation

Your garden's success starts underground...
[content continues]"
```

---

## T≈18000ms: ebookService - Composition Complete

```javascript
// All 3 calls done!
// Now compose HTML

const html = this.composeHTML({
  structure: [structure from call 0],
  opening: [opening from call 1],
  chapters: [chapters from call 2],
  theme: "dark"
})

// Return result
return {
  type: "ebook",
  pages: [structure, opening, chapters],
  html: "<html>...</html>",
  metadata: {
    cost: 3,
    theme: "dark",
    pageCount: 3,
    model: "gemini-2.5"
  }
}
```

---

## T≈18100ms: genieService - Mark Complete

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

## T≈18500ms: Frontend Polling Update - COMPLETE

Frontend continues polling:

```
GET /api/status/abc-123-def-456

Response:
{
  status: "complete",
  calls_completed: 3,
  calls_total: 3,
  progress_percent: 100,
  result: {
    type: "ebook",
    pages: [...],
    html: "<html>...</html>",
    metadata: {...}
  }
}
```

**UI shows**: "✅ Complete! 3 of 3 calls | 100%"

Frontend now:

- Displays the generated ebook
- Offers download button
- Shows generation metadata (took ~18 seconds, 3 API calls)

---

## Timeline Summary

```
T=0ms       ✅ Frontend POST /api/ebook/generate
T=50ms      ✅ HTTP returns 202 + resultId
T=60ms      ✅ Frontend starts polling
T=100ms     ✅ Backend starts async job
T=150ms     ✅ ebookService calls orchestrator with manifest
T=200ms     ✅ Orchestrator calculates timing (ETA: 23s)
T=250ms     ✅ Frontend polls, gets ETA + progress
T=800ms     ✅ Call 0 (structure) → Gemini (6s)
T=1500ms    ✅ Frontend polls, sees 1 of 3
T=6250ms    ✅ Call 1 (opening) → Gemini (6s)
T=12350ms   ✅ Call 2 (chapters) → Gemini (5s)
T=18000ms   ✅ Composition complete
T=18100ms   ✅ Mark complete in smartPoller
T=18500ms   ✅ Frontend polls, gets COMPLETE + result
T=18600ms   ✅ User sees ebook

Total: 18.6 seconds (vs. current 55-65 second timeout failure)
```

---

## Key Observations

1. **No Timeout**: Request was ~18 seconds total. User never had to wait for the full 60-second infrastructure limit. Client never blocked.

2. **Rate-Limit Compliance**:

   - Call 0 (expert): immediate
   - Call 1 (expert): 6250ms later (exceeds 250ms Pro requirement) ✅
   - Call 2 (standard): 12350ms later (exceeds 100ms Flash requirement) ✅
   - **Zero rapid-fire violations**

3. **Transparency**: User saw progress in real-time (0 → 33% → 67% → 100%) with accurate ETA.

4. **Async Execution**: Frontend never blocked. User could navigate, refresh, close browser.

5. **Service Isolation**: ebookService only knew about orchestrator interface. Didn't import aiService, quotaTracker, etc.

6. **Reusability**: wallArtService would follow identical pattern, just different manifest and business logic.

---

**Document Status**: Walk-Through Complete  
**Date**: December 19, 2025
