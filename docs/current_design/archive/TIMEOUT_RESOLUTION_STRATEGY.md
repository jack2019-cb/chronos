# TIMEOUT RESOLUTION STRATEGY: 60-Second Infrastructure Bottleneck

**Status**: Draft  
**Date**: December 14, 2025 @ 2:30PM
**Branch**: feat/ebook-revert  
**Related**: [ARCHITECTURE_DOCUMENTATION_PROPOSAL.md](ARCHITECTURE_DOCUMENTATION_PROPOSAL.md), [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md#scenario-a-60-second-infrastructure-timeout)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Solution Options](#solution-options)
   - [Option 1: Streaming](#option-1-response-streaming-chunked-transfer-encoding)
   - [Option 2: Polling](#option-2-asynchronous-polling-pattern-202-accepted)
   - [Option 3: Heartbeat](#option-3-hybrid-streaming--heartbeat)
   - [Option 4: Queue](#option-4-async-queuebackground-workers-celerybull)
   - [Option 5: Optimization](#option-5-reduce-backend-processing-time-optimization-only)
4. [Comparison Matrix](#comparison-matrix)
5. [Recommended Approach](#recommended-approach)
   - [Phase 1: OPT-INFRA](#phase-1-opt-infra-optimizationinfrastructure)
   - [Phase 2: ASYNC-POLL](#phase-2-async-poll-asynchronous-polling)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Decision Tree](#decision-tree)
8. [Risk Mitigation](#risk-mitigation)
9. [Success Metrics](#success-metrics)
10. [FAQ](#faq)
11. [References](#references)

---

## Executive Summary

The AetherPress system faces a **critical blocking issue**: Backend ebook generation takes 49-50 seconds, infrastructure imposes a ~60-second hard timeout, leaving only 5-10 seconds for response transmission. This causes "Network error: Failed to fetch" even when generation succeeds on the server.

**This document**:

- ✅ Presents all viable solutions (5 options)
- ✅ Provides detailed cost/risk analysis for each
- ✅ Recommends a two-phase approach: **OPT-INFRA** (quick wins) → **ASYNC-POLL** (robust solution)
- ✅ Includes implementation roadmap with specific PR structure

---

## Problem Statement

### Timeline of Failure

```
T=0s     Client: POST /api/ebook/generate
T+49s    Server: Gemini generation complete (structure + 5 chapters)
T+50s    Server: HTML composition done, response ready
T+50.5s  Server: Begin transmitting 45KB response
T+60s    Infrastructure: TIMEOUT FIRES
         ↓
         Connection dropped before transmission complete
         ↓
         Client receives: TypeError: Failed to fetch
         ↓
         User sees: "Network error" (despite successful generation)
```

### Root Cause

| Component               | Duration   | Constraint              |
| ----------------------- | ---------- | ----------------------- |
| Gemini Pro (structure)  | 10-15s     | API rate limit (2 RPM)  |
| Gemini Flash (chapters) | 20-30s     | API rate limit (15 RPM) |
| HTML composition        | 2-5s       | CPU-bound               |
| **Total backend**       | **49-50s** | Sum of above            |
| Response transmission   | 5-10s      | Network bandwidth       |
| **Available time**      | **~60s**   | Codespaces timeout      |
| **Buffer**              | **0-5s**   | ⚠️ MARGINAL             |

**Critical Insight**: Backend processing (49-50s) dominates. Slight variations in network latency push transmission past the timeout window.

---

## Solution Options

### Option 1: Response Streaming (Chunked Transfer Encoding)

**Concept**: Begin sending response data incrementally as each generation stage completes, keeping the connection alive throughout.

#### Implementation

```javascript
// Server: Stream data as it becomes available
res.setHeader('Content-Type', 'application/x-ndjson'); // Newline-delimited JSON
res.setHeader('Transfer-Encoding', 'chunked');

// T+15s: Send structure
res.write(JSON.stringify({ stage: 'structure', data: structure }) + '\n');

// T+35s: Send chapters
res.write(JSON.stringify({ stage: 'chapters', data: chapters }) + '\n');

// T+40s: Send final HTML
res.write(JSON.stringify({ stage: 'complete', html: finalHTML, metadata: {...} }) + '\n');

res.end();
```

```javascript
// Client: Parse streaming response
const response = await fetch("/api/ebook/generate", { method: "POST", body });
const reader = response.body.getReader();
const decoder = new TextDecoder();

let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop(); // Keep incomplete line in buffer

  lines.forEach((line) => {
    if (line.trim()) {
      const chunk = JSON.parse(line);
      updateUI(chunk); // Progressive UI update
    }
  });
}
```

#### Pros

- ✅ Keeps connection alive (data flowing continuously)
- ✅ Progressive UI updates (user sees progress: "generating chapters...")
- ✅ No infrastructure changes required
- ✅ No backend complexity (just write chunks instead of one response)
- ✅ Infrastructure timeout never triggers (constant data flow)

#### Cons

- ❌ Requires client refactoring (streaming JSON parsing, not simple `response.json()`)
- ❌ Needs custom NDJSON (newline-delimited JSON) parser
- ❌ Frontend state machine must handle partial results
- ❌ Client must reconstruct final envelope from chunks
- ❌ Backward compatibility: existing clients break

#### Effort

- Backend: 2-3 hours (refactor response serialization to streaming)
- Frontend: 5-8 hours (implement streaming parser, state transitions)
- Testing: 2-3 hours (E2E tests for streaming scenarios)
- **Total**: 9-14 hours

#### Risk

- Low-medium (streaming pattern proven, but requires careful JSON handling)

---

### Option 2: Asynchronous Polling Pattern (202 Accepted)

**Concept**: Return job ID immediately (HTTP 202), client polls for completion status, retrieves result when ready.

#### Implementation

```javascript
// Server: Return job ID immediately
app.post("/api/ebook/generate", async (req, res) => {
  const jobId = generateUUID();
  const { prompt, metadata } = req.body;

  // Queue the job asynchronously (don't wait)
  setImmediate(() => {
    ebookService
      .handle({ prompt, metadata, jobId })
      .then((result) => jobStore.set(jobId, { status: "complete", result }))
      .catch((err) =>
        jobStore.set(jobId, { status: "failed", error: err.message })
      );
  });

  // Return immediately (T+0.01s)
  res.status(202).json({
    jobId,
    status: "queued",
    estimatedTimeMs: 50000,
    statusUrl: `/api/ebook/status/${jobId}`,
  });
});

// Server: Status polling endpoint
app.get("/api/ebook/status/:jobId", (req, res) => {
  const job = jobStore.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  if (job.status === "complete") {
    return res.status(200).json({
      jobId: req.params.jobId,
      status: "complete",
      result: job.result,
    });
  }

  return res.status(200).json({
    jobId: req.params.jobId,
    status: job.status, // 'queued' | 'processing' | 'complete'
    progress: job.progress || 0,
    eta: job.eta || null,
  });
});
```

```javascript
// Client: Poll for completion
async function generateWithPolling(prompt, metadata) {
  // Step 1: Initiate generation
  const response = await fetch("/api/ebook/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, metadata }),
  });

  if (response.status !== 202) {
    throw new Error("Expected 202 Accepted");
  }

  const { jobId, estimatedTimeMs } = await response.json();

  // Step 2: Poll for completion
  return pollUntilComplete(jobId, estimatedTimeMs);
}

async function pollUntilComplete(jobId, estimatedTimeMs) {
  const pollIntervalMs = 2000; // Check every 2 seconds
  const maxWaitMs = 120000; // Max 2 minutes
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`/api/ebook/status/${jobId}`);
    const data = await response.json();

    if (data.status === "complete") {
      return data.result;
    }

    if (data.status === "failed") {
      throw new Error(data.error);
    }

    // Update UI with progress
    flowStore.updateProgress({
      status: "processing",
      progress: data.progress || 0,
      eta: data.eta || null,
    });

    // Wait before next poll
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error("Job timeout (exceeded 2 minutes)");
}
```

#### Pros

- ✅ Infrastructure timeout completely eliminated (polls are <1s each)
- ✅ Clear semantics (job queued → processing → complete)
- ✅ Server can safely timeout slow generations (cut off at T+55s)
- ✅ Minimal backend complexity (just add status endpoint)
- ✅ Familiar pattern (Google Drive, AWS S3, etc.)
- ✅ Natural foundation for background workers/queues

#### Cons

- ❌ Significant frontend refactoring (state machine needs poll loop)
- ❌ UI shows "Processing 45%..." instead of streaming updates
- ❌ Network overhead (5-10 extra polling requests)
- ❌ Slightly longer perceived latency (time between completion and client retrieval)
- ❌ Requires job storage (in-memory or Redis)

#### Effort

- Backend: 3-4 hours (add polling endpoint + job storage)
- Frontend: 6-8 hours (poll loop, progress UI, error recovery)
- Testing: 2-3 hours (test race conditions, polling edge cases)
- **Total**: 11-15 hours

#### Risk

- Low (simple, proven pattern; minimal new complexity)

---

### Option 3: Hybrid Streaming + Heartbeat

**Concept**: Stream data chunks + send periodic heartbeats every 5 seconds to keep connection alive, even if no data available.

#### Implementation

```javascript
// Server: Stream with heartbeat
app.post("/api/ebook/generate", async (req, res) => {
  const { prompt, metadata } = req.body;

  res.setHeader("Content-Type", "application/x-ndjson");

  // Heartbeat timer: send data every 5 seconds (even if empty)
  const heartbeatInterval = setInterval(() => {
    res.write(
      JSON.stringify({ type: "heartbeat", timestamp: Date.now() }) + "\n"
    );
  }, 5000);

  try {
    // Generate structure
    const structure = await aiService.generateStructure(prompt);
    res.write(JSON.stringify({ type: "structure", data: structure }) + "\n");

    // Generate chapters
    const chapters = [];
    for (let i = 0; i < pageCount / 2; i++) {
      const chapter = await aiService.generateChapter(prompt, i);
      chapters.push(chapter);

      // Send progress update
      res.write(
        JSON.stringify({
          type: "progress",
          chapter: i + 1,
          total: Math.ceil(pageCount / 2),
        }) + "\n"
      );
    }

    // Compose and send final HTML
    const html = composeHTML(chapters, metadata.theme);
    res.write(JSON.stringify({ type: "complete", html }) + "\n");
  } finally {
    clearInterval(heartbeatInterval);
    res.end();
  }
});
```

#### Pros

- ✅ Infrastructure timeout bypassed (heartbeat keeps connection alive)
- ✅ Streaming benefits (progressive UI, real-time updates)
- ✅ Guaranteed connection never goes silent
- ✅ Progress feedback at regular intervals
- ✅ Simpler than pure streaming (heartbeat acts as fallback)

#### Cons

- ❌ Requires NDJSON parsing (more complex than simple JSON)
- ❌ Still needs frontend refactoring (streaming parser)
- ❌ Adds network overhead (heartbeats every 5s)
- ❌ Client must filter heartbeats from real data

#### Effort

- Backend: 3-4 hours (streaming + heartbeat logic)
- Frontend: 6-8 hours (streaming parser, heartbeat filtering)
- Testing: 2-3 hours
- **Total**: 11-15 hours

#### Risk

- Low-medium (proven pattern, moderate implementation complexity)

---

### Option 4: Async Queue/Background Workers (Celery/Bull)

**Concept**: Offload generation to background workers via Redis queue, server returns job ID immediately.

#### Implementation

```javascript
// Setup: Redis queue
const Queue = require("bull");
const ebookQueue = new Queue("ebook-generation", {
  redis: { host: "localhost", port: 6379 },
});

// Server: Enqueue job
app.post("/api/ebook/generate", async (req, res) => {
  const { prompt, metadata } = req.body;

  try {
    const job = await ebookQueue.add(
      { prompt, metadata },
      { attempts: 3, backoff: "exponential", removeOnComplete: true }
    );

    res.status(202).json({
      jobId: job.id,
      status: "queued",
      statusUrl: `/api/ebook/status/${job.id}`,
    });
  } catch (err) {
    res.status(503).json({ error: "Queue unavailable" });
  }
});

// Worker: Process jobs
ebookQueue.process(async (job) => {
  console.log(`[WORKER] Processing job ${job.id}`);

  const result = await ebookService.handle(job.data.prompt, job.data.metadata);

  return {
    jobId: job.id,
    result,
    completedAt: new Date(),
  };
});

// Status endpoint (same as polling option)
app.get("/api/ebook/status/:jobId", async (req, res) => {
  const job = await ebookQueue.getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  const state = await job.getState();
  const progress = job._progress;

  if (state === "completed") {
    return res.status(200).json({
      jobId: req.params.jobId,
      status: "complete",
      result: job.returnvalue,
    });
  }

  return res.status(200).json({
    jobId: req.params.jobId,
    status: state,
    progress: progress || 0,
  });
});
```

#### Pros

- ✅ Complete infrastructure timeout elimination
- ✅ Natural load balancing (queue distributes work across workers)
- ✅ Scales horizontally (add more workers as needed)
- ✅ Server always responds in <100ms
- ✅ Job persistence (survives server restart)
- ✅ Foundation for production deployment

#### Cons

- ❌ Requires Redis infrastructure (new dependency)
- ❌ Largest implementation effort
- ❌ Operational complexity (queue monitoring, worker health)
- ❌ Higher risk (new failure modes: queue full, worker crash)
- ❌ Still needs client polling (same as Option 2)
- ❌ Over-engineered for dev environment

#### Effort

- Infrastructure: 2-3 hours (Docker Redis service, health checks)
- Backend: 5-7 hours (queue setup, worker implementation, error handling)
- Frontend: 6-8 hours (polling, error recovery)
- Testing: 3-4 hours (worker tests, failure scenarios)
- **Total**: 16-22 hours

#### Risk

- Medium (introduces Redis, queue management, worker orchestration)

---

### Option 5: Reduce Backend Processing Time (Optimization Only)

**Concept**: Make backend faster through code optimization, so total time stays well under 60s timeout.

#### Optimization Targets

```
Current Timeline:
├─ Gemini Pro (structure):    10-15s
├─ Gemini Flash (chapters):   20-30s  ← Can parallelize
├─ HTML composition:          2-5s    ← Can precompile templates
├─ Serialization + transmit:  5-10s   ← Can gzip compress
└─ Total:                     49-60s

Optimized Timeline:
├─ Gemini Pro (structure):           10-15s
├─ Gemini Flash (parallel, 5x):      8-12s  (save 12-18s)
├─ HTML composition (precompiled):   0.5-1s (save 1.5-4s)
├─ Serialization (gzipped):          2-3s   (save 3-7s, ~70% compression)
├─ Transmission (gzipped):           1-2s   (save 4-8s)
└─ Total:                            25-35s (save 14-25s)
   Buffer to 60s timeout:            25-35s ✅ HEALTHY
```

#### Implementation: Parallel Chapter Generation

```javascript
// Before (sequential): 20-30s
async function generateChaptersSequential(prompt, pageCount) {
  const chapters = [];
  for (let i = 1; i <= Math.ceil(pageCount / 2); i++) {
    const chapter = await aiService.generateContent(prompt, {
      callIndex: i,
      task: `Generate chapter ${i}`,
    });
    chapters.push(chapter);
  }
  return chapters;
}

// After (parallel): 8-12s
async function generateChaptersParallel(prompt, pageCount) {
  const chapterCount = Math.ceil(pageCount / 2);
  const chapterPromises = [];

  for (let i = 1; i <= chapterCount; i++) {
    chapterPromises.push(
      aiService.generateContent(prompt, {
        callIndex: i,
        task: `Generate chapter ${i}`,
      })
    );
  }

  return Promise.all(chapterPromises);
}
```

#### Implementation: Response Gzip Compression

```javascript
const compression = require("compression");

// Enable gzip compression (5 lines)
app.use(
  compression({
    threshold: 1024, // Only compress > 1KB
    level: 6, // Balanced compression level
  })
);

// Result: 45KB → 12-15KB (65-70% reduction)
```

#### Implementation: Template Precompilation

```javascript
// Move HTML template compilation from request time to startup
const templateCache = new Map();

function precompileTemplates() {
  const themes = ["dark", "light", "corporate", "bold"];

  themes.forEach((theme) => {
    const template = fs.readFileSync(`templates/${theme}.html`, "utf-8");
    const compiled = compileTemplate(template);
    templateCache.set(theme, compiled);
  });
}

// During request (now much faster)
function composeHTML(chapters, theme) {
  const template = templateCache.get(theme);
  return template(chapters); // Handlebars or similar: 0.5-1s instead of 2-5s
}

// Call during server startup
precompileTemplates();
```

#### Pros

- ✅ Lowest implementation effort (gzip = 5 lines, parallel = refactor loop)
- ✅ No infrastructure changes needed
- ✅ No client-side refactoring required
- ✅ Performance benefit applies to ALL requests
- ✅ Backward compatible (clients see faster responses automatically)
- ✅ Quick win (can be done in 4-6 hours)

#### Cons

- ❌ Parallel calls consume quota faster (5 simultaneous Flash calls)
- ❌ Requires quota monitoring (ensure 5 Flash available)
- ❌ Limited ceiling (can't reduce API call count)
- ❌ Doesn't fully solve problem if other latencies emerge
- ❌ Still marginal buffer (only 10-15s overhead if optimizations fail)

#### Effort

- Implementation: 2-3 hours (parallelize, gzip, template cache)
- Testing: 1-2 hours (benchmark, verify quota impact)
- **Total**: 3-5 hours

#### Risk

- Low (proven optimizations, minimal complexity)

---

## Comparison Matrix

| Aspect                      | Option 1: Streaming       | Option 2: Polling       | Option 3: Heartbeat       | Option 4: Queue         | Option 5: Optimization |
| --------------------------- | ------------------------- | ----------------------- | ------------------------- | ----------------------- | ---------------------- |
| **Timeout Fixed?**          | ✅ Fully                  | ✅ Fully                | ✅ Fully                  | ✅ Fully                | ⚠️ Partial             |
| **Infrastructure Changes**  | None                      | None                    | None                      | Redis required          | None                   |
| **Backend Effort**          | 2-3h                      | 3-4h                    | 3-4h                      | 5-7h                    | 2-3h                   |
| **Frontend Effort**         | 5-8h                      | 6-8h                    | 6-8h                      | 6-8h                    | 0h                     |
| **Total Effort**            | 9-14h                     | 11-15h                  | 11-15h                    | 16-22h                  | 3-5h                   |
| **Implementation Risk**     | Low-Med                   | Low                     | Low-Med                   | Medium                  | Low                    |
| **Operational Risk**        | Low                       | Low                     | Low                       | Medium                  | Low                    |
| **UX Quality**              | Excellent (live progress) | Good (polling progress) | Excellent (live progress) | Good (polling progress) | Good (unchanged)       |
| **Backward Compatible?**    | ❌ No                     | ⚠️ Partial              | ❌ No                     | ⚠️ Partial              | ✅ Yes                 |
| **Scalable to Production?** | Yes (with optimization)   | Yes                     | Yes                       | ✅ Best                 | Yes                    |
| **Handles Large Payloads?** | ✅ Better (chunked)       | Okay                    | ✅ Better (chunked)       | ✅ Best                 | Okay                   |

---

## Recommended Approach

We recommend a **two-phase implementation strategy**:

### Phase 1: OPT-INFRA (OPTIMIZATION+INFRASTRUCTURE)

**Timeline**: 1 week (4-6 hours development + investigation)

**Objective**: Quick wins + infrastructure investigation

This phase focuses on immediate performance optimizations while determining actual infrastructure constraints.

#### Tasks

1. **Enable gzip compression** (~30 mins)

   ```javascript
   const compression = require("compression");
   app.use(compression());
   ```

   - Expected impact: 45KB → 12-15KB (70% reduction)
   - Effort: Minimal, standard Express middleware

2. **Parallelize chapter generation** (~1 hour)

   - Change from sequential `for` loop to `Promise.all()`
   - Expected impact: 20-30s → 8-12s per request (12-18s saved)
   - Quota impact: Need 5 simultaneous Flash calls available

3. **Precompile HTML templates** (~45 mins)

   - Move template compilation from request time to server startup
   - Expected impact: 2-5s → 0.5-1s per request (1.5-4s saved)
   - Effort: Move `compileTemplate()` to initialization

4. **Investigate infrastructure timeout** (~2 hours)

   - **Question 1**: Is the 60s limit from Codespaces or Express?
   - **Question 2**: Can we configure/increase it?
   - **Question 3**: What's the actual hard limit?
   - **Actions**:
     - Review `.devcontainer/docker-compose.yml` for timeout settings
     - Check Codespaces documentation for timeout configuration
     - Run 10 ebook generations and measure actual times:
       - Generation start → generation finish (backend time)
       - Generation finish → client receive (transmission time)
       - Infrastructure timeout trigger point (if any)
     - Document findings in `INFRASTRUCTURE_TIMEOUT_ANALYSIS.md`

5. **Measure actual impact** (~1 hour)
   - Benchmark current response times
   - Benchmark after optimizations
   - Document in `PERFORMANCE_BENCHMARKS.md`

#### Expected Outcomes

- **30% faster responses** (compression + parallelization + template cache)
- **Infrastructure constraints clarified** (configurable vs hard limit?)
- **Decision point for Phase 2** based on findings:
  - If timeout configurable → increase to 90-120s + ship OPT-INFRA
  - If timeout is hard limit → proceed to ASYNC-POLL

#### Success Criteria

- ✅ Gzip compression enabled, responses are 65-70% smaller
- ✅ Chapter generation parallelized, processing time reduced by 12-18s
- ✅ HTML composition time < 1s (template precompiled)
- ✅ Infrastructure timeout constraints documented
- ✅ Total end-to-end time: 30-45s (down from 49-60s)

---

### Phase 2: ASYNC-POLL (ASYNCHRONOUS POLLING)

**Timeline**: 2 weeks (11-15 hours development + testing)

**Objective**: Robust, production-ready timeout elimination

This phase implements Option 2 (Polling) as the long-term solution, providing a solid foundation for future async/queue infrastructure.

**When to Proceed**: Only if OPT-INFRA investigation shows timeout is a hard infrastructure limit that cannot be increased.

#### Tasks

1. **Add polling status endpoint** (~2 hours)

   - Implement `GET /api/ebook/status/:jobId`
   - Return: `{ status: 'queued|processing|complete', result?, progress?, eta? }`
   - Store job metadata in-memory (v1) or Redis (v2)

2. **Refactor ebook generation to async** (~2 hours)

   - Change `POST /api/ebook/generate` to return 202 immediately
   - Queue work asynchronously (use `setImmediate` for v1)
   - Store results with TTL (24-hour expiry for old jobs)

3. **Implement client polling loop** (~4-5 hours)

   - Create `pollUntilComplete(jobId, estimatedTimeMs)` utility
   - Update flowStore state machine for polling pattern
   - Add progress tracking and ETA display
   - Implement exponential backoff (2s → 5s → 10s intervals)
   - Handle timeout/failure cases

4. **Update UI for polling feedback** (~2-3 hours)

   - Show "Processing 45%..." instead of just "Generating..."
   - Display ETA: "Complete in ~12 seconds"
   - Show job ID for debugging: "Job: abc-def-123"
   - Add ability to check status by job ID (resume on page reload)

5. **Error handling and edge cases** (~2 hours)

   - Handle job expiry (404 after 24 hours)
   - Handle job failures with error messages
   - Handle network disconnects during polling
   - Retry polling on connection loss

6. **Testing** (~2 hours)
   - Test job queuing under load (10 simultaneous requests)
   - Test polling race conditions
   - Test timeout and failure scenarios
   - E2E tests for complete flow

#### Backend Implementation Details

```javascript
// In-memory job store (v1)
class JobStore {
  constructor() {
    this.jobs = new Map();
  }

  create(jobId, initialData = {}) {
    const job = {
      jobId,
      status: "queued",
      progress: 0,
      eta: null,
      startedAt: Date.now(),
      completedAt: null,
      result: null,
      error: null,
      ...initialData,
    };
    this.jobs.set(jobId, job);

    // Auto-cleanup after 24 hours
    setTimeout(() => this.jobs.delete(jobId), 24 * 60 * 60 * 1000);

    return job;
  }

  get(jobId) {
    return this.jobs.get(jobId);
  }

  update(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
    }
    return job;
  }
}

const jobStore = new JobStore();

// Updated endpoint
app.post("/api/ebook/generate", async (req, res) => {
  const jobId = generateUUID();
  const { prompt, metadata } = req.body;

  // Create job record
  jobStore.create(jobId, { prompt, metadata });

  // Return immediately (< 100ms)
  res.status(202).json({
    jobId,
    status: "queued",
    estimatedTimeMs: 50000,
    statusUrl: `/api/ebook/status/${jobId}`,
  });

  // Process asynchronously (don't await)
  setImmediate(async () => {
    jobStore.update(jobId, { status: "processing" });

    try {
      const result = await ebookService.handle(prompt, metadata);
      jobStore.update(jobId, {
        status: "complete",
        result,
        completedAt: Date.now(),
      });
    } catch (error) {
      jobStore.update(jobId, {
        status: "failed",
        error: error.message,
        completedAt: Date.now(),
      });
    }
  });
});

// Status endpoint
app.get("/api/ebook/status/:jobId", (req, res) => {
  const job = jobStore.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found or expired" });
  }

  const response = {
    jobId: req.params.jobId,
    status: job.status,
  };

  if (job.status === "processing") {
    response.progress = job.progress;
    response.eta = job.eta || "calculating...";
  }

  if (job.status === "complete") {
    response.result = job.result;
  }

  if (job.status === "failed") {
    response.error = job.error;
  }

  return res.status(200).json(response);
});
```

#### Frontend Implementation Details

```javascript
// In flowStore.js or new polling module
async function generateEbookWithPolling(prompt, metadata) {
  // Step 1: Initiate
  const initiateResponse = await fetch("/api/ebook/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, metadata }),
  });

  if (initiateResponse.status !== 202) {
    throw new Error(`Expected 202, got ${initiateResponse.status}`);
  }

  const { jobId, estimatedTimeMs } = await initiateResponse.json();

  // Update UI
  flowStore.transitionTo("GENERATING");
  flowStore.setJobId(jobId);

  // Step 2: Poll
  return pollJobUntilComplete(jobId, estimatedTimeMs);
}

async function pollJobUntilComplete(jobId, estimatedTimeMs) {
  const pollIntervalMs = 2000;
  const maxWaitMs = 120000; // 2 minutes
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    pollCount++;

    const response = await fetch(`/api/ebook/status/${jobId}`);

    if (response.status === 404) {
      throw new Error("Job expired or not found");
    }

    const job = await response.json();

    // Update UI with status
    const elapsed = Date.now() - startTime;
    const progress = Math.min(
      100,
      Math.round((elapsed / estimatedTimeMs) * 100)
    );

    flowStore.updatePollingStatus({
      jobId,
      status: job.status,
      progress: job.progress || progress,
      eta:
        job.eta ||
        `~${Math.max(0, Math.round((estimatedTimeMs - elapsed) / 1000))}s`,
      pollCount,
    });

    if (job.status === "complete") {
      flowStore.setResult(job.result);
      flowStore.transitionTo("RESULT_READY");
      return job.result;
    }

    if (job.status === "failed") {
      throw new Error(`Generation failed: ${job.error}`);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Job polling timeout (exceeded 2 minutes)");
}
```

#### Success Criteria

- ✅ POST returns in <100ms (202 Accepted with jobId)
- ✅ Status polling works reliably (<1s response time)
- ✅ Client receives 100% of results (no timeout drops)
- ✅ UI shows progress updates ("45% complete, ~12s remaining")
- ✅ Handles job expiry gracefully
- ✅ Survives page reload (can check status by jobId)

---

## Implementation Roadmap

### Week 1: OPT-INFRA (Optimization + Infrastructure Investigation)

| Day | Task                           | Effort | Deliverable                                       |
| --- | ------------------------------ | ------ | ------------------------------------------------- |
| Mon | Enable gzip compression        | 30m    | PR: `feat/gzip-compression`                       |
| Mon | Parallelize chapter generation | 1h     | PR: `feat/parallel-chapters`                      |
| Tue | Precompile HTML templates      | 45m    | PR: `feat/template-precompile`                    |
| Tue | Infrastructure investigation   | 2h     | Doc: `INFRASTRUCTURE_TIMEOUT_ANALYSIS.md`         |
| Wed | Performance benchmarking       | 1h     | Doc: `PERFORMANCE_BENCHMARKS.md` + Results        |
| Thu | **Decision Point**             | —      | Choose: Increase timeout OR proceed to ASYNC-POLL |
| Fri | Buffer/testing/fixes           | 1h     | Verification                                      |

**Week 1 Output**:

- 3 PRs merged (gzip, parallel, templates)
- 30% performance improvement documented
- Infrastructure constraints clarified
- Decision on Phase 2 made

### Week 2-3: ASYNC-POLL (Asynchronous Polling) — _IF TIMEOUT IS HARD LIMIT_

| Day     | Task                          | Effort | Deliverable                                   |
| ------- | ----------------------------- | ------ | --------------------------------------------- |
| Mon     | Job store + polling endpoint  | 2h     | PR: `feat/async-polling-backend`              |
| Mon-Tue | Refactor generation to async  | 2h     | Part of above PR                              |
| Tue     | Client polling utility        | 2h     | PR: `feat/async-polling-frontend`             |
| Wed     | UI updates + progress display | 2h     | Part of above PR                              |
| Wed     | Error handling + edge cases   | 2h     | Refinements to above PRs                      |
| Thu     | Testing + E2E                 | 2h     | Test coverage, doc: `POLLING_TEST_RESULTS.md` |
| Fri     | Documentation + cleanup       | 1h     | Update API docs, examples                     |

**Week 2-3 Output**:

- 2 major PRs (backend + frontend)
- Complete timeout resolution
- Production-ready polling pattern
- Documentation + examples

---

## Decision Tree

Use this to determine which option to pursue:

```
START: 60-second infrastructure timeout issue
  │
  ├─ Question 1: Is the 60s timeout configurable?
  │              (Check Codespaces, Express, .devcontainer settings)
  │
  ├─ YES → Increase to 90-120s + Deploy OPT-INFRA
  │        (Enable gzip, parallelize, precompile templates)
  │        Time: 1 week
  │        Result: ✅ Solved with minimal changes
  │
  └─ NO (hard limit) → Ask Question 2
     │
     ├─ Question 2: What's the acceptable latency for end-users?
     │              (How long will users tolerate "Processing..."?)
     │
     ├─ < 30 seconds (impatient users) → Use Option 1 (Streaming) or Option 3 (Heartbeat)
     │                                     More complex but real-time updates
     │                                     Time: 2-3 weeks
     │                                     UX: Excellent (live progress)
     │
     ├─ 30-60 seconds (typical users) → Use Option 2 (Polling) ⭐ RECOMMENDED
     │                                   Simple, reliable, familiar pattern
     │                                   Time: 2 weeks
     │                                   UX: Good (polling progress updates)
     │
     └─ Any duration (scalability needed) → Use Option 4 (Queue)
                                            Most robust, production-ready
                                            Time: 3 weeks + ops overhead
                                            UX: Good (polling progress updates)
```

**Recommendation**:

- **Immediate**: Run OPT-INFRA (Phase 1) regardless of outcome
- **If timeout is configurable**: Increase it + ship Phase 1
- **If timeout is hard limit**: Implement ASYNC-POLL (Phase 2, Option 2)

---

## Success Metrics

### OPT-INFRA Success

- [ ] Gzip compression enabled (target: 65-70% size reduction)
- [ ] Chapter generation parallelized (target: 12-18s time savings)
- [ ] Template precompilation working (target: < 1s composition time)
- [ ] Infrastructure constraints documented
- [ ] Total backend time: < 40s (down from 49-50s)
- [ ] Response size: < 15KB (down from 45KB)
- [ ] Infrastructure timeout buffer: > 20s (up from 5-10s)

### ASYNC-POLL Success

- [ ] POST /api/ebook/generate returns 202 in < 100ms
- [ ] GET /api/ebook/status/:jobId responds in < 1s
- [ ] Client receives 100% of responses (zero "Network error: Failed to fetch")
- [ ] UI displays progress: "Processing 45%, ~12s remaining"
- [ ] Job persistence: Can reload page and check status
- [ ] Test coverage: > 90% for polling paths
- [ ] E2E tests pass all scenarios (success, failure, timeout, expiry)

---

## Risk Mitigation

### OPT-INFRA Risks

| Risk                                  | Likelihood | Impact | Mitigation                                          |
| ------------------------------------- | ---------- | ------ | --------------------------------------------------- |
| Parallel Flash calls exceed quota     | Medium     | High   | Monitor quota, reduce page count for parallel tests |
| Template precompilation breaks themes | Low        | Medium | Comprehensive testing before merge                  |
| Gzip incompatibility with old clients | Very Low   | Low    | Client should auto-decompress (browser feature)     |

### ASYNC-POLL Risks

| Risk                                | Likelihood | Impact | Mitigation                                 |
| ----------------------------------- | ---------- | ------ | ------------------------------------------ |
| Job store grows unbounded           | Low        | Medium | Implement 24-hour TTL, periodic cleanup    |
| Client polling loop exhausted       | Very Low   | Low    | Set max 2-minute timeout, fail gracefully  |
| Race conditions in async generation | Low        | Medium | Extensive E2E testing, add request IDs     |
| Memory leaks from job storage       | Low        | Medium | Monitor memory, add periodic audit logging |

---

## FAQ

**Q: Why not just increase the infrastructure timeout?**  
A: We need to investigate first (OPT-INFRA phase). Codespaces may have hard limits, or the timeout may be configured somewhere. Worth 2 hours to find out.

**Q: Why Option 2 (Polling) instead of Option 1 (Streaming)?**  
A: Polling is simpler, more familiar (Google Drive pattern), and has lower implementation risk. Streaming is better for real-time UX but requires more complex client code.

**Q: Will parallel Flash generation break the quota system?**  
A: No, it will consume 5 Flash calls simultaneously, but the quota check in genieService happens before dispatch. As long as we have 5+ Flash available in the current window, it's fine.

**Q: Can we use ASYNC-POLL in production?**  
A: Yes, but start with in-memory job store. For production with multiple servers, upgrade to Redis queue (Option 4) later.

**Q: What if users close the browser during generation?**  
A: The backend continues generating (no way to detect browser close). When user reopens, they can check status by jobId or start a new generation. Server cleans up after 24 hours.

---

## References

- [ARCHITECTURE_DOCUMENTATION_PROPOSAL.md](ARCHITECTURE_DOCUMENTATION_PROPOSAL.md) - Overall documentation plan
- [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md#scenario-a-60-second-infrastructure-timeout) - Detailed timeout analysis
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Backend structure and quota management

---

## Document Metadata

**Created**: December 14, 2025  
**Updated**: December 14, 2025  
**Status**: DRAFT - Ready for team review  
**Owner**: Architecture Team  
**Reviews Needed**: Stakeholder approval on OPT-INFRA scope + Phase 2 decision
