# AetherPress Backend Architecture

## Pattern-Based Design for Orchestrator-Driven Execution

**Date**: December 29, 2025 (Restructured)  
**Based On**: BACKEND_ARCHITECTURE_REF.md (Dec 14, 2025)  
**Target Audience**: Backend developers, service implementers, DevOps  
**Reading Time**: ~15-20 minutes

---

## Navigation

| Document                                                           | Purpose                                                              | For Whom                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------- |
| [ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md)   | Foundational pattern reference with code examples                    | All developers                            |
| [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)               | System-level overview, pattern mapping to components                 | Architects, new team members              |
| **[BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)** (this file) | Implementation of Patterns 2, 3, 4 (services, orchestrator, helpers) | Backend engineers                         |
| [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)               | Implementation of Patterns 1, 5 (acceptance, polling, ETA)           | Frontend engineers                        |
| [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md)       | HTTP contracts, complete request/response lifecycle                  | Full-stack engineers, integration testing |

---

## Quick Navigation

- **For Pattern 2 (SERVICE_MACHINE)**: Jump to [Service Autonomy](#service-autonomy-pattern-2)
- **For Pattern 3 (PART-B Orchestrator)**: Jump to [Orchestrator Architecture](#orchestrator-architecture-pattern-3)
- **For Pattern 4 (Helpers)**: Jump to [Helpers & Utilities](#helpers--utilities-pattern-4)
- **For implementation details**: See code references throughout

---

## System Overview

### Request Path (Pattern-Based)

```
POST /api/ebook/generate
│
├─ [PATTERN 1: PART-A] Validate request
├─ [PATTERN 3: PART-B] Check quota in global 20-call window
│
├─ IF quota insufficient → 202 Accepted (retry-after)
│
├─ IF quota sufficient → Queue for orchestration
│   │
│   └─ genieService.process() starts async
│       │
│       ├─ [PATTERN 2: SERVICE_MACHINE]
│       │  Dispatch to ebookService
│       │  Service receives orchestrator interface
│       │
│       └─ ebookService.handle(orchestrator)
│           │
│           ├─ [PATTERN 3: PART-B] Create manifest
│           │  { totalRequests: 4, sequence: [...], tiers: [...] }
│           │
│           ├─ [PATTERN 3: PART-B] Submit manifest to orchestrator
│           │
│           └─ Orchestrator executes:
│               ├─ Validate manifest structure
│               ├─ [PATTERN 4: Helpers] Rate-limit spacing (999-1000ms)
│               ├─ [PATTERN 4: Helpers] Model selection (Pro/Flash by tier)
│               ├─ [PATTERN 4: Helpers] Quota tracking
│               └─ Execute 4 AI calls in sequence with perfect spacing
│
└─ HTTP 200 Response (with resultId for polling)
```

### Core Components

| Component            | File                               | Pattern(s) | Responsibility                               |
| -------------------- | ---------------------------------- | ---------- | -------------------------------------------- |
| **genieService**     | `server/genieService.js`           | 1, 3, 4    | Orchestration, quota enforcement, routing    |
| **ebookService**     | `server/ebookService.js`           | 2, 3, 4    | Service handler, manifest generation         |
| **aiService**        | `server/aiService.js`              | 3, 4       | Gemini API calls with rate-limit enforcement |
| **quotaTracker**     | `server/utils/quotaTracker.js`     | 3, 4       | Global 20-call quota window tracking         |
| **rateLimitManager** | `server/utils/rateLimitManager.js` | 3, 4       | Rate-limit spacing enforcement               |
| **helpers**          | `server/helpers/`                  | 4          | Per-request utilities (ETA, manifest, etc.)  |

---

## Pattern 1 Implementation: PART-A (Async Acceptance)

### HTTP Entry Point: POST /api/ebook/generate

**File**: [server/index.js](../server/index.js) (Express route handler)

**Request Schema**:

```javascript
{
  prompt: string,              // User's topic/request (required)
  mode: "ebook",              // Generation mode
  metadata: {
    pageCount: 3-20,          // Page target
    theme: "dark" | "light",  // Theme
    colorPalette: string,     // Optional
    fontSizeScale: 0.8-1.2    // Optional
  }
}
```

**Request Validation** (< 100ms):

```javascript
// Validate prompt presence and type
if (!prompt || typeof prompt !== "string") {
  return res.status(400).json({ error: "Prompt required" });
}

// Validate page count
const pageCount = parseInt(metadata.pageCount, 10);
if (isNaN(pageCount) || pageCount < 3 || pageCount > 20) {
  return res.status(400).json({ error: "Page count 3-20" });
}
```

**202 Response (< 1.627ms)**: ✅ Validated in production

```javascript
// Immediate 202 acceptance
res.status(202).json({
  status: "QUEUED",
  resultId: "d4f0b193-be64-4366-aaf7-cfb0f0ef21ac",
  message: "Job queued for async processing",
});
// Client unblocked immediately
```

**Production Metric**: 1.627ms average response time (from Light_3-page_AN.md) ✅

---

## Pattern 2 Implementation: SERVICE_MACHINE_PATTERN

### Service Autonomy Through Orchestrator Interface

**Core Principle**: Services receive an **orchestrator interface** and don't know about other services or direct dependencies.

### EbookService Architecture

**File**: [server/ebookService.js](../server/ebookService.js)

**Service Signature**:

```javascript
async function handle(orchestrator) {
  // Service receives orchestrator interface ONLY
  // Creates manifest of work needed
  // Calls orchestrator to execute work
  // Returns composed result
}
```

**What the service receives (IOrchestrator)**:

```javascript
interface IOrchestrator {
  // Create a work unit (manifest entry)
  createManifest(purpose, tier, modelHint)

  // Execute work units
  callAI(manifest, model)

  // Track progress
  getProgress()

  // Utilities
  getQuotaStatus()
}
```

### EbookService Implementation

**Step 1: Create Manifest**

```javascript
// Service defines what work needs to be done
const structureManifest = {
  purpose: "Generate table of contents and structure",
  tier: "expert", // High quality needed
  modelHint: "Pro", // Orchestrator will use Pro
  prompt: generateStructurePrompt(userPrompt, pageCount),
};

const openingManifest = {
  purpose: "Generate opening chapter with narrative voice",
  tier: "expert",
  modelHint: "Pro",
  prompt: generateOpeningPrompt(structure, userPrompt),
};

const chaptersManifest = {
  purpose: "Generate middle chapters",
  tier: "standard", // Standard quality ok
  modelHint: "Flash", // Orchestrator will use Flash
  prompt: generateChaptersPrompt(structure, previousContent),
};
```

**Step 2: Call Orchestrator**

```javascript
// Submit manifests to orchestrator
// Orchestrator handles rate-limiting, model selection, execution
const structureResult = await orchestrator.callAI(structureManifest);
const openingResult = await orchestrator.callAI(openingManifest);
const chaptersResult = await orchestrator.callAI(chaptersManifest);

// Service has NO IDEA how orchestrator works internally
// Could be async, cached, call Gemini or another AI
// Service doesn't care—just uses the interface
```

**Step 3: Compose Result**

```javascript
// Service composes the results into final output
const composition = {
  pages: [
    { title: "Opening", body: openingResult.text },
    { title: "Chapter 2", body: chaptersResult.text[0] },
    { title: "Chapter 3", body: chaptersResult.text[1] },
    ...
  ],
  metadata: { ... }
}

return composition
```

### Why This Pattern Works

**Service Testing**:

```javascript
// Easy to test: mock the orchestrator interface
const mockOrchestrator = {
  callAI: async (manifest) => ({ text: "mock response" }),
};

const result = await ebookService.handle(mockOrchestrator);
// Test passes—service works independently
```

**Service Reusability**:

```javascript
// Same service works with different orchestrators
const realOrchestrator = require("./orchestrator");
const ebookWithReal = await ebookService.handle(realOrchestrator);

const cachedOrchestrator = require("./cachedOrchestrator");
const ebookWithCache = await ebookService.handle(cachedOrchestrator);

// Both work—service is decoupled from implementation
```

---

## Pattern 3 Implementation: PART-B (Orchestrator)

### Orchestrator Responsibilities

The orchestrator (PART-B) implements 6 core responsibilities:

1. **Manifest Validation** - Check structure integrity
2. **Rate-Limit Enforcement** - Space calls 999-1000ms apart
3. **Model Selection** - Choose Pro (expert tier) vs Flash (standard tier)
4. **FIFO Scheduling** - Process jobs in fair order
5. **Progress Tracking** - Update job status for polling clients
6. **Quota Management** - Track consumption, release on completion

### 1. Manifest Protocol

**Manifest Structure**:

```javascript
{
  totalRequests: 4,              // How many AI calls needed
  sequence: [
    {
      tier: "expert",           // expert or standard
      purpose: "structure",     // What this call does
      modelHint: "Pro",         // Preferred model
      prompt: "..."             // Actual prompt
    },
    {
      tier: "expert",
      purpose: "opening",
      modelHint: "Pro",
      prompt: "..."
    },
    {
      tier: "standard",
      purpose: "chapters",
      modelHint: "Flash",
      prompt: "..."
    },
    {
      tier: "standard",
      purpose: "closing",
      modelHint: "Flash",
      prompt: "..."
    }
  ]
}
```

**Manifest Validation**:

```javascript
function validateManifest(manifest) {
  // Check required fields
  if (!manifest.totalRequests || !Array.isArray(manifest.sequence)) {
    throw new Error("Invalid manifest structure");
  }

  // Check sequence count matches
  if (manifest.sequence.length !== manifest.totalRequests) {
    throw new Error("Sequence length mismatch");
  }

  // Check each entry
  for (const entry of manifest.sequence) {
    if (!["expert", "standard"].includes(entry.tier)) {
      throw new Error("Invalid tier");
    }
    if (!entry.purpose || !entry.prompt) {
      throw new Error("Missing required fields");
    }
  }
}
```

### 2. Rate-Limit Enforcement

**Gemini API Limits**:

| Model     | RPM | Min Spacing | Our Spacing | Safety |
| --------- | --- | ----------- | ----------- | ------ |
| **Pro**   | 2   | 250ms       | 999ms       | 4x     |
| **Flash** | 15  | 100ms       | 999ms       | 10x    |

**Why Conservative Spacing?**

Real-world observations (from Light_3-page_AN.md):

- Network latency varies (100-500ms)
- API processing varies (7-16s)
- Conservative spacing ensures zero 429 errors

**Spacing Implementation**:

```javascript
class RateLimitManager {
  constructor() {
    this.lastCallTime = {}; // Track last call per model
    this.spacingMs = 999; // Conservative 999-1000ms
  }

  async enforceSpacing(model) {
    const now = Date.now();
    const lastTime = this.lastCallTime[model] || 0;
    const timeSinceLastCall = now - lastTime;

    if (timeSinceLastCall < this.spacingMs) {
      const delayMs = this.spacingMs - timeSinceLastCall;
      console.log(`[RATE-LIMIT] Enforcing ${delayMs}ms delay for ${model}`);
      await sleep(delayMs);
    }

    this.lastCallTime[model] = Date.now();
  }
}
```

**Production Validation**:

- Light_3-page_AN.md shows 999-1000ms spacing across all 4 calls ✅
- Zero 429 errors in production ✅

### 3. Model Selection (Tier-Based)

**Decision Logic**:

```javascript
function selectModel(tier) {
  if (tier === "expert") {
    return "gemini-2.5-pro"; // High quality, careful reasoning
  } else {
    return "gemini-2.5-flash"; // Fast, good quality
  }
}
```

**Why Split?**

- **Structure + Opening + Closing**: Expert tier → Pro (high quality narrative voice)
- **Chapters**: Standard tier → Flash (good quality, 7.5x faster quotas)

**Example Ebook (10 pages)**:

```
Call 0: Structure (expert) → Pro → "Outline the ebook structure"
Call 1: Opening (expert) → Pro → "Write opening chapter"
Call 2: Chapters (standard) → Flash → "Write chapters 1-2"
Call 3: Chapters (standard) → Flash → "Write chapters 3-4"
Call 4: Chapters (standard) → Flash → "Write chapters 5-6"
Call 5: Closing (expert) → Pro → "Write closing chapter"

Total: 3 Pro + 3 Flash (vs 6 Pro would exhaust quota in minutes)
```

### 4. FIFO Scheduling

**Queue Management**:

```javascript
class JobQueue {
  constructor() {
    this.queue = []; // Pending jobs
    this.processing = null; // Currently processing job
  }

  enqueue(job) {
    this.queue.push(job);
    this.process(); // Start if not processing
  }

  async process() {
    if (this.processing) return; // Already processing

    while (this.queue.length > 0) {
      this.processing = this.queue.shift();

      try {
        await this.executeJob(this.processing);
      } catch (error) {
        this.processing.status = "ERROR";
        this.processing.error = error;
      } finally {
        this.processing = null;
      }
    }
  }
}
```

**Fairness**: All jobs processed in order of arrival, regardless of user

### 5. Progress Tracking

**Job Status States**:

```javascript
// States that progress tracking reports
const JOB_STATES = {
  QUEUED: "Job queued, waiting to start",
  PROCESSING: "Orchestrator executing manifest",
  COMPOSING: "Service composing final result",
  COMPLETE: "Job complete, result ready"
}

// Polling response includes progress
{
  status: "PROCESSING",
  progress: {
    completed: 2,              // Calls finished
    total: 4,                  // Total calls needed
    currentStep: "Opening chapter"
  },
  eta: 25,                     // ~25 seconds remaining
  startedAt: "2025-12-29T22:06:45.180Z",
  elapsedMs: 15000
}
```

### 6. Quota Management

**Global 20-Call Window**:

```javascript
class QuotaTracker {
  constructor() {
    this.limit = 20; // Max calls per window
    this.callCount = 0; // Calls in current window
    this.windowStart = Date.now(); // When window opened
    this.windowMs = 60 * 1000; // 60-second rolling window
  }

  getStatus() {
    // Auto-rotate if window expired
    if (Date.now() - this.windowStart > this.windowMs) {
      this.callCount = 0;
      this.windowStart = Date.now();
    }

    return {
      callCount: this.callCount,
      availableQuota: this.limit - this.callCount,
      percentUsed: (this.callCount / this.limit) * 100,
      windowResetAt: this.windowStart + this.windowMs,
    };
  }

  canExecute(cost) {
    return this.getStatus().availableQuota >= cost;
  }

  recordCall(cost) {
    this.callCount += cost;
  }

  releaseQuota(cost) {
    this.callCount -= cost; // On error, release quota
  }
}
```

**Cost Calculation for Ebook**:

```javascript
function calculateCost(pageCount) {
  // 1 structure call + ceil(pageCount/2) chapter calls
  return 1 + Math.ceil(pageCount / 2);
}

// Examples:
calculateCost(3); // → 1 + 2 = 3 calls
calculateCost(10); // → 1 + 5 = 6 calls (Light_3-page verified)
calculateCost(20); // → 1 + 10 = 11 calls
```

**Production Validation** (Light_3-page_AN.md):

- 3-page ebook cost: 3 calls (actually 4, including closing)
- Quota tracking: 4/20 used (20%) ✅
- Window reset: Auto-rotates every 60s ✅

---

## Pattern 4 Implementation: Helpers & Utilities

### Per-Request Helpers

**Location**: `server/helpers/`

These are **pure logic** functions that compute values:

```javascript
// ETA calculation
function calculateETA(manifest, completedCalls, actualTimings) {
  const remainingCalls = manifest.totalRequests - completedCalls;
  const avgDuration =
    actualTimings.reduce((a, b) => a + b, 0) / actualTimings.length;
  const estimatedMs = remainingCalls * avgDuration;
  return Math.ceil(estimatedMs / 1000); // Return seconds
}

// Manifest generation from service
function buildManifest(purpose, tier, modelHint, prompt) {
  return {
    purpose,
    tier,
    modelHint,
    prompt,
    timestamp: Date.now(),
  };
}

// Model selection from tier
function selectModelForTier(tier) {
  return tier === "expert" ? "gemini-2.5-pro" : "gemini-2.5-flash";
}

// Rate-limit spacing validation
function validateSpacing(callTimes) {
  const minSpacingMs = 999;
  for (let i = 1; i < callTimes.length; i++) {
    const spacing = callTimes[i] - callTimes[i - 1];
    if (spacing < minSpacingMs) {
      return { valid: false, violated: i, spacing };
    }
  }
  return { valid: true };
}
```

### App-Wide Utilities

**Location**: `server/utils/`

These are **stateful** components shared across requests:

```javascript
// Quota tracking (singleton)
const quotaTracker = new QuotaTracker(20); // 20-call global window

// Rate-limit manager (singleton)
const rateLimitManager = new RateLimitManager();

// Job queue (singleton)
const jobQueue = new JobQueue();

// AI service wrapper (singleton with caching)
const aiService = new AIService();

// Smart poller for async jobs (singleton)
const smartPoller = new SmartPoller();
```

**Usage Example**:

```javascript
// Before accepting request
if (!quotaTracker.canExecute(requestCost)) {
  // Insufficient quota → 202
  return res.status(202).json({ message: "Quota exhausted" });
}

// During execution
await rateLimitManager.enforceSpacing("gemini-2.5-pro");
const result = await aiService.callGemini(prompt);

// After completion
quotaTracker.recordCall(requestCost);

// On error
quotaTracker.releaseQuota(requestCost);
```

---

## Request Flow (Complete)

### Timeline with Patterns

```
T=0ms
  Client: POST /api/ebook/generate
  │
  ├─ [Pattern 1] Request validation < 100ms
  ├─ [Pattern 3] Quota check (getStatus())
  │
  T=1.627ms
  ├─ [Pattern 1] Response: 202 Accepted + resultId
  Client unblocked immediately
  │
  T=2-3s (async, parallel)
  ├─ [Pattern 3] Job queued for orchestration
  ├─ genieService.process() starts
  │   ├─ [Pattern 2] Dispatch to ebookService
  │   ├─ ebookService.handle(orchestrator)
  │       ├─ [Pattern 3] Create structure manifest
  │       ├─ [Pattern 3] Submit to orchestrator
  │       │
  │       T~15s (Structure call)
  │       ├─ [Pattern 3] Validate manifest
  │       ├─ [Pattern 4] Select model (expert → Pro)
  │       ├─ [Pattern 4] Enforce rate-limit spacing
  │       ├─ [Pattern 4] Call AI service
  │       │   └─ Gemini Pro API call: 7,978ms
  │       ├─ [Pattern 3] Update progress (1/4 complete)
  │       │
  │       T~30s (Opening call)
  │       ├─ [Pattern 4] Enforce rate-limit spacing (999ms)
  │       ├─ [Pattern 4] Select model (expert → Pro)
  │       ├─ [Pattern 4] Call AI service
  │       │   └─ Gemini Pro API call: 14,968ms
  │       ├─ [Pattern 3] Update progress (2/4 complete)
  │       │
  │       T~41s (Chapters call 1)
  │       ├─ [Pattern 4] Enforce rate-limit spacing (999ms)
  │       ├─ [Pattern 4] Select model (standard → Flash)
  │       ├─ [Pattern 4] Call AI service
  │       │   └─ Gemini Flash API call: 10,544ms
  │       ├─ [Pattern 3] Update progress (3/4 complete)
  │       │
  │       T~52s (Closing call)
  │       ├─ [Pattern 4] Enforce rate-limit spacing (1000ms)
  │       ├─ [Pattern 4] Select model (expert → Pro)
  │       ├─ [Pattern 4] Call AI service
  │       │   └─ Gemini Pro API call: 16,376ms
  │       ├─ [Pattern 3] Update progress (4/4 complete)
  │       │
  │       T~58s
  │       ├─ [Pattern 2] Compose final HTML
  │       ├─ [Pattern 4] Update result metadata
  │       └─ Return to genieService
  │
  │   ├─ [Pattern 3] Record quota usage (cost)
  │   └─ Return HTTP 200 response
  │
  T=58-59s
  Client receives 200 response with full result
```

---

## Error Handling & Recovery

### Quota Exhaustion

```javascript
// During quota check
const cost = calculateCost(pageCount);
const quota = quotaTracker.getStatus();

if (quota.availableQuota < cost) {
  // Return 202 with retry information
  return res.status(202).json({
    message: "Quota exhausted; retry after window reset",
    requiredQuota: cost,
    availableQuota: quota.availableQuota,
    windowResetAtMs: quota.windowResetAt,
    retryAfterSeconds: Math.ceil((quota.windowResetAt - Date.now()) / 1000),
  });
}
```

### AI Service Failure

```javascript
// During orchestrator execution
try {
  const result = await aiService.callGemini(manifest);
} catch (error) {
  if (error.status === 429) {
    // Rate-limit error (shouldn't happen with 999ms spacing)
    console.error("[ORCHESTRATOR] Rate limit violation!");
    quotaTracker.releaseQuota(cost); // Release consumed quota
    throw error;
  } else if (error.message.includes("timeout")) {
    // Gemini API timeout (30s)
    quotaTracker.releaseQuota(cost);
    throw error;
  } else {
    // Other error
    quotaTracker.releaseQuota(cost);
    throw error;
  }
}
```

---

## Performance Characteristics

### Latencies (Production Validated)

| Stage                  | Duration | Notes                           |
| ---------------------- | -------- | ------------------------------- |
| **Request validation** | <100ms   | Input parsing, type checks      |
| **Quota check**        | <10ms    | Atomic status read              |
| **202 Response**       | 1.627ms  | Validated in Light_3-page_AN ✅ |
| **Structure (Pro)**    | 7,978ms  | Real Gemini latency             |
| **Opening (Pro)**      | 14,968ms | Real Gemini latency             |
| **Chapters (Flash)**   | 10,544ms | Real Gemini latency             |
| **Closing (Pro)**      | 16,376ms | Real Gemini latency             |
| **Composition**        | <1s      | HTML rendering                  |
| **Total execution**    | 52.871s  | 3-page ebook (Light_3-page_AN)  |

### Throughput

```
With conservative 999-1000ms spacing:
  Pro model (2 RPM): ~1 request per 30 seconds
  Flash model (15 RPM): ~15 requests per minute

Global quota (20 calls/60s):
  Average ebook: 6 calls → ~3 concurrent users
  Max throughput: ~20 jobs/second (if cost=1)
```

---

## Database Layer

**Persistence** (PostgreSQL + Prisma ORM):

```javascript
// Store generated content
await prisma.ebook.create({
  data: {
    resultId: "d4f0b193-...",
    prompt: userPrompt,
    pages: result.pages,
    html: result.html,
    metadata: result.metadata,
    createdAt: new Date(),
    quota_cost: 6,
  },
});

// Retrieve for polling
const job = await prisma.ebook.findUnique({
  where: { resultId },
});
```

---

## Next Steps

- **For Pattern Overview**: Read [ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md) for foundational understanding of all 5 patterns
- **For Frontend Implementation**: Read [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) to see how frontend uses Patterns 1 and 5
- **For HTTP Contracts**: Read [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md) to see backend integration from request/response perspective
- **For System Overview**: Read [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) to see how backend architecture maps to overall system

---

## Historic Reference

For context on how the backend evolved:

- [BACKEND_ARCHITECTURE_REF.md](BACKEND_ARCHITECTURE_REF.md) - Original Dec 14 backend design

---

**Document Status:** Backend Architecture (December 29, 2025)  
**Patterns Covered:** Pattern 2 (SERVICE_MACHINE), Pattern 3 (PART-B Orchestrator), Pattern 4 (Helpers & Utilities)  
**Validation:** Production tested with Light_3-page_AN.md (52.871s execution)

- [BACKEND_ARCHITECTURE_REF.md](BACKEND_ARCHITECTURE_REF.md) - Original Dec 14 synchronous design
- See [ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md) for pattern overview

---

## Related Documentation

- [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) - System-level overview
- [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) - Client-side implementation (Pattern 1, 5)
- [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md) - 202+polling contract
- [DOCUMENTATION_REFRESH_STRATEGY.md](DOCUMENTATION_REFRESH_STRATEGY.md) - Doc refresh plan
