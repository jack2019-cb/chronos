# AetherPress Frontend Architecture

## Pattern-Based Design for Async Polling with Zero Client Timeouts

**Date**: December 29, 2025 (Restructured)  
**Based On**: FRONTEND_ARCHITECTURE_REF.md (Dec 13, 2025)  
**Target Audience**: Frontend developers, UI/UX designers, integration specialists  
**Reading Time**: ~15-20 minutes

---

## Quick Navigation

- **For Pattern 1 (PART-A)**: Jump to [Async Request Handling](#pattern-1-async-request-handling)
- **For Pattern 5 (Smart Polling)**: Jump to [Smart Polling Architecture](#pattern-5-smart-polling-architecture)
- **For state management**: See [State Management](#state-management-flow-store)
- **For implementation details**: See code references throughout

---

## System Overview

### Frontend Responsibilities

The AetherPress frontend is a **Svelte 4 + Vite** single-page application orchestrating:

1. **User Input Collection** - Prompt, theme, page count configuration
2. **Async Request Handling** - POST /api/ebook/generate → 202 Accepted
3. **Smart Polling** - GET /api/ebook/status/:resultId with adaptive intervals
4. **Progress Display** - Real-time progress bar with ETA updates
5. **Result Visualization** - Preview and export
6. **Error Recovery** - Graceful handling of network/server failures

### Key Difference from Old Architecture

| Aspect                | Old (Dec 13)         | New (Current)                  |
| --------------------- | -------------------- | ------------------------------ |
| **Request Model**     | POST → Blocking 200  | POST → Immediate 202           |
| **Client Timeout**    | 600 seconds          | None (infinite polling)        |
| **HTTP Response**     | 200 with full result | 202 with resultId              |
| **Progress Feedback** | None (user waits)    | Polling + ETA                  |
| **Failure Handling**  | Client timeout error | Polling timeout (configurable) |

### Technology Stack

| Layer                | Technology          | Purpose                                  |
| -------------------- | ------------------- | ---------------------------------------- |
| **Framework**        | Svelte 4            | Reactive components, compiler-optimized  |
| **Build Tool**       | Vite                | Fast bundling, HMR, optimized builds     |
| **HTTP Client**      | Fetch API           | Native browser HTTP with AbortController |
| **State Management** | Svelte Stores       | Reactive state containers                |
| **Styling**          | CSS + Scoped styles | Component-level styling                  |
| **Testing**          | Vitest + Puppeteer  | Unit tests, E2E tests                    |

---

## Pattern 1 Implementation: Async Request Handling

### HTTP Contract (202 Acceptance)

**Old Synchronous Model** (❌ Timeout risk):

```
Client: POST /api/ebook/generate
         ↓ (blocks here)
Server: Processing 49-50 seconds
         ↓ (network transmission 5-10s)
         ↓
         ←── 200 OK with 30KB+ HTML
         ↓
         ⚠️ RISK: If transmission delayed, 60s timeout hits
```

**New Async Model** (✅ Zero timeout):

```
Client: POST /api/ebook/generate
         ↓
         ←── 202 Accepted (1.627ms)
         ↓
         Client unblocked immediately
         Start polling for progress
```

### Request Handler: GenerateFlow.svelte

**File**: [client/src/components/GenerateFlow.svelte](../client/src/components/GenerateFlow.svelte)

**Async Initiation**:

```javascript
async function handleGenerateClick() {
  const { prompt, selectedMedium, metadata } = $flowStore;

  // Validate input
  if (!prompt || prompt.trim().length < 10) {
    flowStore.setError({ message: "Prompt must be at least 10 characters" });
    return;
  }

  flowStore.startGenerating();

  try {
    // [PATTERN 1] Send async request
    const response = await fetch("/api/ebook/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        mode: "ebook",
        metadata: {
          theme: metadata.theme,
          pageCount: metadata.pageCount,
          colorPalette: metadata.colorPalette,
        },
      }),
    });

    // [PATTERN 1] Handle 202 response
    if (response.status === 202) {
      const data = await response.json();
      const { resultId, status } = data;

      // Store resultId for polling
      flowStore.setResultId(resultId);
      flowStore.setStatus(status);

      // [PATTERN 5] Begin polling with resultId
      startPolling(resultId);

      return;
    }

    // Other status codes
    if (response.status === 400) {
      const error = await response.json();
      flowStore.setError(error);
      return;
    }

    if (response.status === 202) {
      const data = await response.json();
      flowStore.setError({
        message: "Quota exhausted; retry after " + data.retryAfterSeconds + "s",
        retryable: true,
        retryAfterSeconds: data.retryAfterSeconds,
      });
      return;
    }

    throw new Error(`Unexpected status: ${response.status}`);
  } catch (err) {
    flowStore.setError(err);
    flowStore.stopGenerating();
  }
}
```

### 202 Response Handling

**Server Response** (from Pattern 1 spec):

```javascript
{
  status: "QUEUED",
  resultId: "d4f0b193-be64-4366-aaf7-cfb0f0ef21ac",
  message: "Job queued for async processing"
}
```

**Frontend Extraction**:

```javascript
// Extract resultId from 202 response
const resultId = response.resultId;

// Store for polling
flowStore.setResultId(resultId);

// Begin polling
startPolling(resultId);
```

**Key Invariant**: 202 response arrives in < 2ms, unblocking client immediately ✅

---

## Pattern 5 Implementation: Smart Polling & ETA Management

### Polling Architecture

**Polling Endpoint**:

```
GET /api/ebook/status/:resultId
```

**Response Schema** (from server):

```javascript
{
  status: "QUEUED" | "PROCESSING" | "COMPOSING" | "COMPLETE",
  progress: {
    completed: 2,       // API calls completed
    total: 4,           // Total API calls needed
    currentStep: "Opening chapter"
  },
  eta: 25,             // Estimated seconds remaining
  startedAt: "2025-12-29T22:06:45.180Z",
  elapsedMs: 15000
}
```

### Smart Polling Implementation

**File**: `client/src/lib/polling.js`

**Polling Logic**:

```javascript
class SmartPoller {
  constructor(resultId, callbacks) {
    this.resultId = resultId;
    this.callbacks = callbacks;
    this.isPolling = false;
    this.pollInterval = 2000; // Start at 2s interval
    this.maxInterval = 30000; // Cap at 30s
    this.minInterval = 1000; // Floor at 1s
  }

  async start() {
    this.isPolling = true;

    while (this.isPolling) {
      try {
        // Fetch job status
        const response = await fetch(`/api/ebook/status/${this.resultId}`);
        const status = await response.json();

        // Update UI with progress
        this.callbacks.onProgress(status);

        // Check completion
        if (status.status === "COMPLETE") {
          this.callbacks.onComplete(status);
          this.stop();
          return;
        }

        // [PATTERN 5] Adaptive polling interval based on ETA
        this.adjustInterval(status.eta);

        // Wait before next poll
        await this.sleep(this.pollInterval);
      } catch (error) {
        this.callbacks.onError(error);
        // Continue polling (connection might recover)
      }
    }
  }

  adjustInterval(etaSeconds) {
    // [PATTERN 5] Dynamically adjust polling frequency
    // High ETA (lots of time left) → poll less frequently
    // Low ETA (almost done) → poll more frequently

    if (etaSeconds > 30) {
      this.pollInterval = Math.min(this.maxInterval, 10000); // 10s
    } else if (etaSeconds > 15) {
      this.pollInterval = 5000; // 5s
    } else if (etaSeconds > 5) {
      this.pollInterval = 2000; // 2s
    } else {
      this.pollInterval = Math.max(this.minInterval, 500); // 500ms
    }
  }

  stop() {
    this.isPolling = false;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### Polling Integration in GenerateFlow

```javascript
let poller = null;

function startPolling(resultId) {
  poller = new SmartPoller(resultId, {
    onProgress: (status) => {
      // Update UI with progress
      flowStore.setProgress({
        completed: status.progress.completed,
        total: status.progress.total,
        percent: Math.round(
          (status.progress.completed / status.progress.total) * 100
        ),
        eta: status.eta,
        currentStep: status.progress.currentStep,
      });
    },

    onComplete: (status) => {
      // Fetch full result and display
      fetchAndDisplayResult(resultId);
      flowStore.finishGenerating();
    },

    onError: (error) => {
      // Handle polling errors gracefully
      console.error("Polling error:", error);
      // Continue polling (network might recover)
    },
  });

  poller.start();
}

async function fetchAndDisplayResult(resultId) {
  const response = await fetch(`/api/ebook/result/${resultId}`);
  const result = await response.json();

  flowStore.setResult(result);
  flowStore.transitionTo("RESULT_READY");
}
```

### ETA Display Component

**File**: `client/src/components/ProgressDisplay.svelte`

```svelte
<script>
  import { flowStore } from "$lib/stores"

  $: progress = $flowStore.progress
  $: percent = progress?.percent || 0
  $: eta = progress?.eta || 0
  $: currentStep = progress?.currentStep || "Initializing..."
</script>

<div class="progress-container">
  <div class="progress-bar">
    <div class="fill" style="width: {percent}%"></div>
  </div>

  <div class="progress-text">
    <span class="percent">{percent}% complete</span>
    <span class="eta">~{eta}s remaining</span>
  </div>

  <div class="current-step">
    <p>Current step: <strong>{currentStep}</strong></p>
  </div>

  <div class="progress-details">
    <span>{progress?.completed}/{progress?.total} calls complete</span>
  </div>
</div>

<style>
  .progress-container {
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .progress-bar {
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .fill {
    height: 100%;
    background: var(--color-primary);
    transition: width 0.3s ease;
  }

  .progress-text {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  .percent {
    font-weight: 600;
    color: var(--text-primary);
  }

  .current-step {
    margin: 0.75rem 0;
    font-size: 0.95rem;
  }

  .progress-details {
    font-size: 0.85rem;
    color: var(--text-tertiary);
  }
</style>
```

---

## State Management: flowStore

### Store Architecture

**File**: [client/src/lib/stores/flowStore.js](../client/src/lib/stores/flowStore.js)

**State Machine** (New Async Model):

```
┌─────────┐
│ INITIAL │
└────┬────┘
     │ user enters prompt, clicks Generate
     ↓
┌──────────────────┐
│  SENDING_REQUEST │ (POST /api/ebook/generate)
└──────┬───────────┘
       │ 202 Accepted
       ↓
┌──────────────────┐
│    POLLING       │ (GET /api/ebook/status/:resultId)
├──────┬───────────┤
│      │           └─→ [error handling]
│      └─→ Updates progress + ETA every 2-5s
│
└──────┬───────────┘
       │ status === "COMPLETE"
       ↓
┌──────────────────┐
│  RESULT_READY    │
├──────┬───────────┤
│      ├─→ EXPORTING (PDF download)
│      └─→ INITIAL (restart)
└──────┘
```

### Store Definition

```javascript
const flowStore = writable({
  // Flow state
  state: "INITIAL", // Current state
  resultId: null, // For polling

  // User input
  prompt: "",
  metadata: {
    theme: "dark",
    pageCount: 10,
    colorPalette: "standard",
    fontSizeScale: 1.0,
  },

  // Progress tracking [PATTERN 5]
  progress: {
    completed: 0, // API calls done
    total: 0, // Total calls needed
    percent: 0, // 0-100
    eta: 0, // Seconds remaining
    currentStep: "Initializing...",
  },

  // Result
  result: {
    id: null,
    html: null,
    chapters: [],
    metadata: {},
  },

  // Error tracking
  error: null,
  startTime: null,
});
```

### Store Methods

```javascript
export function startGenerating() {
  flowStore.update((store) => ({
    ...store,
    state: "SENDING_REQUEST",
    startTime: Date.now(),
    error: null,
  }));
}

export function setResultId(resultId) {
  flowStore.update((store) => ({
    ...store,
    resultId,
    state: "POLLING",
  }));
}

export function setProgress(progress) {
  flowStore.update((store) => ({
    ...store,
    progress: {
      ...progress,
      percent: Math.round((progress.completed / progress.total) * 100),
    },
  }));
}

export function setResult(result) {
  flowStore.update((store) => ({
    ...store,
    result,
    state: "RESULT_READY",
  }));
}

export function finishGenerating() {
  flowStore.update((store) => ({
    ...store,
    state: "COMPLETE",
  }));
}

export function setError(error) {
  flowStore.update((store) => ({
    ...store,
    error,
    state: "ERROR",
  }));
}

export function reset() {
  flowStore.set({
    state: "INITIAL",
    resultId: null,
    prompt: "",
    progress: { completed: 0, total: 0, percent: 0, eta: 0 },
    result: { id: null, html: null, chapters: [], metadata: {} },
    error: null,
  });
}
```

---

## API Client Layer

### ebookApi.js

**File**: [client/src/lib/ebookApi.js](../client/src/lib/ebookApi.js)

**Configuration** (Changed from old 600s timeout):

```javascript
const CONFIG = {
  API_BASE_URL: "/api",
  TIMEOUTS: {
    GENERATE: 5000, // 5s for initial 202 response (short!)
    POLLING: 10000, // 10s for polling requests
    RESULT_FETCH: 10000, // 10s to fetch final result
    // NOTE: No overall timeout anymore; polling continues indefinitely
  },
};
```

**Why different timeouts?**

- **GENERATE (5s)**: Initial POST should get 202 response quickly (~1.627ms)
- **POLLING (10s)**: Each poll request should complete within 10s
- **RESULT_FETCH (10s)**: Final result fetch should complete within 10s
- **Overall**: No timeout; polling can continue indefinitely

### Fetch Methods

```javascript
// [PATTERN 1] Send async generation request
export async function generateEbook(payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONFIG.TIMEOUTS.GENERATE
  );

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/ebook/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.status === 202) {
      return await response.json(); // { resultId, status }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// [PATTERN 5] Poll for job status
export async function pollJobStatus(resultId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONFIG.TIMEOUTS.POLLING
  );

  try {
    const response = await fetch(
      `${CONFIG.API_BASE_URL}/ebook/status/${resultId}`,
      {
        method: "GET",
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json(); // { status, progress, eta }
  } finally {
    clearTimeout(timeoutId);
  }
}

// Fetch final result after COMPLETE
export async function getEbookResult(resultId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONFIG.TIMEOUTS.RESULT_FETCH
  );

  try {
    const response = await fetch(
      `${CONFIG.API_BASE_URL}/ebook/result/${resultId}`,
      {
        method: "GET",
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json(); // { html, chapters, metadata }
  } finally {
    clearTimeout(timeoutId);
  }
}
```

---

## Error Handling & Recovery

### Network Errors During Polling

**Graceful Continuation**:

```javascript
async function pollWithRecovery(resultId) {
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 10; // Fail after 10 consecutive errors

  while (isPolling) {
    try {
      const status = await ebookApi.pollJobStatus(resultId);
      consecutiveErrors = 0; // Reset on success

      if (status.status === "COMPLETE") {
        // Success - fetch and display
        const result = await ebookApi.getEbookResult(resultId);
        flowStore.setResult(result);
        break;
      }

      // Update progress
      flowStore.setProgress(status.progress);

      await sleep(calculatePollInterval(status.eta));
    } catch (error) {
      consecutiveErrors++;

      if (consecutiveErrors >= maxConsecutiveErrors) {
        // Too many errors - give up
        flowStore.setError({
          message: "Server unreachable; polling stopped",
          retryable: true,
        });
        break;
      }

      // Log but continue polling
      console.warn(`Polling error (attempt ${consecutiveErrors}):`, error);
      await sleep(5000); // Wait 5s before retry
    }
  }
}
```

### Quota Exhaustion (202 before acceptance)

```javascript
if (response.status === 202) {
  const data = await response.json();

  if (data.message.includes("Quota exhausted")) {
    // Quota error - schedule retry
    const retryAfter = data.retryAfterSeconds;

    flowStore.setError({
      message: `Quota exhausted. Retry available in ${retryAfter}s`,
      retryable: true,
      retryAfterSeconds: retryAfter,
    });

    // Optionally schedule automatic retry
    setTimeout(() => {
      handleGenerateClick();
    }, retryAfter * 1000);

    return;
  }
}
```

---

## Request Lifecycle (Complete)

```
T=0ms   User clicks "Generate"
        ↓
        Client: POST /api/ebook/generate
        │       (handleGenerateClick)
        │
T=1.627ms
        Server: 202 Accepted
        {
          status: "QUEUED",
          resultId: "d4f0b193-..."
        }
        ↓
        Client received 202 ✅
        Client unblocked immediately
        │
        ├─→ flowStore.setResultId(resultId)
        ├─→ flowStore.setState("POLLING")
        └─→ startPolling(resultId)
        │
T=2-3s  Client: GET /api/ebook/status/:resultId
        │       (First poll)
        │
        Server: 200 OK
        {
          status: "PROCESSING",
          progress: { completed: 0, total: 4 },
          eta: 52,
          currentStep: "Initializing..."
        }
        ↓
        Client updates UI with progress
        │
        ├─→ flowStore.setProgress(...)
        ├─→ ProgressDisplay updates (0%)
        └─→ Schedule next poll in 2s
        │
T~5s    Client: GET /api/ebook/status/:resultId
        │       (Second poll)
        │
        Server processing continues in background
        │
T~15s   [Server side: Structure call (Pro) completes - 7,978ms]
        │
T~30s   Client: GET /api/ebook/status/:resultId
        │
        Server: 200 OK
        {
          status: "PROCESSING",
          progress: { completed: 1, total: 4 },
          eta: 35,
          currentStep: "Opening chapter"
        }
        ↓
        ProgressDisplay: 25% complete, ~35s remaining
        │
T~53s   [Server side: All API calls complete, composing]
        │
T~58s   Client: GET /api/ebook/status/:resultId
        │
        Server: 200 OK
        {
          status: "COMPLETE",
          progress: { completed: 4, total: 4 },
          eta: 0,
          currentStep: "Done"
        }
        ↓
        flowStore.setProgress(...) → ProgressDisplay: 100% complete
        │
        fetchAndDisplayResult(resultId)
        │
        Client: GET /api/ebook/result/:resultId
        ↓
        Server: 200 OK
        { html, chapters, metadata }
        ↓
        flowStore.setResult(...)
        flowStore.transitionTo("RESULT_READY")
        ↓
        Display preview, enable export
```

**Key Metrics**:

- 202 response: 1.627ms ✅
- Polling interval: 2-5s (adaptive)
- Total client time: ~59s
- **Infrastructure timeout**: ✅ AVOIDED (no blocking)

---

## UI Components

### GenerateFlow.svelte

Main orchestrator component managing complete user flow

### ProgressDisplay.svelte

Shows real-time progress bar with ETA updates

### ResultPreview.svelte

Displays generated ebook HTML with theme applied

### ExportButton.svelte

Triggers PDF download of final result

---

## Performance Characteristics

| Aspect                   | Value   | Notes                      |
| ------------------------ | ------- | -------------------------- |
| **202 Response Time**    | 1.627ms | Validated in production ✅ |
| **Initial Poll Latency** | <100ms  | Status endpoint fast       |
| **Polling Interval**     | 2-5s    | Adaptive based on ETA      |
| **Final Result Time**    | ~59s    | Real Gemini API            |
| **Memory Usage**         | <50MB   | Svelte optimizations       |
| **Bundle Size**          | ~120KB  | Gzipped, optimized         |

---

## Zero Client Timeout Guarantee

**Old Model** (❌ Problematic):

- Client timeout: 600 seconds (hard limit)
- Server processing: 49-50 seconds
- Network transmission: 5-10 seconds
- Buffer: 0-11 seconds (TOO TIGHT)
- Result: Client timeout errors when network slow

**New Model** (✅ Robust):

- Client timeout for 202 response: 5 seconds
- Client timeout for polling: 10 seconds each
- Client timeout for final result: 10 seconds
- Overall timeout for polling: NONE (continues indefinitely)
- Buffer: Infinite (polling continues until completion)
- Result: Zero timeout risk, robust to network variations

---

## Historic Reference

For context on how the frontend evolved:

- [FRONTEND_ARCHITECTURE_REF.md](FRONTEND_ARCHITECTURE_REF.md) - Original Dec 13 synchronous design

---

## Related Documentation

- [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) - System-level overview
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Server-side implementation (Pattern 2, 3, 4)
- [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md) - 202+polling contract details
- [ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md) - Pattern overview
