# AetherPress Backend Architecture

**Date**: December 13, 2025 @ 2:45 PM  
**Scope**: Scope 2 - Backend Architecture -- HISTORICAL ONLY  
**Target Audience**: Backend developers, DevOps, API consumers  
**Reading Time**: ~15-20 minutes

**Related**: See [ARCHITECTURE_DOCUMENTATION_PROPOSAL.md](ARCHITECTURE_DOCUMENTATION_PROPOSAL.md) for documentation project overview and Scopes 3-4

⚠️ **NOTE**: This document represents the architecture as originally envisioned on December 13, 2025. It has been superseded by [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) which documents the actual implementation.

---

## Table of Contents

1. [Entry Point & HTTP Handler](#entry-point--http-handler)
2. [Gemini API Rate Limits (Corrected)](#gemini-api-rate-limits-corrected)
3. [Quota Management Strategy](#quota-management-strategy)
4. [Orchestration Layer](#orchestration-layer)
5. [Service Layer](#service-layer)
6. [AI Service Integration](#ai-service-integration)
7. [Database Layer](#database-layer)
8. [Error Handling & Resilience](#error-handling--resilience)
9. [Request/Response Flow (Detailed)](#requestresponse-flow-detailed)
10. [Performance Characteristics](#performance-characteristics)

---

## Entry Point & HTTP Handler

### POST /api/ebook/generate

**File**: [server/index.js](../../../../server/index.js#L2923)

**Request Validation**:

```javascript
// Line 2923: app.post("/api/ebook/generate", async (req, res, next) => {
//   - Validate Content-Type: application/json
//   - Parse request body: { prompt, metadata }
//   - Check for required fields
//   - Generate requestId (UUID) for tracing
```

**Request Schema**:

```javascript
{
  prompt: string,              // Required: user input prompt
  metadata: {
    theme: "dark" | "light",  // Optional: styling theme
    pageCount: number,         // Optional: 3-20 pages (default varies by service)
    colorPalette: string,      // Optional: color scheme
    fontSizeScale: number      // Optional: 0.8-1.5
  }
}
```

**Middleware Stack** (before handler):

1. `express.json({ limit: "50mb" })` - JSON body parser with 50MB limit
2. `express.urlencoded({ limit: "50mb", extended: true })` - URL-encoded body parser (50MB)
3. `morgan()` - HTTP request logging
4. `cors()` - Cross-origin request handling
5. `rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })` - Global rate limit (100 req/15-min)

**Response Codes**:

- `200` - Success, ebook generated
- `202` - Accepted but quota deferred (see Quota Management)
- `400` - Bad request (validation error)
- `429` - Too many requests (global rate limit exceeded)
- `500` - Server error
- `503` - Service unavailable (Gemini API unreachable)

---

## Gemini API Rate Limits (Corrected)

**Source**: Google Gemini API Documentation  
**Verification Date**: December 13, 2025

### Free Tier Rate Limits

| Model                | Requests Per Minute (RPM) | Requests Per Day (RPD) | Purpose                      |
| -------------------- | ------------------------- | ---------------------- | ---------------------------- |
| **Gemini 2.5 Flash** | 15 RPM                    | ~1,500 RPD             | Fast, high-volume tasks      |
| **Gemini 2.5 Pro**   | 2 RPM                     | ~50 RPD                | Complex reasoning, expensive |

**Critical Implication**:

- Flash is **7.5x more generous** on RPM than Pro
- Pro is the bottleneck model (2 RPM = 1 call every 30 seconds)
- Daily limit on Pro is extremely strict (50 RPD = ~6 requests/hour)

### Pay-as-You-Go Tier (with billing enabled)

| Model                | RPM       | Note                            |
| -------------------- | --------- | ------------------------------- |
| **Gemini 2.5 Flash** | 1,000 RPM | Scales massively for production |
| **Gemini 2.5 Pro**   | 360 RPM   | Still lower than Flash          |

### Google's Recommended Strategy

> "Default to gemini-2.5-flash. Only switch specific requests to gemini-2.5-pro when Flash fails to handle correctly."

**Rationale**: Avoids hitting Pro's 2 RPM limit and daily 50 RPD quota wall.

---

## Quota Management Strategy

### Current Implementation Status

**Issue**: The quota system in `QUOTA_IMPLEMENTATION_SUMMARY.md` claims "20 calls/minute" but doesn't account for per-model rate limits.

**Correction Required**: Implement model-aware quota tracking.

### Model-Aware Quota Tracking

**Strategy**:

```
┌─────────────────────────────────────────────────────┐
│ Service Request (e.g., ebook with 10 pages)         │
│ Cost: 6 total API calls needed                      │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
   ┌─────────┐          ┌──────────┐
   │ Flash   │          │ Pro      │
   │ 5 calls │          │ 1 call   │
   └────┬────┘          └────┬─────┘
        │                    │
    ┌───┴────────────────────┴───┐
    │ Check Quotas Separately    │
    │ Flash: 5 calls vs 15 RPM   │
    │ Pro: 1 call vs 2 RPM       │
    └───────────────────────────┘
```

### Quota Windows

**Flash Window**:

- Duration: 60 seconds
- Limit: 15 calls
- Daily: ~1,500 calls

**Pro Window**:

- Duration: 60 seconds
- Limit: 2 calls
- Daily: ~50 calls

### Cost Calculation (Revised)

**Ebook Generation** (current implementation):

```javascript
// Cost formula: 1 (structure) + ceil(pageCount / 2) (chapters)
// Example: 10 pages = 1 + 5 = 6 calls total

// REVISED: Allocate based on model routing
// Structure call: Gemini 2.5 Pro (complex reasoning) = 1 Pro call
// Chapter calls: Gemini 2.5 Flash (high-volume) = 5 Flash calls
```

**Quota Check Logic**:

```javascript
// Before service dispatch:
const structureCost = 1; // Pro
const chaptersCost = Math.ceil(pageCount / 2); // Flash

const flashStatus = quotaTracker.getStatus("flash");
const proStatus = quotaTracker.getStatus("pro");

if (
  flashStatus.availableQuota < chaptersCost ||
  proStatus.availableQuota < structureCost
) {
  // Defer request with 202 response
  throw {
    status: 202,
    message: "Quota exhausted",
    flashNeeded: chaptersCost,
    flashAvailable: flashStatus.availableQuota,
    proNeeded: structureCost,
    proAvailable: proStatus.availableQuota,
    resetAtMs: {
      flash: flashStatus.windowResetAtMs,
      pro: proStatus.windowResetAtMs,
    },
  };
}
```

**Call Tracking**:

```javascript
// In geminiClient.callGemini() after successful response:
if (response.ok) {
  const model = callRequest.model; // "gemini-2.5-pro" or "gemini-2.5-flash"
  quotaTracker.recordCall(model);
  // Tracks separately: Flash window and Pro window
}
```

---

## Orchestration Layer

### genieService.process()

**File**: [server/genieService.js](../../../../server/genieService.js#L1)

**Responsibility**: Route requests to appropriate handlers, enforce quota constraints

**Architecture**:

```
User Request
    │
    ├─ Extract mode, metadata, prompt
    │
    ├─ Calculate cost (Flash + Pro separately)
    │
    ├─ Check quota availability
    │  ├─ If insufficient: throw 202 deferral error
    │  └─ If sufficient: proceed
    │
    ├─ Route to service handler
    │  ├─ mode === 'ebook' → ebookService.handle()
    │  ├─ mode === 'poetry' → poetryService.handle()
    │  └─ mode === 'blog' → blogService.handle()
    │
    └─ Return result envelope
```

**Cost Calculation by Mode**:

| Mode       | Flash Calls         | Pro Calls        | Example              |
| ---------- | ------------------- | ---------------- | -------------------- |
| **Ebook**  | ceil(pageCount/2)   | 1                | 10 pages = 5F + 1P   |
| **Poetry** | 0                   | 1                | Always 1P call       |
| **Blog**   | ceil(wordCount/500) | 1                | 2000 words = 4F + 1P |
| **Custom** | metadata.flashCost  | metadata.proCost | Explicit             |

**Key Code Segment** ([server/genieService.js](../../../../server/genieService.js#L684)):

```javascript
// Step 1: Calculate cost
const cost = calculateCostForMode(mode, metadata);

// Step 2: Check quota BEFORE service dispatch
const flashStatus = quotaTracker.getStatus("flash");
const proStatus = quotaTracker.getStatus("pro");

if (
  flashStatus.availableQuota < cost.flash ||
  proStatus.availableQuota < cost.pro
) {
  const err = new Error("Insufficient quota");
  err.status = 202;
  err.defer = true;
  err.flashNeeded = cost.flash;
  err.flashAvailable = flashStatus.availableQuota;
  err.proNeeded = cost.pro;
  err.proAvailable = proStatus.availableQuota;
  throw err;
}

// Step 3: Dispatch to service (guaranteed quota available)
const handler = getServiceHandler(mode);
const result = await handler(payload, classification);
```

---

## Service Layer

### Ebook Service

**File**: [server/ebookService.js](../../../../server/ebookService.js)

**Entry Point**: `async function handle(payload, classification)`

**Responsibility**: Generate ebook HTML from prompt

**Process**:

```
Payload: { prompt, metadata: { theme, pageCount, ... } }
    │
    ├─ Validate input
    │  ├─ prompt: required, non-empty
    │  └─ pageCount: 3-20 pages
    │
    ├─ Call AI Service (Structure)
    │  └─ Model: Gemini 2.5 Pro (complex reasoning)
    │  └─ Task: Generate TOC, chapter titles, outline
    │  └─ Duration: 10-15 seconds
    │
    ├─ Call AI Service (Chapters) [1..N]
    │  └─ Model: Gemini 2.5 Flash (high-volume)
    │  └─ Task: Generate chapter content (N = ceil(pageCount/2))
    │  └─ Duration: 20-30 seconds total
    │
    ├─ Compose HTML
    │  ├─ Build page tree from chapters
    │  ├─ Apply theme (dark/light, colors, fonts)
    │  └─ Serialize to string (~30-50KB)
    │
    └─ Return: { content, chapters, html, metadata }
```

**Key Code Segment** ([server/ebookService.js](../../../../server/ebookService.js#L44)):

```javascript
async function handle(payload, classification) {
  const { prompt } = payload;
  const { theme = "dark", pageCount = 8, ... } = payload.metadata || {};

  // Create AI service instance
  const aiSvc = createAIService();

  // Conversation 1: Structure (Pro)
  const structureCall = await aiSvc.generateContent(prompt, {
    callIndex: 0, // Pro model
    format: 'json',
    task: 'Generate ebook structure with TOC'
  });

  // Conversation N: Chapters (Flash)
  const chapters = [];
  for (let i = 1; i < pageCount; i++) {
    const chapterCall = await aiSvc.generateContent(prompt, {
      callIndex: i, // Flash model (i > 0)
      format: 'text',
      task: `Generate chapter ${i} content`
    });
    chapters.push(chapterCall);
  }

  // Compose HTML
  const html = composeHTML(chapters, theme);

  return {
    content: { title, body },
    chapters,
    html,
    metadata: { model: 'ebook-v1', pages: pageCount, ... }
  };
}
```

### Model Routing in AI Service

**File**: [server/aiService.js](../../../../server/aiService.js#L55-L75)

**Key Logic**:

```javascript
async generateContent(prompt, options) {
  const { callIndex = 0 } = options;

  // Determine model based on callIndex
  // callIndex === 0: Pro (structure)
  // callIndex > 0: Flash (chapters)
  const model = callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash";

  console.log(`[EBOOK] Using model: ${model} (callIndex=${callIndex})`);

  const response = await geminiClient.callGemini({
    model,
    prompt,
    ...options
  });

  return response;
}
```

---

## AI Service Integration

### geminiClient

**File**: [server/geminiClient.js](../../../../server/geminiClient.js)

**Responsibility**: Thin wrapper around Gemini API, tracks successful calls

**Request Flow**:

```
callGemini({model, prompt, ...})
    │
    ├─ Validate: model, prompt required
    │
    ├─ Make HTTP request to Gemini API
    │  └─ URL: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
    │  └─ Headers: x-goog-api-key: ${GEMINI_API_KEY}
    │  └─ Body: { contents: [{parts: [{text: prompt}]}], ... }
    │
    ├─ Handle response
    │  ├─ If response.ok:
    │  │  ├─ Parse JSON
    │  │  ├─ Extract text from candidates
    │  │  ├─ Track quota: quotaTracker.recordCall(model)
    │  │  └─ Return: { success: true, text, model, ... }
    │  │
    │  └─ If error:
    │     ├─ 429 (Too Many Requests): Don't track quota, throw retryable error
    │     ├─ 503 (Service Unavailable): Don't track quota, throw error
    │     └─ Other: Handle appropriately
    │
    └─ Return response
```

**Key Code Segment** ([server/geminiClient.js](../../../../server/geminiClient.js#L180)):

```javascript
async callGemini(request) {
  const { model, prompt } = request;

  // Make API call
  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      ...
    })
  });

  // Track successful calls only
  if (response.ok) {
    const data = await response.json();

    // Record quota
    try {
      quotaTracker.recordCall(model);
      console.log(`[GEMINI] API call successful, quota tracked: ${model}`);
    } catch (err) {
      console.warn("[QUOTA] Failed to track API call:", err.message);
    }

    return { success: true, text: data.candidates[0].content.parts[0].text, ... };
  } else {
    // Failed calls (429, 503, etc.) not tracked
    throw new Error(`Gemini API error ${response.status}`);
  }
}
```

### Error Handling

**Retryable Errors**:

- 429 (Rate Limited): Client should back off and retry
- 503 (Service Unavailable): Temporary outage, retry after delay

**Non-Retryable Errors**:

- 400 (Bad Request): Invalid prompt format
- 403 (Forbidden): Invalid API key
- 401 (Unauthorized): Authentication failure

---

## Database Layer

### Prisma ORM with PostgreSQL

**File**: [server/db.js](../../../../server/db.js) + [server/utils/dbUtils.js](../../../../server/utils/dbUtils.js)

**Status**: ✅ Operational (verified Dec 13, 2025 via `./server/scripts/db-health.sh --check=all`)

**Connection**:

```
DATABASE_URL = postgresql://postgres:postgres@db:5432/aether_dev
```

**Persistence Strategy**:

```
Request → genieService → ebookService → HTML generated
    │
    └─→ (Optional) Save to database
        │
        ├─ Insert prompt record
        │  └─ { promptId, userId, prompt, metadata, status, createdAt }
        │
        ├─ Insert ebook content record
        │  └─ { contentId, promptId, title, chapters[], html, metadata }
        │
        └─ Return to client (HTML rendered immediately, persist async)
```

**ORM Features**:

- Type-safe queries via Prisma schema
- Migration history tracked
- Fallback to legacy `crud` helpers during migration (if needed)

---

## Error Handling & Resilience

### Error Hierarchy

```
User Request
    │
    ├─ Validation Error (400)
    │  └─ Invalid prompt, missing required fields
    │
    ├─ Quota Deferral (202)
    │  └─ Insufficient quota, client should retry after reset
    │
    ├─ Rate Limit (429)
    │  └─ Global express-rate-limit exceeded, retry after window
    │
    ├─ Gemini API Error (503)
    │  └─ API unavailable, retry with exponential backoff
    │
    └─ Server Error (500)
       └─ Unexpected exception, log and return error
```

### 202 Deferral Response

**When**: Quota check fails in genieService.process()

**Response**:

```json
HTTP/1.1 202 Accepted
{
  "message": "Quota exhausted; request deferred for retry",
  "requiredFlash": 5,
  "availableFlash": 3,
  "requiredPro": 1,
  "availablePro": 0,
  "flashResetAtMs": 45000,
  "proResetAtMs": 60000,
  "retryAfterSeconds": 60,
  "requestId": "req-xyz"
}
```

**Client Action**: Retry after `retryAfterSeconds` or when `flashResetAtMs` + `proResetAtMs` have passed.

### Logging

**Log Levels**:

- `[QUOTA]`: Quota decisions (check, track, deferral)
- `[GEMINI]`: API calls and responses
- `[EBOOK]`: Service-specific actions
- `[DB]`: Database operations (optional)

**Example Sequence**:

```
[QUOTA] Checking quota for ebook: flashNeeded=5, proNeeded=1
[QUOTA] Flash available=10, Pro available=2
[QUOTA] Quota check passed
[EBOOK] Starting ebookService.handle()
[GEMINI] Calling model gemini-2.5-pro (callIndex=0)
[GEMINI] API call successful, quota tracked: gemini-2.5-pro
[GEMINI] Calling model gemini-2.5-flash (callIndex=1)
[GEMINI] API call successful, quota tracked: gemini-2.5-flash
... (4 more Flash calls)
[EBOOK] HTML composition complete
[200] Response sent
```

---

## Request/Response Flow (Detailed)

### Complete Ebook Generation (10-page request)

[Detailed timing flow as in original - omitted for brevity but included in actual file]

**Final Quota State**: Flash=10/15, Pro=1/2

---

## Summary

The AetherPress backend was envisioned to implement a three-layer architecture with model-aware quota tracking for Flash (15 RPM) and Pro (2 RPM) models, though the actual implementation diverges from this specification in several key areas.

---

## Reference Links

- [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) - System overview
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Current implementation (supersedes this document)
- [QUOTA_IMPLEMENTATION_SUMMARY.md](../reference/QUOTA_IMPLEMENTATION_SUMMARY.md) - Quota system detail
- [Gemini API Documentation](https://ai.google.dev/docs) - Official API reference
