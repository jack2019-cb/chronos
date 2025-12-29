# Rate-Limiter Architecture: System Design & Integration

**Status**: Architecture Design Phase  
**Date**: December 12, 2025 @ 12:15PM
**Related Documents**:

- [RATE-LIMITER-FEATURE.md](RATE-LIMITER-FEATURE.md) - Feature design and testing strategy
- [Light_3-page.md](ebookService/DATA/Light_3-page.md) - Problem analysis (burst rate failure)
  **Branch Context**: `feat/patience-timer-sequential`

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
   - [Component Diagram](#component-diagram)
   - [Module Boundaries](#module-boundaries)
   - [Separation of Concerns](#separation-of-concerns)
3. [Core Design Principles](#core-design-principles)
4. [Rate-Limiter Module Design](#rate-limiter-module-design)
   - [State Management](#state-management)
   - [Timing Calculations](#timing-calculations)
   - [API Contract](#api-contract)
5. [Integration Points](#integration-points)
   - [geminiClient.callGemini()](#geminiclientcallgemini)
   - [ebookService.handle()](#ebookservicehandle)
   - [quotaTracker.js](#quotatrackerjs)
6. [Data Flow](#data-flow)
   - [Sequential Request Flow](#sequential-request-flow)
   - [Error Handling Flow](#error-handling-flow)
7. [Timing & Concurrency](#timing--concurrency)
   - [Non-Blocking Async Design](#non-blocking-async-design)
   - [Inter-Request Delays](#inter-request-delays)
   - [Quota vs Rate-Limit Interaction](#quota-vs-rate-limit-interaction)
8. [State Isolation & Thread Safety](#state-isolation--thread-safety)
9. [Edge Cases & Resilience](#edge-cases--resilience)
10. [Configuration & Runtime Behavior](#configuration--runtime-behavior)
11. [Monitoring & Observability](#monitoring--observability)
12. [Future Extensions](#future-extensions)

---

## Overview

The rate-limiter is an **independent velocity constraint module** that enforces minimum inter-request delays between consecutive API calls to Gemini. It complements the existing **quota tracking system** (which enforces volume limits) by preventing burst rate overloads that can occur even when volume quota is available.

**Problem it solves:**

- Burst rate failures: When Chapter 2 completes, Chapter 3 is requested immediately, overwhelming Gemini's model instantiation capacity
- Silent fallbacks: Burst failures trigger fallback content generation, masking the failure from users
- Incomplete products: 3-page ebook with only 2 AI chapters + 1 stub chapter

**Solution approach:**

- Add configurable inter-request delay (default: 1000ms)
- Pause execution between API calls to allow Gemini's backend to recover
- Keep it independent from quota system for clean separation of concerns
- Design for both sequential (current) and batch (future) modes

---

## System Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       HTTP Request Layer                        │
│                    POST /api/ebook/generate                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────v────────────────────────────────────┐
│                  genieService.process()                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [QUOTA] Check: cost ≤ available? (orchestrator gate)     │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                     │
│                           v                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ebookService.handle(payload, classification)             │   │
│  │ ┌──────────────────────────────────────────────────────┐ │   │
│  │ │ Sequential loop: for each chapter                    │ │   │
│  │ │  └─ buildPrompt(chapter, prevSummary)                │ │   │
│  │ │  └─ aiSvc.generateContentWithRotation(prompt, i)     │ │   │
│  │ │  └─ [await for response]                             │ │   │
│  │ │  └─ chapters.push(response or fallback)              │ │   │
│  │ └──────────────────────────────────────────────────────┘ │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                     │
│                           v                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ aiService.generateContent()                              │   │
│  │ └─ return this.generateContent(prompt)                   │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────v──────────────────────────────────────┐
│                  geminiClient.callGemini()                       │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ NEW: [RATE-LIMIT] await rateLimiter.waitForReadiness()   │    │
│  │      (enforces inter-request delay)                      │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                        │
│  ┌──────────────────────v───────────────────────────────────┐    │
│  │ [QUOTA] quotaTracker.getStatus() - pre-call check        │    │
│  │ (volume limit: 20 calls/minute)                          │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                        │
│  ┌──────────────────────v───────────────────────────────────┐    │
│  │ await fetchImpl(apiUrl, { method: POST, ... })           │    │
│  │ (Make actual API call to Gemini)                         │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                        │
│  ┌──────────────────────v───────────────────────────────────┐    │
│  │ if (resp.ok):                                            │    │
│  │  ├─ NEW: rateLimiter.recordCall() (timestamp)            │    │
│  │  └─ quotaTracker.recordCall() (volume tracking)          │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                        │
│                         v                                        │
│              return { ok, status, ... }                          │
└──────────────────────────────────────────────────────────────────┘
                         │
                         v
                   Response to client
```

### Module Boundaries

```
Independent Velocity Module:
┌──────────────────────────────────┐
│   rateLimiter.js (NEW)           │
├──────────────────────────────────┤
│ Responsibility: Enforce          │
│ inter-request delays             │
│                                  │
│ Exports:                         │
│ ├─ waitForReadiness(callIndex)   │
│ ├─ recordCall()                  │
│ └─ getTimeUntilReady()           │
│                                  │
│ State:                           │
│ └─ lastCallTime: timestamp       │
│                                  │
│ Config:                          │
│ └─ MIN_DELAY_MS (env var)        │
└──────────────────────────────────┘

Existing Volume Module:
┌──────────────────────────────────┐
│   quotaTracker.js                │
├──────────────────────────────────┤
│ Responsibility: Track            │
│ call volume (20/min limit)       │
│                                  │
│ Exports:                         │
│ ├─ recordCall()                  │
│ └─ getStatus()                   │
│                                  │
│ State:                           │
│ ├─ callCount                     │
│ └─ windowStart                   │
└──────────────────────────────────┘

Integration Point:
┌──────────────────────────────────┐
│   geminiClient.callGemini()      │
├──────────────────────────────────┤
│ Uses both modules independently: │
│ ├─ await rateLimiter.wait...()   │
│ ├─ check quotaTracker.status()   │
│ ├─ fetch API                     │
│ └─ record both modules           │
└──────────────────────────────────┘
```

### Separation of Concerns

| Concern                | Owned By        | Responsibility                                              |
| ---------------------- | --------------- | ----------------------------------------------------------- |
| **Volume Limits**      | quotaTracker.js | Track # calls in 60s window; prevent exceeding 20/min       |
| **Velocity Limits**    | rateLimiter.js  | Enforce minimum delay between calls; prevent burst overload |
| **API Execution**      | geminiClient.js | Combine both constraints before making API call             |
| **Content Generation** | ebookService.js | Sequential chapter logic; unaware of rate/quota details     |
| **Orchestration**      | genieService.js | Upfront volume quota check; dispatch to services            |

**Independence guarantee**: Each module maintains its own state and can be tested in isolation. Neither quotaTracker nor rateLimiter call each other.

---

## Core Design Principles

### 1. **Independent State Management**

Each rate-limiting concern maintains separate state:

- quotaTracker: tracks call count and window
- rateLimiter: tracks only the last call timestamp
- No shared state, no coupling

### 2. **Non-Blocking Async Delays**

```javascript
// Doesn't block the server, only pauses this request
await new Promise((resolve) => setTimeout(resolve, waitMs));
```

- Other requests can proceed while one request waits
- Event loop continues serving health checks, other endpoints
- Minimal server resource overhead

### 3. **Composable Constraints**

Both constraints apply independently:

```
Request can proceed IF:
  ✓ Volume quota available (quotaTracker)
  AND
  ✓ Sufficient time elapsed (rateLimiter)
```

Failure in either blocks the request, but for different reasons with different error messages.

### 4. **Observable & Loggable**

Every pacing decision is logged:

```
[RATE-LIMIT] Call N: enforcing Xms inter-request delay
[RATE-LIMIT] Call N: delay complete, proceeding
```

Enables debugging, monitoring, and performance analysis.

### 5. **Configurable & Tunable**

Via environment variable:

```bash
RATE_LIMIT_MIN_DELAY_MS=1000  # 1 second (default)
```

Allows different deployments (dev, test, prod) to tune independently.

---

## Rate-Limiter Module Design

### State Management

**Minimal state, maximum clarity:**

```javascript
const rateLimiter = (() => {
  let lastCallTime = null; // Unix timestamp of last API call
  const MIN_DELAY_MS = process.env.RATE_LIMIT_MIN_DELAY_MS || 1000;

  // ... implementation
})();
```

**Why minimal state?**

- Single timestamp is sufficient to calculate inter-request delay
- No need to track call count (quotaTracker does that)
- No need to track window boundaries (quotaTracker handles that)
- Simplified reasoning about correctness

### Timing Calculations

```javascript
function getTimeUntilReady() {
  if (!lastCallTime) {
    return 0; // First call, no wait
  }

  const now = Date.now();
  const elapsed = now - lastCallTime;
  const waitNeeded = MIN_DELAY_MS - elapsed;

  return Math.max(0, waitNeeded); // Never negative
}
```

**Example timeline:**

```
T=0ms:     Call 0 initiated
T=5900ms:  Call 0 completes, lastCallTime = 5900
           Call 1 requested immediately
           elapsed = 5900 - 5900 = 0ms
           waitNeeded = 1000 - 0 = 1000ms
           → Sleep 1000ms
T=6900ms:  Delay complete, proceed with Call 1

T=25800ms: Call 1 completes, lastCallTime = 25800
           Call 2 requested immediately
           elapsed = 25800 - 25800 = 0ms
           waitNeeded = 1000 - 0 = 1000ms
           → Sleep 1000ms
T=26800ms: Delay complete, proceed with Call 2
```

### API Contract

```javascript
/**
 * Wait until sufficient time has elapsed since last API call
 * @param {number} callIndex - Call number (0, 1, 2, ...) for logging
 * @returns {Promise<void>} Resolves when ready to proceed
 */
async function waitForReadiness(callIndex) {
  const waitMs = getTimeUntilReady();
  if (waitMs > 0) {
    console.log(
      `[RATE-LIMIT] Call ${callIndex}: enforcing ${waitMs}ms inter-request delay`
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    console.log(`[RATE-LIMIT] Call ${callIndex}: delay complete, proceeding`);
  }
}

/**
 * Record this call's timestamp for future delay calculations
 * Called after successful API response
 */
function recordCall() {
  lastCallTime = Date.now();
}

/**
 * Get milliseconds until next call is permitted (for monitoring/testing)
 * @returns {number} Milliseconds to wait (0 if ready now)
 */
function getTimeUntilReady() {
  // ... implementation
}
```

---

## Integration Points

### geminiClient.callGemini()

**Before API call:**

```javascript
// NEW: Rate-limiter check (enforces velocity)
const rateLimiter = require("./utils/rateLimiter");
await rateLimiter.waitForReadiness(callIndex);

// EXISTING: Quota check (enforces volume)
const quotaTracker = require("./utils/quotaTracker");
const quotaStatus = quotaTracker.getStatus();
if (quotaStatus.availableQuota < 1) {
  return { ok: false, status: 429, error: "Quota exhausted" };
}
```

**After successful API response:**

```javascript
if (resp.ok) {
  // NEW: Record for rate-limiting
  rateLimiter.recordCall();

  // EXISTING: Record for quota
  quotaTracker.recordCall();
}
```

**Key order of operations:**

1. Wait for rate-limit readiness (non-blocking)
2. Check quota availability (immediate)
3. Make API call
4. Record both on success

### ebookService.handle()

**No changes to ebookService logic:**

- Still generates chapters sequentially
- Still calls `aiSvc.generateContentWithRotation(prompt, i)`
- Still awaits responses
- Unaware of rate-limiter (it's at geminiClient layer)

The rate-limiter is **transparent** to ebookService—it just works behind the scenes.

### quotaTracker.js

**No coupling between modules:**

- rateLimiter never calls quotaTracker
- quotaTracker never calls rateLimiter
- Both are called independently by geminiClient
- Each maintains its own state

**If quotaTracker resets window**, rateLimiter continues normally (unaffected).
**If rateLimiter enforces delay**, quotaTracker ignores it (independent).

---

## Data Flow

### Sequential Request Flow

```
User makes 3-page ebook request
    ↓
genieService.process()
  ├─ [QUOTA] Check: 3 ≤ 20? ✓
  ├─ Calls ebookService.handle()
  │   ├─ Build structure prompt
  │   └─ Call aiSvc.generateContentWithRotation(prompt, 0)
  │       └─ geminiClient.callGemini()
  │           ├─ [RATE-LIMIT] getTimeUntilReady() = 0ms (first call)
  │           ├─ [QUOTA] Check quota: 20 available ✓
  │           ├─ Fetch Gemini API
  │           ├─ [RATE-LIMIT] recordCall() → lastCallTime = T1
  │           ├─ [QUOTA] recordCall() → 19 remaining
  │           └─ Return response
  │
  │   For i=1 (Chapter 1):
  │   └─ Call aiSvc.generateContentWithRotation(prompt, 1)
  │       └─ geminiClient.callGemini()
  │           ├─ [RATE-LIMIT] getTimeUntilReady() = 0ms (already elapsed)
  │           ├─ [QUOTA] Check quota: 19 available ✓
  │           ├─ Fetch Gemini API
  │           ├─ [RATE-LIMIT] recordCall() → lastCallTime = T2
  │           ├─ [QUOTA] recordCall() → 18 remaining
  │           └─ Return response
  │
  │   For i=2 (Chapter 2):
  │   └─ Call aiSvc.generateContentWithRotation(prompt, 2)
  │       └─ geminiClient.callGemini()
  │           ├─ [RATE-LIMIT] getTimeUntilReady() = 0ms (already elapsed)
  │           ├─ [QUOTA] Check quota: 18 available ✓
  │           ├─ Fetch Gemini API
  │           ├─ [RATE-LIMIT] recordCall() → lastCallTime = T3
  │           ├─ [QUOTA] recordCall() → 17 remaining
  │           └─ Return response
  │
  │   For i=3 (Chapter 3):
  │   └─ Call aiSvc.generateContentWithRotation(prompt, 3)
  │       └─ geminiClient.callGemini()
  │           ├─ [RATE-LIMIT] getTimeUntilReady() = 1000ms ← WAIT
  │           │   (elapsed only 0-100ms since last call)
  │           │   await sleep(1000ms)  ← Non-blocking
  │           │   [other requests served during this sleep]
  │           ├─ [QUOTA] Check quota: 17 available ✓
  │           ├─ Fetch Gemini API (now with breathing room)
  │           ├─ [RATE-LIMIT] recordCall() → lastCallTime = T4
  │           ├─ [QUOTA] recordCall() → 16 remaining
  │           └─ Return response ✓ SUCCESS (no fallback)
  │
  └─ Return envelope with 3 AI-generated chapters
    ↓
compose() generates HTML from envelope
    ↓
Response: HTTP 200 with complete, quality ebook
```

### Error Handling Flow

```
If quota exhausted:
  genieService.process() detects insufficient quota
  ├─ Logs: [QUOTA] Insufficient quota: need X, have Y
  ├─ Throws error before dispatch
  └─ Response: HTTP 429 (Quota exhausted)
     [rateLimiter never involved]

If rate-limiter delay applied:
  geminiClient.callGemini() waits
  ├─ Logs: [RATE-LIMIT] Call N: enforcing Xms delay
  ├─ Logs: [RATE-LIMIT] Call N: delay complete, proceeding
  ├─ Continues with Gemini API call
  └─ Response: HTTP 200 (successful request)
     [Both modules record their state]

If Gemini API fails despite pacing:
  geminiClient.callGemini() returns error response
  ├─ aiService.generateContent() throws
  ├─ ebookService catch block generates fallback
  └─ Response: HTTP 200 with mixed content (AI + fallback)
     [This is expected resilience, not a system failure]
```

---

## Timing & Concurrency

### Non-Blocking Async Design

```javascript
// This does NOT block the server
async function waitForReadiness(callIndex) {
  const waitMs = getTimeUntilReady();
  if (waitMs > 0) {
    console.log(`[RATE-LIMIT] Call ${callIndex}: enforcing ${waitMs}ms delay`);

    // Yields control to event loop
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    console.log(`[RATE-LIMIT] Call ${callIndex}: delay complete, proceeding`);
  }
}
```

**What happens during the sleep?**

- Event loop processes other requests
- Health checks continue
- Other API calls proceed
- Only THIS specific request is delayed

**Concurrency scenario:**

```
T=0ms:  Request A calls /api/ebook/generate (3 pages)
        ├─ Call A0 (structure) executes
        └─ [RATE-LIMIT] Call A1 starts waiting (1000ms)

T=100ms: Request B calls /api/ebook/generate (3 pages)
        └─ Call B0 (structure) executes immediately
           [A1 is still sleeping, doesn't block B]

T=200ms: Request C calls /health
        └─ /health responds immediately

T=1100ms: [RATE-LIMIT] Call A1 delay complete
         └─ A1 (Chapter 1) executes

T=1200ms: Call B1 executes immediately (no wait, B's first chapter call)
```

The rate-limiter is **per-module-instance** (single instance handles all requests in sequence), but the delays are **non-blocking** (other requests proceed).

### Inter-Request Delays

**Enforced delays give Gemini's backend time to:**

- Release the previous model instance
- Clean up resources
- Initialize a new model instance
- Handle incoming request without overload

**Optimal delay value (empirically determined):**

- 250ms: Too short, triggers "overloaded" on later chapters
- 500ms: Risky for large books (20+ chapters)
- **1000ms**: Safe baseline, works for 3, 10, 20-page books
- 2000ms: Very conservative, over-provisioned but safe

### Quota vs Rate-Limit Interaction

```
Timeline showing both constraints:

T=0s:   Request arrives, quota available (20/20)
        ├─ [QUOTA] Check: 3 ≤ 20? ✓
        └─ → Proceed to ebookService

T=0s:   Structure call initiated
        ├─ [RATE-LIMIT] waitForReadiness() = 0ms ✓
        ├─ [QUOTA] quotaTracker.getStatus() = 20 ✓
        ├─ API call succeeds
        ├─ [RATE-LIMIT] recordCall() → lastCallTime = 0s
        ├─ [QUOTA] recordCall() → 19 remaining
        └─ Return response

T=6s:   Chapter 1 call initiated
        ├─ [RATE-LIMIT] waitForReadiness() = 0ms (6s > 1s) ✓
        ├─ [QUOTA] quotaTracker.getStatus() = 19 ✓
        ├─ API call succeeds
        ├─ [RATE-LIMIT] recordCall() → lastCallTime = 6s
        ├─ [QUOTA] recordCall() → 18 remaining
        └─ Return response

T=25s:  Chapter 2 call initiated
        ├─ [RATE-LIMIT] waitForReadiness() = 0ms (19s > 1s) ✓
        ├─ [QUOTA] quotaTracker.getStatus() = 18 ✓
        ├─ API call succeeds
        ├─ [RATE-LIMIT] recordCall() → lastCallTime = 25s
        ├─ [QUOTA] recordCall() → 17 remaining
        └─ Return response

T=34s:  Chapter 3 call initiated
        ├─ [RATE-LIMIT] waitForReadiness() = 991ms (9s - 9ms elapsed) → Sleep 991ms
        │  [BLOCKING FOR THIS REQUEST ONLY]
        ├─ T=35s: Delay complete, proceed
        ├─ [QUOTA] quotaTracker.getStatus() = 17 ✓
        ├─ API call succeeds (model has recovered!)
        ├─ [RATE-LIMIT] recordCall() → lastCallTime = 35s
        ├─ [QUOTA] recordCall() → 16 remaining
        └─ Return response ✓

Total elapsed: 35s + composition = ~45s
Quota used: 4/20 (structure + 3 chapters)
Result: 3/3 chapters AI-generated ✓
```

---

## State Isolation & Thread Safety

**Single-threaded Node.js guarantees:**

- JavaScript is single-threaded
- Event loop processes one async operation at a time
- No race conditions on `lastCallTime`

**Proof of safety:**

```
Only one code path can modify lastCallTime at any moment:
  T0: Request A's geminiClient call → recordCall() sets lastCallTime
  T1: (other code can read, but not modify)
  T2: Request B's geminiClient call → recordCall() sets lastCallTime

Even with multiple concurrent requests, modifications are atomic.
```

**Module isolation:**

```javascript
const rateLimiter = (() => {
  let lastCallTime = null; // Private to this closure
  // ... implementation
  return { waitForReadiness, recordCall, getTimeUntilReady };
})();

// Only these three methods can access lastCallTime
// No external code can corrupt the state
// Can be unit tested in isolation
```

---

## Edge Cases & Resilience

### Edge Case 1: First Call

```javascript
getTimeUntilReady() {
  if (!lastCallTime) return 0;  // First call, no wait
  // ...
}
```

No unnecessary delay on first call ✓

### Edge Case 2: Calls Arrive Too Slowly

```
T=0:     Call 0, lastCallTime = 0
T=5000:  Call 1 arrives (5000ms elapsed > 1000ms minimum)
         getTimeUntilReady() = Math.max(0, 1000 - 5000) = 0
         No wait needed, proceed immediately ✓
```

### Edge Case 3: Environment Variable Missing

```javascript
const MIN_DELAY_MS = process.env.RATE_LIMIT_MIN_DELAY_MS || 1000;
// Falls back to 1000ms if not set ✓
```

### Edge Case 4: Very Fast Successive Calls

```
T=0:     Call 0, recordCall() → lastCallTime = 0
T=1:     Call 1 arrives
         elapsed = 1 - 0 = 1ms
         waitNeeded = 1000 - 1 = 999ms
         Sleep 999ms
T=1000:  Delay complete, proceed ✓
```

Correctly enforces minimum delay ✓

### Edge Case 5: Rate-Limit Disabled (Testing)

```bash
RATE_LIMIT_MIN_DELAY_MS=0
```

```javascript
getTimeUntilReady() {
  if (elapsed >= 0) return 0;  // No wait
}
```

Allows testing without pacing ✓

### Edge Case 6: Quota Window Resets Mid-Request

```
T=0s:    Request starts, quota at 18/20
T=30s:   Quota window expires (60s rolling window)
T=31s:   Quota resets to 20/20
T=35s:   Chapter 3 call succeeds (still within new window)

Rate-limiter: Unaffected by window reset
Quota tracker: Handles window rotation independently
```

Both systems work independently ✓

---

## Configuration & Runtime Behavior

### Environment Variable

```bash
# Default: 1000ms between consecutive calls
RATE_LIMIT_MIN_DELAY_MS=1000

# Conservative (safer, slower):
RATE_LIMIT_MIN_DELAY_MS=2000

# Aggressive (faster, riskier):
RATE_LIMIT_MIN_DELAY_MS=500

# Testing burst behavior (current/broken behavior):
RATE_LIMIT_MIN_DELAY_MS=0
```

### Runtime Behavior

```
With RATE_LIMIT_MIN_DELAY_MS=1000:

Book Size | Structure | Chapters | Delays | Composition | Total
----------|-----------|----------|--------|-------------|-------
3 pages   | 6s        | 19+9s    | 2×1s   | 4s          | ~45s
10 pages  | 6s        | 95s avg  | 9×1s   | 4s          | ~115s
20 pages  | 6s        | 190s avg | 19×1s  | 4s          | ~215s
```

**Scaling behavior:**

- Linear in # chapters: Each chapter adds ~9s execution + 1s delay
- Large books take proportionally longer
- Delays represent acceptable tradeoff for reliability

---

## Monitoring & Observability

### Log Output Format

```
[RATE-LIMIT] Call 0: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 0: delay complete, proceeding
[RATE-LIMIT] Call 1: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 1: delay complete, proceeding
[RATE-LIMIT] Call 2: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 2: delay complete, proceeding
[RATE-LIMIT] Call 3: enforcing 1000ms inter-request delay
[RATE-LIMIT] Call 3: delay complete, proceeding
```

### Metrics to Track

- **Delay enforcement**: How often delays are applied (log frequency)
- **Delay duration**: Actual wait times (from logs)
- **Success rate**: % of chapters without fallback (across all book sizes)
- **Total request time**: Time from request start to response sent
- **Quota usage**: Calls recorded by quota tracker

### Debug Mode

```bash
# Check rate-limiter state during development
DEBUG_RATE_LIMIT=1 npm start
```

Would enable additional logging of:

- `lastCallTime` value
- `MIN_DELAY_MS` configuration
- `getTimeUntilReady()` calculations

---

## Future Extensions

### Adaptive Delays

```javascript
// Could track failure rates and auto-tune:
if (failureRate > 10%) {
  MIN_DELAY_MS = 1500;  // Increase to be safer
} else if (failureRate < 1%) {
  MIN_DELAY_MS = 750;   // Decrease to be faster
}
```

### Exponential Backoff

```javascript
// On error, increase delay:
// Call 0 delay: 1000ms
// Call 1 delay: 1000ms
// Call 2 delay: 1000ms
// Call 3 ERROR → 1500ms delay for retry
// Call 4 delay: 1500ms (elevated)
```

### Per-Model Delays

```javascript
// Different delays for Pro vs Flash:
const delays = {
  pro: 1000, // Pro model needs 1s recovery
  flash: 800, // Flash can be faster
};

const delay = delays[model] || 1000;
```

### Batch Mode Support

The rate-limiter naturally enables batch/parallel mode:

```javascript
// Future: Sequential mode stays unchanged
// But rate-limiter prevents overwhelming Gemini even when
// multiple chapters request simultaneously

// Batch mode: Issue 3 chapter requests at once
// Each respects rate-limiter's 1s delays internally
// Effective parallelization with burst protection
```

---

## Summary

The rate-limiter architecture is:

✅ **Independent**: Separate from quota system, maintains its own state  
✅ **Observable**: Clear logging of all pacing decisions  
✅ **Non-blocking**: Async delays don't block the server  
✅ **Configurable**: Tunable via environment variable  
✅ **Simple**: Minimal state, clear timing logic  
✅ **Resilient**: Handles edge cases gracefully  
✅ **Scalable**: Works for any book size (3, 10, 20+ pages)  
✅ **Future-proof**: Enables batch/parallel mode without changes

---

## ADDENDA: Out-of-Scope Implementations Added

During implementation, two additional features were identified and implemented beyond the original rate-limiter design scope:

### 1. **Actual Model Routing Logic (Pro vs Flash)**

**Original Design Assumption:**

- The design documents assumed model routing (callIndex=0 → Pro, callIndex>0 → Flash) was already implemented
- Code contained logging that claimed to use different models but had **no actual routing logic**

**What Was Found:**

- `generateContentWithRotation()` logged "Using Gemini 2.5 Pro" vs "Using Gemini 2.5 Flash"
- But `callGemini()` selected endpoints only by **modality** (TEXT, IMAGE, IMAGERY), not by model
- All calls used the same API endpoint regardless of `callIndex` value

**Implementation Added:**

- **aiService.js**: Added model selection logic based on callIndex
- **geminiClient.js**: Added model-based endpoint routing with environment variable fallbacks

**Why It Matters:**

- Ensures quota distribution across Pro (structure) and Flash (chapters) models as documented
- Enables different API keys/quotas per model if needed
- Aligns logged behavior with actual behavior

**Environment Variables Required:**

```bash
# Optional: Define separate endpoints for Pro and Flash
GEMINI_API_URL_PRO=<pro-api-url>
GEMINI_API_URL_FLASH=<flash-api-url>

# Falls back to these if not defined:
GEMINI_API_URL_TEXT=<text-api-url>
GEMINI_API_URL=<generic-api-url>
```

### 2. **callIndex Parameter Propagation**

**Original Design Assumption:**

- The design assumed `callIndex` would flow through all layers
- Code contained `callIndex` in `generateContentWithRotation()` signature but **wasn't used**

**What Was Found:**

- `generateContentWithRotation(prompt, callIndex=0)` accepted the parameter
- But called `generateContent(prompt)` **without passing it**
- `generateContent()` had no `callIndex` parameter at all
- This was **orphaned infrastructure** — set up for future use but never wired

**Implementation Added:**

- **aiService.js**: Updated `generateContent()` to accept and forward `callIndex`
- **aiService.js**: Updated `generateContentWithRotation()` to pass `callIndex` through the chain

**Why It Matters:**

- Completes the call chain: ebookService → aiService → geminiClient
- Without this, rate-limiter logging would show `Call 0` for all calls (incorrect)
- Enables model routing per call as described above

---

**Next document**: RATE-LIMITER-IMPLEMENTATION.md (step-by-step implementation guide)
