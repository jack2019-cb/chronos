# HTTP Integration Implementation: Phase 2 Services & Status Endpoint

**Date**: December 28, 2025 @ 5:05PM
**Branch**: `SERVICE-AUTON-reset`

**Related**: HTTP_INT_PLAN.md (design document)  
**Scope**: Execute HTTP integration fixes in sequence
**Status**: Ready for Execution

---

## Implementation Steps

### Step 1: Register Phase 2 HTTP Endpoints

**File**: `server/index.js`

**Locate**: POST /api/ebook/generate endpoint (existing, working)

**Action**: Add two new endpoints immediately after ebookService endpoint

**Code to Add**:

```javascript
// POST /api/wall-art/generate
app.post("/api/wall-art/generate", async (req, res) => {
  try {
    const { prompt, style, dimensions } = req.body;

    // Input validation
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt required" });
    }

    // PART-A: Generate resultId immediately
    const resultId = generateUUID();

    // Return 202 immediately (< 100ms)
    res.status(202).json({
      resultId,
      status: "queued",
      message: "Your wall art request is queued",
    });

    // HAND OFF ASYNCHRONOUSLY
    genieService
      .process({
        resultId,
        mode: "wall-art",
        prompt,
        style,
        dimensions,
      })
      .catch((err) => {
        logger.error(`Wall-art generation failed for ${resultId}:`, err);
      });
  } catch (err) {
    logger.error("Wall-art endpoint error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/calendar/generate
app.post("/api/calendar/generate", async (req, res) => {
  try {
    const { prompt, year, theme } = req.body;

    // Input validation
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt required" });
    }

    // PART-A: Generate resultId immediately
    const resultId = generateUUID();

    // Return 202 immediately (< 100ms)
    res.status(202).json({
      resultId,
      status: "queued",
      message: "Your calendar request is queued",
    });

    // HAND OFF ASYNCHRONOUSLY
    genieService
      .process({
        resultId,
        mode: "calendar",
        prompt,
        year,
        theme,
      })
      .catch((err) => {
        logger.error(`Calendar generation failed for ${resultId}:`, err);
      });
  } catch (err) {
    logger.error("Calendar endpoint error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
```

**Verification**:

```bash
# Test endpoints exist and return 202
curl -X POST http://localhost:3000/api/wall-art/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test", "style": "minimalist", "dimensions": "3x4"}'
# Expected: 202 { "resultId": "..." }

curl -X POST http://localhost:3000/api/calendar/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test", "year": 2025, "theme": "tech"}'
# Expected: 202 { "resultId": "..." }
```

---

### Step 2: Update genieService Router to Include wall-art and calendar Modes

**File**: `server/genieService.js`

**Locate**: `async process(payload)` method, specifically the switch statement that routes by mode

**Action**: Add two new cases for wall-art and calendar modes

**Code to Add** (insert after "case 'ebook'" block):

```javascript
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
```

**CRITICAL**: genieService.process() should **NOT** call smartPoller methods. That responsibility belongs to the endpoints (see Step 1). genieService is only responsible for routing to the correct service and returning the result.

**Verification**:

```bash
# Check genieService routes correctly
# This happens automatically when endpoints are called
# Verify via logs: service execution paths
```

---

### Step 3: Enhance Status Endpoint Response

**File**: `server/index.js`

**Locate**: GET /api/status/:resultId endpoint

**Action**: Replace entire endpoint handler

**Code**:

```javascript
app.get("/api/status/:resultId", (req, res) => {
  try {
    const { resultId } = req.params;

    // Fetch task status from smartPoller
    const smartPoller = require("./utilities/smartPoller");
    const taskStatus = smartPoller.getStatus(resultId);

    // If job not found
    if (!taskStatus) {
      return res.status(404).json({
        error: "Job not found",
        resultId,
      });
    }

    // BUILD RESPONSE with all required fields
    const response = {
      resultId,
      status: taskStatus.status, // "in-progress", "complete", "error"
      eta: taskStatus.eta || null, // In seconds (number or null)
      calls_total: taskStatus.calls_total || 0, // Total orchestrator calls
      calls_completed: taskStatus.calls_completed || 0, // Completed so far
      progress_percent: taskStatus.progress_percent || 0, // 0-100
      message: taskStatus.message || `Job ${taskStatus.status}`, // Human-readable
      result: taskStatus.result || null, // Final output (if complete)
    };

    // Add error details if present
    if (taskStatus.error) {
      response.error = taskStatus.error;
    }

    // Add timing info for debugging
    if (taskStatus.startedAt) {
      response.elapsed_seconds = Math.round(
        (Date.now() - taskStatus.startedAt) / 1000
      );
      response.remaining_seconds = Math.max(
        0,
        (taskStatus.eta || 0) - response.elapsed_seconds
      );
    }

    logger.debug(`[status] ${resultId}: ${JSON.stringify(response)}`);
    res.json(response);
  } catch (err) {
    logger.error("Status endpoint error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
```

**Verification**:

```bash
# After generating a job, check status:
curl http://localhost:3000/api/status/job-uuid

# Expected response:
{
  "resultId": "job-uuid",
  "status": "in-progress",
  "eta": 23,
  "calls_total": 4,
  "calls_completed": 1,
  "progress_percent": 25,
  "message": "Processing call 2 of 4",
  "result": null,
  "elapsed_seconds": 5,
  "remaining_seconds": 18
}
```

---

### Step 4: Update smartPoller to Store & Return All Fields

**File**: `server/utilities/smartPoller.js`

**Action**: Replace entire class implementation

**Code**:

```javascript
/**
 * SmartPoller Utility
 *
 * Tracks long-running job status across concurrent requests.
 * Enriched by genieService with real-time progress.
 * Queried by status endpoint for client polling.
 */

class SmartPoller {
  constructor() {
    this.tasks = new Map(); // resultId → taskStatus
  }

  /**
   * Assign a new task (called by genieService at handoff)
   *
   * @param {string} resultId - Job identifier
   * @param {object} options - { eta, totalCalls }
   */
  assignTask(resultId, { eta = null, totalCalls = null }) {
    const task = {
      resultId,
      status: "in-progress", // in-progress | complete | error
      eta: eta || null, // In seconds
      calls_total: totalCalls, // Total orchestrator calls
      calls_completed: 0, // Completed so far
      progress_percent: 0,
      message: "Job queued",
      result: null,
      error: null,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      completedAt: null,
    };

    this.tasks.set(resultId, task);
    return task;
  }

  /**
   * Update progress (called by genieService via onProgress callback)
   *
   * @param {string} resultId - Job identifier
   * @param {object} options - { callsCompleted, currentCall, totalCalls, eta }
   */
  updateProgress(
    resultId,
    { callsCompleted = 0, currentCall = 0, totalCalls = null, eta = null } = {}
  ) {
    const task = this.tasks.get(resultId);
    if (!task) return;

    // Update fields
    task.calls_completed = callsCompleted;
    task.calls_total = totalCalls || task.calls_total;
    task.eta = eta || task.eta;

    // Compute progress percentage
    if (task.calls_total && task.calls_total > 0) {
      task.progress_percent = Math.round(
        (task.calls_completed / task.calls_total) * 100
      );
    }

    // Human-readable message
    if (task.calls_total) {
      task.message = `Processing call ${currentCall} of ${task.calls_total}`;
    }

    task.lastUpdatedAt = Date.now();
  }

  /**
   * Mark task complete with result
   *
   * @param {string} resultId - Job identifier
   * @param {object} result - Final output from service
   */
  markComplete(resultId, result) {
    const task = this.tasks.get(resultId);
    if (!task) return;

    task.status = "complete";
    task.result = result;
    task.progress_percent = 100;
    task.message = "Complete";
    task.completedAt = Date.now();
  }

  /**
   * Mark task failed with error
   *
   * @param {string} resultId - Job identifier
   * @param {object} error - Error object with { message, code }
   */
  markError(resultId, { message = "Unknown error", code = "ERROR" } = {}) {
    const task = this.tasks.get(resultId);
    if (!task) return;

    task.status = "error";
    task.error = { message, code };
    task.message = `Error: ${message}`;
    task.completedAt = Date.now();
  }

  /**
   * Get status for a task
   *
   * @param {string} resultId - Job identifier
   * @returns {object|null} Task status object or null if not found
   */
  getStatus(resultId) {
    return this.tasks.get(resultId) || null;
  }

  /**
   * Get all active tasks
   *
   * @returns {array} Array of active task statuses
   */
  getActiveTasks() {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === "in-progress"
    );
  }

  /**
   * Clean up old completed tasks (optional, for memory management)
   *
   * @param {number} maxAgeMs - Max age in milliseconds (default: 24h)
   */
  cleanup(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const toDelete = [];

    this.tasks.forEach((task, resultId) => {
      if (task.completedAt && now - task.completedAt > maxAgeMs) {
        toDelete.push(resultId);
      }
    });

    toDelete.forEach((resultId) => this.tasks.delete(resultId));
    return toDelete.length;
  }
}

// Export singleton instance
module.exports = new SmartPoller();
```

**Verification**:

```bash
# Verify smartPoller exports correctly
node -e "const sp = require('./server/utilities/smartPoller'); console.log(sp.assignTask('test', {eta: 20, totalCalls: 4}));"
# Expected: task object with all fields
```

---

### Step 5: Verify Endpoints Handle smartPoller Integration Correctly

**File**: `server/index.js` (wall-art and calendar endpoints)

**Verify**: Both new endpoints follow the ebook pattern with .then() and .catch() callbacks:

```javascript
genieService
  .process({ ... })
  .then((result) => {
    smartPoller.markComplete(resultId, result);  // ← Must be in .then()
  })
  .catch((err) => {
    smartPoller.markError(resultId, { message: err.message, ... });
  });
```

**Key Point**: smartPoller integration (assignTask, markComplete, markError) happens in the **endpoint handler**, not in genieService.process(). This is the critical architectural pattern that was missing in the first attempt.

---

### Step 6: Address Rate Limiting (Choose One)

**Option A: Increase Global Rate Limit** (Recommended for testing)

**File**: `server/index.js`

**Locate**: Rate limit middleware setup

**Current**:

```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
```

**Updated**:

```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Increased from 100
});
```

**Rationale**: Tests make 5 concurrent requests. 100 limit gets hit too early. 200 allows room.

**Note**: If changing rate limits affects production, consider instead adjusting tests to be less concurrent (add spacing between requests).

---

## Test Execution Plan

### Pre-Test Checklist

- [ ] Step 1 completed: POST /api/wall-art/generate exists
- [ ] Step 1 completed: POST /api/calendar/generate exists
- [ ] Step 2 completed: genieService routes to all 3 services
- [ ] Step 3 completed: GET /api/status/:resultId returns full response
- [ ] Step 4 completed: smartPoller stores all fields
- [ ] Step 5 completed: orchestrator ETA flows to smartPoller
- [ ] Step 6 completed: Rate limit adjusted or test spacing added

### Run Performance Tests

```bash
cd /workspaces/Aether/server

# Run only Phase 2 performance tests
npm test -- service-auton-performance.test.js

# Expected output:
# ✅ Test Files  1 passed
# ✅ Tests  18 passed (all)
```

### Run Full Test Suite

```bash
npm test

# Expected:
# ✅ Phase 2 tests: all passing (24+ tests)
# ✅ No regressions in existing tests
```

---

## Debugging Tips

### If endpoints still return 404:

```bash
# Check Express routes
node -e "const app = require('./server/index.js'); console.log(app._router.stack.filter(r => r.route).map(r => r.route.path))"

# Should include:
# /api/ebook/generate
# /api/wall-art/generate
# /api/calendar/generate
# /api/status/:resultId
```

### If status returns empty object:

```bash
# Check smartPoller has task
node -e "const sp = require('./server/utilities/smartPoller'); console.log(sp.getStatus('test-id'))"
# If null, genieService.assignTask() isn't being called
```

### If ETA is object instead of number:

```bash
# Check smartPoller.assignTask() is called with numeric eta
# Verify genieService.estimateETA() returns number, not object
# Check onProgress callback passes orchestrator.eta correctly
```

---

## Rollback Plan

If tests still fail after all steps:

```bash
# Revert the HTTP integration changes
git diff server/index.js  # Review changes
git checkout server/index.js  # Revert

# Verify delegation tests still pass
npm test -- service-auton-delegation.test.js
# Should still pass (unit tests not affected)
```

---

## Expected Results

### Before HTTP Integration:

```
❌ service-auton-performance.test.js: 14 FAIL, 4 PASS
- 404 errors on wall-art, calendar endpoints
- Status endpoint returns {}
- ETA is object
- Tests timeout
```

### After HTTP Integration:

```
✅ service-auton-performance.test.js: 18 PASS (all)
✅ POST /api/wall-art/generate returns 202
✅ POST /api/calendar/generate returns 202
✅ GET /api/status/:resultId returns { eta, calls_total, calls_completed, ... }
✅ ETA is number, not object
✅ 5 concurrent requests don't hit 429
✅ No regressions in other tests
```

---
