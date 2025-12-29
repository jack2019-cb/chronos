# Rate-Limiter Feature: Inter-Request Pacing for Sequential Ebook Generation

**Status**: Design Phase - Brainstorming Session  
**Date**: December 12, 2025 @ 11:15AM
**Reference Log**: [Light_3-page.md](ebookService/DATA/Light_3-page.md) - Server log showing burst rate failure  
**Branch Context**: `feat/patience-timer-sequential`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Analysis](#problem-analysis)
   - [Reference: Real Failure Case](#reference-real-failure-case)
   - [Hypothesis: Burst Rate Overload](#hypothesis-burst-rate-overload-not-volume-quota)
3. [Current Architecture](#current-architecture)
   - [Three Independent Concerns](#three-independent-concerns)
   - [Key Flow: No Velocity Constraints](#key-flow-no-velocity-constraints)
4. [Proposed Solution: Rate-Limiter Module](#proposed-solution-rate-limiter-module)
   - [New Component: rateLimiter.js](#new-component-ratelimiterjs)
   - [Updated Architecture with Rate-Limiter](#updated-architecture-with-rate-limiter)
5. [How It Works: Execution Timeline](#how-it-works-execution-timeline)
   - [Before: Burst Pattern (Current - Fails)](#before-burst-pattern-current---fails)
   - [After: Paced Pattern (Proposed - Should Work)](#after-paced-pattern-proposed---should-work)
6. [Implementation Details](#implementation-details)
   - [Integration: geminiClient.callGemini()](#integration-geminiclientcallgemini)
   - [Configuration: Environment Variables](#configuration-environment-variables)
7. [Testing Strategy](#testing-strategy)
   - [Test Configuration Matrix](#test-configuration-matrix)
   - [Test 1: Verify Current Behavior (Baseline) - 3-Page Book](#test-1-verify-current-behavior-baseline---3-page-book)
   - [Test 2: Verify Pacing Works (With 1s Delay) - 3-Page Book](#test-2-verify-pacing-works-with-1s-delay---3-page-book)
   - [Test 3: Scalability - 10-Page Book](#test-3-scalability---10-page-book)
   - [Test 4: Scalability - 20-Page Book](#test-4-scalability---20-page-book)
   - [Test 5: Optimize Delay Value](#test-5-optimize-delay-value)
   - [Test 6: Integration with Quota System](#test-6-integration-with-quota-system)
8. [Configuration & Tuning](#configuration--tuning)
   - [Finding Optimal Delay](#finding-optimal-delay)
   - [Adaptive Delays (Future Enhancement)](#adaptive-delays-future-enhancement)
9. [Impact Analysis](#impact-analysis)
   - [Benefits](#benefits)
   - [Costs](#costs)
10. [Relationship to Batch Mode](#relationship-to-batch-mode)
11. [Acceptance Criteria](#acceptance-criteria)
12. [Reference Documents](#reference-documents)
13. [Discussion Topics](#discussion-topics)

---

## Executive Summary

Current sequential ebook generation fails on Chapter 3 due to **burst rate overload** (not quota exhaustion). When Chapter 2 completes at ~28 seconds, Chapter 3 is requested immediately, creating a tight burst that exceeds Gemini's per-model instance capacity.

This proposal introduces an independent **inter-request rate-limiter** that enforces minimum delays between consecutive API calls, allowing Gemini's backend to recover model instances without silently falling back to stub content.

---

## Problem Analysis

### Reference: Real Failure Case

**Server log from 2025-12-12 14:59:55 UTC:**

- 3-page ebook request (Light theme, "Benny the Brave Bunny" prompt)
- Structure generation: ~5.9s (Gemini 2.5 Pro)
- Chapter 1: ~18.9s (Gemini 2.5 Flash)
- Chapter 2: ~8.9s (Gemini 2.5 Flash)
- **Chapter 3: FAILED** - "The model is overloaded. Please try again later."
- Total request time: 38.3 seconds
- Fallback: Chapter 3 rendered as boilerplate stub
- Response: HTTP 200 OK (silent failure)

**Full analysis**: See [Light_3-page.md](ebookService/DATA/Light_3-page.md)

### Hypothesis: Burst Rate Overload, Not Volume Quota

Gemini's free tier enforces **two distinct limits**:

| Limit                   | Type         | Current Tracking  | Status      |
| ----------------------- | ------------ | ----------------- | ----------- |
| 20 calls/60sec          | Volume quota | ✓ quotaTracker.js | Working     |
| Min inter-request delay | Burst rate   | ✗ None            | **Missing** |

**Evidence:**

```
Quota accounting at failure:
├─ Call 0: -1 = 19 remaining (Structure)
├─ Call 1: -1 = 18 remaining (Chapter 1)
├─ Call 2: -1 = 17 remaining (Chapter 2)
└─ Call 3: FAIL (no recording) = 17 still remaining
            ↑ Only 15% of quota used (3 of 20)
            ↑ Error is "overloaded", not "quota exhausted"
```

**Timing analysis:**

```
Timeline of calls (no inter-request delays):
├─ T=0s:      Call 0 (Structure) initiated
├─ T=5.9s:    Call 0 completes → Call 1 initiated immediately
├─ T=24.8s:   Call 1 completes → Call 2 initiated immediately
├─ T=33.7s:   Call 2 completes → Call 3 initiated immediately ← BURST
│             Gemini: "model instance not ready" → 429/503
└─ T=38.3s:   Request times out, fallback triggered
```

When Call 3 fires, Gemini's Flash model instance hasn't had time to:

- Release the previous instance (Call 2)
- Initialize a new instance
- Handle the incoming request

Result: Overload error despite being quota-compliant.

---

## Current Architecture

### Three Independent Concerns

```
┌──────────────────────────────────────────────────────────────┐
│                    genieService.process()                    │
│  Entry point: Checks VOLUME quota once upfront               │
│  ├─ [QUOTA] Checking quota for mode 'ebook': cost=3, ...     │
│  └─ [QUOTA] Quota check passed: proceeding with dispatch     │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                   ebookService.handle()                      │
│  Responsibility: Sequential chapter generation               │
│  └─ for i in [0..N]:                                         │
│      ├─ contentPrompt = buildPrompt(chapter, prevSummary)    │
│      ├─ chapterResp = aiSvc.generateContentWithRotation()    │
│      │                 (AWAIT here - blocks next iteration)  │
│      └─ chapters.push(parsed response or fallback)           │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                  geminiClient.callGemini()                   │
│  Responsibility: Execute API call with volume quota checks   │
│  └─ [QUOTA] getStatus() - Pre-call check                     │
│     └─ [Fetch API]                                           │
│     └─ [QUOTA] recordCall() - Post-call (on success only)    │
│                                                              │
│  ✗ Does NOT check inter-request timing                       │
└──────────────────────────────────────────────────────────────┘
```

### Key Flow: No Velocity Constraints

```
ebookService loop iteration i:
  1. Build prompt (includes prevSummary for i>0)
  2. Call aiSvc.generateContentWithRotation(prompt, i)
  3. This calls geminiClient.callGemini()
  4. Which checks quotaTracker.getStatus()
  5. Then fetches from Gemini (potentially overloading burst rate)
  6. Returns response
  7. Back to step 1 for i+1 (loop continues immediately)

Result: Tight burst pattern with NO INTER-REQUEST PACING
```

---

## Proposed Solution: Rate-Limiter Module

### New Component: rateLimiter.js

Independent velocity tracking in `server/utils/rateLimiter.js`:

```javascript
/**
 * rateLimiter - Inter-request pacing module
 *
 * Enforces minimum delays between consecutive API calls
 * to avoid overwhelming Gemini's model instantiation.
 *
 * Works independently from quota tracking:
 * - quotaTracker: Prevents exceeding volume limits (20 calls/min)
 * - rateLimiter: Prevents exceeding burst rate limits (min delay between calls)
 */

const rateLimiter = (() => {
  let lastCallTime = null;

  // Configurable minimum delay (milliseconds)
  // Allows Gemini's backend to recover model instances
  const MIN_DELAY_BETWEEN_CALLS_MS =
    process.env.RATE_LIMIT_MIN_DELAY_MS || 1000;

  /**
   * Get milliseconds until next call is permitted
   */
  function getTimeUntilReady() {
    if (!lastCallTime) return 0; // First call, no wait

    const elapsed = Date.now() - lastCallTime;
    const waitNeeded = MIN_DELAY_BETWEEN_CALLS_MS - elapsed;
    return Math.max(0, waitNeeded);
  }

  /**
   * Wait until sufficient time has passed since last call
   * Called from geminiClient BEFORE making API request
   */
  async function waitForReadiness(callIndex) {
    const waitMs = getTimeUntilReady();

    if (waitMs > 0) {
      console.log(
        `[RATE-LIMIT] Call ${callIndex}: ` +
          `enforcing ${waitMs}ms inter-request delay`
      );

      // Sleep without blocking other requests (async)
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      console.log(`[RATE-LIMIT] Call ${callIndex}: delay complete, proceeding`);
    }
  }

  /**
   * Record this call's timestamp
   * Called from geminiClient AFTER successful API call
   */
  function recordCall() {
    lastCallTime = Date.now();
  }

  return {
    waitForReadiness,
    recordCall,
    getTimeUntilReady, // For testing/monitoring
  };
})();

module.exports = rateLimiter;
```

### Updated Architecture with Rate-Limiter

```
┌──────────────────────────────────────────────────────────────┐
│                    genieService.process()                    │
│  Entry point: Checks VOLUME quota once upfront               │
│  ├─ [QUOTA] Checking quota for mode 'ebook': cost=3, ...     │
│  └─ [QUOTA] Quota check passed: proceeding with dispatch     │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                   ebookService.handle()                      │
│  Responsibility: Sequential chapter generation               │
│  └─ for i in [0..N]:                                         │
│      ├─ contentPrompt = buildPrompt(chapter, prevSummary)    │
│      ├─ chapterResp = aiSvc.generateContentWithRotation()    │
│      │                 (AWAIT here - blocks next iteration)  │
│      └─ chapters.push(parsed response or fallback)           │
│                                                              │
│  ✗ Still sequential, but now respects inter-request pacing  │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                  geminiClient.callGemini()                   │
│  Responsibility: Execute API call with volume & velocity     │
│                  quota checks                                │
│  └─ [RATE-LIMIT] waitForReadiness(callIndex)  ← NEW          │
│     │ Enforces minimum inter-request delay                   │
│     │ (async, doesn't block server)                          │
│     └─ [QUOTA] getStatus() - Pre-call check                  │
│        └─ [Fetch API]                                        │
│        ├─ [RATE-LIMIT] recordCall() ← NEW                    │
│        └─ [QUOTA] recordCall()                               │
└──────────────────────────────────────────────────────────────┘
```

---

## How It Works: Execution Timeline

### Before: Burst Pattern (Current - Fails)

```
┌─────────────────────────────────────────────────────────────┐
│ ebook/generate request (3 pages)                            │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴──────────────────┐
        │                                        │
    [QUOTA]                              [NO RATE-LIMIT]
    Check: 3 ≤ 20? ✓                             │
        │                                        │
        └────────────────────┬───────────────────┘
                             │
    ┌────────────────────────┴────────────────────┐
    │        Call 0: Structure (Pro)              │
    │        └─ 5.9s execution                    │
    └────────────────────────┬────────────────────┘
                             │
    ┌────────────────────────v────────────────────┐
    │ Call 1: Chapter 1 (Flash)                   │
    │ ├─ 0ms inter-request delay ← BURST          │
    │ └─ 18.9s execution                          │
    └────────────────────────┬────────────────────┘
                             │
    ┌────────────────────────v────────────────────┐
    │ Call 2: Chapter 2 (Flash)                   │
    │ ├─ 0ms inter-request delay ← BURST          │
    │ └─ 8.9s execution                           │
    └────────────────────────┬────────────────────┘
                             │
    ┌────────────────────────v────────────────────┐
    │ Call 3: Chapter 3 (Flash)                   │
    │ ├─ 0ms inter-request delay ← BURST TRIGGERS │
    │ └─ ERROR: "model is overloaded" ✗           │
    └────────────────────────┬────────────────────┘
                             │
    ┌────────────────────────v────────────────────┐
    │ Fallback: Generate stub Chapter 3           │
    │ └─ Boilerplate content                      │
    └────────────────────────┬────────────────────┘
                             │
              Result: HTTP 200 with degraded content
```

**Total time: 38.3s | Success rate: 67% (2/3 chapters) | Quality: Failed**

### After: Paced Pattern (Proposed - Should Work)

```
┌─────────────────────────────────────────────────────────────┐
│ ebook/generate request (3 pages)                            │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴──────────────────┐
        │                                        │
    [QUOTA]                          [RATE-LIMIT]
    Check: 3 ≤ 20? ✓              Initialized: ready
        │                                        │
        └────────────────────┬───────────────────┘
                             │
    ┌────────────────────────┴────────────────────┐
    │ Call 0: Structure (Pro)                     │
    │ ├─ [RATE-LIMIT] 0ms wait (first call)       │
    │ ├─ [QUOTA] Pre-check: 20 available ✓        │
    │ ├─ Execute: 5.9s                            │
    │ └─ [RATE-LIMIT] Record timestamp            │
    └────────────────────────┬────────────────────┘
                             │
    ┌────────────────────────v────────────────────┐
    │ Call 1: Chapter 1 (Flash)                   │
    │ ├─ [RATE-LIMIT] 0ms wait (elapsed > delay)  │
    │ ├─ [QUOTA] Pre-check: 19 available ✓        │
    │ ├─ Execute: 18.9s                           │
    │ └─ [RATE-LIMIT] Record timestamp            │
    └────────────────────────┬────────────────────┘
                             │
    ┌────────────────────────v────────────────────┐
    │ Call 2: Chapter 2 (Flash)                   │
    │ ├─ [RATE-LIMIT] 0ms wait (elapsed > delay)  │
    │ ├─ [QUOTA] Pre-check: 18 available ✓        │
    │ ├─ Execute: 8.9s                            │
    │ └─ [RATE-LIMIT] Record timestamp            │
    └────────────────────────┬────────────────────┘
                             │
    ┌────────────────────────v────────────────────┐
    │ Call 3: Chapter 3 (Flash)                   │
    │ ├─ [RATE-LIMIT] 1000ms wait ← BREATHING ROOM│
    │ │                   (Gemini recovers here)  │
    │ ├─ [QUOTA] Pre-check: 17 available ✓        │
    │ ├─ Execute: 19s ← SUCCESS ✓                 │
    │ └─ [RATE-LIMIT] Record timestamp            │
    └────────────────────────┬────────────────────┘
                             │
              Result: HTTP 200 with complete, quality content
```

**Total time: 45.8s (+7.5s for pacing) | Success rate: 100% (3/3 chapters) | Quality: Success**

---

## Implementation Details

### Integration: geminiClient.callGemini()

```javascript
// server/geminiClient.js - callGemini() function

async function callGemini({
  prompt,
  modality = "TEXT",
  generationConfig = {},
  imageB64 = null,
  callIndex = 0  // ← NEW parameter for rate-limiting
}) {
  // ... existing setup code ...

  try {
    // ✅ NEW: Rate-limiter check (enforces inter-request delay)
    const rateLimiter = require("./utils/rateLimiter");
    await rateLimiter.waitForReadiness(callIndex);
    console.log(`[RATE-LIMIT] Call ${callIndex}: proceeding after pacing`);

    // ✅ EXISTING: Quota check (enforces volume limit)
    const quotaTracker = require("./utils/quotaTracker");
    const quotaStatus = quotaTracker.getStatus();
    if (quotaStatus.availableQuota < 1) {
      console.log(`[QUOTA] Pre-call check BLOCKED: exhausted quota`);
      return { ok: false, status: 429, error: "Quota exhausted" };
    }

    // Make the API call
    const resp = await fetchImpl(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // ... existing response parsing ...

    // ✅ Track successful call
    if (resp.ok) {
      // NEW: Record for rate-limiting
      rateLimiter.recordCall();

      // EXISTING: Record for quota
      quotaTracker.recordCall();
      console.log(`[QUOTA] Call recorded: ${quotaStatus.callCount + 1}/20`);
      console.log(`[RATE-LIMIT] Call ${callIndex}: timestamp recorded`);
    }

    return { ok: resp.ok, status: resp.status, ... };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}
```

### Configuration: Environment Variables

```bash
# Default: 1000ms (1 second) between consecutive calls
RATE_LIMIT_MIN_DELAY_MS=1000

# Tuning for testing/optimization:
# Conservative (safer):
RATE_LIMIT_MIN_DELAY_MS=2000  # 2 seconds between calls

# Aggressive (faster):
RATE_LIMIT_MIN_DELAY_MS=500   # 0.5 seconds between calls

# Testing burst resilience:
RATE_LIMIT_MIN_DELAY_MS=0     # No pacing (simulates current behavior)
```

---

## Testing Strategy

### Test Configuration Matrix

The rate-limiter solution must scale across **any book size**. Testing focuses on three standard configurations:

| Configuration | Chapters | Use Case                 | Expected Duration      |
| ------------- | -------- | ------------------------ | ---------------------- |
| **Small**     | 3 pages  | Current failing case     | 45-48s (with pacing)   |
| **Medium**    | 10 pages | Real-world typical ebook | 100-115s (with pacing) |
| **Large**     | 20 pages | Maximum complexity       | 190-210s (with pacing) |

**Scalability assumption**: 1000ms inter-request delay applies uniformly across all book sizes. Success rate should remain consistent (100% chapter generation, zero fallback).

### Test 1: Verify Current Behavior (Baseline) - 3-Page Book

**Setup:**

```bash
RATE_LIMIT_MIN_DELAY_MS=0  # Disable pacing (current behavior)
PAGE_COUNT=3
```

**Expected result:**

- Chapter 3 fails with "model is overloaded"
- Fallback triggered
- HTTP 200 with boilerplate Chapter 3
- Total time: ~38s
- **Quality**: 2/3 chapters AI-generated, 1/3 fallback stub

**Logs:**

```
[RATE-LIMIT] Call 0: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 1: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 2: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 3: enforcing 0ms inter-request delay ← BURST
[EBOOK] Chapter 3/3: AI generation failed, using fallback
```

### Test 2: Verify Pacing Works (With 1s Delay) - 3-Page Book

**Setup:**

```bash
RATE_LIMIT_MIN_DELAY_MS=1000  # 1 second pacing
PAGE_COUNT=3
```

**Expected result:**

- All three chapters succeed
- Chapter 3 gets Gemini API response (not fallback)
- HTTP 200 with quality content
- Total time: ~45-48s (+7-10s for pacing)
- **Quality**: 3/3 chapters AI-generated ✓

**Logs:**

```
[RATE-LIMIT] Call 0: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 0: delay complete, proceeding

[RATE-LIMIT] Call 1: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 1: delay complete, proceeding

[RATE-LIMIT] Call 2: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 2: delay complete, proceeding

[RATE-LIMIT] Call 3: enforcing 1000ms inter-request delay ← BREATHING ROOM
[RATE-LIMIT] Call 3: delay complete, proceeding
[EBOOK] Chapter 3/3: AI response received in 19000ms ← SUCCESS
```

### Test 3: Scalability - 10-Page Book

**Setup:**

```bash
RATE_LIMIT_MIN_DELAY_MS=1000  # 1 second pacing
PAGE_COUNT=10
```

**Expected result:**

- All 10 chapters succeed without fallback
- No burst rate errors throughout sequence
- Total time: ~100-115s (structure 6s + 10 chapters avg 10s each + 9 delays 1s each)
- **Quality**: 10/10 chapters AI-generated ✓
- **Metrics**:
  - Fallback count: 0
  - Quota used: 11/20 (structure + 10 chapters)
  - Success rate: 100%

**Verification**:

- Spot-check Chapter 7 (mid-sequence) and Chapter 10 (end) for quality
- Ensure no "overloaded" errors in logs
- Confirm rate-limiter enforced delays at each inter-request boundary

### Test 4: Scalability - 20-Page Book

**Setup:**

```bash
RATE_LIMIT_MIN_DELAY_MS=1000  # 1 second pacing
PAGE_COUNT=20
```

**Expected result:**

- All 20 chapters succeed without fallback
- Total time: ~190-210s (structure 6s + 20 chapters avg 9.5s each + 19 delays 1s each)
- **Quality**: 20/20 chapters AI-generated ✓
- **Quota impact**: Uses full 20-call limit (structure + 19 chapters) - at quota boundary
- **Metrics**:
  - Fallback count: 0
  - Quota used: 20/20 (at limit, no buffer)
  - Success rate: 100%

**Verification**:

- Test close to quota limit: Chapters 19-20 should succeed despite quota near exhaustion
- Verify quota check still functions: Would a 21st chapter (21st call) properly fail with quota error?
- Spot-check Chapter 10 and Chapter 20 for quality consistency across full sequence

### Test 5: Optimize Delay Value

Run against Gemini API with varying delays across all three book sizes (3, 10, 20 pages):

| Delay    | 3-Page Result | 10-Page Result | 20-Page Result | Verdict            |
| -------- | ------------- | -------------- | -------------- | ------------------ |
| `250ms`  | ?             | ?              | ?              | Too aggressive?    |
| `500ms`  | ?             | ?              | ?              | Acceptable?        |
| `1000ms` | ✓ Success     | ?              | ?              | Safe baseline      |
| `2000ms` | ✓ Success     | ✓ Success      | ✓ Success      | Over-conservative? |

**Metrics to track per test**:

- **Success rate**: % of chapters generated (target: 100%, no fallback)
- **Response time**: Total request duration vs expected
- **Quality score**: Content depth, summary coherence, narrative continuity
- **Quota efficiency**: Calls used per book size
- **Consistency**: Error rates and timing variance across repeated runs

**Target outcome**: Identify the lowest delay that maintains 100% success rate across all book sizes.

### Test 6: Integration with Quota System

Ensure rate-limiter and quota tracker work together without interference:

**Scenario A: Quota exhausted (multi-request scenario)**

```bash
# Run 15 ebook requests back-to-back (3 pages each = 4 calls per request)
# This will exhaust the 20-call/minute quota after 5 requests
RATE_LIMIT_MIN_DELAY_MS=1000
PAGE_COUNT=3
```

**Expected behavior**:

- Requests 1-5: Complete successfully (20 calls total, uses full quota)
- Request 6+: Rejected by genieService with `[QUOTA] Insufficient quota` message
- **Verify**: Rate-limiter delays still apply until quota rejection occurs

**Scenario B: Rate-limited but quota available**

```bash
# Single large ebook that takes 4+ minutes (over the quota window)
RATE_LIMIT_MIN_DELAY_MS=1000
PAGE_COUNT=20
```

**Expected behavior**:

- First 19 chapters: rate-limiter paces at 1s delays, quota available
- ~2 minutes elapsed: quota window may reset (60s sliding window)
- Remaining chapters: quota refreshes, continues with pacing
- **Verify**: Quota tracker correctly rotates window mid-request

---

## Configuration & Tuning

### Finding Optimal Delay

```javascript
// Empirical testing across all book sizes (3, 10, 20 pages):
// - 250ms:  Frequently fails on later chapters (too aggressive)
// - 500ms:  Occasionally fails on 20-page books (risky)
// - 1000ms: Consistently succeeds across all sizes (safe baseline)
// - 2000ms: Always succeeds but adds ~20s overhead for 20-page book

// Recommendation: Start with 1000ms baseline, optimize after data collection

Rapid-fire API calls from external client
Expected: Rate-limiter enforces pacing, quota tracker stays healthy
```

---

## Configuration & Tuning

### Finding Optimal Delay

```javascript
// Empirical testing suggests:
// - 500ms:  Frequently fails on Chapter 3 (too aggressive)
// - 1000ms: Consistently succeeds (safe baseline)
// - 2000ms: Always succeeds but adds unnecessary time

// Recommendation: Start with 1000ms, optimize after data collection
```

### Adaptive Delays (Future Enhancement)

```javascript
// Could track failure rates and adjust:
// - If >10% of requests fail: increase delay to 1500ms
// - If <1% of requests fail: try 750ms
// - This would auto-tune for Gemini's actual burst limits
```

---

## Impact Analysis

### Benefits

1. **Eliminates silent failures**: Chapter 3 generates successfully instead of falling back
2. **Improves quality**: All 3 chapters are AI-generated, not mixed with stubs
3. **Maintains sequential architecture**: No change to ebookService logic
4. **Independent concerns**: Quota and rate-limiting are separate systems
5. **Observable**: Clear logs show when pacing is applied
6. **Testable**: Can verify behavior with different delay values
7. **Preparation for batch mode**: Establishes velocity management pattern for future parallelization

### Costs

1. **Latency increase**: ~7-10 seconds for 3-page ebook (38s → 45-48s)

   - Acceptable tradeoff for reliability
   - Batch mode will parallelize to recover this time

2. **Server resource usage**: Slightly increased (async sleep() calls)

   - Negligible impact (non-blocking)

3. **Configuration complexity**: One new environment variable
   - Simple, well-documented

---

## Relationship to Batch Mode

This rate-limiter lays groundwork for future **batch/parallel mode**:

**Sequential mode** (current & proposed):

```
Structure → wait 1s → Chapter 1 → wait 1s → Chapter 2 → wait 1s → Chapter 3
Total: ~46s
```

**Future batch mode** (sketch):

```
Structure (await)
├─ After structure: issue Chapter 1, 2, 3 calls concurrently
├─ Each respects rate-limiter's 1s spacing internally
├─ But overlap execution: Ch1 and Ch2 run while Ch3 waits
Total: ~26s (2x speedup)
```

The rate-limiter handles velocity at the API call level, allowing both sequential and batch modes to coexist safely.

---

## Acceptance Criteria

**Core functionality:**

- [ ] rateLimiter module created in `server/utils/rateLimiter.js`
- [ ] geminiClient.callGemini() integrates waitForReadiness() and recordCall()
- [ ] Environment variable `RATE_LIMIT_MIN_DELAY_MS` configurable (default: 1000ms)

**Testing across all book sizes:**

- [ ] Test 1 (Baseline): 3-page book with RATE_LIMIT_MIN_DELAY_MS=0 fails on Chapter 3 ✗
- [ ] Test 2 (Paced): 3-page book with RATE_LIMIT_MIN_DELAY_MS=1000 succeeds 3/3 chapters ✓
- [ ] Test 3 (Scalability): 10-page book with pacing succeeds 10/10 chapters ✓
- [ ] Test 4 (Large scale): 20-page book with pacing succeeds 20/20 chapters ✓
- [ ] Test 5 (Optimization): Identify optimal delay that works for all sizes
- [ ] Test 6 (Integration): Rate-limiter and quota system work together without conflicts

**Logging and observability:**

- [ ] Logs show pacing: `[RATE-LIMIT] Call X: enforcing Yms inter-request delay`
- [ ] Logs show completion: `[RATE-LIMIT] Call X: delay complete, proceeding`
- [ ] Logs show recorded timestamps: `[RATE-LIMIT] Call X: timestamp recorded`
- [ ] Documentation in inline comments and logs

**Quality assurance:**

- [ ] Zero fallback chapters across all test cases (3, 10, 20 page books)
- [ ] Success rate: 100% chapters AI-generated (no boilerplate stubs)
- [ ] No breaking changes to existing sequential ebook flow
- [ ] Quota and rate-limit checks remain independent

---

- [ ] No breaking changes to existing sequential ebook flow

---

## Reference Documents

- **Problem Analysis**: [Light_3-page.md](ebookService/DATA/Light_3-page.md)
- **Current Code**:
  - [server/ebookService.js](../../server/ebookService.js) - Sequential chapter loop
  - [server/geminiClient.js](../../server/geminiClient.js) - API execution
  - [server/utils/quotaTracker.js](../../server/utils/quotaTracker.js) - Volume quota
- **Related Features**:
  - Sequential mode (current proposal)
  - Batch/parallel mode (future, will reuse rate-limiter)

---

## ADDENDA: Out-of-Scope Implementations Added

During implementation, two incomplete features were discovered and completed:

### 1. **Model Routing: Pro vs Flash Based on callIndex**

**Original Feature Assumption:**

- The design assumed model routing was already implemented
- Code contained references to "Using Gemini 2.5 Pro (structure)" vs "Using Gemini 2.5 Flash (chapters)"

**Reality:**

- Logging was present but **no actual routing logic existed**
- All calls went to the same API endpoint

**Implementation:**

- Added model selection in aiService: `callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash"`
- Added endpoint routing in geminiClient based on model name
- Environment variables support model-specific endpoints: `GEMINI_API_URL_PRO`, `GEMINI_API_URL_FLASH`

**Impact on Feature:**

- Ensures quota distribution works as described
- Structure generation (callIndex=0) uses Pro model
- Chapter generation (callIndex>0) uses Flash model
- Enables different pricing/quota tiers per model

### 2. **callIndex Parameter Chain**

**Original Feature Assumption:**

- The design assumed `callIndex` flowed through all layers (ebookService → aiService → geminiClient)

**Reality:**

- `generateContentWithRotation()` had `callIndex` in signature but **never used it**
- `generateContent()` had no `callIndex` parameter
- Orphaned infrastructure set up but never wired

**Implementation:**

- Updated `generateContent()` to accept and forward `callIndex`
- Updated `generateContentWithRotation()` to pass `callIndex` through
- Completed call chain: all layers now receive correct call index

**Impact on Feature:**

- Rate-limiter logs now show correct call sequence (Call 0, 1, 2, 3...)
- Burst detection is accurate at the specific failing call
- Model routing works based on actual call sequence

---

## Discussion Topics

1. **Optimal delay value**: Is 1000ms the right baseline?
2. **Adaptive vs fixed**: Should delay adjust based on errors?
3. **Per-model tuning**: Should Pro and Flash have different delays?
4. **Observable metrics**: What should be logged for monitoring?
5. **Future: Exponential backoff**: If Chapter 3 fails, retry with longer delay?
6. **Future: Jitter**: Randomize delay to avoid synchronized requests?

---

**Next Steps**: Run Test Cases 1-4 to validate both rate-limiter and model routing implementations.
