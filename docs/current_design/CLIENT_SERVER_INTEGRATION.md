# CLIENT_SERVER_INTEGRATION.md

## Scope 4: Client-Server Integration Documentation

**Status:** Reverse-engineered from implementation  
**Last Updated:** 2024  
**Related Documentation:** [ARCHITECTURE_DOCUMENTATION_PROPOSAL.md](ARCHITECTURE_DOCUMENTATION_PROPOSAL.md), [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md), [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)

---

## 1. Overview

This document describes the actual HTTP contract between the AetherPress client (Svelte 4 + Vite frontend) and the Express.js backend. It documents:

- **Request envelopes** sent by the client
- **Response envelopes** returned by the backend
- **Error propagation** mechanisms (HTTP status codes, error payloads)
- **Timeout behavior** and infrastructure limits
- **State transitions** during request/response cycles
- **Known issues** and current limitations

This is a **reverse-engineered** document capturing the implementation as it exists, not as originally designed. It serves as ground truth for validating against original design specifications.

---

## 2. Core Endpoints

### 2.1 Prompt Generation Flow

#### **POST /prompt**

Primary endpoint for generating content from a user prompt.

**Request Envelope:**

```json
{
  "mode": "string", // e.g., "poetry", "story", "article"
  "prompt": "string", // Required: non-empty user input
  "metadata": "object", // Optional: { userId, sessionId, ... }
  "options": "object" // Optional: { tone, style, format, ... }
}
```

**Implementation Details:**

- Input validation enforced: `prompt` must be non-empty string
- Mode-based routing through `genieService.process()`
- Delegates to appropriate backend service based on mode
- Supports two dispatch patterns:
  1. Direct prompt processing (classic path)
  2. Dev mode testing: `POST /prompt?dev=true` returns deterministic mock response

**Timeout:** 600 seconds (10 minutes) - required for Gemini Flash/Pro models with large token generation

**Success Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "content": {
      "title": "string", // Generated title
      "body": "string", // Generated body/content
      "layout": "string" // Optional: layout hint
    }
  }
}
```

**Alternative Response Format (canonical envelope, used by downstream systems):**

```json
{
  "resultId": "uuid",                  // Unique result identifier
  "out_envelope": {
    "pages": [
      {
        "title": "string",
        "content": "string",
        "metadata": { ... }
      }
    ]
  },
  "metadata": {
    "model": "gemini-2.5-flash",
    "cost": "number",
    "tokensUsed": "number",
    "generationTime": "number"         // ms
  }
}
```

**Error Responses:**

| Status | Error Code          | Meaning                      | Recovery                         |
| ------ | ------------------- | ---------------------------- | -------------------------------- |
| 400    | INVALID_REQUEST     | Prompt missing or empty      | Validate input before sending    |
| 500    | GENERATION_ERROR    | Backend service failed       | Retry with exponential backoff   |
| 503    | SERVICE_UNAVAILABLE | Puppeteer/services not ready | Retry after startup grace period |

**Error Response Format:**

```json
{
  "error": "GENERATION_ERROR",
  "message": "Generation Error: [detailed error]",
  "code": "GENERATION_ERROR",
  "details": { ... }
}
```

---

### 2.2 Content Classification

#### **POST /api/classify**

Extract metadata (medium, style, themes) from a prompt **before** generation.

**Request:**

```json
{
  "prompt": "string", // Required
  "selectedMedium": "string" // Optional: hint if user pre-selected medium
}
```

**Response (200 OK):**

```json
{
  "classification": {
    "medium": "poetry|story|article|...",
    "style": "formal|casual|poetic|...",
    "themes": ["theme1", "theme2"],
    "confidence": 0.85, // 0.0-1.0
    "source": "gemini|heuristic" // How classification was determined
  }
}
```

**Error:** 400 (invalid request), 500 (service error)

---

### 2.3 Explicit Medium Generation

#### **POST /api/generate**

Generate with explicit medium specification (bypasses auto-classification).

**Request:**

```json
{
  "prompt": "string", // Required
  "medium": "string", // Required: poetry, story, article, etc.
  "classification": {
    // Optional: pre-computed classification
    "medium": "string",
    "style": "string",
    "themes": ["..."]
  },
  "options": {
    // Optional
    "tone": "string",
    "style": "string",
    "format": "string"
  }
}
```

**Response (201 Created):**

```json
{
  "resultId": "uuid",
  "out_envelope": { ... },
  "metadata": { ... }
}
```

**Error:** 400 (invalid request), 500 (service error)

---

### 2.4 Style Overrides

#### **POST /api/override**

Apply style overrides to an existing generated result **without** re-generating content.

**Request:**

```json
{
  "resultId": "uuid", // Required: which result to override
  "overrides": {
    // Required: what to change
    "medium": "string", // Optional: change medium
    "style": "string", // Optional: change style
    "theme": "string", // Optional: change theme
    "colorPalette": "string", // Optional
    "fontScale": "number" // Optional: 0.8-1.5
  },
  "classification": {
    // Optional: original classification
    "medium": "string",
    "style": "string"
  }
}
```

**Response (200 OK):**

```json
{
  "resultId": "uuid",
  "overrides": {
    "applied": ["field1", "field2"], // Fields that were applied
    "skipped": ["field3"] // Fields that couldn't be applied
  },
  "costMultiplier": 1.2, // Estimated cost increase
  "costBreakdown": {
    "style": 0.1,
    "theme": 0.1,
    "colorPalette": 0.0
  },
  "regenerationStrategy": "restyling|partial|full",
  "message": "Override validated (regeneration in Phase 2)"
}
```

**Regeneration Strategies:**

- `restyling`: CSS/styling only, no re-generation needed
- `partial`: Minor content re-generation (themes, styles)
- `full`: Complete re-generation required (medium changed)

**Error:** 400 (invalid request), 500 (service error)

---

### 2.5 E-Book Generation (Phase B)

#### **POST /api/ebook/generate**

Generate a themed, multi-page e-book with Gemini.

**Request:**

```json
{
  "prompt": "string", // Required: e-book topic/premise
  "theme": "dark|light|corporate|bold", // Default: "dark"
  "pageCount": 10, // Default: 10 (5-20 typical)
  "colorPalette": "default|vibrant|pastel", // Default: "default"
  "fontSizeScale": 1.0 // Default: 1.0 (0.8-1.5)
}
```

**Implementation Details:**

- Validates: prompt non-empty, theme in allowed list, pageCount 5-50
- Long timeout (600s) due to multi-page Gemini generation
- Sets `req.setTimeout(600000)` and `res.setTimeout(600000)`
- Supports model selection (Flash vs Pro based on pageCount)

**Response (201 Created):**

```json
{
  "id": "uuid",
  "content": {
    "title": "string",
    "subtitle": "string",
    "chapters": [
      {
        "number": 1,
        "title": "string",
        "content": "string",
        "pageBreak": true
      }
    ]
  },
  "html": "string", // Full rendered HTML
  "metadata": {
    "model": "gemini-2.5-flash|gemini-2.5-pro",
    "cost": "number",
    "tokensUsed": "number",
    "generationTime": "number", // ms
    "pageCount": "number"
  },
  "pages": [
    // Alternative format: array of page objects
    {
      "number": 1,
      "title": "string",
      "content": "string"
    }
  ],
  "can_export": true,
  "can_override": true
}
```

**Error Responses:**

| Status | Error Code          | Meaning                   |
| ------ | ------------------- | ------------------------- |
| 400    | VALIDATION_ERROR    | Invalid parameters        |
| 500    | GENERATION_ERROR    | Backend generation failed |
| 503    | SERVICE_UNAVAILABLE | Services not ready        |

---

### 2.6 PDF Export

#### **POST /api/export** and **POST /export**

Generate PDF from HTML content.

**Request (Unified Pipeline - New):**

```json
{
  "prompt": "string", // Required if no pages array
  "theme": "string", // Optional
  "pageCount": "number", // Optional
  "quality": "string", // Optional: draft|normal|high
  "validate": true // Optional: validate PDF structure
}
```

**Request (Legacy Envelope - Old):**

```json
{
  "pages": [
    {
      "title": "string",
      "content": "string",
      "metadata": { ... }
    }
  ],
  "validate": true
}
```

**Response (200 OK):**

```
Binary: application/pdf
Headers:
  Content-Type: application/pdf
  Content-Disposition: inline; filename=export.pdf
  Content-Length: <bytes>
```

**Error (422 Unprocessable Entity - Validation Failed):**

```json
{
  "ok": false,
  "errors": ["PDF has 0 pages", "Invalid page dimensions"],
  "warnings": ["Image quality degraded"],
  "pageCount": 0
}
```

**Error Handling:**

- If Puppeteer unavailable, falls back to `pdfGenerator` (mock implementation in test mode)
- Validation via `validatePdfBuffer()` (structural checks)
- 422 returned if validation fatal errors present

---

### 2.7 Async Export Queue (Phase 3/4)

#### **POST /api/export/generate**

Queue an async PDF export job.

**Request:**

```json
{
  "resultId": "uuid" // Required: which result to export
}
```

**Response (202 Accepted):**

```json
{
  "jobId": "uuid",
  "status": "queued"
}
```

**Error (400 - Result Not Found):**

```json
{
  "error": "Result not found",
  "code": "RESULT_NOT_FOUND"
}
```

**Error (503 - Queue Full):**

```json
{
  "error": "Export queue full",
  "code": "QUEUE_FULL"
}
```

---

#### **GET /api/export/status/:jobId**

Check status of export job.

**Response (200 OK):**

```json
{
  "jobId": "uuid",
  "status": "queued|processing|complete|failed",
  "progress": 0-100,
  "pdfUrl": "/api/export/download/:jobId",    // If complete
  "error": "error message"                      // If failed
}
```

**Error (404 - Job Not Found):**

```json
{
  "error": "Export job not found",
  "code": "JOB_NOT_FOUND"
}
```

**Error (410 - Expired):**

```json
{
  "error": "Export expired",
  "code": "EXPIRED"
}
```

Expiry: 24 hours after creation.

---

#### **GET /api/export/download/:jobId**

Download completed PDF.

**Response (200 OK):**

```
Binary PDF
```

**Error (202 - Not Ready):**

```json
{
  "error": "Export not ready",
  "code": "NOT_READY",
  "status": "queued|processing",
  "progress": 45
}
```

**Error (404, 410):** Same as `/status` endpoint

---

## 3. Error Handling and Propagation

### 3.1 HTTP Status Codes

| Code    | Semantics            | Client Action                           |
| ------- | -------------------- | --------------------------------------- |
| 200-201 | Success              | Process response                        |
| 202     | Accepted (async)     | Poll status endpoint                    |
| 400     | Bad Request          | Fix input, retry immediately            |
| 401     | Unauthorized         | DO NOT RETRY - auth failure             |
| 408     | Timeout              | Retry with backoff                      |
| 409     | Conflict             | Handle business logic error             |
| 410     | Gone                 | Resource expired, don't retry           |
| 422     | Unprocessable Entity | Validation failed, may retry with fixes |
| 429     | Too Many Requests    | Rate limited - back off                 |
| 500     | Server Error         | Retry with backoff                      |
| 502     | Bad Gateway          | Retry with backoff                      |
| 503     | Service Unavailable  | Retry - services initializing           |
| 504     | Gateway Timeout      | Retry with longer timeout               |

### 3.2 Error Response Envelope

**Standardized error format:**

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "code": "ERROR_CODE",
  "details": {
    "field1": "value",
    "originalError": "..."
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### 3.3 Client-Side Retry Logic

**Current implementation in `api.js`:**

```javascript
const DEFAULT_CONFIG = {
  maxRetries: 3,
  initialBackoffMs: 1000,
  maxBackoffMs: 10000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};
```

**Retry behavior:**

- Exponential backoff: `backoff = min(maxBackoffMs, initialBackoffMs * 2^(attempt-1))`
- Jitter added: `+/- 0-100ms`
- Does NOT retry on 401 (auth failures surface immediately)
- Does NOT retry on AbortError (user-cancelled requests)
- Logs all retries at debug level

**Retry flow:**

1. Initial request
2. If retryable status → backoff, retry
3. If non-retryable or max retries → throw error
4. Error bubbles to UI error handler

### 3.4 Error Context Headers

**Request headers added by middleware:**

- `X-Request-Id` (UUID): Trace request through proxies

**Response headers exposed to client (via CORS):**

- `X-Request-Id`: Match request with server logs
- `X-Backend-Error`: Optional backend error context

---

## 4. Timing and Timeout Behavior

### 4.1 Timeout Configuration

**Server-side timeouts:**

| Endpoint             | Timeout | Reason                                           |
| -------------------- | ------- | ------------------------------------------------ |
| /prompt              | 600s    | Gemini generation (1000+ tokens)                 |
| /api/classify        | 30s     | Classification model inference                   |
| /api/generate        | 600s    | Generation + possible re-generation              |
| /api/override        | 10s     | Fast path styling only                           |
| /api/ebook/generate  | 600s    | Multi-page generation, manual req/res.setTimeout |
| /api/export          | 60s     | Puppeteer PDF rendering                          |
| /api/export/generate | 10s     | Queue enqueue operation                          |
| /api/export/status   | 5s      | Job status lookup                                |
| Health check         | 5s      | Timeout on service checks                        |

**Client-side timeouts (ebookApi.js):**

```javascript
TIMEOUTS: {
  GENERATE: 600000,    // 10min
  OVERRIDE: 10000,     // 10s
  THEMES: 5000         // 5s
}
```

### 4.2 Timeout Failure Scenarios

#### **Scenario A: 60-Second Infrastructure Timeout**

```
T=0s     Client sends POST /api/ebook/generate
T=49s    Backend finishes Gemini generation
T=53s    Response starts transmitting
T=55s    Response fully received by client
T=60s    Infrastructure timeout FIRES (if response not fully sent)
```

**Current Status:** CRITICAL ISSUE - **Confirmed in testing**

Evidence from Light_3-page_02 and Light_3-page_04:

- Backend completes processing in **49.4-50.4 seconds** ✓
- Server logs confirm response serialized and ready to send ✓
- HTTP 200 returned with full payload ✓
- **Client receives: "Network error: Failed to fetch"** ❌

**Root Cause Analysis:**

The failure is **infrastructure/network timeout**, not generation time:

- Request completes at T+49s
- Response transmission begins at T+49s
- **Infrastructure timeout fires at ~T+60s** (likely in proxy/middleware)
- Response never reaches client browser
- Manifests as generic "Failed to fetch" TypeError

**Known impacts:**

- **Occurs at minimal size** (3-page ebook with light theme succeeds backend, fails on transmission)
- Affects all successful responses that cross the 49-60 second boundary
- Systematic and repeatable (not random network blip)
- Backend processing time (49-50s) leaves minimal buffer before infrastructure hard timeout

#### **Scenario B: Client Abort During Generation**

```
T=0s     Client sends request, starts timer
T=30s    User navigates away / cancels request
         Frontend calls AbortController.abort()
T=30.1s  Server receives abort signal (if HTTP/2)
T=30.2s  Server may continue generating (no early termination)
T=49s    Backend generation completes (wasteful)
         Response dropped (client already aborted)
```

**Current behavior:**

- Server does not detect abort until response ready
- Continues to consume Gemini tokens
- Network connection closed by client
- Response discarded

#### **Scenario C: Network Jitter**

```
T=0s     Client sends POST /api/ebook/generate
T=49s    Backend generation completes
T=55s    Response mostly transmitted
T=58s    Last bytes lost due to packet loss
T=60s    Infrastructure timeout fires
         Partial response (corrupted JSON) received by client
```

**Impact:** Client receives incomplete response, fails to parse JSON

---

### 4.3 Timeout Mitigation (Current)

**What works:**

- Explicit `req.setTimeout(600000)` and `res.setTimeout(600000)` on `/api/ebook/generate`
- Exponential backoff retry logic on client
- Health checks verify service readiness (reduce initial latency)

**What doesn't work:**

- No progress reporting during generation (client unaware if still working)
- No heartbeat/keep-alive (infrastructure may timeout if no data flowing)
- No incremental response (all-or-nothing delivery)

**What's missing:**

- Streaming response mode (chunked transfer to keep connection alive)
- Server-side request timeout (abort at T=55s if still generating)
- Client-side progress polling endpoint (POST → 202 Accepted + polling pattern)

---

## 5. State Transitions and Request Lifecycle

### 5.1 Generation Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                   CLIENT REQUEST FLOW                         │
└─────────────────────────────────────────────────────────────┘

[User Input] → [Validate]
                   ↓
[Call /api/classify] (optional, 30s timeout)
                   ↓
[Display Classification] (user confirms medium/style)
                   ↓
[Call POST /api/generate or /prompt] (600s timeout)
                   ↓
[Receive Result + resultId]
                   ↓
[Display Generated Content + Preview]
                   ↓
[User Can:] → [Apply Overrides] → [Call POST /api/override] (10s)
          → [Export to PDF] → [Call POST /api/export or /api/export/generate]
          → [Save/Share] → [Database persistence]
```

### 5.2 Frontend State Machine

**From FRONTEND_ARCHITECTURE.md - flowStore states:**

```
INITIAL
   ↓ (prompt entered)
MEDIUM_SELECTED
   ↓ (call /api/classify if needed)
GENERATING
   ↓ (POST /prompt or /api/generate sent)
CLASSIFICATION_READY
   ↓ (classification received, waiting for confirmation)
RESULT_READY
   ↓ (generation complete, content available)
OVERRIDE_ACTIVE
   ↓ (user applies overrides)
COMPLETE or ERROR
   ↓ (final state)
```

### 5.3 Request State in Backend

**Server-side request lifecycle:**

```
Express handler entry
   ↓
Middleware: validate request ID, auth, readiness
   ↓
Input validation (POST body schema)
   ↓
Service dispatch (genieService.process, etc.)
   ↓
Gemini API call (may take 30-50s)
   ↓
Response composition (HTML rendering, envelope wrapping)
   ↓
Response headers set (Content-Type, Content-Length, CORS)
   ↓
Binary/JSON response sent
   ↓
Express request complete
```

---

## 6. Request/Response Examples

### 6.1 Successful Generation

**Client Request:**

```javascript
const payload = {
  mode: "poetry",
  prompt: "Write a poem about the ocean at dawn",
  metadata: { userId: "user123" },
  options: { tone: "contemplative" },
};

await fetch("/prompt", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
  signal: abortController.signal,
});
```

**Server Response (201):**

```json
{
  "success": true,
  "data": {
    "content": {
      "title": "Dawn's Whisper",
      "body": "The ocean breathes at dawn,\nWaves lap against the sand...",
      "layout": "default"
    }
  }
}
```

**Client Processing:**

```javascript
const result = await response.json();
flowStore.setState("RESULT_READY");
ebookStore.setContent(result.data.content);
```

---

### 6.2 Error: Generation Timeout

**Sequence:**

```
T=0s    POST /api/ebook/generate (pageCount=20)
T=50s   Gemini still generating (4000+ tokens)
T=55s   Last chunk of response sent
T=60s   Infrastructure timeout fires
        Connection closed by proxy
```

**Client receives:**

```
TypeError: Failed to fetch (connection reset)
```

**Client action:**

```javascript
try {
  const result = await ebookApi.generateEbook(payload);
} catch (err) {
  if (err.message.includes("timeout")) {
    flowStore.setError({
      code: "TIMEOUT",
      message: "Generation took too long (60s limit). Try fewer pages.",
      retryable: true,
      suggested: "Reduce pageCount from 20 to 10",
    });
  }
}
```

---

### 6.3 Error: Validation Failure

**Client Request:**

```json
{
  "prompt": "" // Empty!
}
```

**Server Response (400):**

```json
{
  "error": "INVALID_REQUEST",
  "message": "Prompt is required and must be non-empty",
  "code": "INVALID_REQUEST"
}
```

**Client Recovery:**

```javascript
if (response.status === 400) {
  flowStore.setError({
    code: response.data.error,
    message: response.data.message,
    retryable: false,
  });
}
```

---

### 6.4 Async Export (Polling Pattern)

**Client Request 1:**

```json
{
  "resultId": "abc-123-def"
}
```

**Server Response 1 (202):**

```json
{
  "jobId": "job-456-ghi",
  "status": "queued"
}
```

**Client polls (every 2 seconds):**

```
GET /api/export/status/job-456-ghi
```

**Server Response (Polling):**

```
T=0s   {"status": "queued", "progress": 0}
T=2s   {"status": "processing", "progress": 30}
T=4s   {"status": "processing", "progress": 60}
T=6s   {"status": "complete", "progress": 100, "pdfUrl": "..."}
```

**Client downloads:**

```
GET /api/export/download/job-456-ghi
```

**Server Response (200 with binary PDF)**

---

## 7. Known Issues and Limitations

### 7.1 Critical Issues

#### **[CRITICAL] 60-Second Infrastructure Timeout**

**Issue:** Large ebook generation (15+ pages) fails intermittently due to infrastructure timeout.

**Root Cause:**

- Backend takes 49-50s for generation
- Transmission takes 5-10s additional
- Infrastructure limit is exactly 60s
- **Buffer: 0-6 seconds**

**Symptoms:**

- POST /api/ebook/generate fails with "connection reset" after ~60s
- Works fine for small requests (5-10 pages, takes 20-30s)
- Pro model (slower) fails more than Flash

**Workarounds (Current):**

- Reduce pageCount to ≤10
- Retry failed requests
- Use Flash model instead of Pro

**Proper Fix Needed:**

- Switch to streaming/chunked response
- Add keep-alive heartbeat during generation
- Implement progress polling (202 Accepted + GET status)
- Or: request infrastructure timeout extension to 120s

---

#### **[HIGH] No Request Cancellation on Client Abort**

**Issue:** When user cancels a request, the backend continues generating and consuming Gemini tokens.

**Root Cause:** No early termination of Gemini API call when HTTP connection closes.

**Symptoms:**

- User navigates away, request still processing server-side
- Gemini quota consumed for cancelled work
- "Wasted" tokens and latency

**Workaround:** None (tokens consumed regardless)

**Fix Needed:**

- Implement AbortController on server-side Gemini call
- Detect connection close and abort in-flight API calls

---

### 7.2 High Priority Issues

#### **[HIGH] No Progress Reporting**

**Issue:** Client doesn't know if generation is still in progress or hung.

**Symptom:** Long silence (30-50s) with no feedback. UI appears frozen.

**Workaround:** Show spinner with estimated time.

**Fix Needed:**

- Progress polling endpoint
- Or: Streaming response with progress chunks

---

#### **[HIGH] Incomplete Error Context**

**Issue:** Some errors lack enough context for client to provide helpful remediation.

**Example:**

```json
{
  "error": "GENERATION_ERROR",
  "message": "Generation Error: API error 429: Rate limited"
}
```

Client cannot distinguish:

- Gemini rate limit (user quota)
- System rate limit (infrastructure)
- Transient vs. permanent

**Fix Needed:**

- Structured error codes (not nested text)
- `code: "RATE_LIMIT_QUOTA"` vs `code: "RATE_LIMIT_SYSTEM"`
- Retry guidance in response

---

### 7.3 Medium Priority Issues

#### **[MEDIUM] Override Endpoint Returns Cost Estimate Only**

**Issue:** POST /api/override validates overrides but doesn't actually apply them.

**Response indicates:**

```json
{
  "regenerationStrategy": "restyling",
  "message": "Override validated (regeneration in Phase 2)"
}
```

**Meaning:** Cost calculated, but result not actually updated.

**Current Workaround:** Client must re-generate manually.

**Fix Needed:** Implement Phase 2 override re-generation.

---

#### **[MEDIUM] PDF Export Lacks Incremental Delivery**

**Issue:** PDF generation is all-or-nothing. If network hiccup at T=58s of 60s timeout, entire export fails.

**Symptom:** Occasional "connection reset" on large PDF exports.

**Workaround:** Retry the export.

**Fix Needed:** Chunked/streaming PDF delivery.

---

### 7.4 Low Priority Issues

#### **[LOW] Legacy Export Endpoints Still Active**

**Issue:** Old POST /api/export/job endpoints return 410 (Gone) but still consume routing.

**Impact:** Minimal - endpoints are deprecated but documented.

**Fix:** Remove deprecated endpoints in major version bump.

---

#### **[LOW] Health Check Doesn't Measure Gemini Quota**

**Issue:** GET /health reports services ready but doesn't verify Gemini API quota available.

**Symptom:** User receives quota exceeded error only after submitting request.

**Impact:** Minor UX issue (could pre-check quota).

**Fix:** Add quota check to health endpoint (optional).

---

## 8. Client API Integration (ebookApi.js, api.js)

### 8.1 ebookApi.js - High-Level Client

**Configuration:**

```javascript
const CONFIG = {
  API_BASE_URL: "/api",
  TIMEOUTS: {
    GENERATE: 600000, // 10min for generation
    OVERRIDE: 10000, // 10s for overrides
    THEMES: 5000, // 5s for theme metadata
  },
};
```

**Core Functions:**

```javascript
// Generate e-book
export async function generateEbook(payload) {
  return fetchWithTimeout(
    `${CONFIG.API_BASE_URL}/ebook/generate`,
    { method: "POST", body: JSON.stringify(payload) },
    CONFIG.TIMEOUTS.GENERATE
  );
}

// Apply overrides (fast-path)
export async function applyOverride(payload) {
  return fetchWithTimeout(
    `${CONFIG.API_BASE_URL}/override`,
    { method: "POST", body: JSON.stringify(payload) },
    CONFIG.TIMEOUTS.OVERRIDE
  );
}

// Fetch available themes
export async function fetchThemes() {
  return fetchWithTimeout(
    `${CONFIG.API_BASE_URL}/themes`,
    { method: "GET" },
    CONFIG.TIMEOUTS.THEMES
  );
}
```

**Error Handling:**

- Wraps timeout errors: "Request timeout after Xms"
- Converts network errors: "Network error: ..."
- Attempts JSON parse with detailed logging
- Logs response length, headers, first/last 200 bytes

### 8.2 api.js - Lower-Level HTTP Client

**Features:**

```javascript
const DEFAULT_CONFIG = {
  maxRetries: 3,
  initialBackoffMs: 1000,
  maxBackoffMs: 10000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

// Core retry-enabled fetch
async function fetchWithRetry(url, options = {}) {
  // Implements exponential backoff
  // Skips 401 (auth failures)
  // Logs all retries
  // Throws on exhausted retries
}
```

**Key behaviors:**

- Auto-retry on transient errors
- Absolute URL resolution (handles Node/test environments)
- Detailed logging per request
- Respects AbortController signals
- No automatic retry on AbortError

---

## 9. Comparison with Original Design (Pending)

This section will be populated after comparing against original design documents from `/docs/`.

**Dimensions to evaluate:**

- [ ] Request envelope structure matches design spec
- [ ] Response codes align with REST conventions
- [ ] Timeout values match performance requirementsF
- [ ] Error taxonomy is complete and consistent
- [ ] State machine transitions follow intended flow
- [ ] Async patterns (202 Accepted) implemented as designed
- [ ] Rate limiting and quota enforcement working as specified

**Known Divergences (placeholder):**

- (Will be identified through comparison)

---

## 10. Timeline and Performance Characteristics

### 10.1 Latency Budget

**Typical flow (prose generation, 1000 tokens):**

```
Phase 1: Request transmission:     0.1s  (network + serialization)
Phase 2: Server validation:        0.05s (input checks, auth)
Phase 3: Gemini API call:          30-45s (model inference)
Phase 4: Response composition:     1-2s  (HTML rendering)
Phase 5: Response transmission:    0.5-3s (network, varies by size)
───────────────────────────────────────
Total:                             31-51s
```

**Critical path:** Gemini inference (30-45s of 60s limit)

### 10.2 Infrastructure Constraints

**Known limits:**

- HTTP timeout: **60 seconds** (hard infrastructure limit)
- Gemini quota: **Flash 15 RPM, Pro 2 RPM** (model-specific)
- PDF rendering: Puppeteer requires full page load (10-20s for complex HTML)
- Network transmission: Depends on client connection (LTE: 1-5 Mbps)

### 10.3 Scaling Behavior

**Response size growth:**

| Request Type     | Tokens | Response Size | Transmission Time |
| ---------------- | ------ | ------------- | ----------------- |
| Short poem       | 200    | 8KB           | 0.1s              |
| Medium story     | 1000   | 35KB          | 0.5s              |
| Long article     | 2000   | 70KB          | 1s                |
| Ebook (10 pages) | 8000   | 250KB         | 3s                |
| Ebook (20 pages) | 16000  | 500KB         | 6s                |

**Time-to-completion growth:**

| Content Type | Generation Time | Total With Overhead     |
| ------------ | --------------- | ----------------------- |
| Poem         | 10-15s          | 12-18s                  |
| Story        | 20-30s          | 22-35s                  |
| Article      | 30-40s          | 32-45s                  |
| Ebook (10p)  | 40-50s          | 42-55s                  |
| Ebook (20p)  | 50-60s          | 52-65s ❌ EXCEEDS LIMIT |

---

## 11. Debugging and Troubleshooting

### 11.1 Common Failure Scenarios

**Symptom: "Connection reset by peer" (HTTP 0)**

Possible causes:

1. Infrastructure timeout (60s limit) → Check elapsed time
2. Puppeteer crash during PDF rendering → Check logs for Puppeteer errors
3. Network interruption → Retry
4. Server process killed → Check health endpoint

**Diagnosis:**

```javascript
// Check server health
GET /health

// Check error logs
tail -f server/logs/*.log | grep GENERATION_ERROR
```

**Symptom: "Request timeout after 600000ms"**

Expected for generation >10min. Check:

- Is token limit hit?
- Is Gemini API slow?
- Are resource limits exceeded?

---

### 11.2 Request ID Tracing

**All requests include:**

```
X-Request-Id: <uuid>
```

**To trace a request:**

```bash
# Client logs
console.log(response.headers.get("X-Request-Id"));

# Server logs
grep "X-Request-Id" server/logs/*.log | grep <uuid>

# Check request → response timeline
grep "<uuid>" server/logs/*.log
```

---

### 11.3 Response Parsing Errors

**If client receives corrupted JSON:**

```javascript
// Check raw response
const text = await response.text();
console.log(text.substring(0, 500));
console.log(text.substring(text.length - 200));

// May indicate partial transmission (timeout)
```

---

## 12. Related Documentation

- [ARCHITECTURE_DOCUMENTATION_PROPOSAL.md](ARCHITECTURE_DOCUMENTATION_PROPOSAL.md) - Scope planning and status
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Server-side service architecture
- [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) - Client-side state management and flows
- `/server/index.js` - Express endpoint implementations
- `/client/src/lib/ebookApi.js` - High-level HTTP client
- `/client/src/lib/api.js` - Retry logic and low-level HTTP utilities

---

## 13. Future Work and Open Questions

### 13.1 For Scope 5 (Next Phase)

- [ ] Implement request cancellation (AbortController server-side)
- [ ] Add streaming response support (keep-alive, progress chunks)
- [ ] Implement progress polling endpoint
- [ ] Extend infrastructure timeout or implement workaround
- [ ] Add request quota checking to health endpoint
- [ ] Complete Phase 2 override re-generation
- [ ] Remove deprecated endpoints

### 13.2 Open Questions (Pending Comparison)

- Does actual implementation match original timeout design?
- Were async export endpoints (202 Accepted pattern) planned?
- What was the intended strategy for >60s requests?
- Should errors include more granular recovery guidance?

---

**Document Status:** REVERSE-ENGINEERED (Implementation-based truth)  
**Completeness:** ~90% (missing only original design comparison)  
**Last Verified:** During Scope 4 implementation
