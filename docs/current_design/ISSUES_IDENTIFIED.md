# Issues Identified During Architecture Refresh

**Date**: December 29, 2025  @ 6:30PM
**Branch**: `feat/B_Frontend_option2`  

**Scope**: Issues discovered while documenting patterns and validating against production data  
**Status**: For Discussion and Prioritization

---

## Executive Summary

During the architecture documentation refresh (Dec 29, 2025), six issues were identified that warrant discussion and prioritization. These range from **high priority** (polling network resilience) to **low priority** (user experience). This document captures findings and recommends next steps.

**Total Issues**: 6  
**Critical**: 0  
**High**: 1  
**Medium**: 2  
**Low**: 2  
**Not Yet Discovered**: 1

---

## Issue #1: Polling Network Error Resilience [HIGH]

### Current Behavior

When client loses network connection during polling, the SmartPoller counts consecutive errors and gives up after 10 consecutive failures:

```javascript
// From FRONTEND_ARCHITECTURE.md - SmartPoller.poll()
this.consecutiveErrors++;

if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
  return { success: false, error, terminal: true };
}
```

### Problem

**User Impact**: If polling encounters transient network errors (e.g., 5-second WiFi dropout), user sees "Lost connection to server" error and cannot retry without manual intervention.

**Technical Root Cause**:

- Each failed poll increments counter
- 10 consecutive failures triggers terminal error
- No mechanism to continue polling after network recovery
- No exponential backoff (fixed 500ms-10s intervals based on ETA)
- No user-facing "Network recovering, please wait..." state

### Production Evidence

Potential impact: Any user with unstable WiFi/mobile connection during ~50-60 second generation will fail to completion even if generation succeeds server-side.

**Scenario**:

```
T=30s  Client polling (processing 3/10 chapters)
T=32s  WiFi drops (5-second outage)
T=32.1s Poll #1 fails → consecutiveErrors = 1
T=32.5s Poll #2 fails → consecutiveErrors = 2
T=33s  WiFi returns, but...
T=33.1s Poll #3 fails (unknown reason) → consecutiveErrors = 3
...
T=37s  Poll #10 fails → consecutiveErrors = 10 (terminal)
       User: "Lost connection to server (10 consecutive errors)"
       Server: Still generating, result stored
       Generation succeeds, but user sees failure
```

### Recommended Fix

**Option A (Robust)**: Change terminal error condition from counter to explicit "server unreachable" check:

```javascript
// Poll server health at /api/health endpoint
// Only mark terminal if:
// 1. Server responds with 404 (result truly lost)
// 2. Server responds with 410 (result expired)
// 3. User explicitly cancels (AbortController)
// For any other error (network): continue polling indefinitely
```

**Option B (Immediate)**: Increase terminal error threshold from 10 to 50+ consecutive failures:

```javascript
this.maxConsecutiveErrors = 50; // ~5-10 minutes of polling failures
```

**Option C (Minimal)**: Add backoff resets between each success:

```javascript
// Successfully polled → reset error counter
if (response.ok) {
  this.consecutiveErrors = 0; // Already implemented
  return status;
}

// Failed poll → increment and continue
this.consecutiveErrors++;
```

### Timeline to Fix

- **Criticality**: Medium (affects edge case: poor network during generation)
- **Effort**: 1-2 hours (decision on approach + testing)
- **Recommendation**: Implement Option A for robustness

---

## Issue #2: Export Endpoint 400 Error [MEDIUM]

### Current Behavior

During the Light_3-page_AN.md production test, the export endpoint returned a 400 error during middle chapter processing:

```
T=27s  [400 Error during export endpoint validation]
       Status: non-fatal (generation continued)
```

### Problem

**Technical Details**:

- The error occurred mid-generation (T=27s)
- Non-blocking (generation completed successfully)
- Error type/message not captured in logs
- Suggests validation issue in PDF export pipeline

**Questions Needing Answers**:

1. What triggered the 400? (Invalid pages array? Missing metadata?)
2. Is this a race condition during composition?
3. Do we need stricter page validation before calling PDF renderer?
4. Should this error be surfaced to user or silently retried?

### Production Evidence

From Light_3-page_AN.md logs:

```
T=27000ms  Composition in progress...
           [400 Error during export endpoint validation]
           Status: Non-terminal (processing continued)
T=45490ms  Generation completed successfully (all chapters)
```

The fact that generation completed suggests:

- The 400 error was not the cause of generation failure
- Export was likely called speculatively (not awaited by main flow)
- Validation passed eventually or error was caught and ignored

### Root Cause Analysis Needed

Investigate in `/server/exportService.js` and `/server/compositionService.js`:

```javascript
// Questions to answer:
// 1. When is export endpoint called during generation?
// 2. What validation fails at T=27s but passes at T=45s?
// 3. Is pages array being mutated mid-generation?
// 4. Should we lock pages array until composition complete?
```

### Recommended Fix

**Priority**: Medium (non-blocking, but suggests race condition)

**Steps**:

1. Reproduce the 400 error consistently
2. Add detailed logging: "Export validation failed: [reason]"
3. Review page validation logic
4. Consider: Should export be disabled until composition complete?
5. Add test case for concurrent composition + export calls

### Timeline to Fix

- **Criticality**: Medium (non-blocking in this case, but unsettling)
- **Effort**: 2-3 hours (debugging + fix + test)
- **Recommendation**: Investigate before next release

---

## Issue #3: Theme Application Timing [MEDIUM]

### Current Behavior

Documentation doesn't clarify **when** the theme is applied relative to generation:

**Uncertainty**:

- Is theme applied during chapter generation (prompt includes theme)?
- Is theme applied during composition (HTML rendering)?
- Is theme applied post-generation (CSS injection)?
- Or some combination?

### Problem

**Impact**:

- Unclear to frontend developers when theme changes are reflected
- Affects performance expectations (theme = extra time?)
- Matters for override logic (can theme be changed without regeneration?)

### Questions Needing Answers

From `/server/ebookService.js` or relevant service:

```javascript
// 1. What does the theme parameter do?
// 2. Is it passed to Gemini (affects content)?
// 3. Or only affects HTML rendering?

// Example ambiguity:
const manifest = {
  theme: "dark", // ← Does this make it to Gemini prompt?
  prompt: "Generate a 10-page ebook about...",
};

// If theme is in prompt: "Generate in dark theme aesthetic..."
// If theme is not in prompt: Just affects CSS later
```

### Impact on Architecture

**If theme affects prompt content**:

- Changing theme requires re-generation
- Cost increases with each override
- ETA calculations must account for theme changes

**If theme only affects CSS**:

- Theme can change instantly post-generation
- Overrides are free (just CSS injection)
- No server-side cost for theme changes

### Recommended Fix

**Priority**: Low (doesn't block functionality, but confusing)

**Steps**:

1. Review `ebookService.describeWork()` - does manifest include theme?
2. Review prompt builder - is theme included in Gemini prompt?
3. Review composition - where is CSS applied?
4. Update BACKEND_ARCHITECTURE.md Section 2 (Manifest Protocol) with clarity
5. Update FRONTEND_ARCHITECTURE.md Section 7 (Overrides) with timing explanation

### Timeline to Fix

- **Criticality**: Low (architectural clarity only)
- **Effort**: 1 hour (trace code + document)
- **Recommendation**: Address before next documentation update

---

## Issue #4: Error Contracts During Polling [MEDIUM]

### Current Behavior

CLIENT_SERVER_INTEGRATION.md documents some error scenarios, but several gaps exist:

**Documented**:

- 404 Result Not Found
- 410 Result Expired
- 202 Not Ready (during composition)

**Not Documented**:

- What if server crashes during generation? (result lost? retry?)
- What if Gemini API quota hit mid-generation? (partial state? error message?)
- What if Gemini API returns 503? (retry? timeout?)
- What if database connection drops? (result state lost?)
- What if rate-limiter deadlocks? (infinite queue?)

### Problem

**Impact**: Clients can't implement robust error recovery because error contract is incomplete.

**Example Missing Case**:

```javascript
// What should client do if polling returns:
{
  "status": "failed",
  "error": {
    "code": "GEMINI_QUOTA_EXCEEDED",
    "message": "API quota exhausted after 2 of 10 chapters"
  }
}
```

**Questions**:

- Is this retriable? (Wait for quota reset?)
- Is result partially usable? (Return chapters 1-2?)
- Should user pay for partial generation?
- How long until retry is viable?

### Recommended Fix

**Priority**: Medium (affects robustness, but not immediate functionality)

**Steps**:

1. Define error taxonomy: Which errors are retriable? Which are terminal?
2. Add error contract section to CLIENT_SERVER_INTEGRATION.md:

   ```
   ## Server Errors During Polling

   ### GEMINI_QUOTA_EXCEEDED
   - Cause: API hit quota
   - Retriable: Yes (after quota window reset)
   - Partial result: Depends on phase
   - User action: Retry or cancel

   ### DATABASE_CONNECTION_ERROR
   - Cause: Database unavailable
   - Retriable: Yes
   - Partial result: No (state lost)
   - User action: Retry (server will have to restart generation)

   ### GEMINI_TIMEOUT
   - Cause: Gemini API timeout
   - Retriable: Yes
   - Partial result: No
   - User action: Retry

   [etc. for other error types]
   ```

3. Update backend error handling to return structured error codes
4. Update frontend SmartPoller to handle each error type differently

### Timeline to Fix

- **Criticality**: Medium (robustness + error clarity)
- **Effort**: 3-4 hours (spec + implement + test)
- **Recommendation**: Address before expanding error scenarios

---

## Issue #5: Database/State Persistence for Async [LOW]

### Current Behavior

Architecture documents don't explain where generation state is persisted:

**Unclear**:

- Is result stored in-memory? (Lost on server restart?)
- Is result stored in database? (Persisted? Queryable?)
- Is result stored in cache? (TTL? Eviction policy?)
- When is state written? (Immediately? After completion?)

### Problem

**Impact**:

- Operators don't know what happens if server restarts mid-generation
- Scaling unclear (can multiple servers share result store?)
- Cleanup strategy unclear (when to delete old results?)
- Recovery unclear (can incomplete results be resumed?)

### Questions Needing Answers

From architecture design:

```javascript
// From BACKEND_ARCHITECTURE.md Section 8:
// "Store result" ← WHERE?

// In-memory example:
const resultStore = {}; // Lost on restart!

// Database example:
await database.results.insert({ resultId, content }); // Survives restart

// Which is it? And why?
```

### Impact on Deployment

**If in-memory**:

- Cannot restart server during generation (results lost, clients see 404)
- Cannot load balance across multiple servers (results not shared)
- Simple, fast, no database dependency

**If database**:

- Server restart doesn't lose results
- Can load balance across servers (sticky sessions not required)
- Requires database connection (operational complexity)
- Slower (database I/O)

### Recommended Fix

**Priority**: Low (doesn't block current functionality, but important for scaling)

**Steps**:

1. Determine current implementation (grep for resultStore in code)
2. Document in BACKEND_ARCHITECTURE.md Section 8 (Database Integration)
3. If in-memory: Plan migration to database before scaling
4. If database: Document schema, TTL policy, cleanup strategy

### Timeline to Fix

- **Criticality**: Low (doesn't affect current behavior)
- **Effort**: 2-3 hours (determine + document + plan)
- **Recommendation**: Address as part of scaling/DevOps planning

---

## Issue #6: Rate-Limit User Experience [LOW]

### Current Behavior

BACKEND_ARCHITECTURE.md documents conservative 999-1000ms spacing between Gemini API calls:

```javascript
// Conservative spacing: 999-1000ms (4-10x safety factor)
async waitForSlot() {
  const timeSinceLastCall = now - this.lastCallTime;
  if (timeSinceLastCall < 999) {
    await sleep(1000 - timeSinceLastCall);
  }
  this.lastCallTime = Date.now();
}
```

**Effect on a 10-page ebook**:

```
Total spacing: 10 pages × 1 second = 10 extra seconds
Generation time: 52 seconds (without spacing)
Total time with spacing: ~62 seconds
```

### Problem

**User Perception**:

- 62 seconds feels slow (might cancel thinking it's hung)
- No visible indication why it's slow (client only sees "generating chapter 5" + ETA)
- Client doesn't know it's waiting for rate-limit (appears like server is slow)

**Technical Reality**:

- Spacing is necessary for API reliability
- Gemini has limits (Pro: 2 RPM = 30s min spacing, Flash: 15 RPM = 4s min spacing)
- 999ms is 4-10x safety factor (very conservative)
- Could probably use 100-500ms safely

### Questions Needing Answers

1. What's the actual Gemini rate-limit? (2 RPM or higher?)
2. Have we tested 100ms spacing? 500ms spacing?
3. How many consecutive failures before we hit actual rate-limit errors?
4. Is conservative spacing necessary or overly cautious?

### Recommended Fix

**Priority**: Low (works fine, but UX could be better)

**Steps**:

1. A/B test different spacing values (999ms, 500ms, 100ms)
2. Monitor error rates with each spacing
3. Find minimum safe spacing (no 429 errors)
4. Update BACKEND_ARCHITECTURE.md with data-backed decision
5. Consider exposing spacing to client in progress updates (explain delay)

### Timeline to Fix

- **Criticality**: Low (cosmetic, not blocking)
- **Effort**: 1-2 hours (A/B test + analysis)
- **Recommendation**: Nice-to-have for UX improvement

---

## Issue #7: (Placeholder) - Not Yet Discovered [TBD]

This space is reserved for issues that will likely emerge:

- Actual user feedback (testing feedback)
- Production issues discovered after deployment
- Performance issues under load
- Scaling/DevOps concerns

**Recommendation**: Monitor PR comments, bug reports, and production logs for emerging issues.

---

## Prioritization Matrix

| Issue                                | Severity | Effort | Impact                | Priority   |
| ------------------------------------ | -------- | ------ | --------------------- | ---------- |
| #1: Polling Network Error Resilience | HIGH     | 1-2h   | High (edge case)      | **HIGH**   |
| #2: Export 400 Error                 | MEDIUM   | 2-3h   | Medium (non-blocking) | **MEDIUM** |
| #3: Theme Application Timing         | MEDIUM   | 1h     | Low (clarity only)    | **MEDIUM** |
| #4: Error Contracts                  | MEDIUM   | 3-4h   | Medium (robustness)   | **MEDIUM** |
| #5: State Persistence                | LOW      | 2-3h   | Low (scaling only)    | **LOW**    |
| #6: Rate-Limit UX                    | LOW      | 1-2h   | Low (cosmetic)        | **LOW**    |

---

## Recommended Next Steps

### Phase 1 (This Sprint)

- [ ] Issue #1: Implement robust polling error recovery (Option A)
- [ ] Issue #2: Investigate and reproduce 400 error
- [ ] Issue #3: Clarify theme application timing in code review

### Phase 2 (Next Sprint)

- [ ] Issue #4: Define error contracts + implement error taxonomy
- [ ] Issue #5: Determine state persistence strategy

### Phase 3 (Nice-to-Have)

- [ ] Issue #6: A/B test rate-limit spacing

### Ongoing

- [ ] Issue #7: Monitor for emerging issues

---

## Related Documentation

See these documents for context:

- [ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md) - Patterns overview
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Section 7 (Error Handling)
- [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) - Section 4 (Error Handling & Recovery)
- [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md) - Section 6 (Error Propagation)
- [Light_3-page_AN.md](../Light_3-page_AN.md) - Production validation data

---

**Document Status**: Issues Identified (December 29, 2025)  
**Next Review**: After Phase 1 implementation  
**Owner**: Triage team  
**Stakeholders**: Backend team, frontend team, QA
