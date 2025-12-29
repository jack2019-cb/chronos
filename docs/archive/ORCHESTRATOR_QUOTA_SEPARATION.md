````markdown
# Orchestrator-Quota Separation Architecture

**Date**: December 11, 2025 @ 3:00PM
**Branch**: `feat/ebook-revert`  
**Status**: Design Phase  
**Purpose**: Clean separation of business logic (domain services) from platform policies (quota enforcement)

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution: Three-Layer Architecture](#solution-three-layer-architecture)
   - [Layer 1: Orchestrator (Platform Policy)](#layer-1-orchestrator-platform-policy)
   - [Layer 2: Domain Services (Business Logic)](#layer-2-domain-services-business-logic)
   - [Layer 3: Infrastructure (Shared Utilities)](#layer-3-infrastructure-shared-utilities)
3. [Information Flow Diagram](#information-flow-diagram)
4. [Cost Calculation Helper](#cost-calculation-helper)
5. [Separation of Concerns: Benefits](#separation-of-concerns-benefits)
6. [Extensibility: Adding New Services](#extensibility-adding-new-services)
7. [Deferral Handling](#deferral-handling)
8. [Comparison: Old vs New](#comparison-old-vs-new)
9. [Related Documentation](#related-documentation)
10. [Implementation Checklist](#implementation-checklist)
11. [Next Steps](#next-steps)

---

## Problem Statement

Previous quota design (see `BRANCH_STRATEGY_FEAT_EBOOK_REVERT.md`) embedded quota checks directly in `ebookService.handle()`:

```javascript
// ❌ PROBLEMATIC: mixing concerns
async function handle(payload) {
  // Business logic
  const cost = Math.ceil(pageCount / PAGES_PER_CALL);

  // Platform logic (shouldn't be here)
  const quotaTracker = require("./utils/quotaTracker");
  if (quotaTracker.getStatus().availableQuota < cost) {
    throw error; // defer job
  }

  // Business logic (continued)
  const content = await aiSvc.generateContent(...);
  return { pages, metadata };
}
```

**Issues**:

1. **Tight coupling**: Each new service (poetryService, blogService) must re-implement quota logic
2. **Mixed responsibilities**: ebookService cares about both "generate ebook" AND "manage quotas"
3. **Non-reusable patterns**: Quota enforcement can't be applied consistently across future services
4. **Harder to test**: Can't test ebookService in isolation from quota tracker
5. **Harder to extend**: Adding new quota policies (per-user limits, priority queues) requires touching every service

---

## Solution: Three-Layer Architecture

### Layer 1: Orchestrator (Platform Policy)

**File**: `server/genieService.js` — `process()` method

**Responsibility**: Route requests to domain services while applying platform-level policies

```javascript
async function process(payload) {
  const { mode, prompt, metadata } = payload;

  // ✅ Platform concern: quotas, auth, rate limits, etc.
  // Applied BEFORE dispatching to any service

  const quotaTracker = require("./utils/quotaTracker");
  const cost = calculateCostForMode(mode, metadata);
  const status = quotaTracker.getStatus();

  if (status.availableQuota < cost) {
    const err = new Error("Quota exhausted; request deferred");
    err.status = 202; // Accepted, not processed yet
    err.defer = true;
    err.requiredQuota = cost;
    err.availableQuota = status.availableQuota;
    throw err; // Caught in index.js, handled as deferral
  }

  // ✅ Domain routing: dispatch to appropriate service
  // Service is GUARANTEED to have quota available

  if (mode === "ebook") {
    const ebookService = require("./ebookService");
    return await ebookService.handle(payload);
  }

  if (mode === "poetry") {
    const poetryService = require("./poetryService");
    return await poetryService.handle(payload);
  }

  if (mode === "blog") {
    const blogService = require("./blogService");
    return await blogService.handle(payload);
  }

  // Future services automatically get quota protection
  // without any changes to this orchestrator ✅
}
```

**Key Design Decisions**:

- Quota check happens **once** per request at the orchestrator
- Cost calculation is **centralized** (single `calculateCostForMode()` function)
- Deferral policy is **consistent** across all services (return 202)
- Services are dispatched **only if quota is sufficient**

---

### Layer 2: Domain Services (Business Logic)

**Files**:

- `server/ebookService.js` — Generate ebook from prompt
- `server/poetryService.js` (future) — Generate poem from prompt
- `server/blogService.js` (future) — Generate blog post from prompt

**Responsibility**: Implement domain-specific logic WITHOUT any quota awareness

```javascript
// ✅ CLEAN: pure domain logic
async function handle(payload, classification) {
  const { prompt, metadata } = payload;
  const { pageCount, theme } = metadata;

  // Validate domain inputs
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    const e = new Error("ebookService: prompt is required");
    e.status = 400;
    throw e;
  }

  if (pageCount < 3 || pageCount > 20) {
    const e = new Error("ebookService: pageCount must be 3-20");
    e.status = 400;
    throw e;
  }

  // Create AI service and generate content
  // (Quota is already guaranteed by orchestrator)
  const aiSvc = createAIService();

  // Structure generation
  const structureResp = await aiSvc.generateContent(structurePrompt, 0);

  // Chapter generation
  const chapters = [];
  for (let i = 0; i < structure.outline.length; i++) {
    const chapterResp = await aiSvc.generateContent(chapterPrompt, i + 1);
    chapters.push(chapterResp);
  }

  // Return domain-specific result
  return {
    pages: chapters,
    metadata: { model: "ebook-v1", pageCount },
    html: null, // Composed by orchestrator if needed
    actions: { generate_pdf: true, can_export: true },
  };
}

// Export for orchestrator to dispatch
module.exports = { handle };
```

**Key Design Decisions**:

- **No quota logic** — trust orchestrator has already checked
- **No deferral logic** — if we're running, quota is available
- **Pure business focus** — validate inputs, generate content, return result
- **Testable in isolation** — no external dependencies on quota tracker
- **Reusable logic** — same pattern works for poetry, blog, etc.

---

### Layer 3: Infrastructure (Shared Utilities)

**Files**:

- `server/utils/quotaTracker.js` — Quota accounting
- `server/geminiClient.js` — API wrapper with call tracking
- `server/aiService.js` — AI provider abstraction

**Responsibility**: Provide reusable, cross-service utilities

```javascript
// server/utils/quotaTracker.js
// Pure accounting, no flow control

const quotaTracker = {
  callCount: 0,
  limit: 20, // Gemini free tier: 20 calls/min
  windowStart: Date.now(),

  recordCall() {
    this.callCount++;
    // Called after each successful API call
  },

  getStatus() {
    const elapsed = Date.now() - this.windowStart;
    const windowExpired = elapsed > 60 * 1000;

    if (windowExpired) {
      this.rotateWindow();
    }

    return {
      callCount: this.callCount,
      limit: this.limit,
      availableQuota: this.limit - this.callCount,
      percentUsed: (this.callCount / this.limit) * 100,
      windowResetAt: this.windowStart + 60 * 1000,
      windowExpiredMs: windowExpired ? 0 : 60 * 1000 - elapsed,
    };
  },

  rotateWindow() {
    this.callCount = 0;
    this.windowStart = Date.now();
  },
};

module.exports = quotaTracker;
```

```javascript
// server/geminiClient.js (excerpt)

async function callGemini({
  prompt,
  modality = "TEXT",
  generationConfig = {},
  imageB64 = null,
  callIndex = null, // Model rotation (see MODEL_ROTATION_ARCHITECTURE.md)
}) {
  // Select model based on callIndex
  let apiUrl, rawKey;
  if (callIndex !== null && callIndex === 0) {
    apiUrl = process.env.GEMINI_API_URL_VISION || process.env.GEMINI_API_URL;
    rawKey = process.env.GEMINI_API_KEY_VISION || process.env.GEMINI_API_KEY;
  } else if (callIndex !== null && callIndex > 0) {
    apiUrl = process.env.GEMINI_API_URL || process.env.GEMINI_API_URL_TEXT;
    rawKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_TEXT;
  } else {
    // Default model selection (existing logic)
    apiUrl = /* ... */;
    rawKey = /* ... */;
  }

  // Make API call
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(/* ... */)
  });

  // ✅ Track the call (quota accounting)
  const quotaTracker = require("./utils/quotaTracker");
  quotaTracker.recordCall();

  return response;
}

module.exports = { callGemini };
```

**Key Design Decisions**:

- **quotaTracker is purely accounting** — no decisions, just counting
- **Call tracking is implicit** — happens automatically in geminiClient
- **Shared by all services** — any service using geminiClient automatically tracked
- **Independent of domain** — doesn't know about ebooks, poetry, blogs

---

## Information Flow Diagram

```
Request: POST /api/ebook/generate
{ prompt, pageCount, theme }
         │
         ↓
┌─────────────────────────────────────────┐
│ index.js route handler                  │
│ - Parse request                         │
│ - Build payload: { mode: "ebook", ... } │
│ - Call genieService.process()           │
└─────────────────┬───────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────┐
│ ORCHESTRATOR: genieService.process()    │
│                                         │
│ 1. Check mode: "ebook"                  │
│ 2. Calculate cost: ceil(10 / 2) = 5     │
│ 3. quotaTracker.getStatus()             │
│    → { availableQuota: 8, ... }         │
│ 4. Cost (5) <= Available (8)? YES       │
│ 5. Dispatch to ebookService.handle()    │
└─────────────────┬───────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────┐
│ SERVICE: ebookService.handle()          │
│                                         │
│ 1. Validate inputs (pageCount 3-20)     │
│ 2. Create AI service                    │
│ 3. Generate structure (callIndex=0)     │
│    → aiService.generateContent()        │
│       → geminiClient.callGemini()       │
│          → quotaTracker.recordCall()    │
│ 4. Generate 10 chapters (callIndex=1+)  │
│ 5. Return { pages, metadata }           │
└─────────────────┬───────────────────────┘
                  │
                  ↓
         Result to index.js
         Return 201 + body
```

---

## Cost Calculation Helper

**Location**: `server/genieService.js`

```javascript
// Centralized cost calculation logic
// Used by orchestrator before dispatching

const PAGES_PER_CALL = 2;
const WORDS_PER_CALL = 500;

function calculateCostForMode(mode, metadata = {}) {
  if (mode === "ebook") {
    const pageCount = metadata.pageCount || 10;
    return Math.ceil((pageCount + 1) / PAGES_PER_CALL); // +1 for structure
  }

  if (mode === "poetry") {
    return 1; // Single call for short poem
  }

  if (mode === "blog") {
    const articleLength = metadata.articleLength || 5;
    return Math.ceil(articleLength / WORDS_PER_CALL);
  }

  // Default: assume 1 call
  return 1;
}

module.exports = { calculateCostForMode };
```

---

## Separation of Concerns: Benefits

| Concern               | Owner                | Reusable?       | Testable?             |
| --------------------- | -------------------- | --------------- | --------------------- |
| **Quota accounting**  | quotaTracker         | ✅ All services | ✅ Isolated unit test |
| **Quota enforcement** | genieService.process | ✅ All services | ✅ Mock services      |
| **Model rotation**    | geminiClient         | ✅ All services | ✅ API mock           |
| **Ebook generation**  | ebookService         | ❌ Ebooks only  | ✅ Pure domain logic  |
| **Poetry generation** | poetryService        | ❌ Poetry only  | ✅ Pure domain logic  |
| **Blog generation**   | blogService          | ❌ Blogs only   | ✅ Pure domain logic  |

---

## Extensibility: Adding New Services

**Step 1**: Implement new service (copy ebookService pattern)

```javascript
// server/poetryService.js
async function handle(payload) {
  const { prompt } = payload;

  // Pure domain logic
  const aiSvc = createAIService();
  const response = await aiSvc.generateContent(prompt, null);

  return {
    poem: response.content,
    metadata: { model: "poetry-v1" },
  };
}

module.exports = { handle };
```

**Step 2**: Register in orchestrator (4 lines)

```javascript
// server/genieService.js - process()

if (mode === "poetry") {
  const poetryService = require("./poetryService");
  return await poetryService.handle(payload);
}
```

**Step 3**: Update cost calculation (1 line)

```javascript
if (mode === "poetry") {
  return 1; // Poetry always costs 1 call
}
```

**That's it!** New service is automatically quota-protected, call-tracked, and model-rotated.

---

## Deferral Handling

When quota is insufficient, orchestrator throws a deferral error:

```javascript
// In genieService.process()
if (status.availableQuota < cost) {
  const err = new Error("Quota exhausted; request deferred");
  err.status = 202; // Accepted, not yet processed
  err.defer = true;
  err.cost = cost;
  err.availableQuota = status.availableQuota;
  throw err;
}
```

**In index.js** (error handler catches this):

```javascript
app.post("/api/ebook/generate", async (req, res) => {
  try {
    const result = await genieService.process(payload);
    return res.status(201).json(result);
  } catch (err) {
    if (err.defer) {
      // Enqueue for retry after 60s window reset
      return res.status(202).json({
        message: "Quota exhausted; request queued for retry",
        cost: err.cost,
        availableQuota: err.availableQuota,
        retryAfterSeconds: 60,
      });
    }

    // Other errors...
  }
});
```

---

## Comparison: Old vs New

| Aspect                   | Old (BRANCH_STRATEGY)          | New (This Doc)                 |
| ------------------------ | ------------------------------ | ------------------------------ |
| **Quota location**       | In ebookService                | In genieService.process        |
| **Reusable quota logic** | ❌ Copy-paste for each service | ✅ Single implementation       |
| **Service focus**        | Mixed (domain + platform)      | ✅ Pure domain                 |
| **Cost calculation**     | Per-service                    | ✅ Centralized                 |
| **Testability**          | Hard (tightly coupled)         | ✅ Easy (isolated)             |
| **Extensibility**        | Hard (repeat quota logic)      | ✅ Easy (register + cost)      |
| **Future policies**      | Affects all services           | ✅ Change once in orchestrator |

---

## Related Documentation

- **Model Rotation**: `docs/design/MODEL_ROTATION_ARCHITECTURE.md` — callIndex-based Pro/Flash routing
- **Model Rotation Implementation**: `docs/design/MODEL_ROTATION_IMPLEMENTATION.md` — Step-by-step code changes
- **Original Branch Strategy**: `docs/design/BRANCH_STRATEGY_FEAT_EBOOK_REVERT.md` — Quota motivation and Gemini context

---

## Implementation Checklist

- [ ] Create `server/utils/quotaTracker.js` (pure accounting module)
- [ ] Update `server/geminiClient.js` to call `quotaTracker.recordCall()`
- [ ] Add `calculateCostForMode()` helper to `server/genieService.js`
- [ ] Move quota check from `ebookService.handle()` to `genieService.process()`
- [ ] Add deferral error handling in `index.js` (return 202)
- [ ] Implement model rotation in `geminiClient` (callIndex parameter)
- [ ] Update `aiService.generateContent()` to accept callIndex
- [ ] Update `ebookService` calls to pass callIndex (0 for structure, i+1 for chapters)
- [ ] Add unit tests for quotaTracker
- [ ] Add integration tests for deferral flow
- [ ] Document cost calculation logic

---

## Next Steps

1. **Implement infrastructure layer** (quotaTracker, geminiClient updates)
2. **Refactor orchestrator** (move quota check to genieService.process)
3. **Clean up domain services** (remove quota logic from ebookService)
4. **Test end-to-end** (ensure deferral works correctly)
5. **Document API contracts** (202 responses, deferral retry semantics)

---

**Owner**: Architecture Review  
**Status**: 🟢 READY FOR IMPLEMENTATION  
**Effort**: 2-3 hours (same as original plan, just better organized)
````
