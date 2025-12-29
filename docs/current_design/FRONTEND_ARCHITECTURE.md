# AetherPress Frontend Architecture

**Date**: December 13, 2025 @ 4:45 PM  
**Scope**: Scope 3 - Frontend Architecture  
**Target Audience**: Frontend developers, UI/UX designers, integration specialists  
**Reading Time**: ~15-20 minutes

**Related**: See [ARCHITECTURE_DOCUMENTATION_PROPOSAL.md](ARCHITECTURE_DOCUMENTATION_PROPOSAL.md) for documentation project overview, [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md) for HTTP contracts and timeout behavior analysis

---

## Table of Contents

1. [Overview & Responsibilities](#overview--responsibilities)
2. [Entry Point Component](#entry-point-component)
3. [Store Layer (State Management)](#store-layer-state-management)
4. [API Client Layer](#api-client-layer)
5. [UI Component Structure](#ui-component-structure)
6. [Error Handling & Recovery](#error-handling--recovery)
7. [Timeout Behavior & User Feedback](#timeout-behavior--user-feedback)
8. [State Machines & Flow Logic](#state-machines--flow-logic)
9. [Data Persistence & localStorage](#data-persistence--localstorage)
10. [Performance Characteristics](#performance-characteristics)

---

## Overview & Responsibilities

The AetherPress frontend is a **Svelte 4 + Vite** single-page application that orchestrates the complete user-facing workflow from prompt input through ebook generation and export.

### Core Responsibilities

1. **User Input Collection** - Prompt entry, medium selection, configuration
2. **State Management** - Reactive store-based state for generation, classification, overrides
3. **API Communication** - HTTP client with retry logic and timeout handling
4. **Flow Orchestration** - Multi-phase state machine managing generation lifecycle
5. **Error Recovery** - Graceful degradation, user-facing error messages, exponential backoff
6. **UI Feedback** - Progress indicators, loading states, preview rendering
7. **Export Facilitation** - PDF download triggering and status display

### Technology Stack

| Layer                | Technology                        | Purpose                                       |
| -------------------- | --------------------------------- | --------------------------------------------- |
| **Framework**        | Svelte 4                          | Reactive component model, compiler-optimized  |
| **Build Tool**       | Vite                              | Fast bundling, HMR, optimized dev/prod builds |
| **HTTP Client**      | Fetch API                         | Native browser HTTP with AbortController      |
| **State Management** | Svelte Stores (writable, derived) | Reactive state containers                     |
| **Styling**          | CSS + Svelte scoped styles        | Component-level styling                       |
| **Testing**          | Vitest + Puppeteer                | Unit tests, E2E tests                         |

---

## Entry Point Component

### GenerateFlow.svelte

**File**: [client/src/components/GenerateFlow.svelte](../../../../client/src/components/GenerateFlow.svelte) (520 lines)

**Responsibility**: Main orchestrator component managing the entire generation workflow

#### State Phases

The component drives the application through distinct phases:

```
Phase 1: INITIAL
  ↓
User selects medium, enters prompt
  ↓
Phase 2: CLASSIFY
  ├─ Call /api/classify with prompt
  ├─ Receive classification confidence
  ├─ Auto-accept if confidence > threshold (default 0.85)
  └─ Otherwise: Show classification for user review
  ↓
Phase 3: GENERATE
  ├─ Call /api/generate with prompt + classification
  ├─ Backend processes ~49-50 seconds
  ├─ Return HTML + metadata
  └─ Store result in state
  ↓
Phase 4: RESULT_READY
  ├─ Display preview
  ├─ Offer export or override
  └─ Wait for user action
  ↓
Phase 5: OVERRIDE (Optional)
  ├─ Call /api/override with style modifications
  ├─ Regenerate HTML with new styling
  └─ Return to RESULT_READY
  ↓
Phase 6: EXPORT
  └─ Download PDF to user device
```

#### Key Methods

**handleGenerateClick()**: Initiates classification

```javascript
async function handleGenerateClick() {
  const { prompt, selectedMedium } = $flowStore;

  // Validate input
  if (!prompt || prompt.trim().length < 10) {
    flowStore.setError({ message: "Prompt must be at least 10 characters" });
    return;
  }

  flowStore.startClassifying();
  retryCount = 0;

  try {
    const classResult = await withRetry(
      () => classify({ prompt, selectedMedium }),
      maxRetries,
      retryDelayMs
    );

    flowStore.setClassification(classResult.classification);

    // Auto-accept if high confidence
    const threshold = config.CONFIDENCE_THRESHOLD || 0.85;
    if (classResult.classification.confidence > threshold) {
      await handleAcceptClassification();
    } else {
      flowStore.transitionTo("CLASSIFICATION_READY");
    }
  } catch (err) {
    flowStore.setError(err, retryCount);
  }
}
```

**handleAcceptClassification()**: Proceeds to generation

```javascript
async function handleAcceptClassification() {
  const { prompt, classification, selectedMedium } = $flowStore;

  flowStore.startGenerating();
  retryCount = 0;

  try {
    const genResult = await withRetry(
      () =>
        generate({
          prompt,
          medium: selectedMedium || classification.medium,
          classification,
        }),
      maxRetries,
      retryDelayMs
    );

    flowStore.setResult(genResult);
    flowStore.finishGenerating();
    flowStore.transitionTo("RESULT_READY");
  } catch (err) {
    flowStore.finishGenerating();
    flowStore.setError(err, retryCount);
    // Go back to classification for retry
    flowStore.transitionTo("CLASSIFICATION_READY");
  }
}
```

**handleApplyOverride()**: Applies style modifications

```javascript
async function handleApplyOverride(overrideEvent) {
  const { detail: overrides } = overrideEvent;
  const { resultId, classification } = $flowStore;

  flowStore.startOverriding();
  retryCount = 0;

  try {
    const overrideResult = await withRetry(
      () =>
        applyOverride({
          resultId,
          classification,
          overrides,
        }),
      maxRetries,
      retryDelayMs
    );

    if (overrideResult.result) {
      flowStore.setResult(overrideResult.result);
    }
    flowStore.finishOverriding();
    flowStore.transitionTo("RESULT_READY");
  } catch (err) {
    flowStore.setError(err, retryCount);
  }
}
```

**withRetry()**: Exponential backoff retry logic

```javascript
async function withRetry(fn, maxAttempts, delays) {
  let lastError;
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      retryCount = attempt;

      if (attempt < maxAttempts && err.retryable !== false) {
        const delayMs = delays[attempt] || delays[delays.length - 1];
        console.log(
          `Retry attempt ${attempt + 1} after ${delayMs}ms`,
          err.message
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}
```

#### Retry Configuration

- **maxRetries**: 3 attempts
- **Backoff delays**: [1000ms, 2000ms, 4000ms, 8000ms]
- **Strategy**: Exponential backoff with random jitter
- **Non-retryable errors**: 401 (authentication), 403 (authorization)

---

## Store Layer (State Management)

### flowStore.js

**File**: [client/src/lib/stores/flowStore.js](../../../../client/src/lib/stores/flowStore.js) (223 lines)

**Responsibility**: Centralized state machine for the entire flow lifecycle

#### State Diagram

```
┌────────────┐
│  INITIAL   │
└─────┬──────┘
      │ user selects medium
      ↓
┌──────────────────┐
│ MEDIUM_SELECTED  │
└─────┬──────────┬─┘
      │          └─→ [back to INITIAL]
      │ user enters prompt, clicks Generate
      ↓
┌───────────┐
│ GENERATING│
├────┬──────┤
│    │      └─→ [to ERROR]
│    ├─→ CLASSIFICATION_READY (if low confidence)
│    └─→ RESULT_READY (if generation succeeds)
│
│ (backend processing: 49-50 seconds)
│
└────────────┘
      ↓
┌─────────────────────┐
│ CLASSIFICATION_READY│
├────┬────────┬───────┤
│    │        └──→ [to INITIAL]
│    ├─→ GENERATING (user accepts classification)
│    └─→ OVERRIDE_ACTIVE (user modifies classification)
└────────────┘
      ↓
┌──────────────┐
│ RESULT_READY │
├──────┬───────┤
│      ├──→ OVERRIDE_ACTIVE (user applies style changes)
│      ├──→ COMPLETE (user exports PDF)
│      └──→ [to INITIAL]
└──────┘
      ↓
┌──────────────┐
│   COMPLETE   │
└──────┬───────┘
       └──→ [to INITIAL] (reset)
```

#### Store Definition

```javascript
{
  state: "INITIAL" | "MEDIUM_SELECTED" | "GENERATING" |
         "CLASSIFICATION_READY" | "RESULT_READY" |
         "OVERRIDE_ACTIVE" | "COMPLETE" | "ERROR",

  selectedMedium: string,           // "ebook", "calendar", etc.
  prompt: string,                   // User input prompt
  classification: {                 // AI classification result
    confidence: number,             // 0-1
    medium: string,                 // Recommended medium
    tags: string[]                  // Content tags
  },
  result: {                         // Generation result
    id: string,                     // UUID for override calls
    html: string,                   // Full HTML content
    chapters: Array,                // Chapter array
    metadata: {}                    // Theme, density, pages, etc.
  },

  latency: number,                  // Total processing time (ms)
  overrideCost: number,             // Cost multiplier for style changes
  error: {                          // Error tracking
    message: string,
    code: string,
    retryable: boolean,
    timestamp: number
  },
  startTime: timestamp              // For elapsed time tracking
}
```

#### Key Methods

**transitionTo(newState)**: Validated state machine transition

```javascript
transitionTo(newState) {
  update((store) => {
    const currentState = store.state;

    // Validate against VALID_TRANSITIONS
    if (!VALID_TRANSITIONS[currentState]?.includes(newState)) {
      console.warn(
        `Invalid state transition: ${currentState} → ${newState}`
      );
      return store;
    }

    return { ...store, state: newState };
  });
}
```

**setClassification(classification)**: Store classification result

```javascript
setClassification(classification) {
  update((store) => ({
    ...store,
    classification,
    error: null
  }));
}
```

**setResult(result)**: Store generation result with size tracking

```javascript
setResult(result) {
  update((store) => ({
    ...store,
    result,
    error: null,
    latency: Date.now() - store.startTime
  }));
}
```

**setError(error, retryCount)**: Track error with retry information

```javascript
setError(error, retryCount) {
  update((store) => ({
    ...store,
    error: {
      message: error.message,
      code: error.code || "UNKNOWN",
      retryable: error.retryable !== false,
      retryCount,
      timestamp: Date.now()
    },
    state: "ERROR"
  }));
}
```

### ebookStore.js

**File**: [client/src/stores/ebookStore.js](../../../../client/src/stores/ebookStore.js) (390 lines)

**Responsibility**: Ebook-specific configuration and generation state (legacy/alternative flow)

#### Configuration State

```javascript
{
  config: {
    theme: "dark" | "light" | "corporate" | "bold",
    pageCount: 3-20,
    colorPalette: "standard" | "vibrant" | "muted" | "grayscale",
    fontSizeScale: 0.8-1.2,
    density: "sparse" | "standard" | "dense" | "very-dense"
  },
  result: {
    id: string,
    content: { title, body },
    html: string,
    metadata: {},
    pages: Array,
    can_export: boolean,
    can_override: boolean
  },
  loading: boolean,
  error: string | null,
  status: "idle" | "generating" | "success" | "error",
  history: {
    configs: Array,
    currentIndex: number
  }
}
```

#### Key Methods

**generate(prompt)**: Execute ebook generation

```javascript
async generate(prompt) {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error("Prompt cannot be empty");
  }

  update((store) => ({
    ...store,
    loading: true,
    error: null,
    status: "generating"
  }));

  try {
    const currentStore = get({ subscribe });
    const response = await ebookApi.generateEbook({
      prompt,
      theme: currentStore.config.theme,
      pageCount: currentStore.config.pageCount,
      colorPalette: currentStore.config.colorPalette,
      fontSizeScale: currentStore.config.fontSizeScale
    });

    // Log frontend reception
    console.log("[FRONTEND] Response received:");
    console.log("[FRONTEND] - html present:", !!response.html);
    console.log("[FRONTEND] - html length:", response.html?.length || "NULL");
    console.log("[FRONTEND] - chapters:", response.chapters?.length || 0);

    update((store) => ({
      ...store,
      result: response,
      loading: false,
      status: "success",
      error: null,
      history: addToHistory(store.history, store.config)
    }));
  } catch (err) {
    update((store) => ({
      ...store,
      error: err.message,
      loading: false,
      status: "error"
    }));
    throw err;
  }
}
```

**applyOverride(overrides, ebookId)**: Apply style modifications

```javascript
async applyOverride(overrides, ebookId) {
  if (!ebookId) {
    throw new Error("eBook ID required for override");
  }

  validateOverrides(overrides);

  update((store) => ({
    ...store,
    loading: true,
    error: null
  }));

  try {
    const currentStore = get({ subscribe });
    const html = currentStore.result?.html;
    const metadata = currentStore.result?.metadata;

    if (!html || !metadata) {
      throw new Error("No generated eBook found for override");
    }

    const response = await ebookApi.applyOverride({
      ebookId,
      html,
      metadata,
      overrides
    });

    update((store) => ({
      ...store,
      result: {
        ...store.result,
        ...response
      },
      loading: false,
      error: null
    }));
  } catch (err) {
    update((store) => ({
      ...store,
      error: err.message,
      loading: false
    }));
    throw err;
  }
}
```

**undo() / redo()**: Configuration history navigation

```javascript
undo() {
  let undoSucceeded = false;
  update((store) => {
    if (store.history.currentIndex > 0) {
      const newIndex = store.history.currentIndex - 1;
      const previousConfig = store.history.configs[newIndex];
      undoSucceeded = true;
      return {
        ...store,
        config: previousConfig,
        history: { ...store.history, currentIndex: newIndex }
      };
    }
    return store;
  });
  return undoSucceeded;
}

redo() {
  let redoSucceeded = false;
  update((store) => {
    if (store.history.currentIndex < store.history.configs.length - 1) {
      const newIndex = store.history.currentIndex + 1;
      const nextConfig = store.history.configs[newIndex];
      redoSucceeded = true;
      return {
        ...store,
        config: nextConfig,
        history: { ...store.history, currentIndex: newIndex }
      };
    }
    return store;
  });
  return redoSucceeded;
}
```

---

## API Client Layer

### ebookApi.js

**File**: [client/src/lib/ebookApi.js](../../../../client/src/lib/ebookApi.js) (152 lines)

**Responsibility**: HTTP client wrapper for backend API calls with timeout handling

#### Configuration

```javascript
const CONFIG = {
  API_BASE_URL: "/api",
  TIMEOUTS: {
    GENERATE: 600000, // 600s (10 minutes) - Generous for large ebooks
    OVERRIDE: 10000, // 10s for override calls
    THEMES: 5000, // 5s for theme data
  },
};
```

#### fetchWithTimeout(url, options, timeoutMs)

Core utility implementing fetch with timeout and detailed logging:

```javascript
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log(
      `[API] Starting fetch to ${url.replace(CONFIG.API_BASE_URL, "")}`
    );

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    console.log(
      `[API] Response received - Status: ${response.status}, ` +
        `Content-Type: ${response.headers.get("content-type")}`
    );

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      console.log(
        `[API] Content-Length header: ${(
          parseInt(contentLength) / 1024
        ).toFixed(2)}KB`
      );
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(
        data.error || `API error ${response.status}: ${response.statusText}`
      );
    }

    // Parse response with detailed error handling
    try {
      console.log(`[API] Attempting to parse JSON response...`);
      const text = await response.text();
      console.log(`[API] Raw response text length: ${text.length} bytes`);
      console.log(`[API] First 200 chars: ${text.substring(0, 200)}`);
      console.log(`[API] Last 100 chars: ${text.substring(text.length - 100)}`);

      const data = JSON.parse(text);
      console.log(
        `[API] JSON parsed successfully. Result keys: ${Object.keys(data).join(
          ", "
        )}`
      );

      if (data.html) {
        console.log(
          `[API] HTML content length: ${(data.html.length / 1024).toFixed(2)}KB`
        );
      }

      return data;
    } catch (parseErr) {
      console.error(`[API] JSON parse error:`, parseErr);
      throw parseErr;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      console.error(`[API] TypeError caught:`, err.message);
      throw new Error(`Network error: ${err.message}`);
    }
    console.error(`[API] Error:`, err);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

#### generateEbook(payload)

Calls `/api/ebook/generate` endpoint:

```javascript
async function generateEbook(payload) {
  const url = `${CONFIG.API_BASE_URL}/ebook/generate`;

  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    CONFIG.TIMEOUTS.GENERATE
  );
}
```

**Request Payload**:

```javascript
{
  prompt: string,
  theme: "dark" | "light",
  pageCount: 3-20,
  colorPalette: string,
  fontSizeScale: number
}
```

**Response Envelope**:

```javascript
{
  success: true,
  data: {
    content: { title, body },
    chapters: Array,
    html: string,     // ~30-50KB serialized HTML
    metadata: {
      model: "ebook-v1",
      pages: number,
      generatedAt: timestamp,
      processingTimeMs: number
    }
  }
}
```

#### applyOverride(payload)

Calls override endpoint (typically much faster):

```javascript
async function applyOverride(payload) {
  const url = `${CONFIG.API_BASE_URL}/ebook/override`;

  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    CONFIG.TIMEOUTS.OVERRIDE
  );
}
```

### api.js (Alternate Flow)

**File**: [client/src/lib/api.js](../../../../client/src/lib/api.js) (764 lines)

**Responsibility**: Higher-level API client with retry logic (used by alternative flow)

#### fetchWithRetry(url, options = {})

Implements retry logic with exponential backoff:

```javascript
const DEFAULT_CONFIG = {
  maxRetries: 3,
  initialBackoffMs: 1000,
  maxBackoffMs: 10000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

async function fetchWithRetry(url, options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...options.retryConfig,
  };
  delete options.retryConfig;

  const base =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost";
  const resolved = new URL(url, base);
  const endpoint = resolved.pathname;
  const method = options.method || "GET";

  Logger.apiRequest(endpoint, method, { config, headers: options.headers });

  let lastError;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(resolved.href, options);

      Logger.apiResponse(endpoint, response.status, {
        attempt,
        ok: response.ok,
      });

      if (response.ok) return response;

      if (config.retryableStatuses.includes(response.status)) {
        if (attempt < config.maxRetries) {
          const backoff = Math.min(
            config.maxBackoffMs,
            config.initialBackoffMs * Math.pow(2, attempt - 1)
          );
          const jitter = Math.random() * 100;
          const nextAttemptIn = Math.round((backoff + jitter) / 1000);

          Logger.apiRetry(endpoint, attempt, config.maxRetries, {
            status: response.status,
            nextAttemptIn,
          });

          await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
          continue;
        }
      }

      return response;
    } catch (error) {
      if (error.name === "AbortError") {
        throw error; // Don't retry aborted requests
      }

      // ... handle other errors
    }
  }

  throw lastError;
}
```

#### classify(), generate(), applyOverride()

Higher-level wrappers:

```javascript
export async function classify({ prompt, selectedMedium }) {
  return fetchWithRetry("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, selectedMedium }),
  }).then((r) => r.json());
}

export async function generate({ prompt, medium, classification }) {
  return fetchWithRetry("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, medium, classification }),
  }).then((r) => r.json());
}

export async function applyOverride({ resultId, classification, overrides }) {
  return fetchWithRetry("/api/override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resultId, classification, overrides }),
  }).then((r) => r.json());
}
```

---

## UI Component Structure

### Component Hierarchy

```
App.svelte
├─ GenerateFlow.svelte (Main orchestrator)
│  ├─ MediaSelector.svelte
│  │  └─ MediaSelectorWithFeedback.svelte
│  ├─ PromptInput.svelte
│  ├─ Spinner.svelte (Loading indicator)
│  ├─ ClassificationFeedback.svelte (Show/accept classification)
│  ├─ OverrideControls.svelte (Style modification panel)
│  │  ├─ ThemeSelector.svelte
│  │  ├─ PageCountSlider.svelte
│  │  ├─ ThemePreview.svelte
│  │  └─ OverrideForm.svelte
│  ├─ ContentPreview.svelte (Display generated content)
│  │  ├─ PreviewWindow.svelte
│  │  └─ PreviewSkeleton.svelte (Loading state)
│  ├─ StatusDisplay.svelte (Current state indicator)
│  ├─ Export.svelte (Export options)
│  │  └─ ExportButton.svelte
│  └─ Editor.svelte (Advanced editing panel)
│
└─ Other top-level pages/views
```

### Key Components

#### MediaSelector.svelte

Allows user to choose generation medium (ebook, calendar, poster, etc.)

**Props**: `onSelect: (medium) => void`

**Emits**: `select` event with selected medium

#### PromptInput.svelte

Text input for user prompt with character count and validation

**Props**:

- `placeholder: string`
- `maxLength: number`

**Emits**: `input` event with prompt text

#### Spinner.svelte

Animated loading indicator with optional status text

**Props**:

- `active: boolean`
- `statusText: string`

#### ClassificationFeedback.svelte

Shows AI classification result with accept/modify options

**Props**:

- `classification: Object` (confidence, medium, tags)
- `onAccept: () => void`
- `onModify: () => void`

#### OverrideControls.svelte

Panel for applying style overrides (theme, colors, fonts)

**Props**:

- `currentConfig: Object` (theme, pageCount, palette, etc.)
- `onApply: (overrides) => void`

**Child Components**:

- ThemeSelector.svelte
- PageCountSlider.svelte
- ThemePreview.svelte
- OverrideForm.svelte

#### ContentPreview.svelte

Displays generated ebook preview with PreviewWindow

**Props**:

- `html: string` (Full HTML content)
- `loading: boolean`

**Sub-components**:

- PreviewWindow.svelte (Renders iframe with HTML)
- PreviewSkeleton.svelte (Placeholder during loading)

#### StatusDisplay.svelte

Shows current processing state and elapsed time

**Props**:

- `state: string` (INITIAL, GENERATING, RESULT_READY, etc.)
- `elapsedMs: number`

#### Export.svelte

Handles PDF export download

**Props**:

- `result: Object`
- `onExport: () => void`

**Sub-component**: ExportButton.svelte

---

## Error Handling & Recovery

### Error Types & Strategies

#### Network Errors

**Symptoms**:

- TypeError: "Failed to fetch"
- Network timeout after ~60 seconds (infrastructure limit)

**Strategy**:

1. Automatically retry up to 3 times with exponential backoff
2. User sees "Retrying..." in UI
3. If all retries fail: Show "Network error" with option to try again

**Code Path**: `withRetry()` in GenerateFlow.svelte

#### Validation Errors

**Symptoms**:

- Prompt < 10 characters
- No medium selected
- Invalid configuration (pageCount out of range)

**Strategy**:

1. Prevent submit (form validation)
2. Show inline error messages
3. Highlight problematic field

**Code Path**: Input component validation before `handleGenerateClick()`

#### API Errors (4xx/5xx)

**Symptoms**:

- 400 Bad Request (malformed payload)
- 401 Unauthorized (auth failure)
- 429 Too Many Requests (rate limited)
- 500 Server Error (backend crash)
- 503 Service Unavailable (Gemini API down)

**Strategy**:

| Status  | Retryable | Action                    |
| ------- | --------- | ------------------------- |
| 400     | ❌ No     | Show error, don't retry   |
| 401     | ❌ No     | Redirect to login         |
| 403     | ❌ No     | Show permission error     |
| 429     | ✅ Yes    | Exponential backoff retry |
| 500     | ✅ Yes    | Retry with backoff        |
| 502/503 | ✅ Yes    | Retry with backoff        |

**Code Path**:

- `retryableStatuses` in api.js
- Retry decision logic in withRetry()

#### Timeout Errors

**Symptom**: AbortError after 600,000ms (10 minutes)

**Root Cause**: Infrastructure timeout cuts connection before response transmission completes

**User Experience**:

1. User sees "Generating content..." for 49-50 seconds
2. Backend successfully completes processing
3. Response begins transmitting (~5-10 seconds)
4. Codespaces timeout (~60 seconds total) cuts connection
5. Client receives "Network error: Failed to fetch"
6. **BUT** - Backend has completed and stored result

**Current Mitigation**:

- Extended timeout (600s) gives max window
- Exponential backoff retry (may succeed if backend cached result)
- User-facing message suggests refreshing or retrying

**Proposed Solutions** (See ARCHITECTURE_OVERVIEW.md):

- Async polling pattern (get generation status without blocking request)
- Response streaming (transmit incrementally)
- Infrastructure upgrade (increase timeout)

### Error UI & Feedback

#### StatusDisplay Component

Shows real-time state transitions:

```
INITIAL              → "Select medium to get started"
MEDIUM_SELECTED      → "Enter prompt and click Generate"
GENERATING           → "Analyzing prompt..." → "Generating content..."
CLASSIFICATION_READY → "Review classification: [medium] (confidence: X%)"
RESULT_READY         → "Preview ready. Refine or export?"
OVERRIDE_ACTIVE      → "Applying style changes..."
COMPLETE             → "Export complete. Start over?"
ERROR                → "❌ [Error message] - Retry? Go back?"
```

#### Error Messages

```javascript
// User-friendly error text in flowStore
if (error.status === 429) {
  return "Too many requests. Please wait a moment and try again.";
}
if (error.status === 503) {
  return "Service temporarily unavailable. Please try again in a moment.";
}
if (error.code === "TIMEOUT") {
  return "Request took too long. Please try again with a shorter prompt.";
}
if (error.code === "NETWORK_ERROR") {
  return "Network connection lost. Please check your internet and try again.";
}
```

---

## Timeout Behavior & User Feedback

### Timeline from User Perspective

```
T=0s     └─ User clicks "Generate"
         └─ UI shows "Analyzing prompt..."

T=10-15s └─ Backend calls Gemini (structure)
         └─ UI still shows "Analyzing prompt..."

T=15s    └─ Classification ready
         └─ Auto-accept if confidence > threshold
         └─ Otherwise: Show "Review classification"

T=20s    └─ If accepted, show "Generating content..."
         └─ Backend generates chapters (Gemini Flash)

T=45-50s └─ Generation complete on backend
         └─ HTML composition done
         └─ Response begins transmitting

T=50-60s └─ Response transmission in progress
         │  Typical: 5-10 seconds for 30-50KB JSON
         │
         │  RISK: If transmission takes >~10s total,
         │  Codespaces timeout (~60s) cuts connection
         │
         └─ If successful:
            └─ JSON parse succeeds
            └─ ebookStore.generate() updates state
            └─ PreviewWindow renders HTML
            └─ UI shows "Preview ready"

T>60s    └─ If transmission incomplete:
         └─ AbortError from timeout
         └─ Promise rejection caught in withRetry()
         └─ Exponential backoff retry (delay 1-8 seconds)
         └─ If retry succeeds: Process continues
         └─ If retry fails 3x: Show error message
```

### User Feedback Elements

#### Progress Bar

```html
<div class="progress-bar">
  <div class="progress-fill" style="width: {$flowProgress}%"></div>
  <div class="progress-label">
    {#if $flowStore.state === "GENERATING"} {$flowStore.isClassifying ?
    "Analyzing your prompt..." : "Generating content..."} {/if}
  </div>
</div>
```

Provides visual feedback that something is happening (though actual percentage may be inaccurate given backend timing)

#### Loading Spinner

```html
{#if $flowStore.isGenerating}
<LoadingSpinner active="{true}" statusText="Generating ebook..." />
{/if}
```

Animated spinner with status text

#### Elapsed Time Display

```html
<div class="elapsed-time">Generated in {(latencyMs / 1000).toFixed(1)}s</div>
```

Shows actual time taken after completion

#### Error Panel

```html
{#if $flowStore.error}
<div class="error-panel">
  <p class="error-message">{$flowStore.error.message}</p>
  <button on:click="{handleRetryClassification}">
    Retry (Attempt {retryCount + 1}/3)
  </button>
  <button on:click="{handleReset}">Start Over</button>
</div>
{/if}
```

---

## State Machines & Flow Logic

### flowStore State Machine

**File**: [client/src/lib/stores/flowStore.js](../../../../client/src/lib/stores/flowStore.js#L1-L50)

Eight-state machine with validated transitions:

```javascript
const STATES = {
  INITIAL: "INITIAL",
  MEDIUM_SELECTED: "MEDIUM_SELECTED",
  GENERATING: "GENERATING",
  CLASSIFICATION_READY: "CLASSIFICATION_READY",
  RESULT_READY: "RESULT_READY",
  OVERRIDE_ACTIVE: "OVERRIDE_ACTIVE",
  COMPLETE: "COMPLETE",
  ERROR: "ERROR",
};

const VALID_TRANSITIONS = {
  INITIAL: [MEDIUM_SELECTED],
  MEDIUM_SELECTED: [GENERATING, INITIAL],
  GENERATING: [CLASSIFICATION_READY, RESULT_READY, ERROR],
  CLASSIFICATION_READY: [GENERATING, OVERRIDE_ACTIVE, INITIAL, ERROR],
  RESULT_READY: [OVERRIDE_ACTIVE, COMPLETE, INITIAL, ERROR],
  OVERRIDE_ACTIVE: [GENERATING, RESULT_READY, ERROR],
  COMPLETE: [INITIAL],
  ERROR: [INITIAL, MEDIUM_SELECTED],
};
```

**Enforcement**:

```javascript
setState(newState) {
  update((store) => {
    const currentState = store.state;

    if (!VALID_TRANSITIONS[currentState]?.includes(newState)) {
      console.warn(
        `Invalid state transition: ${currentState} → ${newState}`
      );
      return store;  // No-op
    }

    return { ...store, state: newState };
  });
}
```

### Generation Flow Sequence

```
1. User Input Phase
   ├─ Select medium (MediaSelector)
   ├─ Enter prompt (PromptInput)
   └─ Click "Generate"
      └─ flowStore.setState(GENERATING)

2. Classification Phase
   ├─ Call /api/classify (low latency)
   ├─ Receive confidence score
   ├─ If confidence > 0.85: Auto-proceed
   └─ Else: Show ClassificationFeedback
      └─ flowStore.setState(CLASSIFICATION_READY)

3. Generation Phase
   ├─ Call /api/generate (backend: 49-50s)
   ├─ Display "Generating content..." spinner
   ├─ If success: setResult()
   │  └─ flowStore.setState(RESULT_READY)
   └─ If error: setError() + retry
      └─ flowStore.setState(ERROR)
      └─ After 3 retries: Show error message

4. Preview & Override Phase (Optional)
   ├─ Show ContentPreview.svelte with HTML
   ├─ User may apply style overrides
   │  └─ flowStore.setState(OVERRIDE_ACTIVE)
   │  └─ Call /api/override (faster)
   │  └─ Return to RESULT_READY
   └─ User clicks "Export"
      └─ Trigger PDF download
      └─ flowStore.setState(COMPLETE)

5. Reset
   └─ User clicks "Start Over"
      └─ flowStore.reset()
      └─ Return to INITIAL state
```

---

## Data Persistence & localStorage

### localStorage Usage

**Minimal persistence strategy**: Currently not heavily used in main flow

**Potential (not yet implemented)**:

```javascript
// Save user preferences
localStorage.setItem('theme-preference', 'dark');
localStorage.setItem('last-prompt', userPrompt);
localStorage.setItem('favorite-configs', JSON.stringify([...]));

// On page load
const savedTheme = localStorage.getItem('theme-preference');
if (savedTheme) {
  flowStore.setTheme(savedTheme);
}
```

### sessionStorage

**Current usage**:

- Store generation result during current session
- Clear on page reload/navigation away

```javascript
// In ebookStore.js (if implemented)
sessionStorage.setItem(
  "last-ebook-result",
  JSON.stringify({
    html: result.html,
    metadata: result.metadata,
    generatedAt: new Date().toISOString(),
  })
);
```

### IndexedDB (Not Currently Used)

**Potential future use**: Store multiple generations, allow offline browsing

```javascript
// Would allow:
// - Saving ebook history
// - Offline preview access
// - Version control of modifications
```

---

## Performance Characteristics

### Metrics & Constraints

| Metric                   | Value               | Notes                                      |
| ------------------------ | ------------------- | ------------------------------------------ |
| **Page Load**            | <1s                 | Vite optimized bundle                      |
| **Medium Selection**     | <100ms              | Instant UI response                        |
| **Prompt Input**         | <50ms per keystroke | Lightweight validation                     |
| **Classification Call**  | 2-5s                | Backend calls Gemini                       |
| **Generation Call**      | 49-50s              | Bottleneck: backend processing             |
| **JSON Parse**           | <500ms              | 30-50KB response                           |
| **HTML Render**          | 1-2s                | PreviewWindow iframe render                |
| **Override Call**        | 5-10s               | Style regeneration                         |
| **Network Transmission** | 5-10s               | 30-50KB at typical speed                   |
| **Total E2E Time**       | ~55-65s             | Classification + generation + transmission |

### Bottlenecks

1. **Backend Generation (49-50s)**: Dominated by Gemini API calls
2. **Network Transmission (5-10s)**: 30-50KB JSON payload
3. **Infrastructure Timeout (~60s)**: Codespaces hard limit cuts connection

### Frontend Optimization Opportunities

1. **Response Streaming**: Instead of waiting for full response, stream chunks to client for incremental rendering
2. **Polling Pattern**: Return generation ID immediately, client polls for status/result
3. **Caching**: Cache classification results for identical prompts within time window
4. **Lazy Load**: Defer non-critical UI components, render preview first

### Bundle Size

| Asset               | Size   | Notes                     |
| ------------------- | ------ | ------------------------- |
| **main.js**         | ~150KB | Svelte components + logic |
| **styles.css**      | ~50KB  | Global + component styles |
| **Total (gzipped)** | ~60KB  | Vite-optimized output     |

---

## Lifecycle Hooks & Initialization

### GenerateFlow.svelte Lifecycle

```javascript
import { onMount } from "svelte";

let unsubscribe;

onMount(() => {
  // Initialize flow on component mount
  flowStore.reset();
  console.log("GenerateFlow mounted");

  // Subscribe to store changes for reactive updates
  unsubscribe = flowStore.subscribe((_) => {
    // Component reactivity handled by Svelte
    // (store updates trigger re-renders automatically)
  });

  // Cleanup on destroy
  return () => {
    if (unsubscribe) unsubscribe();
  };
});
```

### App.svelte Initialization

```javascript
// app.css imported globally
// Theme variables set based on system preference or user selection
// Stores initialized on import
```

---

## Known Issues & Constraints

### Active Issues

1. **60-Second Infrastructure Timeout** ⚠️

   - **Symptom**: Client receives "Network error: Failed to fetch" despite successful backend generation
   - **Root Cause**: Codespaces timeout (~60s) cuts connection during response transmission
   - **Impact**: Users unable to download ebooks even though they were generated
   - **Workaround**: Exponential backoff retry (may work if backend cached result)
   - **Proposed Fix**: Async polling or response streaming

2. **State Machine Rigidity**

   - **Issue**: Some valid transitions blocked by state machine
   - **Example**: Can't return to INITIAL from GENERATING state
   - **Impact**: User must wait for operation to complete to reset

3. **Error Recovery UX**
   - **Issue**: Retry logic doesn't distinguish between retryable and permanent errors
   - **Example**: 401 auth error shouldn't be retried
   - **Fix**: Implemented in api.js via retryableStatuses

### Browser Compatibility

- **Modern browsers**: Chrome, Firefox, Safari, Edge (all support AbortController, Fetch API)
- **IE11**: Not supported (Svelte 4 requires ES2015+)

### Testing Coverage

- Unit tests: Store logic, utility functions
- E2E tests: Full generation flow with mock server
- Coverage gaps: Some frontend tests skipped pending mock updates
