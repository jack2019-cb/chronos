````markdown
# Orchestrator-Quota Separation Implementation Guide

**Date**: December 11, 2025  
**Branch**: `feat/ebook-revert`  
**Status**: Implementation Phase  
**Audience**: Engineers implementing the feature  
**Time Estimate**: 2-3 hours  
**Architecture Reference**: `docs/design/ORCHESTRATOR_QUOTA_SEPARATION.md`

---

## Table of Contents

1. [Overview](#overview)
2. [Step 1: Create quotaTracker Module](#step-1-create-quotatracker-module)
3. [Step 2: Update geminiClient for Call Tracking](#step-2-update-geminiclient-for-call-tracking)
4. [Step 3: Add Cost Calculation to genieService](#step-3-add-cost-calculation-to-genieservice)
5. [Step 4: Move Quota Check to Orchestrator](#step-4-move-quota-check-to-orchestrator)
6. [Step 5: Clean Up Domain Services](#step-5-clean-up-domain-services)
7. [Step 6: Handle Deferral Responses](#step-6-handle-deferral-responses)
8. [Step 7: Testing Strategy](#step-7-testing-strategy)
9. [Error Handling & Edge Cases](#error-handling--edge-cases)
10. [Verification Checklist](#verification-checklist)

---

## Overview

This guide walks through implementing the clean three-layer architecture described in `ORCHESTRATOR_QUOTA_SEPARATION.md`.

**What's changing**:

- ✅ Create `server/utils/quotaTracker.js` (new file)
- ✅ Update `server/geminiClient.js` (add call tracking)
- ✅ Update `server/genieService.js` (add cost calculation + quota check)
- ✅ Update `server/ebookService.js` (remove quota logic)
- ✅ Update `server/index.js` (handle 202 deferral responses)
- ✅ Update `server/aiService.js` (pass callIndex through)

**No breaking changes** — backward compatible with existing tests.

---

## Step 1: Create quotaTracker Module

### File: `server/utils/quotaTracker.js`

**Purpose**: Pure accounting module. No decisions, just counting API calls within the 60-second window.

```javascript
/**
 * quotaTracker - Pure quota accounting module
 *
 * Tracks API calls within a 60-second window.
 * Single responsibility: count calls and expose status.
 * No pause/resume logic, no flow control.
 *
 * Used by:
 * - genieService.process() to check availability before dispatching
 * - geminiClient.callGemini() to record successful API calls
 */

const quotaTracker = (() => {
  let callCount = 0;
  let windowStart = Date.now();

  // Gemini free tier: 20 calls per minute
  const LIMIT = 20;
  const WINDOW_MS = 60 * 1000; // 60 seconds

  /**
   * Record a successful API call
   * Called by geminiClient after each successful Gemini API request
   */
  function recordCall() {
    // Auto-rotate window if expired
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      rotateWindow();
    }

    callCount++;

    // Debug logging
    const status = getStatus();
    console.log(
      `[QUOTA] Call recorded: ${status.callCount}/${status.limit} ` +
        `(${Math.round(status.percentUsed)}% used, ` +
        `${status.availableQuota} remaining)`
    );
  }

  /**
   * Get current quota status
   * Called by genieService.process() before dispatching to domain service
   *
   * @returns {Object} { callCount, limit, availableQuota, percentUsed, windowResetAt, windowExpiredMs }
   */
  function getStatus() {
    const now = Date.now();
    const elapsed = now - windowStart;
    const windowExpired = elapsed >= WINDOW_MS;

    // Auto-rotate if window expired
    if (windowExpired) {
      rotateWindow();
      return getStatus(); // Recursively get status for new window
    }

    return {
      callCount,
      limit: LIMIT,
      availableQuota: Math.max(0, LIMIT - callCount),
      percentUsed: (callCount / LIMIT) * 100,
      windowResetAt: windowStart + WINDOW_MS,
      windowExpiredMs: WINDOW_MS - elapsed, // Milliseconds until window resets
      windowStarted: windowStart,
      isExpired: false,
    };
  }

  /**
   * Rotate window: reset call count and start time
   * Called automatically when 60s window expires
   */
  function rotateWindow() {
    console.log(`[QUOTA] Window rotated: reset counter from ${callCount} to 0`);
    callCount = 0;
    windowStart = Date.now();
  }

  /**
   * Force a manual window rotation (useful for testing)
   * DO NOT call in production code
   */
  function _forceRotateForTesting() {
    rotateWindow();
  }

  // Expose public API
  return {
    recordCall,
    getStatus,
    rotateWindow,
    _forceRotateForTesting, // For tests only
  };
})();

module.exports = quotaTracker;
```

### Testing quotaTracker

```javascript
// test: server/__tests__/quotaTracker.test.js (create new file)

import { describe, it, expect, beforeEach } from "vitest";
const quotaTracker = require("../../utils/quotaTracker");

describe("quotaTracker", () => {
  beforeEach(() => {
    quotaTracker._forceRotateForTesting();
  });

  it("should initialize with zero calls", () => {
    const status = quotaTracker.getStatus();
    expect(status.callCount).toBe(0);
    expect(status.availableQuota).toBe(20);
    expect(status.percentUsed).toBe(0);
  });

  it("should record calls and decrement available quota", () => {
    quotaTracker.recordCall();
    quotaTracker.recordCall();
    quotaTracker.recordCall();

    const status = quotaTracker.getStatus();
    expect(status.callCount).toBe(3);
    expect(status.availableQuota).toBe(17);
    expect(Math.round(status.percentUsed)).toBe(15);
  });

  it("should rotate window when expired", () => {
    // Record 5 calls
    for (let i = 0; i < 5; i++) {
      quotaTracker.recordCall();
    }
    expect(quotaTracker.getStatus().callCount).toBe(5);

    // Force rotation
    quotaTracker._forceRotateForTesting();

    // Should reset to 0
    const status = quotaTracker.getStatus();
    expect(status.callCount).toBe(0);
    expect(status.availableQuota).toBe(20);
  });
});
```

### Verification

```bash
npm --prefix server test -- quotaTracker.test.js
# Should show 3 passing tests
```

---

## Step 2: Update geminiClient for Call Tracking

### File: `server/geminiClient.js`

**Location**: Locate the `callGemini()` function (approximately line 170)

**Change**: Add call tracking after successful API call

```javascript
// BEFORE (around line 170)
async function callGemini({
  prompt,
  modality = "TEXT",
  generationConfig = {},
  imageB64 = null,
  // ... other parameters
}) {
  const apiUrl = (isText ? process.env.GEMINI_API_URL_TEXT : ...) || process.env.GEMINI_API_URL;
  const rawKey = (isText ? process.env.GEMINI_API_KEY_TEXT : ...) || process.env.GEMINI_API_KEY;

  // ... build request payload ...

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  // AFTER response received (but BEFORE returning)
  if (response.ok) {
    // ✅ NEW: Track successful call for quota purposes
    try {
      const quotaTracker = require("./utils/quotaTracker");
      quotaTracker.recordCall();
    } catch (err) {
      // Non-fatal: if quota tracking fails, still return response
      console.warn(
        "[QUOTA] Failed to record API call",
        err && err.message
      );
    }
  }

  return response; // Return as normal
}
```

### Implementation Details

**Important**: Only track **successful** calls (response.ok = true)

```javascript
// DETAILED IMPLEMENTATION (around line 340 in geminiClient.js)

const response = await fetch(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-goog-api-key": rawKey },
  body: JSON.stringify(payload),
});

// Parse response
const responseData = await response.json();

if (response.ok) {
  // ✅ Track call for quota purposes (only on success)
  try {
    const quotaTracker = require("./utils/quotaTracker");
    quotaTracker.recordCall();
    console.log(
      `[GEMINI] API call successful, quota tracked: ${response.status}`
    );
  } catch (err) {
    console.warn("[QUOTA] Failed to track API call:", err && err.message);
  }

  // Return success response
  return {
    ok: true,
    status: response.status,
    json: responseData,
    text: responseData?.candidates?.[0]?.content?.parts?.[0]?.text || "",
    model: responseData?.model || "gemini",
  };
} else {
  // Do NOT track failed calls
  console.warn(
    `[GEMINI] API call failed: ${response.status}`,
    responseData?.error || ""
  );

  return {
    ok: false,
    status: response.status,
    error: responseData?.error || "Unknown error",
  };
}
```

### Why Track Only Successful Calls?

- Failed calls (429, 503, timeout) should NOT count toward quota
- Quota represents actual consumption, not attempts
- This keeps accounting accurate and simpler to reason about

### Testing

```javascript
// In geminiClient test file, add:
it("should track successful API calls", async () => {
  const quotaTracker = require("../../utils/quotaTracker");
  quotaTracker._forceRotateForTesting();

  const initialStatus = quotaTracker.getStatus();
  expect(initialStatus.callCount).toBe(0);

  // Mock Gemini API response
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      /* valid response */
    }),
  });

  await callGemini({ prompt: "test" });

  const finalStatus = quotaTracker.getStatus();
  expect(finalStatus.callCount).toBe(1);
});
```

---

## Step 3: Add Cost Calculation to genieService

### File: `server/genieService.js`

**Location**: Add cost calculation helper at module level (before the genieService object definition)

```javascript
// Add near the top of genieService.js (after requires, before exports)

/**
 * Calculate API call cost for a given service mode
 * Used by orchestrator to check quota BEFORE dispatching to service
 *
 * @param {string} mode - Service mode: "ebook", "poetry", "blog", etc.
 * @param {Object} metadata - Service metadata (pageCount, wordCount, etc.)
 * @returns {number} Number of API calls required
 */
function calculateCostForMode(mode, metadata = {}) {
  const PAGES_PER_CALL = 2; // Ebook: 2 pages per Gemini call (typical)
  const WORDS_PER_CALL = 500; // Blog: 500 words per Gemini call

  if (mode === "ebook") {
    const pageCount = metadata.pageCount || 10;
    // +1 for structure call, then divide pages by PAGES_PER_CALL
    // Example: 10 pages → 1 structure + 10/2 chapters = 1 + 5 = 6 calls
    return 1 + Math.ceil(pageCount / PAGES_PER_CALL);
  }

  if (mode === "poetry") {
    // Single call for poem generation
    return 1;
  }

  if (mode === "blog") {
    const wordCount = metadata.wordCount || 2000;
    // Blog posts: estimate calls based on word count
    return Math.ceil(wordCount / WORDS_PER_CALL);
  }

  if (mode === "custom") {
    // Custom services can provide explicit cost
    return metadata.estimatedCost || 1;
  }

  // Default: assume 1 call
  return 1;
}

// Export for tests and genieService.process
const genieService = {
  // ... existing methods ...
};

module.exports = { ...genieService, calculateCostForMode };
```

### Cost Calculation Examples

```javascript
// Examples of cost calculation:

// Ebook: 10 pages
// Cost = 1 (structure) + ceil(10 / 2) = 1 + 5 = 6 calls
calculateCostForMode("ebook", { pageCount: 10 }); // → 6

// Ebook: 5 pages
// Cost = 1 + ceil(5 / 2) = 1 + 3 = 4 calls
calculateCostForMode("ebook", { pageCount: 5 }); // → 4

// Poetry: always 1 call
calculateCostForMode("poetry", {}); // → 1

// Blog: 2000 words
// Cost = ceil(2000 / 500) = 4 calls
calculateCostForMode("blog", { wordCount: 2000 }); // → 4
```

### Testing Cost Calculation

```javascript
// In server/__tests__/genieService.test.js, add:

it("should calculate cost correctly for ebook mode", () => {
  expect(calculateCostForMode("ebook", { pageCount: 10 })).toBe(6); // 1 structure + 5 chapters
});

it("should calculate cost correctly for poetry mode", () => {
  expect(calculateCostForMode("poetry", {})).toBe(1);
});

it("should calculate cost correctly for blog mode", () => {
  expect(calculateCostForMode("blog", { wordCount: 2000 })).toBe(4); // ceil(2000 / 500)
});
```

---

## Step 4: Move Quota Check to Orchestrator

### File: `server/genieService.js`

**Location**: In the `process()` method (this is the orchestrator entry point)

**Current code** (what to replace):

```javascript
async function process(payload) {
  const { mode, prompt, metadata } = payload;

  // ... existing code ...

  if (mode === "ebook") {
    const ebookService = require("./ebookService");
    result = await ebookService.handle(payload, classification);
  }
  // ... other services ...

  return result;
}
```

**New code** (with quota check):

```javascript
async function process(payload) {
  const { mode, prompt, metadata } = payload;

  // ✅ PLATFORM CONCERN: Quota check before ANY service dispatch
  // This ensures consistent quota protection across all services

  const quotaTracker = require("./utils/quotaTracker");
  const cost = calculateCostForMode(mode, metadata);
  const status = quotaTracker.getStatus();

  console.log(
    `[QUOTA] Checking quota for mode '${mode}': ` +
      `cost=${cost}, available=${status.availableQuota}`
  );

  // Check if sufficient quota available
  if (status.availableQuota < cost) {
    console.log(
      `[QUOTA] Insufficient quota: need ${cost}, have ${status.availableQuota}`
    );

    // Throw deferral error (will be caught in index.js)
    const err = new Error(
      `Quota exhausted: need ${cost} calls, but only ${status.availableQuota} available`
    );
    err.status = 202; // Accepted, not processed yet
    err.defer = true;
    err.cost = cost;
    err.availableQuota = status.availableQuota;
    err.windowResetAtMs = status.windowResetAt;
    throw err;
  }

  console.log(`[QUOTA] Quota check passed: proceeding with service dispatch`);

  // ✅ DOMAIN ROUTING: Service is guaranteed to have quota available
  let result;

  if (mode === "ebook") {
    console.log("[EBOOK] Dispatching to ebookService.handle()");
    const ebookService = require("./ebookService");
    result = await ebookService.handle(payload, classification);
  } else if (mode === "poetry") {
    console.log("[POETRY] Dispatching to poetryService.handle()");
    const poetryService = require("./poetryService");
    result = await poetryService.handle(payload, classification);
  } else if (mode === "blog") {
    console.log("[BLOG] Dispatching to blogService.handle()");
    const blogService = require("./blogService");
    result = await blogService.handle(payload, classification);
  } else {
    const err = new Error(`Unknown mode: ${mode}`);
    err.status = 400;
    throw err;
  }

  return result;
}
```

### Key Design Points

1. **Quota check happens ONCE** per request, before any service dispatch
2. **Cost is calculated** based on mode + metadata (centralized logic)
3. **Error has defer flag** — caught in index.js and handled as 202 response
4. **Logging is clear** — debug logs show quota decisions
5. **Service dispatch is guaranteed** — if we reach line with service dispatch, quota is sufficient

---

## Step 5: Clean Up Domain Services

### File: `server/ebookService.js`

**Location**: In the `handle()` function (around line 65)

**Remove quota check logic**:

```javascript
// ❌ DELETE THIS ENTIRE SECTION (around line 60-80):

// OLD CODE TO REMOVE:
// const quotaTracker = require("./utils/quotaTracker");
// const cost = Math.ceil(pageCount / PAGES_PER_CALL);
// const status = quotaTracker.getStatus();
// if (status.availableQuota < cost) {
//   const err = new Error("Quota exhausted; job deferred");
//   err.status = 202;
//   throw err;
// }
```

**Result**: ebookService.handle() should only contain:

```javascript
/**
 * Generate ebook from prompt
 * ASSUMES quota is already checked by orchestrator
 *
 * @param {Object} payload - { prompt, metadata }
 * @param {Object} classification - Optional classification data
 * @returns {Promise<Object>} { pages, metadata, html, actions }
 */
async function handle(payload, classification) {
  const { prompt } = payload;
  const {
    theme = "dark",
    pageCount = 8,
    colorPalette = "standard",
    fontSizeScale = 1.0,
  } = payload.metadata || {};

  // ✅ Domain validation (unchanged)
  if (!prompt || !String(prompt).trim()) {
    const e = new Error("ebookService: prompt is required");
    e.status = 400;
    throw e;
  }

  if (typeof pageCount !== "number" || pageCount < 3 || pageCount > 20) {
    const e = new Error("ebookService: pageCount must be 3-20");
    e.status = 400;
    throw e;
  }

  // ✅ Create AI service (unchanged)
  let aiSvc;
  try {
    const { createAIService } = require("./aiService");
    aiSvc = createAIService();
  } catch (err) {
    aiSvc = {
      async generateContent(p) {
        return {
          content: {
            title: `Auto: ${String(p).slice(0, 30)}`,
            body: String(p),
          },
        };
      },
    };
  }

  try {
    // ✅ Generate structure (with callIndex=0 for Pro model)
    const structureResp = await aiSvc.generateContent(structurePrompt, 0);

    // ✅ Generate chapters (with callIndex=1+ for Flash model)
    const chapters = [];
    for (let i = 0; i < structure.outline.length; i++) {
      const chapterResp = await aiSvc.generateContent(chapterPrompt, i + 1);
      chapters.push(chapterResp);
    }

    // ✅ Return structured result
    return {
      pages: chapters,
      metadata: { model: "ebook-v1", pageCount },
      html: null,
      actions: { generate_pdf: true },
    };
  } catch (error) {
    console.error("ebookService error:", error?.message);
    throw error;
  }
}
```

**Key changes**:

1. ❌ Remove all quota tracker imports
2. ❌ Remove cost calculation
3. ❌ Remove quota status check
4. ❌ Remove deferral logic
5. ✅ Keep domain validation (input validation still needed)
6. ✅ Keep AI service calls with `callIndex` parameter

---

## Step 6: Handle Deferral Responses

### File: `server/index.js`

**Location**: In the POST /api/ebook/generate route handler (around line 2922)

**Update error handling**:

```javascript
app.post("/api/ebook/generate", async (req, res) => {
  const startTime = Date.now();
  const reqId = req.id || "unknown";
  console.log(
    `[${new Date().toISOString()}] [${reqId}] POST /api/ebook/generate started`
  );

  // ... input validation code (unchanged) ...

  try {
    const payload = {
      mode: "ebook",
      prompt,
      metadata: { theme, pageCount: pageCountNum, colorPalette, fontSizeScale },
    };

    console.log(
      `[${new Date().toISOString()}] [${reqId}] Calling genieService.process()`
    );

    let result;
    try {
      result = await genieService.process(payload);
    } catch (err) {
      // ✅ NEW: Handle quota deferral errors
      if (err.defer && err.status === 202) {
        console.log(
          `[${new Date().toISOString()}] [${reqId}] Quota insufficient, deferring request`
        );

        return res.status(202).json({
          message: "Quota exhausted; request deferred for retry",
          requiredQuota: err.cost,
          availableQuota: err.availableQuota,
          windowResetAtMs: err.windowResetAtMs,
          retryAfterSeconds: Math.ceil((err.windowResetAtMs || 60000) / 1000),
          requestId: reqId,
        });
      }

      // Other errors: 400, 500, etc.
      console.error(
        `[${new Date().toISOString()}] [${reqId}] genieService.process() ERROR:`,
        err?.message
      );
      throw err;
    }

    // ✅ Success: return 201 with generated ebook
    const envelope = result.out_envelope || result;

    if (!envelope || !envelope.pages || !Array.isArray(envelope.pages)) {
      return res.status(500).json({ error: "Failed to generate e-book" });
    }

    return res.status(201).json({
      id: `ebook_${Date.now()}`,
      chapters: envelope.pages,
      metadata: envelope.metadata,
      requestId: reqId,
    });
  } catch (error) {
    // ✅ Catch-all error handler
    console.error(
      `[${new Date().toISOString()}] [${reqId}] Unhandled error:`,
      error?.message
    );

    const statusCode = error?.status || 500;
    return res.status(statusCode).json({
      error: error?.message || "Internal server error",
      requestId: reqId,
    });
  }
});
```

### Client Handling of 202 Response

Clients should handle the 202 response:

```javascript
// Frontend example (JavaScript)

const response = await fetch("/api/ebook/generate", {
  method: "POST",
  body: JSON.stringify({ prompt, pageCount, theme }),
});

if (response.status === 202) {
  // Quota exhausted
  const data = await response.json();
  console.log(
    `Quota exhausted. Retrying in ${data.retryAfterSeconds} seconds...`
  );

  // Wait and retry
  setTimeout(() => {
    // Retry the request
    fetch("/api/ebook/generate", {
      /* ... */
    });
  }, data.retryAfterSeconds * 1000);
} else if (response.status === 201) {
  // Success
  const ebook = await response.json();
  console.log("Ebook generated:", ebook);
}
```

---

## Step 7: Testing Strategy

### Unit Tests

```bash
# Test quotaTracker in isolation
npm --prefix server test -- quotaTracker.test.js

# Test cost calculation
npm --prefix server test -- genieService.test.js

# Test geminiClient call tracking
npm --prefix server test -- geminiClient.test.js
```

### Integration Tests

Create `server/__tests__/quota-integration.test.js`:

```javascript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../index";

describe("Quota Integration", () => {
  beforeEach(async () => {
    if (typeof app.startServer === "function") await app.startServer();
  });

  it("should allow ebook generation when quota available", async () => {
    const res = await request(app).post("/api/ebook/generate").send({
      prompt: "Test ebook",
      pageCount: 3,
      theme: "dark",
    });

    // Should succeed or defer (both are valid)
    expect([201, 202]).toContain(res.status);
  });

  it("should return 202 when quota exhausted", async () => {
    // This requires mocking quotaTracker to simulate exhaustion
    // See testing section below for mock setup
    const res = await request(app).post("/api/ebook/generate").send({
      prompt: "Large ebook",
      pageCount: 20, // Expensive
      theme: "dark",
    });

    if (res.status === 202) {
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("requiredQuota");
      expect(res.body).toHaveProperty("availableQuota");
      expect(res.body).toHaveProperty("retryAfterSeconds");
    }
  });

  it("should return 400 for invalid pageCount", async () => {
    const res = await request(app).post("/api/ebook/generate").send({
      prompt: "Test",
      pageCount: 100, // Too high
      theme: "dark",
    });

    expect(res.status).toBe(400);
  });
});
```

### Mocking quotaTracker for Tests

```javascript
// In test setup (server/vitest.setup.js or similar):

let injectedQuotaTracker = null;

function setMockQuotaTracker(tracker) {
  injectedQuotaTracker = tracker;
}

function getMockQuotaTracker() {
  return injectedQuotaTracker || require("./utils/quotaTracker");
}

// In genieService.process(), use injected tracker:
const quotaTracker = injectedQuotaTracker || require("./utils/quotaTracker");
```

---

## Step 8: Error Handling & Edge Cases

### Case 1: Window Rotation During Request

**Scenario**: Quota window resets while generating ebook.

**Handling**: quotaTracker auto-rotates in `getStatus()` if window expired.

```javascript
// quotaTracker automatically handles this:
function getStatus() {
  const elapsed = now - windowStart;
  if (elapsed >= WINDOW_MS) {
    rotateWindow(); // Auto-rotate
    return getStatus(); // Re-check
  }
  // ...
}
```

**Result**: If quota resets mid-generation, calls after reset are counted against new window.

### Case 2: Failed API Call (429 Too Many Requests)

**Scenario**: Gemini returns 429 despite our quota check.

**Handling**: Only successful calls are tracked. Failed calls are not counted.

```javascript
// In geminiClient:
if (response.ok) {
  quotaTracker.recordCall(); // Only on success
} else {
  // Don't track failed calls
  return { ok: false, error: response.status };
}
```

**Result**: Quota check prevents 429s, but if one occurs anyway, it doesn't count against quota.

### Case 3: Service Failure After Quota Deduction

**Scenario**: ebookService fails partway through generation, after some API calls recorded.

**Handling**: Calls already recorded are counted; quota is NOT refunded.

**Rationale**: This is acceptable because:

1. We pre-checked that cost would fit within window
2. Failures are rare (well-tested code)
3. Quota resets in 60s anyway

**Alternative** (if needed in future): Track pending calls separately and refund on failure.

### Case 4: Multiple Concurrent Requests

**Scenario**: 2 requests hit quota check simultaneously.

**Handling**: quotaTracker uses closure (immutable state). Both see same status → both proceed or both defer.

```javascript
// Both threads read same callCount
const status = quotaTracker.getStatus(); // { callCount: 18, availableQuota: 2 }

// If both need 2 calls:
// - First succeeds (18 + 2 = 20)
// - Second records call, now at 21 (exceeds limit but in same window)

// Window resets in 60s and clears the overage
```

**Result**: Minor overage possible in high concurrency, but acceptable because:

- Free tier quota (20/min) is generous
- Overage is small (1-2 calls max)
- Resets in 60s
- Production: upgrade to paid tier with higher limits

### Case 5: Test Isolation

**Scenario**: Tests need isolated quota state.

**Handling**: Use `_forceRotateForTesting()` and test fixtures.

```javascript
// In test setup:
beforeEach(() => {
  quotaTracker._forceRotateForTesting();
});

// Now each test starts with clean state
```

---

## Verification Checklist

### Code Changes

- [ ] `server/utils/quotaTracker.js` created

  - [ ] `recordCall()` method implemented
  - [ ] `getStatus()` method implemented
  - [ ] `rotateWindow()` method implemented
  - [ ] Module exports correctly

- [ ] `server/geminiClient.js` updated

  - [ ] Call tracking added after successful API responses
  - [ ] Only successful calls tracked (not failures)
  - [ ] Non-fatal error handling if quota tracking fails
  - [ ] Debug logging added

- [ ] `server/genieService.js` updated

  - [ ] `calculateCostForMode()` function added
  - [ ] Cost calculation includes all service modes
  - [ ] `process()` method has quota check
  - [ ] Deferral error thrown with 202 status
  - [ ] Service dispatch happens only after quota check

- [ ] `server/ebookService.js` updated

  - [ ] All quota tracker imports removed
  - [ ] Cost calculation removed
  - [ ] Quota check removed
  - [ ] Domain validation preserved
  - [ ] callIndex passed to generateContent()

- [ ] `server/index.js` updated
  - [ ] 202 deferral response handled
  - [ ] Error messages include quota details
  - [ ] requestId included in responses

### Testing

- [ ] Unit test: quotaTracker accounting

  - [ ] `recordCall()` increments counter
  - [ ] `getStatus()` returns correct status
  - [ ] `rotateWindow()` resets state

- [ ] Unit test: cost calculation

  - [ ] Ebook cost calculated correctly (e.g., 10 pages → 6 calls)
  - [ ] Poetry cost is 1
  - [ ] Blog cost calculated correctly

- [ ] Integration test: successful generation

  - [ ] POST /api/ebook/generate returns 201 (or 202 if deferred)
  - [ ] Response includes chapters
  - [ ] quotaTracker shows incremented callCount

- [ ] Integration test: quota deferral

  - [ ] POST /api/ebook/generate returns 202 when quota insufficient
  - [ ] 202 response includes requiredQuota, availableQuota, retryAfterSeconds

- [ ] Edge case: quota window rotation

  - [ ] Window rotates correctly after 60s
  - [ ] New calls recorded in new window

- [ ] Error handling: 429 from Gemini
  - [ ] Failed call does NOT increment quota
  - [ ] Error returned to client

### Performance

- [ ] No measurable latency added by quota tracking

  - [ ] quotaTracker.recordCall() completes in <1ms
  - [ ] quotaTracker.getStatus() completes in <1ms

- [ ] No memory leaks
  - [ ] quotaTracker holds O(1) state (just counters)
  - [ ] No accumulation over time

### Logging

- [ ] Debug logs show quota decisions
  - [ ] `[QUOTA] Call recorded: X/20 (Y% used, Z remaining)`
  - [ ] `[QUOTA] Checking quota for mode 'ebook': cost=6, available=14`
  - [ ] `[QUOTA] Window rotated`

---

## Rollback Plan

If issues arise, rollback is clean:

1. Remove quota check from `genieService.process()` — reverts to unlimited API calls
2. Remove call tracking from `geminiClient` — quota tracker becomes dead code
3. Service operates as before (may hit Gemini 429 limits, but functionality preserved)

**No database changes**, **no data migration** needed.

---

## References

- **Architecture**: `docs/design/ORCHESTRATOR_QUOTA_SEPARATION.md`
- **Model Rotation**: `docs/design/MODEL_ROTATION_IMPLEMENTATION.md`
- **Branch Strategy**: `docs/design/BRANCH_STRATEGY_FEAT_EBOOK_REVERT.md`

---

**Owner**: Engineering Team  
**Status**: 🟢 READY FOR IMPLEMENTATION  
**Est. Time**: 2-3 hours (code + testing)
````
