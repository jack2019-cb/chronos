# AetherPress Backend Architecture

## Implementation-Based Deep Dive

**Date**: December 17, 2025  @ 3:30PM
**Scope**: Scope 2 - Backend Architecture (Implementation Verified)  
**Target Audience**: Backend developers, DevOps, API consumers  
**Reading Time**: ~20-25 minutes

**Status**: ✅ IMPLEMENTATION-VERIFIED (Reverse-engineered from actual source code)

**Related**:

- [ARCHITECTURE_DOCUMENTATION_PROPOSAL.md](ARCHITECTURE_DOCUMENTATION_PROPOSAL.md) (4-scope project overview)
- [PIPELINE_SEPARATION_BLUEPRINT.md](focus/PIPELINE_SEPARATION_BLUEPRINT.md) (Branch strategy)
- Historical: [BACKEND_ARCHITECTURE_REF0.md](BACKEND_ARCHITECTURE_REF0.md)

---

## Table of Contents

1. [System Overview](#system-overview)
2. [HTTP Entry Point](#http-entry-point)
3. [Gemini API Rate Limits](#gemini-api-rate-limits)
4. [Quota Management System](#quota-management-system)
5. [Orchestration Layer (genieService)](#orchestration-layer)
6. [Ebook Service (Two Strategies)](#ebook-service)
7. [AI Service Integration](#ai-service-integration)
8. [Request/Response Flow](#requestresponse-flow)
9. [Error Handling & Quota Deferral](#error-handling)
10. [Performance Characteristics](#performance-characteristics)
11. [Database Layer](#database-layer)
12. [Actual vs. Documented Discrepancies](#discrepancies)

---

## System Overview

### High-Level Request Path

```
POST /api/ebook/generate
│
├─ Validate input (prompt, pageCount, theme, etc.)
├─ Create payload: { mode: "ebook", prompt, metadata: {...} }
│
└─ genieService.process(payload)
    ├─ ✅ Check persistence cache (avoid duplicate work)
    ├─ 📊 Calculate cost: cost = 1 + ceil(pageCount / 2)
    ├─ 🔐 Check quota: need cost calls in 60s window
    │   ├─ If insufficient → throw 202 (Retry-Later)
    │   └─ If sufficient → reserve quota and proceed
    ├─ Dispatch to service handler:
    │   ├─ if strategy==='nat-cont_0' → ebookService.handleNARRATIVE_CONT_0()
    │   └─ else → ebookService.handleLegacy()
    ├─ Record API calls in global quota tracker
    └─ Return response envelope: { pages, html, metadata }
│
└─ HTTP Response
    ├─ 200: Success { id, pages, html, metadata }
    ├─ 202: Quota deferred { message, requiredQuota, retryAfterSeconds }
    ├─ 400: Bad request
    └─ 500: Server error
```

### Core Services

| Service          | File                           | Responsibility                       |
| ---------------- | ------------------------------ | ------------------------------------ |
| **genieService** | `server/genieService.js`       | Orchestration, quota checks, routing |
| **ebookService** | `server/ebookService.js`       | Ebook generation (two strategies)    |
| **geminiClient** | `server/geminiClient.js`       | Raw API calls to Google Gemini       |
| **quotaTracker** | `server/utils/quotaTracker.js` | Global 60s rolling window quota      |

---

## HTTP Entry Point

### POST /api/ebook/generate

**File**: [server/index.js](../../../../server/index.js#L2923)

**Request Schema**:

```javascript
{
  prompt: string,           // Required: user's topic/request
  theme: "dark"|"light",   // Optional (default: "dark")
  pageCount: 3-20,         // Optional (default: 10)
  colorPalette: string,    // Optional (default: "default")
  fontSizeScale: 0.8-1.2   // Optional (default: 1.0)
}
```

**Request Validation** (lines 2945-2970):

```javascript
// Validate prompt
if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
  return res.status(400).json({ error: "Prompt required" });
}

// Validate theme
const validThemes = ["dark", "light", "corporate", "bold"];
if (!validThemes.includes(theme)) {
  return res.status(400).json({ error: "Invalid theme" });
}

// Validate pageCount
const pageCountNum = parseInt(pageCount, 10);
if (isNaN(pageCountNum) || pageCountNum < 3 || pageCountNum > 20) {
  return res.status(400).json({ error: "Page count must be 3-20" });
}
```

**Request Timeout Configuration** (line 2934):

```javascript
// Set generous timeout for LLM processing
req.setTimeout(600000); // 10 minutes
res.setTimeout(600000); // 10 minutes
```

Why 10 minutes? Ebook generation can process up to 20 pages with Gemini calls, which is inherently slow.

**Response Schema**:

```javascript
// Success (200):
{
  id: "ebook_<timestamp>_<random>",
  pages: [
    {
      title: string,
      body: string,
      layout: string
    },
    ...
  ],
  html: string,           // Rendered HTML
  metadata: {
    model: "nat-cont_0" | "legacy",
    theme: string,
    pageCount: number,
    processingTimeMs: number,
    can_export: boolean,
    can_preview: boolean,
    can_override: boolean
  },
  actions: {
    persist_prompt: boolean,
    generate_pdf: boolean,
    can_export: boolean,
    can_preview: boolean,
    can_override: boolean
  }
}

// Quota Deferred (202):
{
  message: "Quota exhausted; request deferred for retry",
  requiredQuota: number,
  availableQuota: number,
  retryAfterSeconds: number,
  windowResetAtMs: number,
  requestId: string
}
```

**Middleware Stack** (before handlers):

1. `express.json({ limit: "50mb" })` - JSON parser
2. `express.urlencoded({ limit: "50mb" })` - URL-encoded parser
3. `morgan()` - HTTP request logging
4. `cors()` - Cross-origin support
5. `rateLimit({ windowMs: 15*60*1000, max: 100 })` - Global rate limit (100 req/15min)

---

## Gemini API Rate Limits

### Free Tier Quotas (as of December 2025)

| Model           | RPM | Notes                                    |
| --------------- | --- | ---------------------------------------- |
| **Flash (2.5)** | 15  | Fast, suitable for high-volume tasks     |
| **Pro (2.5)**   | 2   | Expensive, careful reasoning, BOTTLENECK |

### Critical Insight: Pro is the Bottleneck

- Flash: 15 RPM = **15 calls/min** = ~4ms per call slot
- Pro: 2 RPM = **2 calls/min** = ~30s per call slot
- **Flash is 7.5x more generous than Pro**

### Rate Limit Mechanics (Clarified)

**Common Misconception**: "2 RPM means 1 call every 30 seconds"

**Actual Behavior**: 2 RPM is a **sliding window** constraint:

- Max 2 requests in ANY 60-second window (not evenly spaced)
- You CAN burst 2 calls back-to-back at T=0
- Next call must wait until oldest call ages out (~T=60s)

**Example Timeline**:

```
T=0s    Call 1 (structure) fires → ✅ Success
T=0.5s  Call 2 (opening) fires → ✅ Success (burst allowed)
T=0-60s You've exhausted Pro quota (2/2)
T=60.1s Call 3 fires → ✅ Success (Call 1 aged out, window rotates)
```

### Empirical Production Finding

**Problem**: Bursting without spacing causes **transient friction**:

- 429 errors (Too Many Requests)
- 5xx transient errors
- Rate-limit rejections

**Both Flash AND Pro show this**, but Flash requires less spacing.

**Recommended Spacing** (Empirically Verified):

| Model     | Spacing | Reason                                  |
| --------- | ------- | --------------------------------------- |
| **Pro**   | ~250ms  | Scarce quota (2 RPM), needs buffer      |
| **Flash** | ~100ms  | Abundant quota (15 RPM), smaller buffer |

**Revised Timeline with Spacing**:

```
Pro calls (250ms spacing):
T=0s     Call 1 fires
T=0.25s  Call 2 fires
T=60s    Call 3 fires (window rotated)

Flash calls (100ms spacing):
T=0s     Call 1 fires
T=0.1s   Call 2 fires
T=0.2s   Call 3 fires
T=0.3s   Call 4 fires
```

**Result**: More stable API, fewer transient errors.

---

## Quota Management System

### Single Global 60-Second Window

**File**: [server/utils/quotaTracker.js](../../../../server/utils/quotaTracker.js)

**Architecture**:

```javascript
const LIMIT = 20; // Hard ceiling per window
const WINDOW_MS = 60 * 1000; // 60-second rolling window

let callCount = 0; // Calls recorded in current window
let windowStart = Date.now(); // When current window opened
```

**Key Facts**:

- ✅ Single global pool (not per-model)
- ✅ Auto-rotating (resets every 60s)
- ✅ All service types share the same window (ebook, poetry, blog, demo)
- ❌ NOT separate Pro/Flash quota (despite some docs suggesting this)

### Window Lifecycle & Auto-Rotation

```
T=0s      windowStart = Date.now()
T=5s      recordCall() → callCount=1
T=15s     recordCall() → callCount=2
T=25s     recordCall() → callCount=3
...
T=55s     recordCall() → callCount=19
T=58s     recordCall() → callCount=20 (AT LIMIT)
T=59s     recordCall() → BLOCKED (202 response)
T=60.1s   recordCall() → AUTO-ROTATE:
            · Detect window expired (Date.now() - windowStart > WINDOW_MS)
            · callCount = 0
            · windowStart = Date.now()
            · Proceed with call
            · recordCall() → callCount=1
```

No manual reset needed—automatic on next call after 60s expiration.

### Status & Availability

```javascript
quotaTracker.getStatus() → {
  callCount: 5,              // Current calls in window
  limit: 20,                 // Ceiling
  availableQuota: 15,        // Remaining (20 - 5)
  percentUsed: 25,           // (5/20)*100
  windowResetAt: <ms>,       // Epoch ms when window expires
  windowExpiresInMs: 58000   // Time until reset
}
```

### Cost Calculation (Actual)

**Function**: `calculateCostForMode(mode, metadata)` in [server/genieService.js](../../../../server/genieService.js)

```javascript
function calculateCostForMode(mode, metadata = {}) {
  const { pageCount = 10 } = metadata;

  if (mode === "ebook") {
    // Cost: 1 structure call + divided chapters
    // Example: 10 pages = 1 + ceil(10/2) = 1 + 5 = 6
    return 1 + Math.ceil(pageCount / 2);
  }

  if (mode === "poetry") {
    return 1; // Single poem generation
  }

  if (mode === "blog") {
    return 1; // Single blog post
  }

  return 1; // Default
}
```

**Key Point**: Cost is a **single integer**, not split `{pro, flash}`.

### Pre-Request Quota Check

**Location**: [server/genieService.js#L839-L887](../../../../server/genieService.js)

```javascript
// Inside genieService.process()
const quotaTracker = require("./utils/quotaTracker");
const cost = calculateCostForMode(mode, payload.metadata);
const status = quotaTracker.getStatus();

console.log(`[QUOTA] Checking: need ${cost}, have ${status.availableQuota}`);

if (status.availableQuota < cost) {
  // Not enough quota
  console.log(
    `[QUOTA] Insufficient: need ${cost}, have ${status.availableQuota}`
  );

  const err = new Error(
    `Quota exhausted: need ${cost}, have ${status.availableQuota}`
  );
  err.status = 202; // Accepted, not processed
  err.defer = true; // Flag for deferral handling
  err.cost = cost;
  err.availableQuota = status.availableQuota;
  err.windowResetAtMs = status.windowResetAt;
  throw err;
}

// Quota check passed! Proceed to reserve and service dispatch
console.log("[QUOTA] Check passed, proceeding with dispatch");
```

### Quota Reservation (Optional)

If implemented, a `reserve(cost)` call locks quota before service execution:

```javascript
const reserveResult = quotaTracker.reserve(cost);

if (!reserveResult || !reserveResult.success) {
  // Reservation failed
  const err = new Error(`Reservation failed: ${reserveResult.reason}`);
  err.status = 202;
  err.defer = true;
  throw err;
}

// Quota guaranteed available
const reservationId = reserveResult.reservationId;
// Proceed with service...
```

---

## Orchestration Layer

### genieService — Request Router & Quota Enforcer

**File**: [server/genieService.js](../../../../server/genieService.js#L1)

**Key Responsibilities**:

1. Route requests by mode → service handler
2. Calculate generation cost before service dispatch
3. Enforce quota constraints (202 deferral on shortage)
4. Support advanced strategies (nat-cont_0, etc.)
5. Coordinate persistence (idempotency short-circuit)
6. Compose final HTML response

**Note**: FIFO scheduling and timing management are handled by a separate **FIFO Scheduler** component (documented separately). genieService does NOT manage timing; the scheduler does that automatically.

### genieService.process() Flow

**Signature**:

```javascript
async process(payload) {
  const { mode, prompt } = payload;
  // Returns: { out_envelope: { pages, html, metadata }, resultId }
}
```

**Steps** (lines 827-1050):

```javascript
// 1. IDEMPOTENCY SHORT-CIRCUIT
// If prompt was processed before, return cached result immediately
// (Avoids consuming quota on retries/polling)
if (ENABLE_PERSISTENCE && prompt) {
  const persisted = await this.findPersistedByPrompt(prompt);
  if (persisted) {
    // Return immediately, zero quota cost
    return {
      out_envelope: buildEnvelope(persisted),
      resultId: persisted.resultId,
    };
  }
}

// 2. QUOTA CHECK
const quotaTracker = require("./utils/quotaTracker");
const cost = calculateCostForMode(mode, payload.metadata);
const status = quotaTracker.getStatus();

if (status.availableQuota < cost) {
  // Return 202 to frontend (quota insufficient, retry later)
  throw {
    status: 202,
    defer: true,
    cost,
    availableQuota: status.availableQuota,
    windowResetAtMs: status.windowResetAt,
  };
}

// 3. RESERVE QUOTA (optional, if implemented)
const reserveResult = quotaTracker.reserve(cost);
if (!reserveResult.success) {
  throw { status: 202, defer: true };
}

// 4. CLASSIFY PROMPT (optional)
if (!mode || mode === "auto") {
  // Auto-detect task type (ebook vs. poetry vs. blog)
  classification = await this.classifyPrompt(prompt);
  mode = classification.medium;
}

// 5. DISPATCH TO SERVICE HANDLER
let result;
switch (mode) {
  case "ebook":
    const ebookService = require("./ebookService");
    result = await ebookService.handle(payload, classification);
    break;
  case "poetry":
  // ...
  default:
  // ...
}

// 6. COMPOSE HTML
if (mode === "ebook") {
  const html = await this.compose(result);
  result.html = html;
}

// 7. RECORD QUOTA USAGE
quotaTracker.recordCall(cost); // Increment counter in window

// 8. PERSIST RESULT (async, non-blocking)
if (ENABLE_PERSISTENCE) {
  // Async persistence (doesn't block response)
  this.persistResult(result, prompt);
}

// 9. RETURN ENVELOPE
return {
  out_envelope: {
    pages: result.pages,
    html: result.html,
    metadata: { ...result.metadata },
  },
  resultId: result.resultId,
};
```

---

## Ebook Service

### Overview: Two Strategies

The ebook service (`ebookService.handle()`) supports two distinct generation strategies:

**1. Legacy Sequential** (default)

- Simple, sequential chapter generation
- Single callIndex-based routing (Pro for structure, Flash for chapters)
- Minimal complexity

**2. NAT-CONT_0** (narrative continuity, when `metadata.strategy === "nat-cont_0"`)

- Semantic call routing (tier-aware)
- Batch chapter generation
- Advanced orchestration

### Strategy 1: Legacy Sequential

**Entry Point**: [server/ebookService.js#L40](../../../../server/ebookService.js)

```javascript
async function handle(payload, classification) {
  const { prompt } = payload;
  const { pageCount = 8, theme = "dark", strategy } = payload.metadata || {};

  // Legacy path (when strategy !== "nat-cont_0")
  if (strategy !== "nat-cont_0") {
    console.log("[EBOOK] Using strategy: legacy (default sequential)");

    // Sequential flow:
    // Step 1: Structure generation (callIndex=0, Pro)
    // Step 2-N: Chapter generation loop (callIndex=1..N, Flash)
    // Step N+1: Compose HTML

    return handleLegacy(payload);
  }

  // Otherwise, use NAT-CONT_0...
}
```

**Process** (Legacy Path):

```javascript
// 1. STRUCTURE GENERATION (callIndex=0)
//    Uses Gemini 2.5 Pro (primary model)
const structurePrompt = `Create a ${pageCount}-page eBook structure for:\n"${prompt}"
                        \n\nReturn JSON: {title, chapters, outline}`;

let structureResp = await aiSvc.generateContentWithRotation(structurePrompt, 0);
// callIndex=0 → triggers Pro model selection in geminiClient
```

**Call Pattern**:

```
callIndex=0  → Structure generation (Pro) [1 call]
callIndex=1  → Chapter 1 (Flash) [1 call]
callIndex=2  → Chapter 2 (Flash) [1 call]
callIndex=3  → Chapter 3 (Flash) [1 call]
...
callIndex=N  → Chapter N (Flash) [1 call]
             TOTAL: 1 (Pro) + N (Flash) = N+1 calls
```

**Model Selection Logic** (in `geminiClient.callGemini()`):

```javascript
if (model === "gemini-2.5-pro") {
  // Use Pro endpoint/key
  apiUrl = process.env.GEMINI_API_URL_PRO || ...;
  rawKey = process.env.GEMINI_API_KEY_PRO || ...;
} else if (model === "gemini-2.5-flash") {
  // Use Flash endpoint/key
  apiUrl = process.env.GEMINI_API_URL_FLASH || ...;
  rawKey = process.env.GEMINI_API_KEY_FLASH || ...;
} else {
  // Fallback (if model parameter not provided)
  if (callIndex === 0) {
    // Infer Pro for structure
    use Pro endpoint/key
  } else {
    // Infer Flash for chapters
    use Flash endpoint/key
  }
}
```

**Timing**:

- Structure: ~3-5 seconds
- Each chapter: ~4-6 seconds
- Total for 8-page ebook: ~40-50 seconds

---

### Strategy 2: NAT-CONT_0 (Narrative Continuity)

**When Used**: `payload.metadata.strategy === "nat-cont_0"`

**Purpose**: Implement semantic call routing with tier-aware quota allocation

**Entry Point**: [server/ebookService.js#L904](../../../../server/ebookService.js)

```javascript
if (strategy === "nat-cont_0") {
  console.log("[EBOOK] Using strategy: nat-cont_0");
  const result = await handleNARRATIVE_CONT_0(payload, aiSvc);
  return result;
}
```

**Architecture**:

```
NAT-CONT_0 Orchestration:

INPUT: prompt, pageCount=10

├─ Step 1: STRUCTURE [Expert Tier, callIndex=0, Pro]
│  └─ Generate JSON structure, table of contents
│
├─ Step 2: OPENING CHAPTER [Expert Tier, callIndex=1, Pro]
│  └─ Generate narrative opening with context
│
├─ Step 3: MIDDLE CHAPTERS [Standard Tier, callIndex=2..N-1, Flash]
│  └─ Generate chapters in batches (2-3 pages per call)
│  └─ Preserve narrative continuity via context window
│
└─ Step 4: CLOSING CHAPTER [Expert Tier, callIndex=N, Pro]
   └─ Generate conclusive chapter with closure

OUTPUT: { pages, html, metadata }
```

**Call Allocation Example** (10-page ebook):

```
callIndex  | Tier      | Model      | Count | Pages  | Purpose
-----------|-----------|------------|-------|--------|--------------------------------
0          | Expert    | Pro        | 1     | TOC    | Structure & context generation
1          | Expert    | Pro        | 1     | 1      | Opening (narrative voice)
2          | Standard  | Flash      | 2     | 2-3    | Middle batch 1
3          | Standard  | Flash      | 2     | 4-5    | Middle batch 2
4          | Standard  | Flash      | 2     | 6-7    | Middle batch 3
5          | Expert    | Pro        | 1     | 8-9    | Closing (closure)
           |           |            |-------|--------|
           |           | TOTAL      | 9     | 10     | NAT-CONT_0
```

**vs. Legacy**:

```
Legacy:
callIndex=0 (Pro) → structure [1]
callIndex=1..5 (Flash) → chapters [5]
TOTAL: 6 calls

NAT-CONT_0:
callIndex=0 (Pro) → structure [1]
callIndex=1..5 (Flash/Pro) → chapters [5]
TOTAL: 6 calls (same), but with semantic routing
```

**Cost Calculation** (if split by tier):

Would be `{ pro: 2, flash: 4 }` for example, but actual implementation treats as single integer.

---

## AI Service Integration

### geminiClient — Low-Level API Wrapper

**File**: [server/geminiClient.js](../../../../server/geminiClient.js)

**Signature**:

```javascript
async function callGemini({
  prompt,
  modality = "TEXT",         // TEXT | IMAGE | IMAGERY
  generationConfig = {},     // Temperature, max tokens, etc.
  imageB64 = null,          // Base64 image for IMAGE/IMAGERY modalities
  callIndex = 0,            // Sequence number for routing
  model = null              // "gemini-2.5-pro" | "gemini-2.5-flash"
})
```

**Returns**:

```javascript
{
  ok: true/false,
  status: number,            // HTTP status from API
  json: { ... },            // Parsed response
  rawText: string,          // Raw response text
  imageData: string         // Base64 image (if IMAGE modality)
}
```

**Model Selection Logic** (lines 19-51):

```javascript
// Priority: explicit model param > modality env vars > fallback

if (model === "gemini-2.5-pro") {
  apiUrl = process.env.GEMINI_API_URL_PRO ||
           process.env.GEMINI_API_URL_TEXT ||
           process.env.GEMINI_API_URL;
  rawKey = process.env.GEMINI_API_KEY_PRO ||
           process.env.GEMINI_API_KEY_TEXT ||
           process.env.GEMINI_API_KEY;
} else if (model === "gemini-2.5-flash") {
  apiUrl = process.env.GEMINI_API_URL_FLASH ||
           process.env.GEMINI_API_URL_TEXT ||
           process.env.GEMINI_API_URL;
  rawKey = process.env.GEMINI_API_KEY_FLASH ||
           process.env.GEMINI_API_KEY_TEXT ||
           process.env.GEMINI_API_KEY;
} else {
  // Fallback: infer from modality
  if (isText) {
    apiUrl = process.env.GEMINI_API_URL_TEXT || ...;
    rawKey = process.env.GEMINI_API_KEY_TEXT || ...;
  }
  // ... etc
}
```

**Error Handling** (lines 140-200):

```javascript
// Does NOT throw on API errors
// Returns error information in response object

if (!res.ok) {
  return {
    ok: false,
    status: res.status,
    json: body, // API error response
    rawText: text,
  };
}

// On success:
return {
  ok: true,
  status: 200,
  json: parsedJson,
  rawText: text,
};
```

**Quota Recording** (NOT in geminiClient):

Quota is recorded in `genieService.process()` AFTER successful service completion, not in geminiClient itself.

---

## Request/Response Flow

### Complete Happy Path (200)

```
1. POST /api/ebook/generate
   ├─ Body: { prompt, pageCount: 10, theme: "dark" }
   └─ Validation: ✅ All required fields present

2. index.js handler (line 2923)
   ├─ Validate input
   ├─ Create payload: { mode: "ebook", prompt, metadata: { pageCount, theme } }
   ├─ Call genieService.process(payload)
   └─ (handler waits for result)

3. genieService.process()
   ├─ Check persistence cache: ❌ Not found (new prompt)
   ├─ Calculate cost: cost = 1 + ceil(10/2) = 6
   ├─ Get quota status: availableQuota = 20
   ├─ Check: 6 ≤ 20? ✅ YES
   ├─ Reserve quota: success ✅
   ├─ Dispatch: ebookService.handle(payload)
   │  ├─ Determine strategy (default: legacy)
   │  ├─ Generate structure (call 1, Pro)
   │  ├─ Generate chapters 1-5 (calls 2-6, Flash)
   │  ├─ Compose HTML
   │  └─ Return: { pages, html, metadata }
   ├─ Record quota usage: callCount += 6
   ├─ Persist result (async, background)
   └─ Return: { out_envelope, resultId }

4. index.js handler (continued)
   ├─ Extract envelope from result
   ├─ Build response: { id, pages, html, metadata, actions }
   └─ res.status(200).json(response)

5. Client receives response
   ├─ Display pages in preview
   ├─ Offer export to PDF
   └─ Allow editing/override
```

**Timing**: ~45-55 seconds total

---

### Quota Exhaustion Path (202)

```
1. genieService.process() - QUOTA CHECK
   ├─ Calculate cost: cost = 6
   ├─ Get status: availableQuota = 3
   ├─ Check: 6 ≤ 3? ❌ NO
   └─ Throw error:
      {
        status: 202,
        defer: true,
        cost: 6,
        availableQuota: 3,
        windowResetAtMs: 1734502520000
      }

2. index.js handler - ERROR CATCH (line 2983)
   ├─ Catch error: err.defer && err.status === 202? ✅ YES
   └─ Return 202 response:
      {
        status: 202,
        json: {
          message: "Quota exhausted; request deferred",
          requiredQuota: 6,
          availableQuota: 3,
          windowResetAtMs: 1734502520000,
          retryAfterSeconds: 45
        }
      }

3. Client receives 202
   ├─ Display: "Generation queued, will start in 45 seconds"
   ├─ Set retry timer: setTimeout(() => retry(), 45 * 1000)
   └─ Poll /api/ebook/status/:promptId periodically
```

**Retry Behavior**:

When client retries after quota window resets:

- `genieService.process()` checks persistence cache FIRST
- If previous attempt was persisted (background task completed), returns it immediately
- Otherwise, repeats quota check → service dispatch → persist

---

## Error Handling

### HTTP Status Codes

| Status  | Meaning             | Trigger                      | Frontend Behavior               |
| ------- | ------------------- | ---------------------------- | ------------------------------- |
| **200** | Success             | Generation complete          | Display ebook                   |
| **202** | Quota Deferred      | Insufficient quota available | Retry after `retryAfterSeconds` |
| **400** | Bad Request         | Invalid input                | Show validation error           |
| **500** | Server Error        | Unhandled exception          | Retry or contact support        |
| **503** | Service Unavailable | Gemini API unreachable       | Retry with exponential backoff  |

### Quota Deferral (202) Details

**When thrown** (line 865-873 in genieService.js):

```javascript
if (status.availableQuota < cost) {
  const err = new Error(
    `Quota exhausted: need ${cost}, have ${status.availableQuota}`
  );
  err.status = 202;
  err.defer = true; // Flag for special handling
  err.cost = cost;
  err.availableQuota = status.availableQuota;
  err.windowResetAtMs = status.windowResetAt;
  throw err;
}
```

**Caught in index.js** (line 2983):

```javascript
if (err.defer && err.status === 202) {
  return res.status(202).json({
    message: "Quota exhausted; request deferred for retry",
    requiredQuota: err.cost,
    availableQuota: err.availableQuota,
    windowResetAtMs: err.windowResetAtMs,
    retryAfterSeconds: Math.ceil((err.windowResetAtMs || 60000) / 1000),
    requestId: reqId,
  });
}
```

**Frontend Responsibility**:

- Receive 202 response
- Extract `retryAfterSeconds`
- Set timer: `setTimeout(() => retry(), retryAfterSeconds * 1000)`
- Optionally show user: "Request queued, will retry in X seconds"

---

## Performance Characteristics

### Timing Breakdown (8-page ebook)

```
Component                  | Time      | Notes
---------------------------|-----------|-----------------------------------
Structure generation       | 3-5s      | Single call, Pro model
Chapter 1-4 generation     | 16-24s    | 4 calls, Flash model, sequential
Chapter 5-8 generation     | 12-18s    | 4 calls, Flash model, sequential
HTML composition          | 0.5-1s    | Render to HTML
Persistence (async)       | ~1-2s     | Background, non-blocking
---------------------------|-----------|-----------------------------------
TOTAL (backend)           | ~42-50s   | Typical range
Network transmission      | ~1-5s     | Depends on client speed
TOTAL (end-to-end)        | ~43-55s   | From request to response
```

### Quota Impact

```
Operation                | Quota Cost | Example (10 pages)
------------------------|-----------|-----------------------
Structure                | 1 call    | Always 1
Chapters (2 per call)    | 5 calls   | ceil(10/2) = 5
------------------------|-----------|-----------------------
Total per ebook          | 6 calls   | 1 + 5 = 6
------------------------|-----------|-----------------------
Daily limit (20 quota)   | 3 ebooks  | 20 / 6 = 3.33 → 3 max
```

### Bottleneck Analysis

**Primary Bottleneck**: API call latency

- Each Gemini call takes 3-6 seconds
- Sequential calls multiply: N chapters × 5s = 5N seconds
- 8 chapters = 40+ seconds (approaching 60s infrastructure timeout)

**Secondary Concern**: Infrastructure timeout (60 seconds)

- Gemini processing: ~50 seconds
- Network transmission: ~5 seconds
- **Buffer**: ~5 seconds (DANGEROUS - very tight)

---

## Database Layer

### Persistence Models

**Tables** (via Prisma):

```prisma
// Prompts table
model Prompt {
  id        Int     @id @default(autoincrement())
  text      String  @unique
  normalized String
  createdAt DateTime @default(now())
  results   Result[]
}

// Results table (persisted AI output)
model Result {
  id        Int     @id @default(autoincrement())
  promptId  Int
  prompt    Prompt  @relation(fields: [promptId], references: [id])
  title     String
  pages     Json    // Array of pages: [{title, body, layout}, ...]
  html      String?
  metadata  Json    // {model, theme, pageCount, ...}
  createdAt DateTime @default(now())
}
```

### Persistence Flow

**In genieService.process()** (line 838-851):

```javascript
// IDEMPOTENCY: Check cache on every request
if (ENABLE_PERSISTENCE && prompt) {
  const persisted = await this.findPersistedByPrompt(prompt);
  if (persisted) {
    // Return cached result immediately (zero quota cost!)
    return {
      out_envelope: buildEnvelope(persisted),
      resultId: persisted.resultId,
    };
  }
}

// ... later, after service dispatch succeeds ...

// ASYNC PERSISTENCE: Save result for future retries
if (ENABLE_PERSISTENCE) {
  // Non-blocking: fire-and-forget
  this.persistResult(result, prompt);
}
```

**Key Behavior**:

- ✅ Idempotency: Repeated requests for same prompt return cached result
- ✅ No double-charging: Cache lookup happens BEFORE quota check
- ✅ Async save: Result persisted in background, doesn't block response
- ✅ Fallback detection: Supports both Prisma AND legacy sqlite (migration-safe)

---

## Actual vs. Documented Discrepancies

### What's Different from Earlier Docs

| Aspect                | Earlier Doc                  | Actual Implementation         | Status         |
| --------------------- | ---------------------------- | ----------------------------- | -------------- |
| **Quota Model**       | "Separate Pro/Flash windows" | Single global 20-call window  | ⚠️ CORRECTED   |
| **Cost Calculation**  | `{pro: N, flash: N}`         | Single integer (cost)         | ⚠️ SIMPLIFIED  |
| **NAT-CONT_0 Status** | "Planned"                    | Implemented & selectable      | ✅ COMPLETE    |
| **Quota Deferral**    | "Optional"                   | Required (202 responses)      | ✅ ACTIVE      |
| **Persistence**       | "Mentioned"                  | Full idempotency + async save | ✅ IMPLEMENTED |
| **Spacing Caveat**    | Documented for Pro           | Applies to both Pro & Flash   | ✅ CLARIFIED   |

### Why the Discrepancies?

1. **Evolution**: Code evolved faster than documentation
2. **Pragmatism**: Single global quota simpler than per-model tracking
3. **NAT-CONT_0**: Later addition, not yet in early architectural docs
4. **Spacing Finding**: Empirical discovery during development

---

## Future Adjustments Needed

Based on this implementation review, consider:

1. **Async Job Queue**: Current architecture blocks on 50s generation

   - Could return 202 + jobId immediately, notify client when ready
   - Requires background job processor (Redis, RabbitMQ, or simple queue)

2. **Progressive Streaming**: Send partial results (pages) as they complete

   - Server-Sent Events (SSE) or WebSocket for real-time updates
   - Requires refactoring service layer to emit progress events

3. **Separated Quota Pools**: Restore Pro/Flash split for better utilization

   - Requires schema change to quotaTracker
   - Benefits: Can generate more complex ebooks with Pro tier

4. **Caching Optimization**: Persist intermediate results (structure, chapters)

   - Allows resuming failed ebook generation
   - Reduces re-computation on retries

5. **Scaling Model Rotation**: Add adaptive model selection
   - Choose Flash first for cost savings, fall back to Pro only when needed
   - Requires cost-aware orchestration logic

---

## Summary

The AetherPress backend is fundamentally sound:

✅ **Solid quota protection**: Single global window prevents API abuse
✅ **Smart caching**: Idempotency avoids double-charging on retries
✅ **Flexible routing**: NAT-CONT_0 strategy ready for advanced scenarios
✅ **Graceful degradation**: 202 responses defer requests cleanly
✅ **Detailed logging**: Full trace via requestId and service logs

---

## Architectural Patterns

### 1. Infrastructure Accounting as Separate Plumbing

**Core insight**: Separate content generation logic from infrastructure concerns (model routing). Services (ebookService) have zero awareness of accounting.

**Why this matters**: This enables independent evolution and testability.

**Key clarification** (Updated Dec 17, 2025):

- **Quota and rate-limiting** will now be handled by a **FIFO scheduler** (architecture to be documented separately)
- **Model routing** remains an infrastructure layer concern (callIndex-based implicit selection)
- Services remain completely decoupled from both quota tracking AND scheduling logic

**What Stays in Service Layer**:

Each service (ebookService, wallArtService, calendarService, etc.) owns:

1. **Business composition logic**: Decide HOW MANY calls are needed, IN WHAT ORDER, for coherent output
2. **Semantic tier declarations**: For each call, declare WHAT tier that call requires (`tier: "expert"` vs `tier: "standard"`) based on that specific service's composition needs
3. **Content assembly**: Combine results into final business output (HTML, image, calendar data, etc.)

ebookService declares tiers specific to ebook composition. wallArtService declares tiers specific to art generation. Each service's tier declarations are unique to its business logic and have zero overlap with other services.

**What Stays in Infrastructure Layers**:

| Layer              | Concern        | Responsibility                                                                                                  |
| ------------------ | -------------- | --------------------------------------------------------------------------------------------------------------- |
| **FIFO Scheduler** | Quota + timing | Queue jobs, enforce FIFO ordering, manage delays                                                                |
| **genieService**   | Routing        | "Which service handler for this request?"                                                                       |
| **aiService**      | Model routing  | Map tier declarations (from any service) to available models; gracefully degrade if preferred model unavailable |

---

### The Firewall Pattern: Service ↔ Orchestrator ↔ Infrastructure

**The Core Principle**: Services have **zero awareness** of infrastructure plumbing (quotas, rate-limiting, model selection, database persistence, caching). The boundary between business logic and infrastructure concerns is inviolable.

**Visual Flow**:

```
REQUEST
   ↓
┌─────────────────────────┐
│  HTTP Entry Point       │  (index.js handler)
│  - Validate input       │
│  - Create payload       │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│  ORCHESTRATOR LAYER     │  (genieService)
│  - Route by mode        │
│  - Check persistence    │
│  - Enforce quota        │
│  - Manage timing        │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│  SERVICE LAYER          │  (ebookService, etc.)
│  (Pure Business Logic)  │
│  - Composition strategy │
│  - Semantic tier decl.  │
│  - Content assembly     │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│  INFRASTRUCTURE LAYER   │  (aiService, geminiClient)
│  - Model routing        │
│  - API dispatch         │
│  - Response handling    │
└────────────┬────────────┘
             ↓
           Gemini API
```

**The Firewall Rules**:

| Layer              | Can Access          | Cannot Access     | Responsibility              |
| ------------------ | ------------------- | ----------------- | --------------------------- |
| **Service**        | aiService interface | quotaTracker      | Declare semantic tiers only |
| **Service**        | callIndex parameter | Model selection   | Compose coherent output     |
| **Orchestrator**   | All infrastructure  | Service internals | Route, check quota, persist |
| **Infrastructure** | Gemini API, DB      | Service logic     | Model routing, API calls    |

**What Service Layer Communicates**:

ebookService communicates **exclusively with genieService** (the orchestrator). It is completely unaware of any other system:

```javascript
// ebookService SENDS request to genieService (the ONLY thing it knows about):
{
  callIndex: 0,           // Sequencing only
  tier: "expert",         // ONLY semantic tier, never Pro/Flash
  prompt: "...",
  config: { /* ... */ }
}

// ebookService RECEIVES response from genieService:
{
  content: "...",         // The generated content
  metadata: { /* ... */ } // Cost, model used, etc. (informational only)
}

// ebookService is NEVER AWARE OF:
// - aiService (doesn't exist in ebookService's world)
// - quotaTracker (doesn't exist in ebookService's world)
// - geminiClient (doesn't exist in ebookService's world)
// - Database layer (doesn't exist in ebookService's world)
// - Persistence (doesn't exist in ebookService's world)
// - Rate limiting (doesn't exist in ebookService's world)
// - Model selection (doesn't exist in ebookService's world)
//
// ebookService knows ONLY: "I call genieService when I need something"
```

**What Service Layer CANNOT Do**:

```javascript
// ❌ FORBIDDEN: Service accessing quotaTracker
const status = quotaTracker.getStatus();

// ❌ FORBIDDEN: Service accessing rate-limiter
const delayed = rateLimiter.delay(model);

// ❌ FORBIDDEN: Service specifying model directly
const response = geminiClient.callGemini({ model: "gemini-2.5-pro" });

// ❌ FORBIDDEN: Service accessing persistence layer
const cached = db.results.findFirst({ ... });
```

**Why This Separation Matters**:

1. **Independence**: Services evolve without touching infrastructure—add wallArtService without changing quotaTracker
2. **Testability**: Mock only aiService interface; infrastructure invisibly handled by test harness
3. **Replaceability**: Swap Gemini for Claude? Swap SQLite for PostgreSQL? Only infrastructure changes, services unaware
4. **Clarity**: Read ebookService.js and see business logic; read genieService.js and see infrastructure plumbing
5. **Resilience**: Infrastructure constraints (quota exhausted, API down) handled by orchestrator, don't crash services

**The Request-Response Boundary**:

```javascript
// HTTP request arrives
// ↓
// genieService.process(payload) - THE ORCHESTRATOR
// ├─ Check: "is this an ebook?"
// ├─ IF YES: route to ebookService
// │
// └─ ebookService.handle(payload, orchestratorProxy)
//    │
//    ├─ ebookService: "I need a structure"
//    │  └─ Calls: orchestratorProxy.generate(structurePrompt, {tier: "expert"})
//    │     └─ genieService intercepts
//    │        ├─ Check quota, resolve model, call Gemini, record usage
//    │        └─ Return: {content: "..."}
//    │
//    ├─ ebookService: "I need chapter 1"
//    │  └─ Calls: orchestratorProxy.generate(chapter1Prompt, {tier: "standard"})
//    │     └─ genieService intercepts
//    │        ├─ Check quota, resolve model, call Gemini, record usage
//    │        └─ Return: {content: "..."}
//    │
//    └─ ebookService returns: {pages, html, metadata}
//
// ↓
// genieService (back in process())
// └─ Persist result to database (infrastructure concern)
// └─ Return final envelope to HTTP response

// CRITICAL: ebookService has ZERO visibility into what happens in orchestratorProxy
// It calls orchestratorProxy.generate() and receives content
// It never knows: model selection, quota checks, database, gemini API, anything
```

**Orchestrator's Responsibility** (the sole intermediary):

```javascript
// genieService.process(payload):
// The orchestrator receives the HTTP request and manages EVERYTHING else

// 1. Determine service: "is this an ebook?" → route to ebookService
const isEbook = payload.mode === "ebook";

if (isEbook) {
  // 2. Create a proxy/interface that ebookService will call
  const orchestratorProxy = {
    generate: async (prompt, meta) => {
      // ebookService calls this when it needs content
      // genieService orchestrates EVERYTHING behind this interface:

      // - Check quota (infrastructure concern)
      if (quotaTracker.getStatus().availableQuota < cost) {
        throw { status: 202, defer: true };
      }

      // - Resolve model from tier (infrastructure concern)
      const model = aiService.resolveModel(meta.tier);

      // - Call Gemini API (infrastructure concern)
      const result = await geminiClient.call({ prompt, model });

      // - Record quota usage (infrastructure concern)
      quotaTracker.recordCall(cost);

      // - Return only the content (service never sees infrastructure)
      return result;
    },
  };

  // 3. Invoke service with the proxy
  // ebookService now calls orchestratorProxy for ALL needs
  const result = await ebookService.handle(payload, orchestratorProxy);

  // 4. After service completes, handle persistence (infrastructure)
  await db.persistResult(result, prompt);

  // 5. Return final result
  return result;
}

// ebookService never touched: quotaTracker, aiService, geminiClient, db, rate-limiter
// genieService handled ALL of it, invisible to ebookService
```

---

### 2. Model Routing: Semantic Tier-Based with Intelligent Resolution

**Key Principle**: Separation of Concern with Graceful Degradation

- **ebookService** (sole composition authority): Declares WHAT tier each call requires (expert vs. standard)
- **aiService** (intelligent resolver): Maps tiers to available models, gracefully degrading if preferred option unavailable

**The Pattern**: One unified dynamic routing architecture:

**ebookService declares semantic tiers**:

Example: 3-page ebook composition

```javascript
// ebookService decides ebook structure: need structure + opening + middle + closing
// Declares WHAT tier each requires; aiService decides WHICH model provides it
// (never specifies Pro/Flash—only semantic tier)

const pageCount = 3; // Input: 3-page ebook

// Call 0: Structure (expert tier)
const structure = await aiSvc.generateContent(structurePrompt, {
  callIndex: 0,
  tier: "expert", // Requires careful planning/reasoning
});

// Call 1: Opening (expert tier)
const opening = await aiSvc.generateContent(openingPrompt, {
  callIndex: 1,
  tier: "expert", // Narrative voice needs high quality
});

// Call 2: Middle content (standard tier)
const middle = await aiSvc.generateContent(middlePrompt, {
  callIndex: 2,
  tier: "standard", // Content generation (pages 1-2)
});

// Call 3: Closing (expert tier)
const closing = await aiSvc.generateContent(closingPrompt, {
  callIndex: 3,
  tier: "expert", // Closure needs high-quality narrative skill
});

// Result: 4 semantic tier declarations (expert, expert, standard, expert)
// aiService will map these to actual models based on availability
```

**aiService intelligently resolves tiers→models**:

```javascript
// Tier-to-model preference mapping (what we WANT)
const tierPreferences = {
  expert: "gemini-2.5-pro", // Prefer Pro for expert tier
  standard: "gemini-2.5-flash", // Prefer Flash for standard tier
};

// Available models (what we HAVE)
const availableModels = getAvailableModels(); // e.g., ["gemini-2.5-pro", "gemini-2.5-flash"]

// Intelligent resolution logic
function resolveModel(tier) {
  const preferred = tierPreferences[tier];

  // If preferred model available, use it
  if (availableModels.includes(preferred)) {
    return preferred;
  }

  // Else gracefully degrade to whatever IS available
  // (composition succeeds, just with different quality guarantee)
  return availableModels[0]; // Use first available model
}

// Dispatch
const model = resolveModel(callMetadata.tier || inferFromCallIndex(callIndex));
```

**Result mapping for 10-page ebook** (when both Pro and Flash available):

```
Call 0: tier="expert"   → Pro      [structure]
Call 1: tier="expert"   → Pro      [opening]
Call 2: tier="standard" → Flash    [middle batch 1]
Call 3: tier="standard" → Flash    [middle batch 2]
Call 4: tier="expert"   → Pro      [closing]
```

**Degradation scenario** (if only Flash available):

```
Call 0: tier="expert"   → Flash    [structure, reduced quality]
Call 1: tier="expert"   → Flash    [opening, reduced quality]
Call 2: tier="standard" → Flash    [middle batch 1]
Call 3: tier="standard" → Flash    [middle batch 2]
Call 4: tier="expert"   → Flash    [closing, reduced quality]
```

---

**Why This Separation Matters**:

1. **ebookService is the sole authority on ebook composition**: It decides HOW many calls, WHAT order, and WHAT quality tier each needs
2. **aiService is the sole authority on model availability**: It knows what models exist and intelligently maps tier requirements to available options
3. **No ebook composition logic outside ebookService**: Period. All tier declarations happen inside ebookService
4. **Resilient to resource constraints**: Works with any available model set—composition never fails due to missing models
5. **Flexible model substitution**: Add Pro-2 or remove Flash? Update preferences, aiService automatically adapts

---

**Note on ebookService Strategies**:

ebookService may internally use different composition strategies (Legacy Sequential, NAT-CONT_0, etc.), but **all strategies follow the same architectural pattern**: declare semantic tier requirements, let aiService intelligently resolve them to available models. The strategy choice is an internal ebookService concern, not an architectural pattern difference.

### 3. Scalable Service Architecture

**Pattern**: Multiple independent media services (ebook, wallart, calendar, poetry, blog) all follow the same interface contract.

Each service:

- ✓ Generates content with semantic clarity
- ✓ Zero awareness of quotas, scheduling, or rate-limiting
- ✓ Calls aiService with callIndex for implicit model selection
- ✓ Independently testable with mocked aiService
- ✓ Automatically contributes to unified accounting (no integration needed)

**Benefits**:

1. **Uniformity**: All services follow same contract
2. **Reusability**: Single infrastructure handles all services
3. **Independence**: Add services without touching infrastructure
4. **Testability**: Mock only aiService, ignore infrastructure
5. **Zero Coupling**: Services unaware of each other and infrastructure

---

⚠️ **Key Challenges**:

- Infrastructure timeout (60s) vs. generation time (50s) leaves thin margin
- Current sequential approach doesn't scale beyond ~10-15 pages
- FIFO scheduler (upcoming) will add queueing complexity but improve reliability
- Need distributed coordination for multi-instance deployments

These are architectural decisions with known tradeoffs—resolvable with feature additions.
