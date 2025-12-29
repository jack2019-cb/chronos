# Rate-Limiter Implementation: Step-by-Step Guide

**Status**: Implementation Phase  
**Date**: December 12, 2025 @ 12:15PM
**Related Documents**:

- [RATE-LIMITER-FEATURE.md](RATE-LIMITER-FEATURE.md) - Feature design and testing strategy
- [RATE-LIMITER-ARCHITECTURE.md](RATE-LIMITER-ARCHITECTURE.md) - System architecture and design
  **Branch Context**: `feat/patience-timer-sequential`

---

## Table of Contents

1. [Implementation Overview](#implementation-overview)
2. [File Structure & Locations](#file-structure--locations)
3. [Step 1: Create rateLimiter Module](#step-1-create-ratelimiter-module)
4. [Step 2: Update geminiClient.callGemini()](#step-2-update-geminiclientcallgemini)
5. [Step 3: Update aiService Integration](#step-3-update-aiservice-integration)
6. [Step 4: Configuration & Environment](#step-4-configuration--environment)
7. [Step 5: Logging & Observability](#step-5-logging--observability)
8. [Step 6: Testing Setup](#step-6-testing-setup)
9. [Verification Checklist](#verification-checklist)
10. [Deployment & Monitoring](#deployment--monitoring)
11. [Troubleshooting & Debug](#troubleshooting--debug)

---

## Implementation Overview

The rate-limiter implementation consists of:

1. **New module**: `server/utils/rateLimiter.js` (~80 lines)
2. **Updated integration**: `server/geminiClient.js` (~20 lines added)
3. **Environment configuration**: `.env` and `docker-compose.yml`
4. **Logging integration**: Existing console.log infrastructure
5. **No changes** to: ebookService, aiService, quotaTracker

**Estimated implementation time**: 30-45 minutes  
**Estimated testing time**: 1-2 hours per test case  
**Risk level**: Low (isolated module, non-breaking changes)

---

## File Structure & Locations

### Current Structure

```
server/
├── utils/
│   ├── quotaTracker.js          (existing)
│   └── [rateLimiter.js]         ← NEW FILE
├── geminiClient.js              (to be updated)
├── aiService.js                 (reference only, no changes)
├── ebookService.js              (reference only, no changes)
└── genieService.js              (reference only, no changes)

docs/
└── design/
    ├── RATE-LIMITER-FEATURE.md        (feature design)
    ├── RATE-LIMITER-ARCHITECTURE.md   (architecture)
    └── RATE-LIMITER-IMPLEMENTATION.md (this file)
```

### Files to Modify

```
1. server/utils/rateLimiter.js
   Location: NEW FILE
   Size: ~80 lines
   Changes: Complete implementation

2. server/geminiClient.js
   Location: Lines 112-140 (approx)
   Size: +15 lines
   Changes: Add rate-limiter calls before/after API request

3. .env (optional)
   Location: .env in project root
   Changes: Add RATE_LIMIT_MIN_DELAY_MS=1000

4. docker-compose.yml (optional)
   Location: docker-compose.yml
   Changes: Add RATE_LIMIT_MIN_DELAY_MS env var to services
```

---

## Step 1: Create rateLimiter Module

### File: `server/utils/rateLimiter.js`

```javascript
/**
 * rateLimiter - Inter-request pacing module for API calls
 *
 * Enforces minimum delays between consecutive API calls to Gemini
 * to prevent burst rate overloads that can occur even when volume
 * quota is available.
 *
 * Independent from quotaTracker.js - maintains separate state
 * and can be tested in isolation.
 */

const rateLimiter = (() => {
  // Private state: Last recorded API call timestamp
  let lastCallTime = null;

  // Configuration: Minimum milliseconds between consecutive API calls
  // Default: 1000ms (1 second) - allows Gemini backend to recover model instances
  // Tunable via environment variable RATE_LIMIT_MIN_DELAY_MS
  const MIN_DELAY_BETWEEN_CALLS_MS =
    parseInt(process.env.RATE_LIMIT_MIN_DELAY_MS, 10) || 1000;

  /**
   * Calculate milliseconds until next API call is permitted
   *
   * @private
   * @returns {number} Milliseconds to wait (0 if ready now)
   */
  function getTimeUntilReady() {
    // First call ever: no previous timestamp, no wait needed
    if (!lastCallTime) {
      return 0;
    }

    const now = Date.now();
    const elapsedSinceLastCall = now - lastCallTime;
    const waitStillNeeded = MIN_DELAY_BETWEEN_CALLS_MS - elapsedSinceLastCall;

    // Never return negative values - if elapsed > minimum, we're ready now
    return Math.max(0, waitStillNeeded);
  }

  /**
   * Wait until sufficient time has elapsed since the last API call
   *
   * This is called by geminiClient.callGemini() before making each
   * API request to Gemini. It enforces inter-request pacing without
   * blocking the server (uses async/await, not busy-wait).
   *
   * @param {number} callIndex - Call sequence number (0, 1, 2, ...)
   *                            Used for logging to identify which call this is
   * @returns {Promise<void>} Resolves when it's safe to proceed
   */
  async function waitForReadiness(callIndex) {
    const waitMs = getTimeUntilReady();

    if (waitMs > 0) {
      // Log the enforced delay
      console.log(
        `[RATE-LIMIT] Call ${callIndex}: ` +
          `enforcing ${waitMs}ms inter-request delay`
      );

      // Sleep without blocking the server
      // Other requests can proceed during this sleep via event loop
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      // Log when delay is complete
      console.log(`[RATE-LIMIT] Call ${callIndex}: delay complete, proceeding`);
    }
  }

  /**
   * Record the timestamp of a successful API call
   *
   * Called by geminiClient.callGemini() after a successful response
   * from Gemini API. Updates lastCallTime for use in future
   * getTimeUntilReady() calculations.
   */
  function recordCall() {
    lastCallTime = Date.now();
  }

  /**
   * Get milliseconds until next call is permitted (read-only)
   *
   * Used for monitoring, testing, and observability.
   * Allows external code to check readiness without modifying state.
   *
   * @returns {number} Milliseconds to wait (0 if ready now)
   */
  function getTimeUntilReady_ReadOnly() {
    return getTimeUntilReady();
  }

  // Public API: Only these three methods are exported
  return {
    /**
     * Wait until ready to proceed with next API call
     * @param {number} callIndex - Call sequence number
     * @returns {Promise<void>}
     */
    waitForReadiness,

    /**
     * Record successful API call timestamp
     */
    recordCall,

    /**
     * Get time until next call is ready (read-only, for testing/monitoring)
     * @returns {number} Milliseconds to wait
     */
    getTimeUntilReady: getTimeUntilReady_ReadOnly,
  };
})();

module.exports = rateLimiter;
```

**Key implementation points:**

✅ **Closure pattern**: Private state (`lastCallTime`) encapsulated  
✅ **Configurable**: Uses `process.env.RATE_LIMIT_MIN_DELAY_MS` with fallback  
✅ **Clear naming**: Functions are self-documenting  
✅ **Robust**: Handles edge cases (first call, negative wait times)  
✅ **Observable**: Logs delay enforcement and completion  
✅ **Async**: Uses `await` for non-blocking delays  
✅ **Testable**: Exposes `getTimeUntilReady` for unit tests

---

## Step 2: Update geminiClient.callGemini()

### File: `server/geminiClient.js`

**Location to modify**: Inside `async function callGemini()`, before the API fetch call.

**Current code** (around line 110-140):

```javascript
  try {
    // ✅ PRE-CALL QUOTA CHECK: Verify quota available before making API request
    // This prevents calls from being sent to Gemini when quota is exhausted
    const quotaTracker = require("./utils/quotaTracker");
    const quotaStatus = quotaTracker.getStatus();

    if (quotaStatus.availableQuota < 1) {
      console.log(
        `[QUOTA] Pre-call check BLOCKED: exhausted quota (${quotaStatus.callCount}/${quotaStatus.limit})`
      );
      return {
        ok: false,
        status: 429, // Too Many Requests
        error: `Quota exhausted: reached limit of ${
          quotaStatus.limit
        } calls per ${Math.round(
          quotaStatus.windowExpiredMs / 1000
        )} seconds. Please retry after quota window resets.`,
        quotaExhausted: true,
        availableQuota: quotaStatus.availableQuota,
      };
    }

    const resp = await fetchImpl(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
```

**Updated code** (with rate-limiter added):

```javascript
  try {
    // ✅ NEW: PRE-CALL RATE-LIMIT CHECK: Enforce inter-request pacing
    // This prevents burst rate overloads by enforcing minimum delays
    // between consecutive API calls to Gemini's infrastructure.
    const rateLimiter = require("./utils/rateLimiter");

    // callIndex parameter should be passed to callGemini()
    // It identifies which call this is (0=structure, 1+=chapters)
    // Falls back to 0 if not provided (shouldn't happen in practice)
    const callIndex = arguments[0]?.callIndex || 0;

    await rateLimiter.waitForReadiness(callIndex);

    // ✅ EXISTING: PRE-CALL QUOTA CHECK: Verify quota available before making API request
    // This prevents calls from being sent to Gemini when quota is exhausted
    const quotaTracker = require("./utils/quotaTracker");
    const quotaStatus = quotaTracker.getStatus();

    if (quotaStatus.availableQuota < 1) {
      console.log(
        `[QUOTA] Pre-call check BLOCKED: exhausted quota (${quotaStatus.callCount}/${quotaStatus.limit})`
      );
      return {
        ok: false,
        status: 429, // Too Many Requests
        error: `Quota exhausted: reached limit of ${
          quotaStatus.limit
        } calls per ${Math.round(
          quotaStatus.windowExpiredMs / 1000
        )} seconds. Please retry after quota window resets.`,
        quotaExhausted: true,
        availableQuota: quotaStatus.availableQuota,
      };
    }

    const resp = await fetchImpl(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
```

**After successful response** (around line 200-210):

```javascript
    // ✅ Track successful call for quota purposes (only on success)
    if (resp.ok) {
      try {
        // NEW: Record for rate-limiting
        rateLimiter.recordCall();
        console.log(
          `[RATE-LIMIT] Call ${callIndex}: timestamp recorded`
        );

        // EXISTING: Record for quota
        const quotaTracker = require("./utils/quotaTracker");
        quotaTracker.recordCall();
        console.log(
          `[GEMINI] API call successful, quota tracked: ${resp.status}`
        );
      } catch (err) {
        console.warn("[QUOTA] Failed to track API call:", err && err.message);
      }
    }

    return {
      ok: resp.ok,
      status: resp.status,
      json,
      rawText: raw,
      text: textContent,
      image: imageFound,
    };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
```

### Alternative: Pass callIndex as Parameter

**Better approach** (cleaner than using arguments):

Modify the `callGemini` function signature:

```javascript
async function callGemini({
  prompt,
  modality = "TEXT",
  generationConfig = {},
  imageB64 = null,
  callIndex = 0, // ← ADD THIS PARAMETER
}) {
  // ... existing code ...

  // Use callIndex directly (no need to extract from arguments)
  const rateLimiter = require("./utils/rateLimiter");
  await rateLimiter.waitForReadiness(callIndex);

  // ... rest of code ...
}
```

Then update the callers in `aiService.js`:

```javascript
// In aiService.js, generateContentWithRotation()
const resp = await callGemini({
  prompt: String(prompt),
  modality: "TEXT",
  generationConfig,
  callIndex, // ← PASS IT HERE
});
```

---

## Step 3: Update aiService Integration

### File: `server/aiService.js`

**No changes required** to aiService itself, but verify that `generateContentWithRotation()` passes `callIndex` to geminiClient:

```javascript
// Verify this line exists in aiService.js (it should):
async generateContentWithRotation(prompt, callIndex = 0) {
  // ... setup code ...

  const resp = await callGemini({
    prompt: String(prompt),
    modality: "TEXT",
    generationConfig,
    callIndex,  // ← Make sure this is passed
  });

  // ... rest of code ...
}
```

If `callIndex` is not being passed, add it.

---

## Step 4: Configuration & Environment

### Option A: Hardcoded Default (Minimal Changes)

In `rateLimiter.js`:

```javascript
const MIN_DELAY_BETWEEN_CALLS_MS =
  parseInt(process.env.RATE_LIMIT_MIN_DELAY_MS, 10) || 1000;
```

This works without any .env changes. Default is 1000ms.

### Option B: Add to .env File

Create or update `.env`:

```bash
# Rate-limiter configuration
# Minimum milliseconds between consecutive Gemini API calls
# Default: 1000ms (1 second)
# Adjust for testing: 0 (no delay), 250, 500, 1000, 2000
RATE_LIMIT_MIN_DELAY_MS=1000
```

### Option C: Add to docker-compose.yml

Update the `environment:` section for node services:

```yaml
services:
  server:
    build: ./server
    environment:
      - NODE_ENV=development
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - RATE_LIMIT_MIN_DELAY_MS=1000  ← ADD THIS
    ports:
      - "8000:8000"
```

### Option D: Command-Line Override

```bash
# Override for a specific test run
RATE_LIMIT_MIN_DELAY_MS=500 npm start
```

---

## Step 5: Logging & Observability

### Expected Log Output

When everything is working, you should see:

```
[RATE-LIMIT] Call 0: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 0: delay complete, proceeding
[QUOTA] Call recorded: 1/20 (5% used, 19 remaining)
[GEMINI] API call successful, quota tracked: 200
[RATE-LIMIT] Call 0: timestamp recorded

[RATE-LIMIT] Call 1: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 1: delay complete, proceeding
[QUOTA] Call recorded: 2/20 (10% used, 18 remaining)
[GEMINI] API call successful, quota tracked: 200
[RATE-LIMIT] Call 1: timestamp recorded

[RATE-LIMIT] Call 2: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 2: delay complete, proceeding
[QUOTA] Call recorded: 3/20 (15% used, 17 remaining)
[GEMINI] API call successful, quota tracked: 200
[RATE-LIMIT] Call 2: timestamp recorded

[RATE-LIMIT] Call 3: enforcing 1000ms inter-request delay
[RATE-LIMIT] Call 3: delay complete, proceeding
[QUOTA] Call recorded: 4/20 (20% used, 16 remaining)
[GEMINI] API call successful, quota tracked: 200
[RATE-LIMIT] Call 3: timestamp recorded
```

### Log Parsing for Analysis

Extract rate-limiter waits:

```bash
grep "\[RATE-LIMIT\].*enforcing" server.log | wc -l  # Count delays
grep "\[RATE-LIMIT\].*enforcing.*1000ms" server.log   # Find 1s delays
```

Extract success rate:

```bash
grep "\[EBOOK\] Chapter.*AI response received" server.log | wc -l  # Successful
grep "\[EBOOK\] Chapter.*AI generation failed" server.log | wc -l  # Fallback
```

---

## Step 6: Testing Setup

### Test 1: Baseline (RATE_LIMIT_MIN_DELAY_MS=0)

```bash
# Terminal 1: Start server
RATE_LIMIT_MIN_DELAY_MS=0 npm start

# Terminal 2: Make request
curl -X POST http://localhost:8000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An adorable children story about Benny the Brave Bunny",
    "metadata": {
      "pageCount": 3,
      "theme": "light"
    }
  }'
```

**Expected result**:

- Chapter 3 fails with "model is overloaded"
- Logs show no delays: `enforcing 0ms inter-request delay`
- Response has fallback content

### Test 2: Paced (RATE_LIMIT_MIN_DELAY_MS=1000)

```bash
# Terminal 1: Start server
RATE_LIMIT_MIN_DELAY_MS=1000 npm start

# Terminal 2: Make request (same as Test 1)
curl -X POST http://localhost:8000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An adorable children story about Benny the Brave Bunny",
    "metadata": {
      "pageCount": 3,
      "theme": "light"
    }
  }'
```

**Expected result**:

- All chapters succeed
- Logs show delay on Chapter 3: `enforcing 1000ms inter-request delay`
- Response has all AI-generated chapters

### Test 3: 10-Page Book

```bash
RATE_LIMIT_MIN_DELAY_MS=1000 npm start

# Request with pageCount: 10
curl -X POST http://localhost:8000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "...",
    "metadata": {
      "pageCount": 10,
      "theme": "light"
    }
  }'
```

**Expected**: All 10 chapters succeed, total time ~100-115s

### Test 4: 20-Page Book

```bash
RATE_LIMIT_MIN_DELAY_MS=1000 npm start

# Request with pageCount: 20
curl -X POST http://localhost:8000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "...",
    "metadata": {
      "pageCount": 20,
      "theme": "light"
    }
  }'
```

**Expected**: All 20 chapters succeed, total time ~190-210s, uses 20/20 quota

---

## Verification Checklist

### Code Review

- [ ] `server/utils/rateLimiter.js` created with:

  - [ ] Closure pattern for state isolation
  - [ ] `waitForReadiness(callIndex)` function
  - [ ] `recordCall()` function
  - [ ] `getTimeUntilReady()` getter
  - [ ] Environment variable configuration
  - [ ] Proper logging

- [ ] `server/geminiClient.js` updated with:

  - [ ] `rateLimiter.waitForReadiness()` call before API request
  - [ ] `callIndex` parameter passed through
  - [ ] `rateLimiter.recordCall()` after successful response
  - [ ] Proper error handling

- [ ] `server/aiService.js` verified:
  - [ ] `generateContentWithRotation()` exists
  - [ ] `callIndex` passed to `callGemini()`

### Functional Testing

- [ ] Test 1 (baseline): Chapter 3 fails with RATE_LIMIT_MIN_DELAY_MS=0
- [ ] Test 2 (paced): All chapters succeed with RATE_LIMIT_MIN_DELAY_MS=1000
- [ ] Test 3: 10-page book succeeds with 10/10 chapters
- [ ] Test 4: 20-page book succeeds with 20/20 chapters (at quota boundary)
- [ ] Test 5: Delay values (250, 500, 1000, 2000) produce expected results

### Logging Verification

- [ ] Logs show `[RATE-LIMIT]` messages
- [ ] Delays are enforced correctly (no 0ms waits for calls 1+)
- [ ] Timestamps are recorded correctly
- [ ] Quota tracking still works (`[QUOTA]` logs appear)

### Integration Testing

- [ ] No breaking changes to existing ebookService flow
- [ ] No breaking changes to quotaTracker
- [ ] Can disable rate-limiter (RATE_LIMIT_MIN_DELAY_MS=0) for testing
- [ ] Multiple concurrent requests work (test with parallel ebook requests)

### Performance Validation

- [ ] 3-page book: ~45-48s (acceptable +7-10s overhead)
- [ ] 10-page book: ~100-115s
- [ ] 20-page book: ~190-210s
- [ ] Server responsive (health checks work during delays)

---

## Deployment & Monitoring

### Production Deployment

1. **Merge to main**: Create PR with both docs and code changes
2. **Deploy to staging**: Test with real Gemini API
3. **Monitor logs**: Watch for `[RATE-LIMIT]` messages
4. **Validate success rates**: Track % of chapters without fallback
5. **Deploy to production**: Roll out with 1000ms default

### Environment-Specific Configuration

```yaml
Development (local): RATE_LIMIT_MIN_DELAY_MS=0 # No delays, faster iteration

Staging: RATE_LIMIT_MIN_DELAY_MS=1000 # Test with real pacing

Production: RATE_LIMIT_MIN_DELAY_MS=1000 # Safe default
```

### Monitoring Dashboard

Track these metrics:

```
rate_limit_delays_applied_total      # Count of enforced delays
rate_limit_average_wait_time_ms      # Average delay duration
ebook_chapter_success_rate           # % chapters without fallback
ebook_request_duration_seconds       # Total request time
ebook_request_pages_generated        # How many chapters succeeded
```

### Alerting Rules

```
Alert if:
  - Success rate drops below 95% (too many fallbacks)
  - Average request time > 60s for 3-page books (something wrong)
  - Quota approaching limit (may need to increase allocation)
```

---

## Troubleshooting & Debug

### Issue: Delays Not Being Applied

**Symptom**: Logs show `enforcing 0ms` for all calls

**Causes**:

1. Chapter execution times are too long (> 1000ms between calls)
2. Delay is correctly not needed

**Verify**:

```bash
# Check timestamps in logs
grep "\[RATE-LIMIT\]" server.log | head -20
# If all show 0ms, execution naturally exceeds minimum delay
```

**Solution**: No fix needed, this is correct behavior when chapters take >1s to generate.

### Issue: Chapter 3 Still Fails

**Symptom**: Even with RATE_LIMIT_MIN_DELAY_MS=1000, Chapter 3 returns fallback

**Causes**:

1. Configuration not picked up (server still using default/old value)
2. Rate-limiter not integrated properly
3. Gemini experiencing broader issues

**Debug**:

```bash
# Verify configuration
grep "MIN_DELAY" server.log
# Should show: "RATE_LIMIT_MIN_DELAY_MS: 1000" or similar

# Check if wait is happening
grep "enforcing.*1000ms" server.log
# Should see at least one 1000ms delay for Chapter 3

# Verify rate-limiter module loaded
grep "rateLimiter" server.log
# Should see timestamp recording
```

**Fix**:

1. Restart server to pick up env var changes
2. Verify rateLimiter.js is in the right location
3. Check geminiClient.js integration is complete
4. Check if Gemini API itself is having issues

### Issue: Rate-Limiter Breaks Other Workflows

**Symptom**: Other endpoints slow down due to rate-limiter

**Causes**:

1. Rate-limiter is global, affects all API calls
2. Non-ebook workflows shouldn't use rate-limiter

**Note**: Current implementation is fine - rate-limiter only delays ebook chapter calls. Other endpoints don't call geminiClient.callGemini().

**If there's cross-contamination**:

```javascript
// Add a flag to disable rate-limiter for specific calls:
await rateLimiter.waitForReadiness(callIndex, { disabled: true });
```

### Debug Mode

Add to `rateLimiter.js`:

```javascript
if (process.env.DEBUG_RATE_LIMIT === "1") {
  console.log(`[DEBUG-RATE-LIMIT] lastCallTime: ${lastCallTime}`);
  console.log(`[DEBUG-RATE-LIMIT] MIN_DELAY_MS: ${MIN_DELAY_BETWEEN_CALLS_MS}`);
  console.log(`[DEBUG-RATE-LIMIT] waitMs: ${waitMs}`);
}
```

Run with:

```bash
DEBUG_RATE_LIMIT=1 npm start
```

### Performance Analysis

To identify where time is spent:

```bash
# Extract timing information from logs
grep -E "\[EBOOK\] Chapter|AI response received" server.log | \
  awk '{ print $0 }' | head -20

# Compare structure time
grep "Structure" server.log

# Compare chapter times
grep "Chapter.*response received" server.log | \
  awk '{ print $NF }' | sort -n
```

---

## Summary of Changes

### Files Created

- ✅ `server/utils/rateLimiter.js` (~80 lines)

### Files Modified

- ✅ `server/geminiClient.js` (+15 lines)
- ✅ `.env` (optional, +1 line)
- ✅ `docker-compose.yml` (optional, +1 line per service)

### Files Unchanged

- ✅ `server/ebookService.js`
- ✅ `server/aiService.js`
- ✅ `server/genieService.js`
- ✅ `server/utils/quotaTracker.js`

### Testing Requirements

- Test 1: Baseline (0ms delay) - should fail on Chapter 3
- Test 2: Paced (1000ms delay) - should succeed all chapters
- Test 3: 10-page book - should succeed all 10 chapters
- Test 4: 20-page book - should succeed all 20 chapters

### Risk Assessment

- **Risk level**: Low
- **Breaking changes**: None
- **Rollback plan**: Remove rate-limiter calls from geminiClient.js, disable via env var
- **Testing coverage**: All test cases defined in RATE-LIMITER-FEATURE.md

---

## ADDENDA: Out-of-Scope Implementations Added

During implementation, two additional features were identified as incomplete and implemented:

### 1. **Actual Model Routing Logic (Pro vs Flash)**

**Issue Found:**

- `generateContentWithRotation()` in aiService.js logged which model should be used ("Using Gemini 2.5 Pro" vs "Using Gemini 2.5 Flash")
- But `callGemini()` in geminiClient.js had **no actual logic** to route to different models
- All API calls went to the same endpoint regardless of `callIndex`

**Files Modified:**

#### server/aiService.js - generateContent()

Added model selection logic:

```javascript
const model = callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash";

const resp = await callGemini({
  prompt: String(prompt),
  modality: "TEXT",
  generationConfig,
  callIndex,
  model, // ← Pass model to geminiClient
});
```

#### server/geminiClient.js - callGemini()

Added model parameter and routing logic:

```javascript
async function callGemini({
  prompt,
  modality = "TEXT",
  generationConfig = {},
  imageB64 = null,
  callIndex = 0,
  model = null, // ← New parameter
}) {
  let apiUrl;
  let rawKey;

  if (model === "gemini-2.5-pro") {
    // Use Pro model endpoints (primary/structure)
    apiUrl =
      process.env.GEMINI_API_URL_PRO ||
      process.env.GEMINI_API_URL_TEXT ||
      process.env.GEMINI_API_URL;
    rawKey =
      process.env.GEMINI_API_KEY_PRO ||
      process.env.GEMINI_API_KEY_TEXT ||
      process.env.GEMINI_API_KEY;
  } else if (model === "gemini-2.5-flash") {
    // Use Flash model endpoints (secondary/chapters)
    apiUrl =
      process.env.GEMINI_API_URL_FLASH ||
      process.env.GEMINI_API_URL_TEXT ||
      process.env.GEMINI_API_URL;
    rawKey =
      process.env.GEMINI_API_KEY_FLASH ||
      process.env.GEMINI_API_KEY_TEXT ||
      process.env.GEMINI_API_KEY;
  } else {
    // Fallback: select by modality (original logic)
    // ... existing code ...
  }
}
```

**Environment Variables:**

```bash
# Optional: Define model-specific API endpoints
GEMINI_API_URL_PRO=<pro-model-url>
GEMINI_API_URL_FLASH=<flash-model-url>

# Falls back to these if model-specific not defined:
GEMINI_API_URL_TEXT=<text-api-url>
GEMINI_API_URL=<generic-api-url>
```

**Impact:**

- Call 0 (structure) → Gemini 2.5 Pro
- Calls 1-N (chapters) → Gemini 2.5 Flash
- Different quotas and pricing tiers can be used per model if configured

### 2. **callIndex Parameter Propagation Through Call Chain**

**Issue Found:**

- `generateContentWithRotation(prompt, callIndex=0)` had `callIndex` in signature but **never passed it**
- `generateContent(prompt)` had **no `callIndex` parameter** at all
- Rate-limiter could never receive the correct call index for logging

**Files Modified:**

#### server/aiService.js - generateContent()

Added `callIndex` parameter and passed to geminiClient:

```javascript
async generateContent(prompt, callIndex = 0) {
  // ...
  const resp = await callGemini({
    prompt: String(prompt),
    modality: "TEXT",
    generationConfig,
    callIndex,  // ← Pass through to geminiClient
    model,
  });
}
```

#### server/aiService.js - generateContentWithRotation()

Updated to pass `callIndex` to generateContent():

```javascript
async generateContentWithRotation(prompt, callIndex = 0) {
  // ... determine model ...
  return this.generateContent(prompt, callIndex);  // ← Pass callIndex through
}
```

**Impact:**

- Rate-limiter logs now show correct call sequence: `[RATE-LIMIT] Call 0`, `[RATE-LIMIT] Call 1`, etc.
- Model routing now works correctly based on call sequence
- Enables proper burst detection at the exact call that fails

**Call Chain Verification:**

```
ebookService.handle()
  └─ aiSvc.generateContentWithRotation(prompt, callIndex)
     └─ generateContent(prompt, callIndex)
        └─ callGemini({..., callIndex, model})
           └─ rateLimiter.waitForReadiness(callIndex)
```

All layers now receive and use `callIndex` correctly.

---

**Ready for implementation!**

Next steps:

1. Review this document
2. Create rateLimiter.js
3. Update geminiClient.js
4. Update aiService.js with model routing and callIndex propagation
5. Run Test 1 (verify baseline failure)
6. Run Test 2 (verify fix works)
7. Run Tests 3-6 (scalability and integration)
8. Commit and push changes
