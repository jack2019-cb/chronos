# Branch Strategy: feat/ebook-revert

**Date**: December 11, 2025  
**Base Commit**: `5fc231a` - "docs: Add batch optimization unification strategy"  
**Branch**: `feat/ebook-revert`  
**Purpose**: Fresh implementation of quota system as pure accounting module

---

## Situation

We discovered that the existing quota system (implemented in `feat/revert-original`) was architecturally flawed:

### Previous Architecture Problem

The quota system was implemented as a **flow control mechanism**:

- Sitting in `aiService.js` intercepting every call
- Making pause/resume decisions mid-operation
- Returning 429 errors when quota exhausted
- Creating mysterious blocking behavior

This caused cascading 429 errors across the entire server (even `/health` endpoint) because the quota check was happening at the wrong layer.

### Root Issue

> "The Quota System is just that, an accounting mechanism. It should not initiate or prolong model calls."

The business logic already knows:

- Page count → number of API calls needed (deterministic)
- Pagination length → exact cost upfront
- No mystery, no runtime surprises

---

## New Architecture (What We're Building)

**Quota System = Accounting Module Only**

```
Business Orchestrator (ebookService.js)
    ↓
[1. CALCULATE] How many calls needed? (pageCount / PAGES_PER_CALL)
    ↓
[2. CHECK] Does quota tracker have budget available?
    ↓
IF YES  → Proceed with generateEbook()
         → quota tracker RECORDS each actual call made
         → No blocking, no 429s
    ↓
IF NO   → Defer job to queue
         → Retry after 60s window resets
```

**Key Principle**:

- Quota tracker **never blocks** API calls
- Business layer **prevents** exceeding quota (via upfront deferral)
- Quota tracker **accounts for** what actually happened (accounting only)

---

## Implementation Plan

### Phase 1: Quota Module (Pure Accounting)

1. Create `server/utils/quotaTracker.js`:

   - Simple counter: `recordCall()`
   - Status getter: `getStatus()`
   - Window management: `rotateWindow()` every 60s
   - **No pause/resume logic** (business layer decides deferral)

2. Keep in `server/geminiClient.js` or move to utils:
   - `callGemini()` - Direct API wrapper, NO quota check here
   - Just calls Gemini, quota tracker records it

### Phase 2: Orchestrator Integration (Business Logic)

1. In `server/ebookService.js`:

   - Calculate cost upfront: `const cost = Math.ceil(pageCount / PAGES_PER_CALL)`
   - Check available: `if (quotaTracker.getStatus().availableQuota < cost) → defer job`
   - Proceed: Call `generateEbook()` and let quota tracker record calls

2. In `server/jobQueueManager.js`:
   - Jobs check quota before starting
   - If insufficient, deferred to retry after 60s

### Phase 3: API Endpoints

1. `GET /api/quota-status`:

   - Returns: `{ callCount, limit, percentUsed, availableQuota, windowResetAt }`
   - No flow control logic

2. No new 429-handling endpoints:
   - Server naturally stays under quota (prevented at orchestration layer)
   - No need for quota-specific error responses

---

## What's Already Clean

✅ **geminiClient.js** (5509 bytes)

- Simple API wrapper: `callGemini()`
- No QuotaTracker class
- No pause/resume logic
- Ready for minimal quota recording

✅ **aiService.js**

- MockAIService and RealAIService implementations
- No quota interceptor logic
- Clean async/await pattern

✅ **Tests**

- Existing unit tests in place
- Can add new tests for quota accounting without refactoring

---

## Next Steps

1. **Create quotaTracker module**

   - File: `server/utils/quotaTracker.js`
   - Simple class: recordCall(), getStatus(), rotateWindow()
   - ~80 lines of code

2. **Integrate into geminiClient**

   - After `callGemini()` succeeds: call `quotaTracker.recordCall()`
   - Export singleton: `{ callGemini, quotaTracker }`

3. **Add quota check to ebookService**

   - Before starting job: calculate cost, check budget
   - If insufficient: defer job, don't call API

4. **Add quota endpoint**

   - GET `/api/quota-status` returns tracker status
   - Simple read-only endpoint

5. **Test with real API**
   - No more 429 cascades
   - Quota prevents over-use cleanly
   - Jobs defer gracefully

---

## Comparison: Old vs New

| Aspect               | Old (feat/revert-original)     | New (feat/ebook-revert)                   |
| -------------------- | ------------------------------ | ----------------------------------------- |
| **Quota Location**   | In aiService.js (flow control) | In orchestrator + utils (accounting only) |
| **Decision Making**  | "Can I call Gemini now?"       | "Do I have budget to start this job?"     |
| **Error Handling**   | Returns 429 when exhausted     | Defers job, no errors to user             |
| **Block Layer**      | API interceptor                | Business orchestrator                     |
| **Call Recording**   | After quota check              | After successful API call                 |
| **Server Stability** | 429 cascades on all endpoints  | Clean, no disruption                      |

---

## Branch Status

- **Current State**: Ready to implement
- **Baseline**: All non-quota code clean and functional
- **Next**: Build quota accounting module from scratch

---

**Owner**: Development Team  
**Status**: 🟢 READY TO BUILD
