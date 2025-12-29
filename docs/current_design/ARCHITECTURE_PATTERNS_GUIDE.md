# Architecture Patterns Guide

## The 5 Interconnected Patterns That Define AetherPress

**Date**: December 29, 2025  @ 5:55PM
**Branch**: `feat/B_Frontend_option2`  
**Directory**: `docs/current_design/`

**Status**: Active Architecture (Validated in Production)  
**Audience**: Developers, architects, contributors  
**Reading Time**: 10-15 minutes

---

## Quick Navigation

| Document | Purpose | For Whom |
|----------|---------|----------|
| **[ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md)** (this file) | Foundational pattern reference with code examples | All developers |
| [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) | System-level overview, pattern mapping to components | Architects, new team members |
| [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) | Implementation of Patterns 2, 3, 4 (services, orchestrator, helpers) | Backend engineers |
| [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) | Implementation of Patterns 1, 5 (acceptance, polling, ETA) | Frontend engineers |
| [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md) | HTTP contracts, complete request/response lifecycle | Full-stack engineers, integration testing |

**Also See**: [ARCHITECTURE_OVERVIEW_REF.md](ARCHITECTURE_OVERVIEW_REF.md), [BACKEND_ARCHITECTURE_REF.md](BACKEND_ARCHITECTURE_REF.md), [FRONTEND_ARCHITECTURE_REF.md](FRONTEND_ARCHITECTURE_REF.md), [CLIENT_SERVER_INTEGRATION_REF.md](CLIENT_SERVER_INTEGRATION_REF.md) for historic reference material (old synchronous architecture)

---

## Overview

AetherPress solves the critical **60-second infrastructure timeout problem** through 5 interconnected architectural patterns that work together as a unified system. This guide introduces each pattern and shows how they interconnect.

**The Core Problem They Solve**:

- Old system: Synchronous request → 49-50s processing → timeout with only 0-6s buffer
- New system: Asynchronous request → immediate 202 response → polling for progress → zero timeout risk

---

## The 5 Architecture Patterns

### Pattern 1: PART-A (Async Acceptance)

**Purpose**: Return immediately to client without blocking

**How It Works**:

1. Client sends request to `/api/ebook/generate`
2. Server validates request instantly (~1ms)
3. Server queues job with SmartPoller
4. Server returns **202 Accepted** with `resultId`
5. Client immediately unblocked—can do other things
6. Client begins polling with resultId

**Why It Matters**:

- Eliminates the core timeout problem
- Old: Request blocks for 49-50 seconds, hits 60s infrastructure timeout
- New: Request unblocks in 1.627ms, client can poll indefinitely

**Key Metrics**:

- Target response time: < 150ms
- Production validation: 1.627ms ✅
- Response format: `{ status: "QUEUED", resultId: "uuid" }`

**Prevents**: Infrastructure timeout, client-side timeouts, perception of hanging

**Example**:

```javascript
// Client sends request
POST /api/ebook/generate
{ prompt: "...", mode: "ebook", theme: "light" }

// Server responds immediately (1.627ms)
202 Accepted
{ status: "QUEUED", resultId: "d4f0b193-be64-4366-aaf7-cfb0f0ef21ac" }

// Client is now unblocked and begins polling
```

---

### Pattern 2: SERVICE_MACHINE_PATTERN

**Purpose**: Enable services to be autonomous, reusable, independently testable

**How It Works**:

1. Services (EbookService, ArtService, etc.) are **passed an orchestrator interface only**
2. Services don't know about other services or direct dependencies
3. Services receive manifest instructions from orchestrator
4. Services execute work and update manifest with results
5. Services are completely decoupled from each other

**Why It Matters**:

- Testability: Mock the orchestrator interface, test service in isolation
- Reusability: Service works with any orchestrator
- Independence: Services can evolve independently
- Clarity: Service contract is crystal clear (receive orchestrator, return result)

**Example**:

```javascript
// Service receives ONLY an orchestrator interface
ebookService.handle(orchestrator) {
  // Generate structure
  const structureManifest = orchestrator.createManifest(...)
  const structureResult = await orchestrator.callAI(structureManifest, "Pro")

  // Generate opening
  const openingManifest = orchestrator.createManifest(...)
  const openingResult = await orchestrator.callAI(openingManifest, "Flash")

  // Return composition
  return compose(structureResult, openingResult)
}

// Service has NO IDEA how orchestrator works internally
// Could be async, could be cached, could call Gemini or another AI
// Service doesn't care—just uses the interface
```

**Prevents**: Hard-coded dependencies, tight coupling, testing nightmares

---

### Pattern 3: PART-B (Orchestrator / Waiter Pattern)

**Purpose**: Manage rate limits, schedule work, select optimal tools, track progress

**How It Works**:

1. Orchestrator receives **manifest** from service (list of AI calls needed)
2. Orchestrator validates manifest (correct structure, valid tiers)
3. Orchestrator enforces **rate-limit spacing** (999-1000ms between calls)
4. Orchestrator selects **optimal model** based on tier (Pro for expert, Flash for standard)
5. Orchestrator executes calls **in sequence** (FIFO)
6. Orchestrator tracks **progress** for polling clients
7. Orchestrator returns results back to service

**Why It Matters**:

- Rate limits: Gemini API requires minimum spacing (Pro 250ms, Flash 100ms). We use conservative 999-1000ms to ensure zero violations
- Scheduling: Multiple jobs might be queued. Orchestrator ensures fair FIFO processing
- Tool selection: Different tiers get different models (quality/cost tradeoff)
- Progress tracking: Enables accurate ETAs for polling clients

**Key Metrics**:

- Rate-limit spacing: 999-1000ms (4-10x safety margin)
- 429 errors: 0 (zero violations in production) ✅
- Scheduling: FIFO fairness
- Progress: Manifest-based (know exactly which step)

**Example**:

```javascript
// Service creates manifest
const manifest = {
  totalRequests: 4,
  sequence: [
    { tier: "expert", purpose: "structure", modelHint: "Pro" },
    { tier: "standard", purpose: "opening", modelHint: "Flash" },
    { tier: "standard", purpose: "chapters", modelHint: "Flash" },
    { tier: "standard", purpose: "closing", modelHint: "Flash" }
  ]
}

// Orchestrator executes with perfect rate-limit spacing
Call 0: Pro model, 7,978ms elapsed, spacing: (none)
Call 1: Flash model, 14,968ms elapsed, spacing: 999ms ✅
Call 2: Flash model, 10,544ms elapsed, spacing: 999ms ✅
Call 3: Flash model, 16,376ms elapsed, spacing: 1000ms ✅
```

**Prevents**: Rate-limit violations (429 errors), unfair job scheduling, model selection errors

---

### Pattern 4: Helpers & Utilities Framework

**Purpose**: Organize code into reusable, testable, independently maintainable pieces

**How It Works**:

1. **Per-request helpers**: Pure logic, stateless, reusable functions

   - Rate-limit utilities (check spacing, format times)
   - ETA calculation (predict completion time)
   - Manifest validation (check structure)
   - JSON utilities (format, parse, transform)

2. **App-wide utilities**: Stateful, shared across requests
   - Quota manager (track and enforce 20-call limit)
   - SmartPoller (queue and execute background jobs)
   - AI service wrapper (call Gemini, cache results)
   - Database layer (persist jobs, quotas, results)

**Why It Matters**:

- Testability: Test helpers independently with simple unit tests
- Reusability: Use same helper in multiple services
- Maintainability: Fix bug in one place, applies everywhere
- Performance: Optimize utility once, benefits all consumers

**Example**:

```javascript
// Per-request helper (pure logic)
function calculateETA(manifest, completedCalls, actualTimings) {
  const remainingCalls = manifest.totalRequests - completedCalls;
  const avgDuration =
    actualTimings.reduce((a, b) => a + b, 0) / actualTimings.length;
  const estimatedSeconds = (remainingCuration * avgDuration) / 1000;
  return Math.round(estimatedSeconds);
}

// App-wide utility (stateful)
class QuotaManager {
  constructor() {
    this.quota = 20;
  }
  checkQuota(cost) {
    return this.quota >= cost;
  }
  deductQuota(cost) {
    this.quota -= cost;
  }
  releaseQuota(cost) {
    this.quota += cost;
  }
}
```

**Prevents**: Code duplication, testing bloat, hard-to-find bugs

---

### Pattern 5: Smart Polling & ETA Management

**Purpose**: Give clients progress visibility without blocking; enable accurate completion estimates

**How It Works**:

1. Client polls server with `resultId` (typically every 2-3 seconds)
2. Server returns status: "QUEUED" → "PROCESSING" → "COMPOSING" → "COMPLETE"
3. Server includes **ETA** (estimated seconds remaining)
4. Server includes **progress** (calls completed, steps done)
5. Server includes **status details** (current step, what's being done)
6. Client displays progress bar and updates ETA on each poll

**Why It Matters**:

- User experience: Progress feedback beats empty blank screen
- Accuracy: Manifest-based ETAs predict within 20% of actual time
- Robustness: Polling can continue indefinitely (no infrastructure timeout)
- Flexibility: Client can adjust polling frequency based on ETA

**Accuracy in Production**:

- ETA computation accuracy: Within 20% tolerance ✅
- Light_3-page_AN validation: ETAs matched real execution timing

**Example**:

```javascript
// Client polls
GET /api/ebook/status/d4f0b193-be64-4366-aaf7-cfb0f0ef21ac

// Server returns progress
{
  status: "PROCESSING",
  progress: { completed: 1, total: 4 },
  eta: 35,  // 35 seconds remaining
  details: { currentStep: "Opening chapter", percentComplete: 25 }
}

// Client displays
Progress: ████░░░░░░ 25%
ETA: ~35 seconds remaining

// Next poll (3 seconds later)
{
  status: "PROCESSING",
  progress: { completed: 2, total: 4 },
  eta: 27,  // ETA updated
  details: { currentStep: "Middle chapters", percentComplete: 50 }
}
```

**Prevents**: Client timeouts, user perception of hanging, missed completions

---

## How the 5 Patterns Work Together

### The Complete Flow

```
CLIENT INITIATES
     ↓
Pattern 1 (PART-A) activates
     → Returns 202 immediately ✅
     → Client unblocked (no more timeout!)
     ↓
Pattern 2 (SERVICE_MACHINE) activates
     → Service receives orchestrator
     → Service calls orchestrator to create manifest
     ↓
Pattern 3 (PART-B Orchestrator) activates
     → Validates manifest
     → Enforces rate limits (Pattern 4 helper: rateLimitUtils)
     → Executes AI calls with perfect spacing
     → Updates progress in database (Pattern 4 utility: QuotaManager)
     ↓
Pattern 4 (Helpers & Utilities) throughout
     → ETA helpers calculate progress
     → Quota utilities track consumption
     → Manifest utilities validate structure
     ↓
Pattern 5 (Smart Polling) activates
     → Client polls with resultId
     → Server returns status + ETA + progress
     → Client displays progress bar
     → Repeat until COMPLETE
     ↓
COMPLETION
     → Quota released
     → HTML composition returned
     → Client receives full result
```

### Why This Architecture Works

1. **No Timeout Risk**: Pattern 1 eliminates synchronous blocking
2. **Rate-Limit Compliance**: Pattern 3 ensures zero 429 errors
3. **Clean Code**: Pattern 2 enables independent service testing
4. **Maintainability**: Pattern 4 centralizes reusable logic
5. **User Experience**: Pattern 5 provides progress visibility

### Key Invariants

- **Always**: Every request returns 202 within 1.627ms
- **Always**: Rate-limit spacing enforced (999-1000ms between calls)
- **Always**: Quotas checked before acceptance and released on completion
- **Always**: Services don't know about each other (only orchestrator)
- **Always**: Clients can poll indefinitely (infrastructure timeout impossible)

---

## Pattern Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                   PATTERN 1: PART-A                         │
│               (Async Acceptance - 202)                      │
│              "Return immediately, don't block"              │
└────┬────────────────────────────────────────────────────────┘
     │
     ├──→ ┌─────────────────────────────────────────────────┐
     │    │     PATTERN 2: SERVICE_MACHINE                  │
     │    │  (Service Autonomy - Orchestrator Interface)   │
     │    │ "Services receive interface, stay independent" │
     │    └────┬─────────────────────────────────────────────┘
     │         │
     └─────────┼──→ ┌──────────────────────────────────────┐
               │    │  PATTERN 3: PART-B ORCHESTRATOR      │
               │    │  (Waiter Pattern - Manifest Driven)  │
               │    │ "Rate limit, schedule, track progress"│
               │    └────┬─────────────────────────────────┘
               │         │
               │         ├──→ Pattern 4 (Helpers)
               │         │    └─ Rate limit utils
               │         │    └─ ETA calculators
               │         │    └─ Manifest validators
               │         │
               │         └──→ ┌────────────────────────────┐
               │              │ PATTERN 5: SMART POLLING   │
               │              │ (Progress Visibility)      │
               │              │ "Poll for status + ETA"   │
               │              └────────────────────────────┘
               │                    ↑
               └────────────────────┘
                    (Polling returns
                     ETA from Pattern 3's
                     manifest progress)
```

---

## Production Validation

All 5 patterns have been validated in production with the Light_3-page e2e test:

| Pattern                         | Validation                                           | Result  |
| ------------------------------- | ---------------------------------------------------- | ------- |
| **Pattern 1 (PART-A)**          | HTTP 202 in 1.627ms                                  | ✅ Pass |
| **Pattern 2 (SERVICE_MACHINE)** | EbookService uses orchestrator only                  | ✅ Pass |
| **Pattern 3 (PART-B)**          | 4 API calls with 999-1000ms spacing, zero 429 errors | ✅ Pass |
| **Pattern 4 (Helpers)**         | Quota properly tracked and released                  | ✅ Pass |
| **Pattern 5 (Polling)**         | ETA accuracy within 20%, progress tracked            | ✅ Pass |

**Full Production Report**: [Light_3-page_AN.md](../../docs/design/ebookService/DATA/Light_3-page_AN.md)

---

## Detailed Pattern Documentation

For deep dives into each pattern, see:

1. **[PATTERN_1_PART_A_ASYNC_ACCEPTANCE.md](./PATTERN_1_PART_A_ASYNC_ACCEPTANCE.md)**

   - How 202 responses work
   - SmartPoller integration
   - Performance metrics
   - Edge cases

2. **[PATTERN_2_SERVICE_MACHINE.md](./PATTERN_2_SERVICE_MACHINE.md)**

   - Orchestrator interface design
   - Service implementation details
   - How to add new services
   - Testing strategies

3. **[PATTERN_3_PART_B_ORCHESTRATOR.md](./PATTERN_3_PART_B_ORCHESTRATOR.md)**

   - Orchestrator architecture
   - Manifest protocol (generation, validation, comparison)
   - Rate-limit enforcement
   - FIFO scheduling
   - Performance characteristics

4. **[PATTERN_4_HELPERS_AND_UTILITIES.md](./PATTERN_4_HELPERS_AND_UTILITIES.md)**

   - Per-request helpers catalog
   - App-wide utilities catalog
   - Creating new helpers
   - Testing patterns

5. **[PATTERN_5_SMART_POLLING_AND_ETA.md](./PATTERN_5_SMART_POLLING_AND_ETA.md)**
   - Client polling implementation
   - Server progress tracking
   - ETA computation algorithm
   - UI integration
   - Timeout prevention

---

## For Different Audiences

**If you're a frontend developer**:
→ Start with Pattern 1 (PART-A) and Pattern 5 (Polling)  
→ Then Pattern 3 (what happens server-side)

**If you're a backend developer**:
→ Start with Pattern 2 (SERVICE_MACHINE)  
→ Then Pattern 3 (PART-B Orchestrator)  
→ Then Pattern 4 (Helpers)

**If you're adding a new service**:
→ Start with Pattern 2 (SERVICE_MACHINE) to understand the contract  
→ Then Pattern 3 (PART-B) to understand how orchestrator processes manifests  
→ Then look at existing EbookService as example

**If you're debugging**:
→ Start with Pattern 5 (what client sees)  
→ Then trace through Pattern 3 (what server is doing)  
→ Then Pattern 2 (which service is involved)  
→ Then Pattern 4 (which helper is broken)

---

## Next Steps

- **For Architecture Overview**: Read [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) to see how patterns map to system components
- **For Backend Details**: Read [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) to understand Patterns 2, 3, 4 implementation
- **For Frontend Details**: Read [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) to understand Patterns 1, 5 implementation  
- **For Integration**: Read [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md) to see complete request/response lifecycle

---

**Document Status:** Active Architecture Guide (December 29, 2025)  
**Validation:** All 5 patterns confirmed in production (Light_3-page_AN.md)
## Key Takeaways

1. **No more timeouts**: Pattern 1 breaks the synchronous blocking problem
2. **Clean services**: Pattern 2 enables independent testing and evolution
3. **Rate-limit safe**: Pattern 3 ensures API compliance with safety margin
4. **Maintainable code**: Pattern 4 centralizes reusable logic
5. **Good UX**: Pattern 5 provides progress visibility

Together, these 5 patterns form a coherent system that solves the original 60-second timeout problem while maintaining code quality, testability, and user experience.

---

**Next**: Read [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) for system-wide context, or jump directly to a specific pattern document above.
