# HTTP Integration Plan: Phase 2 Services & Status Endpoint

**Date**: December 28, 2025 @ 5:00PM
**Branch**: `SERVICE-AUTON-reset`

**Related**: SERVICE_AUTON_RESET_PROGRESS.md (completion report)  
**Scope**: Connect Phase 2 services to HTTP, integrate orchestrator output with status endpoint
**Status**: Design Phase

---

## Executive Summary

Phase 2 implementation is complete (3 services created, all tests passing at unit level), but **HTTP integration is missing**:

1. ❌ WallArtService has no HTTP endpoint → tests get 404 instead of 202
2. ❌ CalendarService has no HTTP endpoint → tests get 404 instead of 202
3. ❌ Status endpoint returns `{}` instead of manifest fields (eta, calls_total)
4. ❌ orchestrator output not wired to status endpoint response
5. ❌ smartPoller not enriched with orchestrator ETA data

**This plan addresses all 5 gaps.**

---

## Problem Analysis

### Issue 1: Missing HTTP Endpoints

**Current State**:

- `/api/ebook/generate` exists (wired to genieService + ebookService)
- `/api/wall-art/generate` does NOT exist
- `/api/calendar/generate` does NOT exist

**Test Expectation**:

```javascript
const res = await request(app)
  .post("/api/wall-art/generate") // ← 404 Not Found
  .send({ prompt: "...", style: "minimalist", dimensions: "3x4" });

expect(res.status).toBe(202); // Expected 202, got 404
```

**Root Cause**: Services exist in code but aren't registered in Express router.

---

### Issue 2: Status Endpoint Returns Empty Object

**Current State**:

```javascript
GET /api/status/:resultId
→ Returns: {}
```

**Expected State**:

```javascript
GET /api/status/:resultId
→ Returns: {
  status: "in-progress",
  eta: 23,
  calls_total: 4,
  calls_completed: 1,
  progress_percent: 25,
  message: "Processing call 2 of 4"
}
```

**Root Cause**:

- Status endpoint not integrated with orchestrator
- smartPoller not receiving ETA + manifest info
- orchestrator output not flowing to status response

---

### Issue 3: Missing Result Property on Completion

**Current State**:

```javascript
// When complete, status returns:
{
  status: "complete";
  // Missing: result
}
```

**Expected State**:

```javascript
{
  status: "complete",
  result: { /* ebook/art/calendar data */ }
}
```

**Root Cause**: Service result not stored in status map.

---

### Issue 4: ETA Type Is Object, Not Number

**Test Error**:

```
TypeError: actual value must be number or bigint, received "object"
expect(status.eta).toBeGreaterThan(0)  // eta is {}
```

**Root Cause**: ETA not extracted from orchestrator, or incorrectly serialized.

---

### Issue 5: Rate Limiting Hits Too Early

**Test Error**:

```
expect(res.status).toBe(202)  // Got 429 (Too Many Requests)
```

**Root Cause**: Concurrent requests hitting global rate limit (100 req / 15 min) or orchestrator spacing not properly implemented.

---

## Solution Design

### Solution 1: Wire Phase 2 Services to HTTP Endpoints

**File**: `server/index.js` (Express router)

**Pattern** (identical to ebookService):

```javascript
// Existing pattern (works):
app.post("/api/ebook/generate", async (req, res) => {
  const { prompt, theme, pageCount } = req.body;

  // PART-A: Generate resultId, return 202 immediately
  const resultId = generateUUID();
  res.status(202).json({ resultId });

  // Hand off async to genieService
  genieService
    .process({
      resultId,
      mode: "ebook",
      prompt,
      theme,
      pageCount,
    })
    .catch((err) => logger.error(err));
});

// NEW endpoints (same pattern):
app.post("/api/wall-art/generate", async (req, res) => {
  const { prompt, style, dimensions } = req.body;

  const resultId = generateUUID();
  res.status(202).json({ resultId });

  genieService
    .process({
      resultId,
      mode: "wall-art",
      prompt,
      style,
      dimensions,
    })
    .catch((err) => logger.error(err));
});

app.post("/api/calendar/generate", async (req, res) => {
  const { prompt, year, theme } = req.body;

  const resultId = generateUUID();
  res.status(202).json({ resultId });

  genieService
    .process({
      resultId,
      mode: "calendar",
      prompt,
      year,
      theme,
    })
    .catch((err) => logger.error(err));
});
```

---

### Solution 2: Update genieService to Route Phase 2 Services

**File**: `server/genieService.js`

**Current**:

```javascript
async process(payload) {
  const { mode } = payload;

  if (mode === "ebook") {
    service = ebookService;
  }
  // No other modes!
}
```

**Updated**: Add two new switch cases for wall-art and calendar modes

```javascript
async process(payload) {
  const { resultId, mode } = payload;

  let service;
  let result;

  switch (mode) {
    case "ebook": {
      const ebookService = require("./services/ebookService");
      service = ebookService;
      // ... existing ebook logic ...
      break;
    }
    case "wall-art": {
      const WallArtService = require("./services/wallArtService");
      const wallArtService = new WallArtService();

      // Create orchestrator with helpers
      const Orchestrator = require("./orchestrator");
      const helpers = require("./helpers");
      const orchestrator = new Orchestrator(resultId, helpers);

      // Execute service with orchestrator context
      result = await wallArtService.handle(payload, {
        orchestrator,
        onProgress: (update) => { /* no-op, endpoint handles smartPoller */ },
      });
      break;
    }
    case "calendar": {
      const CalendarService = require("./services/calendarService");
      const calendarService = new CalendarService();

      // Create orchestrator with helpers
      const Orchestrator = require("./orchestrator");
      const helpers = require("./helpers");
      const orchestrator = new Orchestrator(resultId, helpers);

      // Execute service with orchestrator context
      result = await calendarService.handle(payload, {
        orchestrator,
        onProgress: (update) => { /* no-op, endpoint handles smartPoller */ },
      });
      break;
    }
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }

  // Return result to endpoint (endpoint handles smartPoller integration)
  return result;
}
```

**CRITICAL**: smartPoller integration (assignTask, markComplete, markError) happens in the **endpoints**, not here. genieService.process() is only responsible for routing to the correct service.

---

### Solution 3: Enhance Status Endpoint with Orchestrator Output

**File**: `server/index.js`

**Current**:

```javascript
app.get("/api/status/:resultId", (req, res) => {
  const status = smartPoller.getStatus(resultId);
  res.json(status || {}); // ← Returns {} if not found
});
```

**Updated**:

```javascript
app.get("/api/status/:resultId", (req, res) => {
  const { resultId } = req.params;
  const status = smartPoller.getStatus(resultId);

  if (!status) {
    return res.status(404).json({ error: "Job not found" });
  }

  // Enrich with all required fields
  const response = {
    resultId,
    status: status.status, // "in-progress", "complete", "error"
    eta: status.eta || null, // In seconds
    calls_total: status.calls_total || 0,
    calls_completed: status.calls_completed || 0,
    progress_percent: status.progress_percent || 0,
    message: status.message || `Job ${status.status}`,
    result: status.result || null, // Null if not complete
  };

  // Add error if present
  if (status.error) {
    response.error = status.error;
    response.error_code = status.error_code;
  }

  res.json(response);
});
```

---

### Solution 4: Update smartPoller to Store & Return All Fields

**File**: `server/utilities/smartPoller.js`

**Current**:

```javascript
assignTask(resultId, { eta, totalCalls }) {
  this.tasks.set(resultId, {
    resultId,
    status: "in-progress",
    eta,
    totalCalls,
    callsCompleted: 0
  });
}

getStatus(resultId) {
  const task = this.tasks.get(resultId);
  // Returns incomplete data
}
```

**Updated**:

```javascript
assignTask(resultId, { eta, totalCalls = null }) {
  this.tasks.set(resultId, {
    resultId,
    status: "in-progress",
    eta: eta || null,  // In seconds
    calls_total: totalCalls,
    calls_completed: 0,
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    error: null,
    result: null
  });
}

updateProgress(resultId, { callsCompleted, currentCall, totalCalls, eta }) {
  const task = this.tasks.get(resultId);
  if (!task) return;

  task.calls_completed = callsCompleted || 0;
  task.calls_total = totalCalls || task.calls_total;
  task.eta = eta || task.eta;  // Update ETA if provided

  // Compute progress percentage
  if (task.calls_total && task.calls_total > 0) {
    task.progress_percent = Math.round((task.calls_completed / task.calls_total) * 100);
  }

  task.message = `Processing call ${currentCall} of ${task.calls_total}`;
  task.lastUpdatedAt = Date.now();
}

markComplete(resultId, result) {
  const task = this.tasks.get(resultId);
  if (!task) return;

  task.status = "complete";
  task.result = result;  // Store full result
  task.progress_percent = 100;
  task.message = "Complete";
  task.completedAt = Date.now();
}

getStatus(resultId) {
  const task = this.tasks.get(resultId);
  if (!task) return null;

  // Return all fields needed by HTTP endpoint
  return {
    status: task.status,
    eta: task.eta,
    calls_total: task.calls_total,
    calls_completed: task.calls_completed,
    progress_percent: task.progress_percent || 0,
    message: task.message,
    result: task.result,
    error: task.error
  };
}
```

---

### Solution 5: Handle Rate Limiting Gracefully

**Problem**: Concurrent requests hitting 429 too early.

**Options**:

**Option A**: Increase global rate limit (if infrastructure allows)

```javascript
// server/index.js
const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Increased from 100 to 200
});

app.use(limiter);
```

**Option B**: Implement per-user rate limiting

```javascript
// Track per user, not globally
const userLimits = new Map();

const perUserLimiter = (req, res, next) => {
  const userId = req.user?.id || req.ip;

  // Track this user's requests
  if (!userLimits.has(userId)) {
    userLimits.set(userId, []);
  }

  const requests = userLimits.get(userId);
  const now = Date.now();

  // Remove requests older than 15 minutes
  const recentRequests = requests.filter((t) => now - t < 15 * 60 * 1000);

  if (recentRequests.length >= 50) {
    // 50 per user per 15 min
    return res.status(429).json({ error: "Rate limited" });
  }

  recentRequests.push(now);
  userLimits.set(userId, recentRequests);
  next();
};

app.use(perUserLimiter);
```

**Option C**: Test with reduced concurrent load

```javascript
// Modify test to send requests sequentially or with spacing
const requests = [];
for (let i = 0; i < 5; i++) {
  // Add 500ms spacing between requests
  await sleep(500);

  requests.push(
    request(app)
      .post("/api/ebook/generate")
      .send({...})
  );
}
```

---

## Implementation Sequence

| Step | Task                                 | File                            | Complexity |
| ---- | ------------------------------------ | ------------------------------- | ---------- |
| 1    | Register Phase 2 HTTP endpoints      | server/index.js                 | Low        |
| 2    | Update genieService router           | server/genieService.js          | Low        |
| 3    | Enhance status endpoint              | server/index.js                 | Low        |
| 4    | Update smartPoller fields            | server/utilities/smartPoller.js | Medium     |
| 5    | Wire orchestrator ETA to smartPoller | server/genieService.js          | Medium     |
| 6    | Address rate limiting                | server/index.js                 | Low-Medium |

---

## Expected Test Results After Implementation

**Before**:

```
✅ service-auton-delegation.test.js (24 tests) — PASS
❌ service-auton-performance.test.js (18 tests) — 14 FAIL, 4 PASS
```

**After**:

```
✅ service-auton-delegation.test.js (24 tests) — PASS
✅ service-auton-performance.test.js (18 tests) — 18 PASS (all)
```

---

## Success Criteria

- ✅ POST /api/wall-art/generate returns 202
- ✅ POST /api/calendar/generate returns 202
- ✅ GET /api/status/:resultId returns `{ eta, calls_total, calls_completed, progress_percent, result }`
- ✅ ETA is a number, not an object
- ✅ 5 concurrent requests don't hit 429
- ✅ All 18 performance tests pass
- ✅ No HTTP integration regressions in existing tests

---
