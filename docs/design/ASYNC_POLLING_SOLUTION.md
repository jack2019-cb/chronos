# Async Polling Solution: 60-Second Infrastructure Timeout Fix

**Status:** Draft Proposal  
**Date:** December 13, 2025 @ 5:15 PM
**Related Issues:** 60-second infrastructure timeout blocking 3+ page ebook generation  
**Related Documentation:** [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md#scenario-a-60-second-infrastructure-timeout)

---

## Executive Summary

The current synchronous POST `/api/ebook/generate` endpoint takes 49-50 seconds to complete, then requires 5-10 seconds for network transmission. This consistently exceeds infrastructure timeout limits (~60 seconds), causing "Network error: Failed to fetch" failures even when backend processing succeeds.

**Proposed Solution:** Transform ebook generation to async polling pattern (HTTP 202 Accepted + polling). Immediate benefits:

- ✅ No individual request exceeds 100ms (zero timeout risk)
- ✅ Real-time progress reporting to user
- ✅ Client-side cancellation support (eliminates token waste)
- ✅ Higher resilience to network issues
- ✅ Leverages existing async export queue pattern

**Implementation Effort:** 4-5 days across 4 phases (backend, cancellation, frontend, monitoring)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
   - [Current Behavior](#11-current-behavior)
   - [Root Cause](#12-root-cause)
   - [Impact](#13-impact)
2. [Proposed Solution Architecture](#2-proposed-solution-architecture)
   - [High-Level Design](#21-high-level-design)
3. [Endpoint Specifications](#3-endpoint-specifications)
   - [POST /api/ebook/generate](#31-post-apiebookgenerate-modified)
   - [GET /api/ebook/status/:jobId](#32-get-apiebookstatusjobid-new)
   - [GET /api/ebook/result/:jobId](#33-get-apiebookresultjobid-new)
   - [POST /api/ebook/cancel/:jobId](#34-post-apiebookcanceljobid-new)
4. [Backend Implementation Details](#4-backend-implementation-details)
   - [Job Record Structure](#41-job-record-structure)
   - [Storage Options](#42-storage-options)
   - [Background Worker](#43-background-worker)
   - [Endpoint Handlers](#44-endpoint-handlers)
5. [Frontend Implementation Details](#5-frontend-implementation-details)
   - [Updated ebookApi.js](#51-updated-ebookapijs)
   - [Updated GenerateFlow.svelte](#52-updated-generateflowsvelte)
   - [New GenerationProgress.svelte Component](#53-new-generationprogresssvelte-component)
6. [Updated State Machine](#6-updated-state-machine)
7. [Timeout Analysis (Before vs After)](#7-timeout-analysis-before-vs-after)
8. [Concurrency & Queue Management](#8-concurrency--queue-management)
   - [Queue Configuration](#81-queue-configuration)
   - [Queue Metrics](#82-queue-metrics)
   - [Scaling Considerations](#83-scaling-considerations)
9. [Implementation Roadmap](#9-implementation-roadmap)
   - [Phase 1: Backend Async Infrastructure](#phase-1-backend-async-infrastructure-1-2-days)
   - [Phase 2: Cancellation Support](#phase-2-cancellation-support-1-day)
   - [Phase 3: Frontend Integration](#phase-3-frontend-integration-1-2-days)
   - [Phase 4: Monitoring & Optimization](#phase-4-monitoring--optimization-1-day)
10. [Backward Compatibility & Migration](#10-backward-compatibility--migration)
    - [Feature Flagging](#101-feature-flagging)
    - [Client Detection](#102-client-detection)
11. [Error Handling & Edge Cases](#11-error-handling--edge-cases)
    - [Common Error Scenarios](#111-common-error-scenarios)
    - [Validation & Safety Checks](#112-validation--safety-checks)
12. [Success Metrics](#12-success-metrics)
    - [Metrics to Track](#121-metrics-to-track)
    - [Observability](#122-observability)
13. [Risks & Mitigation](#13-risks--mitigation)
14. [Testing Strategy](#14-testing-strategy)
    - [Unit Tests](#141-unit-tests)
    - [Integration Tests](#142-integration-tests)
    - [E2E Tests](#143-e2e-tests)
    - [Load Testing](#144-load-testing)
15. [Documentation & Communication](#15-documentation--communication)
    - [Internal Documentation](#151-internal-documentation)
    - [User Communication](#152-user-communication)
16. [Appendix: API Reference Summary](#appendix-api-reference-summary)
    - [Endpoints](#endpoints)
    - [Status Values](#status-values)
    - [Error Codes](#error-codes)

---

## 1. Problem Statement

### 1.1 Current Behavior

**Request flow (synchronous):**

```
T=0s     Client: POST /api/ebook/generate (3-page ebook)
T=49s    Backend: Finish Gemini generation
T=49.5s  Backend: Serialize response (30KB JSON)
T=50s    Backend: Start transmitting response
T=60s    Infrastructure: Hard timeout fires
         Result: Client receives "Failed to fetch" ❌
```

**Evidence from testing (Light_3-page_02, Light_3-page_04):**

- Backend processing: 49.4-50.4 seconds ✓ (successful)
- Server logs: Response serialized and ready ✓
- HTTP 200 sent: Yes ✓
- Client receives data: No ❌
- Failure type: "Network error: Failed to fetch" (infrastructure timeout)

### 1.2 Root Cause

Infrastructure layer (proxy, load balancer, or middleware) enforces 60-second hard timeout on HTTP requests. This is **not configurable** from application code.

- Express `req.setTimeout(600000)` and `res.setTimeout(600000)` only affect Express-level timeouts
- Does not override infrastructure timeout at proxy layer

**Timeline analysis:**

- Generation (49s) + Serialization (0.5s) + Transmission (1-10s) = 50.5-59.5s
- **Buffer: 0.5-9.5 seconds** (insufficient for network variance)
- Network jitter of 5+ seconds is common in cloud environments

### 1.3 Impact

- **Cannot reliably generate 3+ page ebooks** with any theme/model combination
- Failure is **systematic and repeatable**, not intermittent
- Affects production use case (users cannot use main feature)
- Workarounds (retry, reduce pageCount) are poor UX

---

## 2. Proposed Solution Architecture

### 2.1 High-Level Design

Convert ebook generation from synchronous to asynchronous job queue pattern:

```
CLIENT                                SERVER
  │                                     │
  ├─ POST /api/ebook/generate           ├─ Validate request (100ms)
  │  (submit job)                       ├─ Create job record
  │                                     ├─ Return 202 + jobId
  │  ← Response (202 Accepted)          │
  │     { jobId, estimatedWait }        │
  │                                     ├─ BACKGROUND WORKER:
  │                                     │  1. Fetch job from queue
  │  GET /api/ebook/status/jobId        │  2. Call Gemini API (30-50s)
  │  (poll every 2s)                    │  3. Compose HTML (1-2s)
  │                                     │  4. Store result
  │  ← { progress: 5 }                  │
  │                                     │
  │  GET /api/ebook/status/jobId        │
  │  ← { progress: 45 }                 │
  │                                     │
  │  GET /api/ebook/status/jobId        │
  │  ← { status: "complete" }           │
  │                                     │
  │  GET /api/ebook/result/jobId        │
  │  (fetch result)                     │
  │                                     │
  │  ← Full ebook content               │
```

**Key principle:** No individual request takes >100ms → No timeout risk.

---

## 3. Endpoint Specifications

### 3.1 POST /api/ebook/generate (Modified)

**Purpose:** Submit ebook generation job, return immediately

**Request:**

```json
{
  "prompt": "string", // Required: ebook topic/premise
  "theme": "dark|light|corporate|bold", // Default: "dark"
  "pageCount": "number", // Default: 10 (range: 5-50)
  "colorPalette": "default|vibrant|pastel", // Default: "default"
  "fontSizeScale": 1.0 // Default: 1.0 (range: 0.8-1.5)
}
```

**Response (202 Accepted - Immediate):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "estimatedWait": 47000,
  "statusUrl": "/api/ebook/status/550e8400-e29b-41d4-a716-446655440000",
  "cancelUrl": "/api/ebook/cancel/550e8400-e29b-41d4-a716-446655440000",
  "message": "Job submitted. Use statusUrl to poll for progress."
}
```

**Response time:** <100ms (validation only)

**Error: 400 Bad Request (Invalid input)**

```json
{
  "error": "VALIDATION_ERROR",
  "code": "VALIDATION_ERROR",
  "message": "pageCount must be between 5 and 50",
  "field": "pageCount"
}
```

**Error: 503 Service Unavailable (Queue full)**

```json
{
  "error": "QUEUE_FULL",
  "code": "QUEUE_FULL",
  "message": "Generation queue is full. Try again in 30 seconds.",
  "retryAfter": 30
}
```

**Differences from sync version:**

| Aspect        | Old (Sync)   | New (Async)          |
| ------------- | ------------ | -------------------- |
| Status Code   | 201 Created  | 202 Accepted         |
| Response Time | 49-50s       | <100ms               |
| Content       | Full result  | jobId + polling URLs |
| Timeout Risk  | ❌ HIGH      | ✅ NONE              |
| Progress Info | None         | estimatedWait        |
| Cancellation  | Not possible | cancelUrl provided   |

---

### 3.2 GET /api/ebook/status/:jobId (New)

**Purpose:** Poll job status and get progress

**Request:**

```
GET /api/ebook/status/550e8400-e29b-41d4-a716-446655440000
```

**Response (200 OK - Queued):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "position": 3,
  "estimatedWait": 42000,
  "elapsedTime": 5000,
  "createdAt": "2024-01-15T10:30:15.000Z"
}
```

**Response (200 OK - Processing):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 67,
  "elapsedTime": 32500,
  "estimatedRemaining": 17500,
  "currentPhase": "chapter_generation",
  "currentPhaseProgress": 2,
  "currentPhaseOf": 3,
  "generationStartedAt": "2024-01-15T10:30:20.000Z"
}
```

**Response (200 OK - Complete):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "complete",
  "progress": 100,
  "elapsedTime": 50250,
  "completedAt": "2024-01-15T10:31:05.250Z",
  "resultUrl": "/api/ebook/result/550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (200 OK - Failed):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "error": {
    "code": "RATE_LIMIT_QUOTA",
    "message": "Gemini API quota exceeded",
    "details": "Used 18/20 requests in current rate window",
    "retryable": true,
    "retryAfter": 3600
  },
  "failedAt": "2024-01-15T10:31:02.500Z"
}
```

**Response (200 OK - Cancelled):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "cancelled",
  "progress": 45,
  "cancelledAt": "2024-01-15T10:30:45.000Z",
  "refund": {
    "tokensConsumed": 1500,
    "costRefunded": 0.02,
    "message": "50% refund applied for cancelled job"
  }
}
```

**Response time:** <50ms always (database lookup only)

**Error: 404 Not Found (Job doesn't exist)**

```json
{
  "error": "JOB_NOT_FOUND",
  "code": "JOB_NOT_FOUND",
  "message": "Job ID not found or expired"
}
```

**Error: 410 Gone (Job expired >24 hours)**

```json
{
  "error": "JOB_EXPIRED",
  "code": "EXPIRED",
  "message": "Job expired after 24 hours without completion",
  "expiredAt": "2024-01-16T10:30:15.000Z"
}
```

---

### 3.3 GET /api/ebook/result/:jobId (New)

**Purpose:** Fetch completed ebook result

**Request:**

```
GET /api/ebook/result/550e8400-e29b-41d4-a716-446655440000
```

**Response (200 OK - Result available):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "id": "ebook_1765645966937_suzliz604",
  "resultId": "5467850f-3d04-4d3e-99ad-a76081385303",

  "content": {
    "title": "Barty Bumble: The Case of the Missing Sparkleberry",
    "subtitle": "A children's mystery tale",
    "chapters": [
      {
        "id": "ch_1",
        "number": 1,
        "title": "Bartholomew's Beginnings & Mouse-town Mayhem",
        "content": "Bartholomew 'Barty' Bumble didn't need eyes to see the world...",
        "pageBreak": true
      }
    ]
  },

  "html": "<!DOCTYPE html>...[full HTML]...</html>",

  "metadata": {
    "model": "gemini-2.5-flash",
    "cost": 0.045,
    "tokensUsed": 2840,
    "generationTime": 49412,
    "pageCount": 3,
    "theme": "light",
    "colorPalette": "default"
  },

  "pages": [{ "number": 1, "title": "...", "content": "..." }],

  "can_export": true,
  "can_override": true
}
```

**Response (202 Accepted - Not ready yet):**

```json
{
  "error": "NOT_READY",
  "code": "NOT_READY",
  "status": "processing",
  "progress": 67,
  "estimatedRemaining": 17500,
  "message": "Result not ready. Call GET /api/ebook/status/:jobId to check progress"
}
```

**Response time:** <100ms (database lookup + JSON serialization)

**Error: 404 Not Found**

```json
{
  "error": "JOB_NOT_FOUND",
  "code": "JOB_NOT_FOUND",
  "message": "Job ID not found"
}
```

**Error: 410 Gone (Expired)**

```json
{
  "error": "JOB_EXPIRED",
  "code": "EXPIRED",
  "message": "Job result expired and has been deleted"
}
```

---

### 3.4 POST /api/ebook/cancel/:jobId (New)

**Purpose:** Cancel in-progress ebook generation job

**Request:**

```
POST /api/ebook/cancel/550e8400-e29b-41d4-a716-446655440000
```

**Response (200 OK - Queued job cancelled)**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "cancelled",
  "message": "Queued job cancelled. No processing occurred.",
  "refund": null
}
```

**Response (200 OK - Processing job cancelled)**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "cancelled",
  "progress": 45,
  "message": "In-progress job cancelled with partial refund.",
  "refund": {
    "tokensConsumed": 1500,
    "costRefunded": 0.02,
    "refundPercentage": 50,
    "reason": "Job cancelled at 45% completion"
  }
}
```

**Response time:** <100ms

**Behavior:**

1. If status is `queued`: Remove from queue, return immediately
2. If status is `processing`:
   - Trigger AbortController on Gemini API call
   - Mark job as `cancelled`
   - Calculate partial refund (tokens used vs total cost)
   - Return immediately
3. If status is `complete`: Return 410 (cannot cancel completed job)
4. If status is `cancelled` or `failed`: Return 410 (already terminal)

**Error: 404 Not Found**

```json
{
  "error": "JOB_NOT_FOUND",
  "code": "JOB_NOT_FOUND",
  "message": "Job ID not found"
}
```

**Error: 410 Gone (Already terminal)**

```json
{
  "error": "INVALID_STATE",
  "code": "INVALID_STATE",
  "message": "Cannot cancel job with status 'complete'",
  "currentStatus": "complete"
}
```

---

## 4. Backend Implementation Details

### 4.1 Job Record Structure

```javascript
interface EbookJobRecord {
  // Identification
  jobId: string; // UUID
  createdAt: Date;
  expiresAt: Date; // createdAt + 24 hours

  // Status
  status: "queued" | "processing" | "complete" | "failed" | "cancelled";

  // Request payload
  request: {
    prompt: string,
    theme: string,
    pageCount: number,
    colorPalette: string,
    fontSizeScale: number,
  };

  // Processing timeline
  queuedAt: Date;
  processingStartedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;

  // Progress tracking
  currentPhase?: "structure" | "chapter_generation" | "html_composition";
  progress: number; // 0-100
  estimatedTotalTime?: number; // ms

  // Result (populated when complete)
  result?: {
    id: string,
    resultId: string,
    content: { ... },
    html: string,
    metadata: { ... },
    pages: Array<{ ... }>,
  };

  // Error information (populated when failed)
  error?: {
    code: string,
    message: string,
    details?: any,
    timestamp: Date,
    retriable: boolean,
  };

  // Cancellation info
  abortController?: AbortController;
  cancelled?: boolean;
  refund?: {
    tokensConsumed: number,
    costRefunded: number,
  };
}
```

### 4.2 Storage Options

**Option A: In-Memory Map (Development)**

```javascript
const ebookJobs = new Map<string, EbookJobRecord>();

// Add job
ebookJobs.set(jobId, jobRecord);

// Retrieve job
const job = ebookJobs.get(jobId);

// Cleanup (every 24 hours)
setInterval(() => {
  for (const [jobId, job] of ebookJobs) {
    if (job.expiresAt < now) {
      ebookJobs.delete(jobId);
    }
  }
}, 3600000);
```

**Pros:** Simple, no database setup
**Cons:** Data lost on server restart, not suitable for production

**Option B: PostgreSQL (Production)**

```sql
CREATE TABLE ebook_jobs (
  job_id UUID PRIMARY KEY,
  status VARCHAR(20) NOT NULL,
  request JSONB NOT NULL,
  progress INT DEFAULT 0,

  queued_at TIMESTAMP DEFAULT NOW(),
  processing_started_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,

  result JSONB,
  error JSONB,
  refund JSONB,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ebook_jobs_status ON ebook_jobs(status);
CREATE INDEX idx_ebook_jobs_expires ON ebook_jobs(expires_at);
```

**Pros:** Persists across restarts, scalable, supports concurrent workers
**Cons:** Requires database setup, slightly higher latency (5-10ms vs <1ms)

### 4.3 Background Worker

```javascript
class EbookGenerationWorker {
  constructor(maxConcurrent = 3) {
    this.queue = [];
    this.activeJobs = new Set();
    this.maxConcurrent = maxConcurrent;
  }

  async start() {
    // Periodically check for queued jobs
    setInterval(() => this.processQueue(), 100);
  }

  async processQueue() {
    while (this.activeJobs.size < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      this.activeJobs.add(job.jobId);

      this.processJob(job)
        .then(() => this.activeJobs.delete(job.jobId))
        .catch((err) => {
          job.status = "failed";
          job.error = { code: "PROCESSING_ERROR", message: err.message };
          this.activeJobs.delete(job.jobId);
        });
    }
  }

  async processJob(job) {
    job.status = "processing";
    job.processingStartedAt = new Date();
    const abortController = new AbortController();
    job.abortController = abortController;

    try {
      // Dispatch to service layer with ONLY:
      // 1. Request payload (prompt, theme, pageCount, etc.)
      // 2. AbortSignal for cancellation control
      //
      // Service layer has ZERO awareness of:
      // - Job record structure
      // - Progress tracking
      // - Phase management
      // - Job queue state
      // - Cancellation callbacks
      //
      // This separation keeps business logic pure and testable.
      const result = await ebookService.handle(job.request, {
        signal: abortController.signal,
      });

      // Store result in job record (infrastructure layer only)
      job.result = {
        id: generateId(),
        resultId: uuidv4(),
        ...result,
      };

      job.status = "complete";
      job.completedAt = new Date();
      job.progress = 100;
    } catch (err) {
      if (err.name === "AbortError") {
        // Job was cancelled
        job.status = "cancelled";
        job.cancelledAt = new Date();
        // Calculate partial refund
        job.refund = calculateRefund(job);
      } else {
        job.status = "failed";
        job.error = {
          code: "PROCESSING_ERROR",
          message: err.message,
          retriable: isRetriable(err),
        };
      }
    }
  }
}

// Global worker instance
const ebookWorker = new EbookGenerationWorker(3);
ebookWorker.start();
```

### 4.3.1 Service Layer Purity (Critical Architectural Requirement)

**MUST BE RESPECTED**: The `ebookService.handle()` method must remain **pure business logic** with **zero awareness** of infrastructure plumbing.

**What ebookService.handle() CAN do:**

```javascript
async handle(payload, { signal }) {
  const { prompt, theme, pageCount, ... } = payload;

  // ✓ Generate content
  const structure = await aiService.generateContent(prompt, { signal });

  // ✓ Process content
  const chapters = await this.generateChapters(structure, { signal });

  // ✓ Compose result
  const html = await this.composeHTML(chapters, theme);

  // ✓ Return business result
  return {
    content: { title, chapters },
    html,
    metadata: { model, tokens, generationTime }
  };
}
```

**What ebookService.handle() CANNOT do:**

```javascript
async handle(payload, options) {
  // ✗ NEVER directly access job record
  options.job.progress = 50;  // VIOLATION
  options.job.currentPhase = "structure";  // VIOLATION

  // ✗ NEVER manage progress updates
  this.updateProgress(50);  // VIOLATION

  // ✗ NEVER know about queue position
  const queuePos = this.getQueuePosition();  // VIOLATION

  // ✗ NEVER know about cancellation state
  if (options.isCancelled) return;  // VIOLATION (check signal instead)

  // ✗ NEVER update job status
  options.job.status = "processing";  // VIOLATION
}
```

**Why This Separation is Critical**:

| Aspect                 | Without Separation                                           | With Separation                             |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| **What Service Knows** | Job records, progress, phases, queue, callbacks, persistence | Only how to generate content                |
| **What Service Tests** | Full infrastructure needed                                   | Just the business logic                     |
| **Reusability**        | Locked to async polling pattern                              | Works anywhere (sync, events, imports)      |
| **Maintainability**    | Changes to job tracking affect service code                  | Service untouched by infrastructure changes |
| **Complexity**         | Service contains: generation + accounting + orchestration    | Service contains: generation only           |
| **Testing**            | Mock jobs, queue, worker, storage, progress                  | Mock aiService only                         |

**Example: The Cost of Coupling**

```javascript
// WITHOUT separation: Service knows job structure
async handle(payload, options) {
  options.job.currentPhase = "structure";
  options.job.progress = 10;
  const structure = await aiService.generateStructure(...);

  options.job.currentPhase = "chapter_generation";
  for (let i = 0; i < chapters; i++) {
    if (options.job.cancelled) return;  // Must check job state
    options.job.progress = 15 + ...;
    // ...
  }
}
// Problem: If we add a feature (e.g., pause/resume),
// we must rewrite ebookService.handle() instead of just
// updating the worker infrastructure.
```

```javascript
// WITH separation: Service knows nothing about job infrastructure
async handle(payload, { signal }) {
  const structure = await aiService.generateStructure(..., { signal });

  const chapters = [];
  for (let i = 0; i < structure.chapters; i++) {
    const chapter = await aiService.generateChapter(..., { signal });
    chapters.push(chapter);
  }
  // That's it. Return content.
  return { content: { structure, chapters }, html, metadata };
}
// Benefit: Worker infrastructure can change (add pause/resume,
// change storage, change progress tracking) without touching
// ebookService at all.
```

**Implementation Guarantee**: Before deployment, verify that:

1. ✓ `ebookService.handle()` receives only `(payload, { signal })`
2. ✓ Service never accesses job record fields directly
3. ✓ Service never manages progress, phases, or queue state
4. ✓ Service returns `{ content, chapters, html, metadata }`
5. ✓ Service can be tested with just `{ aiService: mock }` dependency
6. ✓ No worker-specific code exists in service layer

---

### 4.4 Endpoint Handlers

**POST /api/ebook/generate**

```javascript
app.post("/api/ebook/generate", async (req, res) => {
  const { prompt, theme, pageCount, colorPalette, fontSizeScale } = req.body;

  // Validation (fast path)
  if (!prompt || prompt.trim().length === 0) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "prompt is required",
    });
  }

  if (pageCount < 5 || pageCount > 50) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "pageCount must be between 5 and 50",
    });
  }

  if (!["dark", "light", "corporate", "bold"].includes(theme)) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Invalid theme",
    });
  }

  // Check queue capacity
  if (ebookWorker.queue.length >= 100) {
    return res.status(503).json({
      error: "QUEUE_FULL",
      message: "Generation queue is full",
      retryAfter: 30,
    });
  }

  // Create job record
  const jobId = uuidv4();
  const job = {
    jobId,
    status: "queued",
    request: { prompt, theme, pageCount, colorPalette, fontSizeScale },
    progress: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  };

  // Store job
  ebookJobs.set(jobId, job);
  ebookWorker.queue.push(job);

  // Return immediately (202)
  res.status(202).json({
    jobId,
    status: "queued",
    estimatedWait: 47000,
    statusUrl: `/api/ebook/status/${jobId}`,
    cancelUrl: `/api/ebook/cancel/${jobId}`,
  });
});
```

**GET /api/ebook/status/:jobId**

```javascript
app.get("/api/ebook/status/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = ebookJobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: "JOB_NOT_FOUND",
      message: "Job not found",
    });
  }

  if (job.expiresAt < new Date()) {
    ebookJobs.delete(jobId);
    return res.status(410).json({
      error: "JOB_EXPIRED",
      message: "Job expired",
    });
  }

  // Build response based on status
  const response = {
    jobId,
    status: job.status,
    progress: job.progress,
    elapsedTime: Date.now() - job.createdAt.getTime(),
  };

  if (job.status === "queued") {
    response.position = ebookWorker.queue.indexOf(job);
    response.estimatedWait = response.position * 50000; // 50s per job
  }

  if (job.status === "processing") {
    response.estimatedRemaining = (100 - job.progress) * 500; // Rough estimate
    response.currentPhase = job.currentPhase;
    response.generationStartedAt = job.processingStartedAt;
  }

  if (job.status === "complete") {
    response.completedAt = job.completedAt;
    response.resultUrl = `/api/ebook/result/${jobId}`;
  }

  if (job.status === "failed") {
    response.error = job.error;
  }

  if (job.status === "cancelled") {
    response.cancelledAt = job.cancelledAt;
    response.refund = job.refund;
  }

  res.json(response);
});
```

**GET /api/ebook/result/:jobId**

```javascript
app.get("/api/ebook/result/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = ebookJobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: "JOB_NOT_FOUND",
      message: "Job not found",
    });
  }

  if (job.status === "complete" && job.result) {
    return res.json({
      jobId,
      ...job.result,
    });
  }

  // Not ready
  res.status(202).json({
    error: "NOT_READY",
    status: job.status,
    progress: job.progress,
  });
});
```

**POST /api/ebook/cancel/:jobId**

```javascript
app.post("/api/ebook/cancel/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = ebookJobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: "JOB_NOT_FOUND",
      message: "Job not found",
    });
  }

  if (job.status === "complete" || job.status === "failed") {
    return res.status(410).json({
      error: "INVALID_STATE",
      message: `Cannot cancel job with status '${job.status}'`,
    });
  }

  // Mark as cancelled
  job.cancelled = true;
  job.status = "cancelled";
  job.cancelledAt = new Date();

  // If processing, abort Gemini call
  if (job.abortController) {
    job.abortController.abort();
  }

  // Calculate refund
  if (job.progress > 0) {
    job.refund = {
      tokensConsumed: Math.floor((job.progress / 100) * 2840),
      costRefunded: 0.045 * (1 - job.progress / 100),
      refundPercentage: Math.floor(100 - job.progress),
    };
  }

  res.json({
    jobId,
    status: "cancelled",
    progress: job.progress,
    message: "Job cancelled",
    refund: job.refund || null,
  });
});
```

---

## 5. Frontend Implementation Details

### 5.1 Updated ebookApi.js

```javascript
// ebookApi.js - High-level client

const CONFIG = {
  API_BASE_URL: "/api",
  POLLING_INTERVAL: 2000, // ms
  POLLING_MAX_ATTEMPTS: 3600, // ~2 hours
  TIMEOUTS: {
    STATUS: 10000, // 10s
    RESULT: 30000, // 30s
    CANCEL: 5000, // 5s
  },
};

/**
 * Submit ebook generation job
 * Returns job handle for polling/cancellation
 */
export async function generateEbook(payload) {
  const response = await fetchWithTimeout(
    `${CONFIG.API_BASE_URL}/ebook/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    5000 // Fast endpoint
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Submission failed: ${response.status}`);
  }

  const { jobId, estimatedWait, statusUrl, cancelUrl } = await response.json();

  // Return handle with polling/cancellation methods
  return {
    jobId,
    estimatedWait,
    statusUrl,
    cancelUrl,

    /**
     * Poll current job status
     */
    async poll() {
      return getStatus(jobId);
    },

    /**
     * Fetch result (only when complete)
     */
    async getResult() {
      return getResult(jobId);
    },

    /**
     * Cancel in-progress job
     */
    async cancel() {
      return cancelJob(jobId);
    },

    /**
     * Poll until complete or failed
     * @param onProgress callback(status) fired on each poll
     * @param interval ms between polls
     */
    async waitForCompletion(onProgress, interval = CONFIG.POLLING_INTERVAL) {
      let attempts = 0;

      while (attempts < CONFIG.POLLING_MAX_ATTEMPTS) {
        const status = await this.poll();

        if (onProgress) {
          onProgress(status);
        }

        if (status.status === "complete") {
          return await this.getResult();
        }

        if (status.status === "failed") {
          throw new Error(
            `Generation failed: ${status.error?.message || "Unknown error"}`
          );
        }

        if (status.status === "cancelled") {
          throw new Error("Generation was cancelled");
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, interval));
        attempts++;
      }

      throw new Error("Generation polling timeout");
    },
  };
}

/**
 * Get current status of a job
 */
export async function getStatus(jobId) {
  const response = await fetchWithTimeout(
    `${CONFIG.API_BASE_URL}/ebook/status/${jobId}`,
    { method: "GET" },
    CONFIG.TIMEOUTS.STATUS
  );

  if (response.status === 404) {
    throw new Error("Job not found");
  }

  if (response.status === 410) {
    throw new Error("Job expired");
  }

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  return await response.json();
}

/**
 * Get result of completed job
 */
export async function getResult(jobId) {
  const response = await fetchWithTimeout(
    `${CONFIG.API_BASE_URL}/ebook/result/${jobId}`,
    { method: "GET" },
    CONFIG.TIMEOUTS.RESULT
  );

  if (response.status === 202) {
    // Not ready yet
    const status = await response.json();
    throw new Error(
      `Result not ready (${status.progress}% complete). Try again soon.`
    );
  }

  if (response.status === 404) {
    throw new Error("Job not found");
  }

  if (response.status === 410) {
    throw new Error("Job expired");
  }

  if (!response.ok) {
    throw new Error(`Result fetch failed: ${response.status}`);
  }

  return await response.json();
}

/**
 * Cancel in-progress job
 */
export async function cancelJob(jobId) {
  const response = await fetchWithTimeout(
    `${CONFIG.API_BASE_URL}/ebook/cancel/${jobId}`,
    { method: "POST" },
    CONFIG.TIMEOUTS.CANCEL
  );

  if (response.status === 404) {
    throw new Error("Job not found");
  }

  if (response.status === 410) {
    throw new Error("Cannot cancel completed job");
  }

  if (!response.ok) {
    throw new Error(`Cancellation failed: ${response.status}`);
  }

  return await response.json();
}
```

### 5.2 Updated GenerateFlow.svelte

```svelte
<script>
  import { ebookStore, flowStore } from "./stores";
  import * as ebookApi from "./ebookApi";

  let currentJob = null;
  let pollInterval = null;
  let pollCount = 0;

  async function startGeneration() {
    flowStore.setState("GENERATING");
    pollCount = 0;

    try {
      // Step 1: Submit job
      const job = await ebookApi.generateEbook({
        prompt: $flowStore.prompt,
        theme: $ebookStore.theme,
        pageCount: $ebookStore.pageCount,
        colorPalette: $ebookStore.colorPalette,
        fontSizeScale: $ebookStore.fontSizeScale,
      });

      currentJob = job;

      // Step 2: Poll until complete
      const result = await job.waitForCompletion(
        (status) => {
          pollCount++;

          flowStore.setProgress({
            status: status.status,
            progress: status.progress,
            elapsedTime: status.elapsedTime,
            estimatedRemaining: status.estimatedRemaining,
            currentPhase: status.currentPhase,
          });

          // Log every 10th poll
          if (pollCount % 10 === 0) {
            console.log(
              `[Poll ${pollCount}] Progress: ${status.progress}% ` +
              `(${Math.floor(status.elapsedTime / 1000)}s elapsed)`
            );
          }
        },
        2000 // Poll every 2 seconds
      );

      // Step 3: Store result
      ebookStore.setContent(result);
      flowStore.setState("RESULT_READY");

    } catch (err) {
      console.error("[Generation Error]", err);

      flowStore.setError({
        code: "GENERATION_ERROR",
        message: err.message,
        retryable: !err.message.includes("cancelled"),
      });

      flowStore.setState("ERROR");
    }
  }

  function cancelGeneration() {
    if (!currentJob) return;

    currentJob
      .cancel()
      .then(() => {
        flowStore.setState("CANCELLED");
        console.log("[Generation] Cancelled by user");
      })
      .catch((err) => {
        console.error("[Cancellation Error]", err);
        flowStore.setError({
          code: "CANCELLATION_ERROR",
          message: `Failed to cancel: ${err.message}`,
        });
      });
  }

  // Cleanup on unmount
  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });
</script>

<!-- Template -->
<div class="generate-flow">
  {#if $flowStore.state === "INITIAL"}
    <PromptInput on:submit={startGeneration} />

  {:else if $flowStore.state === "GENERATING"}
    <GenerationProgress
      progress={$flowStore.progress}
      onCancel={cancelGeneration}
    />

  {:else if $flowStore.state === "RESULT_READY"}
    <EbookPreview
      content={$ebookStore.content}
      on:export
      on:override
    />

  {:else if $flowStore.state === "ERROR"}
    <ErrorDisplay
      error={$flowStore.error}
      on:retry={startGeneration}
    />

  {:else if $flowStore.state === "CANCELLED"}
    <CancelledDisplay on:newGeneration={reset} />
  {/if}
</div>
```

### 5.3 New GenerationProgress.svelte Component

```svelte
<script>
  import { onInterval } from "svelte";

  export let progress = 0;
  export let onCancel = () => {};

  let displayTime = 0;
  let displayProgress = 0;

  // Smooth animation
  $: if (progress !== displayProgress) {
    displayProgress = progress;
  }

  // Format remaining time
  function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainderSeconds = seconds % 60;
    return `${minutes}m ${remainderSeconds}s`;
  }
</script>

<div class="generation-progress">
  <div class="header">
    <h2>Generating Your Ebook</h2>
    <p>Please wait while we create your content...</p>
  </div>

  <div class="progress-container">
    <div class="progress-bar">
      <div
        class="progress-fill"
        style="width: {displayProgress}%"
      />
    </div>
    <div class="progress-text">
      <span class="percentage">{Math.floor(displayProgress)}%</span>
      <span class="time" data-remaining>
        ~{formatTime(progress.estimatedRemaining || 0)} remaining
      </span>
    </div>
  </div>

  <div class="phase-indicator">
    <p>
      {#if progress.currentPhase === "structure"}
        Creating outline...
      {:else if progress.currentPhase === "chapter_generation"}
        Writing chapters...
      {:else if progress.currentPhase === "html_composition"}
        Composing layout...
      {:else}
        Processing...
      {/if}
    </p>
  </div>

  <button
    class="cancel-button"
    on:click={onCancel}
  >
    Cancel Generation
  </button>

  <div class="details">
    <p class="text-muted">
      Elapsed: {Math.floor(progress.elapsedTime / 1000)}s
    </p>
  </div>
</div>

<style>
  .generation-progress {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 2rem;
  }

  .progress-bar {
    height: 8px;
    background: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4f46e5, #7c3aed);
    transition: width 0.3s ease;
  }

  .progress-text {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
  }

  .percentage {
    font-weight: 600;
  }

  .time {
    color: #666;
  }

  .cancel-button {
    padding: 0.75rem 1.5rem;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 500;
  }

  .cancel-button:hover {
    background: #dc2626;
  }
</style>
```

---

## 6. Updated State Machine

```
┌─────────────────────────────────────────┐
│           FRONTEND STATE MACHINE          │
└─────────────────────────────────────────┘

INITIAL
  ├─ User enters prompt
  ├─ User selects theme/settings
  ↓

GENERATING (NEW FLOW)
  ├─ POST /api/ebook/generate → 202 + jobId
  ├─ Poll every 2s: GET /api/ebook/status/:jobId
  │
  ├─ Progress 0-25%: "Creating outline..."
  ├─ Progress 25-75%: "Writing chapters..."
  ├─ Progress 75-95%: "Composing layout..."
  ├─ Progress 95-100%: "Finalizing..."
  │
  ├─ User can cancel → POST /api/ebook/cancel/:jobId
  │
  ├─ Status: "queued" → Wait in queue
  ├─ Status: "processing" → Polling continues
  ├─ Status: "complete" → GET /api/ebook/result/:jobId
  ↓

RESULT_READY
  ├─ Content displayed
  ├─ User can export, override, download
  ↓

COMPLETE or CANCELLED or ERROR
```

---

## 7. Timeout Analysis (Before vs After)

### Before (Synchronous)

```
T=0s    Client POST /api/ebook/generate
        │
        ├─ Server validation (100ms)
        ├─ Gemini API call (49s)
        ├─ Response composition (1s)
        ├─ Network transmission (1-10s)
        │
T=60s   Infrastructure timeout fires ❌
        Client: "Failed to fetch"
```

**Risk: HIGH** — Single 50-60s request vulnerable to timeout

### After (Async Polling)

```
T=0s    Client POST /api/ebook/generate
        └─ Server: 202 + jobId (50ms)
           ✓ Safe, completes in <100ms

T=0.05s Client GET /api/ebook/status/:jobId
        └─ Server: {"status":"queued"} (20ms)
           ✓ Safe, completes in <100ms

T=2.05s Client GET /api/ebook/status/:jobId
        └─ Server processes job in background
        └─ Response: {"progress":5} (30ms)
           ✓ Safe, completes in <100ms

... polling continues every 2 seconds ...

T=49s   Background job finishes generation
        └─ Next poll: {"status":"complete"} (30ms)
           ✓ Safe, completes in <100ms

T=50s   Client GET /api/ebook/result/:jobId
        └─ Server returns full result (100ms)
           ✓ Safe, completes in <200ms

Total: 50 seconds elapsed, but every individual
request completed in <200ms ✓✓✓
NO TIMEOUT RISK
```

**Risk: NONE** — All individual requests <100-200ms

---

## 8. Concurrency & Queue Management

### 8.1 Queue Configuration

```javascript
const QUEUE_CONFIG = {
  maxConcurrentJobs: 3, // Process 3 jobs simultaneously
  maxQueueSize: 100, // Reject if 100+ jobs waiting
  jobTimeoutSeconds: 120, // Abort job if >120s (sanity limit)
  jobExpirationHours: 24, // Delete result after 24 hours
};
```

### 8.2 Queue Metrics

```javascript
// Monitor queue health
setInterval(() => {
  const queued = ebookJobs.filter((j) => j.status === "queued").length;
  const processing = ebookJobs.filter((j) => j.status === "processing").length;
  const completed = ebookJobs.filter((j) => j.status === "complete").length;
  const failed = ebookJobs.filter((j) => j.status === "failed").length;

  console.log(
    `[Queue] Queued: ${queued}, Processing: ${processing}, ` +
      `Completed: ${completed}, Failed: ${failed}`
  );

  // Alert if queue backing up
  if (queued > 50) {
    logger.warn(`[Alert] Ebook queue backing up: ${queued} jobs waiting`);
  }
}, 60000); // Every minute
```

### 8.3 Scaling Considerations

**Single-Server Deployment:**

- 3 concurrent jobs
- Support 1-2 requests/sec reliably
- Queue backlog acceptable for internal use

**Multi-Server Deployment:**

- Use shared database (PostgreSQL) for job records
- Each server runs independent worker with maxConcurrent=3
- With 3 servers: 9 concurrent jobs, scales to 4-5 requests/sec
- Load balancer distributes POST requests; workers process independently

---

## 9. Implementation Roadmap

### Phase 1: Backend Async Infrastructure (1-2 days)

- [ ] Design EbookJob record structure
- [ ] Implement in-memory job queue (Map)
- [ ] Implement background worker thread
- [ ] Implement POST /api/ebook/generate (return 202)
- [ ] Implement GET /api/ebook/status/:jobId
- [ ] Implement GET /api/ebook/result/:jobId
- [ ] Test with curl/Postman
- [ ] Add logging and debugging
- [ ] Document queue behavior

**Acceptance Criteria:**

- POST returns in <100ms
- Status polls return in <50ms
- Can submit 10 jobs and retrieve results
- No timeout errors during typical flow

---

### Phase 2: Cancellation Support (1 day)

- [ ] Implement POST /api/ebook/cancel/:jobId
- [ ] Wire AbortController in Gemini API client
- [ ] Add cancellation check in worker loop
- [ ] Calculate partial refund on cancellation
- [ ] Test cancellation at 10%, 50%, 90% completion
- [ ] Verify tokens not consumed after cancellation

**Acceptance Criteria:**

- Cancel queued job: immediate
- Cancel processing job: aborts within 1s
- Tokens refunded proportionally
- No "wasted" API calls after cancellation

---

### Phase 3: Frontend Integration (1-2 days)

- [ ] Update ebookApi.js with polling functions
- [ ] Create waitForCompletion() helper
- [ ] Update GenerateFlow.svelte state machine
- [ ] Create GenerationProgress.svelte component
- [ ] Implement polling loop (2s interval)
- [ ] Add progress bar and time estimates
- [ ] Add cancel button
- [ ] Handle edge cases (expired jobs, lost connection)
- [ ] Test E2E: submit → poll → result → display

**Acceptance Criteria:**

- UI polls every 2 seconds smoothly
- Progress bar animates from 0-100%
- Time remaining estimate tracks accurately
- Cancel button works and reflects cancellation
- All error states handled gracefully

---

### Phase 4: Monitoring & Optimization (1 day)

- [ ] Add metrics collection (success rate, avg wait time)
- [ ] Set up alerting (queue backing up, job failures)
- [ ] Load test with concurrent requests
- [ ] Optimize polling interval based on queue depth
- [ ] Add observability dashboard
- [ ] Performance benchmarking

**Acceptance Criteria:**

- Can sustain 10 concurrent jobs
- Metrics show success rate >99%
- Dashboard shows queue depth, job success rate
- Alerts fire when queue exceeds threshold

---

## 10. Backward Compatibility & Migration

### 10.1 Feature Flagging

```javascript
const USE_ASYNC_GENERATION = process.env.USE_ASYNC_GENERATION === "true";

app.post("/api/ebook/generate", async (req, res) => {
  if (USE_ASYNC_GENERATION) {
    // New async path
    return handleAsyncGeneration(req, res);
  } else {
    // Old sync path (for backward compatibility)
    return handleSyncGeneration(req, res);
  }
});
```

**Rollout plan:**

1. Deploy with flag OFF → uses sync endpoint
2. Enable for internal testing → flag ON
3. Measure success rate → must be >99%
4. Enable for beta users → 10% traffic
5. Monitor metrics → no regressions
6. Full rollout → 100% traffic
7. Eventually remove sync code

### 10.2 Client Detection

Old clients can detect async support:

```javascript
// In client code
const response = await fetch("/health");
const health = await response.json();

if (health.features?.asyncGeneration) {
  // Use new async polling
  await useAsyncGeneration();
} else {
  // Fall back to old sync
  await useSyncGeneration();
}
```

---

## 11. Error Handling & Edge Cases

### 11.1 Common Error Scenarios

**Scenario A: Job expired while polling**

```
User submits job
Waits 24+ hours
Tries to fetch result
Server returns 410 Gone
Client shows: "Job expired"
User must restart
```

**Scenario B: Network disconnect during polling**

```
Polling proceeds normally
Network drops
fetch() throws TypeError
Client catches error
Shows: "Connection lost, retrying..."
Resumes polling when connection restored
```

**Scenario C: Job failed (Gemini quota)**

```
Job starts processing
Gemini API returns 429 (rate limited)
Backend catches error
Job marked as "failed"
Next poll returns error details
Client shows: "Daily quota exceeded, try tomorrow"
```

**Scenario D: User cancels, then refreshes**

```
User submits job
User cancels job
Job marked as "cancelled"
User refreshes page
New request to status endpoint
Returns: "status": "cancelled"
UI shows cancellation message
```

### 11.2 Validation & Safety Checks

**Input validation (on submission):**

- `prompt`: non-empty, <5000 chars
- `theme`: one of allowed values
- `pageCount`: 5-50 range
- `colorPalette`: one of allowed values
- `fontSizeScale`: 0.8-1.5 range

**State machine validation (during polling):**

- Only allow result fetch when status="complete"
- Only allow cancellation when status="queued" or "processing"
- Expire jobs >24 hours old

**Abort safety (during cancellation):**

- Abort Gemini API call via AbortController
- Verify abort fires within 1s
- Monitor for lingering background tasks

---

## 12. Success Metrics

### 12.1 Metrics to Track

| Metric                    | Target | Current | Goal  |
| ------------------------- | ------ | ------- | ----- |
| Timeout errors            | 0%     | ~100%   | <0.1% |
| Success rate              | >99%   | ~0%     | >99%  |
| P50 completion time       | ~50s   | 50s     | 50s   |
| P99 completion time       | ~60s   | 60s     | 55s   |
| Concurrent jobs supported | 10+    | 1       | 10+   |
| User cancellations        | >0     | 0       | >50%  |
| Token refund rate         | >95%   | N/A     | >95%  |

### 12.2 Observability

```javascript
// Log important events
logger.info("[Job Created]", { jobId, pageCount, theme });
logger.info("[Job Processing Started]", { jobId, elapsedMs });
logger.info("[Job Completed]", { jobId, totalMs, tokensUsed });
logger.warn("[Job Failed]", { jobId, error, reason });
logger.info("[Job Cancelled]", { jobId, progress, refunded });

// Metrics
metrics.counter("ebook.jobs.created", 1);
metrics.counter("ebook.jobs.completed", 1);
metrics.counter("ebook.jobs.failed", 1);
metrics.counter("ebook.jobs.cancelled", 1);
metrics.histogram("ebook.generation.time_ms", completionTimeMs);
metrics.gauge("ebook.queue.size", queueLength);
```

---

## 13. Risks & Mitigation

| Risk                             | Probability | Impact | Mitigation                            |
| -------------------------------- | ----------- | ------ | ------------------------------------- |
| Queue overflow (100+ jobs)       | Low         | Medium | Reject with 503 if queue >100         |
| Job record lost on restart       | Medium      | Low    | Use PostgreSQL instead of in-memory   |
| Stale polling (network issue)    | Medium      | Low    | Add exponential backoff after 5 polls |
| Gemini quota exhaustion          | High        | High   | Monitor quota, alert when <20%        |
| Concurrent worker conflicts      | Low         | High   | Use database locks for job assignment |
| Memory leak in background worker | Low         | High   | Implement job cleanup, monitor memory |

---

## 14. Testing Strategy

### 14.1 Unit Tests

- [ ] Job record creation
- [ ] Status state transitions
- [ ] Cancellation logic
- [ ] Refund calculations
- [ ] Expiration cleanup

### 14.2 Integration Tests

- [ ] Submit job → poll → retrieve result
- [ ] Cancel job → refund calculation
- [ ] Queue management (backpressure)
- [ ] Job expiration (24-hour cleanup)
- [ ] Concurrent job processing

### 14.3 E2E Tests

- [ ] User submits ebook → sees progress → result loads
- [ ] User cancels generation → cancellation confirmed
- [ ] User loses network connection → resumes polling
- [ ] Job expires → error shown
- [ ] Multiple users simultaneously

### 14.4 Load Testing

- [ ] Sustain 3 concurrent jobs continuously
- [ ] Handle 10 job submissions in 10s
- [ ] Queue backing up to 50+ jobs
- [ ] Polling 100s of clients every 2s

---

## 15. Documentation & Communication

### 15.1 Internal Documentation

- [ ] Architecture diagram
- [ ] Job record schema
- [ ] State machine diagram
- [ ] API endpoint reference
- [ ] Error taxonomy
- [ ] Runbook for debugging

### 15.2 User Communication

- [ ] "New: Real-time progress during ebook generation"
- [ ] "Cancel generation anytime to save tokens"
- [ ] "Improved reliability - No more timeout errors"

---

## Appendix: API Reference Summary

### Endpoints

| Method | Endpoint                   | Purpose      | Response Time |
| ------ | -------------------------- | ------------ | ------------- |
| POST   | `/api/ebook/generate`      | Submit job   | <100ms        |
| GET    | `/api/ebook/status/:jobId` | Poll status  | <50ms         |
| GET    | `/api/ebook/result/:jobId` | Fetch result | <200ms        |
| POST   | `/api/ebook/cancel/:jobId` | Cancel job   | <100ms        |

### Status Values

| Status       | Meaning                 | Retriable |
| ------------ | ----------------------- | --------- |
| `queued`     | Waiting in queue        | N/A       |
| `processing` | Currently generating    | N/A       |
| `complete`   | Successfully completed  | N/A       |
| `failed`     | Error during generation | Maybe     |
| `cancelled`  | Cancelled by user       | No        |

### Error Codes

| Code               | HTTP | Cause                      | Retriable |
| ------------------ | ---- | -------------------------- | --------- |
| `VALIDATION_ERROR` | 400  | Invalid request parameters | No        |
| `QUEUE_FULL`       | 503  | Queue at capacity          | Yes       |
| `JOB_NOT_FOUND`    | 404  | Job ID doesn't exist       | No        |
| `JOB_EXPIRED`      | 410  | Job >24 hours old          | No        |
| `NOT_READY`        | 202  | Result not ready yet       | Yes       |
| `INVALID_STATE`    | 410  | Can't cancel completed job | No        |
| `RATE_LIMIT_QUOTA` | 429  | Gemini API quota exceeded  | Yes       |
| `PROCESSING_ERROR` | 500  | Unexpected error           | Maybe     |

---

## Conclusion

This async polling solution transforms ebook generation from a synchronous 50-60 second request (vulnerable to infrastructure timeout) into a responsive job queue pattern. Each individual request completes in <200ms, eliminating timeout risk while improving user experience with real-time progress and cancellation support.

The implementation leverages existing async export queue patterns, requires no architectural changes, and can be deployed behind a feature flag with zero impact on existing code.

**Ready for review and critique.**
