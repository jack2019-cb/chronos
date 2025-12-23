# PERF-VALIDATE Phase: Test Failure Report

**Date**: December 22, 2025 @ 6:30PM
**Branch**: `PERF-VALIDATE`  
**Test Command**: `cd server && npm test -- __tests__/perf-validate-http-async.test.js`

---

## Executive Summary

**Test Results**: 7 FAILED | 3 PASSED (out of 12 tests)  
**Duration**: 187.93 seconds  
**Status**: Test suite created correctly, but implementation gaps in SERVICE-AUTON phase integration

All failures are **IMPLEMENTATION ISSUES**, not test issues. Tests are correctly written and expectations align with ARCHITECTURE_IMPLEMENTATION_GUIDE spec.

---

## Failure Details

### FAIL #1: Suite 1, Test 3 - "should eventually complete and provide result"

**Location**: `__tests__/perf-validate-http-async.test.js:110`  
**Error**: `expect(result.status).toHaveProperty("result")`

```
AssertionError: expected {} to have property "result"
```

**Root Cause**: SmartPoller.getStatus() is not returning `result` property when task is complete  
**Spec Requirement**: When status is "complete", the status object must include the `result` field  
**Implementation Gap**: SmartPoller stores `result` on task completion (line 97) but doesn't include it in getStatus() return object (lines 76-88)

---

### FAIL #2: Suite 1, Test 4 - "should provide status endpoint with progress"

**Location**: `__tests__/perf-validate-http-async.test.js:131`  
**Error**: `expect(status1.body.eta).toBeGreaterThan(0)`

```
TypeError: actual value must be number or bigint, received "object"
```

**Root Cause**: `eta` property is an object (or null/undefined) instead of a number  
**Spec Requirement**: Status endpoint should return `eta` as a number (seconds)  
**Implementation Gap**:

- Index.js initializes smartPoller with `eta: null` (line 2976)
- Orchestrator computes ETA from manifest on first call
- BUT: statusManager.init() doesn't update smartPoller's eta value
- Missing link between orchestrator's computed ETA and smartPoller's task record

---

### FAIL #3: Suite 2, Test 2 - "should complete 5-page ebook in under 40 seconds"

**Location**: `__tests__/perf-validate-http-async.test.js:165`  
**Error**: `Test timed out in 65000ms`

**Root Cause**: Test exceeds 65 second timeout (default vitest timeout)  
**Spec Requirement**: 5-page ebook should complete in < 40 seconds  
**Implementation Gap**: Orchestrator FIFO scheduling with 250ms Pro / 100ms Flash spacing is causing excessive delays

- Call 0: ~6000ms (expert latency)
- Call 1: 250ms + 6000ms = 6250ms (FIFO wait + expert latency)
- Call 2: 100ms + 5000ms = 5100ms (FIFO wait + standard latency)
- Call 3: 250ms + 6000ms = 6250ms (FIFO wait + expert latency)
- **Total estimate**: ~24 seconds, but actual is > 65 seconds (tests are serial, delays compound)

---

### FAIL #4: Suite 3, Test 1 - "should compute ETA on first call via manifest"

**Location**: `__tests__/perf-validate-http-async.test.js:204`  
**Error**: `AssertionError: expected {} to have property "eta"`

**Root Cause**: Same as FAIL #2 - eta property missing from status response  
**Spec Requirement**: After first call with manifest, status endpoint must return computed ETA  
**Implementation Gap**: statusManager.init() (orchestrator.js:63) is called with correct eta value, but doesn't communicate back to smartPoller

---

### FAIL #5: Suite 3, Test 2 - "should track progress through all orchestrator calls"

**Location**: `__tests__/perf-validate-http-async.test.js:242`  
**Error**: `AssertionError: expected 0 to be greater than 0`

```
expect(snapshots.length).toBeGreaterThan(0)
```

**Root Cause**: Progress snapshots are empty (0 length)  
**Spec Requirement**: Status endpoint should return progress that changes across calls  
**Implementation Gap**: orchestrator calls statusManager.updateProgress() but status endpoint returns empty/stale data

---

### FAIL #6: Suite 4, Test 1 - "should handle 5 concurrent requests without 429 errors"

**Location**: `__tests__/perf-validate-http-async.test.js:279`  
**Error**: `AssertionError: expected 429 to be 202`

**Root Cause**: Some requests return HTTP 429 (Too Many Requests) instead of 202 (Accepted)  
**Spec Requirement**: Concurrent requests should be accepted asynchronously (202) without quota rejection  
**Implementation Gap**: Quota system is returning 429 when quota exhausted. With 5 concurrent 3-page ebook requests:

- Each costs 4 calls
- Total cost: 20 calls
- Available: 20 calls (default)
- Expected: All 5 should be reserved
- Actual: Some fail because quota tracking isn't reserving properly across concurrent requests

---

### FAIL #7: Suite 5, Test 1 - "should predict 3-page ebook within ±20%"

**Location**: `__tests__/perf-validate-http-async.test.js:308`  
**Error**: `Test timed out in 65000ms`

**Root Cause**: Same as FAIL #3 - test exceeds timeout  
**Spec Requirement**: 3-page ebook should complete in < 30 seconds with ±20% accuracy  
**Implementation Gap**: Orchestrator timing is too slow due to cumulative FIFO waits

---

## Root Cause Summary

| Issue                    | Component                    | Gap                                                            | Impact      |
| ------------------------ | ---------------------------- | -------------------------------------------------------------- | ----------- |
| ETA not returned         | smartPoller + statusManager  | ETA computed by orchestrator but not propagated to smartPoller | FAIL #2, #4 |
| Result not returned      | smartPoller.getStatus()      | Task.result stored but not included in status object           | FAIL #1     |
| Progress not tracked     | statusManager or smartPoller | Progress updates not visible in status endpoint                | FAIL #5     |
| Quota reservation broken | quotaTracker                 | Concurrent reservations not working correctly                  | FAIL #6     |
| Performance too slow     | orchestrator scheduling      | FIFO + spacing cumulative delays exceed SLA                    | FAIL #3, #7 |

---

## Work Queue for Tomorrow

### Phase 1: Fix Status Object Integration (HIGH PRIORITY)

**Blocks**: FAIL #1, #2, #4, #5

1. **Trace ETA flow**:

   - Orchestrator computes ETA in helpers.timingResolver.compute()
   - statusManager.init() receives eta value
   - Verify statusManager updates smartPoller task.eta

2. **Fix smartPoller.getStatus()**:

   - Include `result` property in returned status object when task is complete
   - Ensure `eta` is a number (not null/object)
   - Include progress snapshots in response

3. **Verify statusManager.updateProgress()**:
   - Ensure progress updates are reflected in smartPoller
   - Check that callbacks to smartPoller work correctly

### Phase 2: Fix Quota Reservation (MEDIUM PRIORITY)

**Blocks**: FAIL #6

1. **Audit quotaTracker.reserve()**:

   - Verify concurrent requests get separate reservations
   - Check that quota is correctly tracked during parallel jobs
   - Ensure default quota pool is sufficient for tests

2. **Verify async handoff**:
   - Ensure quota is checked in index.js before async handoff
   - Confirm 202 is returned before quota is actually consumed

### Phase 3: Performance Optimization (LOWER PRIORITY)

**Blocks**: FAIL #3, #7

1. **Review FIFO scheduling**:

   - Check if 250ms/100ms spacing constants are correct
   - Consider reducing spacing for mock tests (FORCE_MOCK_AI=1)
   - Profile orchestrator call timing

2. **Optimize mock AI latencies**:
   - Current: expert=6000ms, standard=5000ms
   - For tests with mock AI, reduce to match actual mock performance

### Phase 4: Validation

1. Run full test suite again
2. Verify all 12 tests pass
3. Check SLA targets are met:
   - 202 response: < 100ms
   - 3-page ebook: < 30 seconds
   - 5-page ebook: < 40 seconds
   - ETA accuracy: ±20% tolerance

---

## Files to Review

- `server/utilities/smartPoller.js` - Fix getStatus() return object
- `server/helpers.js` or equivalent - statusManager.init() implementation
- `server/orchestrator.js` - Verify statusManager is called correctly
- `server/index.js` - Check quota reservation and smartPoller initialization
- `server/utils/quotaTracker.js` - Fix concurrent reservation logic

---

## Test Infrastructure Notes

- Tests are vitest-compatible with proper HTTP-level integration
- Mock AI is properly configured (FORCE_MOCK_AI=1)
- Test structure is sound - failures are implementation, not test design
- All 3 passing tests (Suite 2 Test 1, Suite 1 Test 1, Suite 1 Test 2) confirm basic async architecture works
