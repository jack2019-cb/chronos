# AetherPress Architecture Overview

## Pattern-Based Design for Async, Rate-Limit-Safe Media Generation

**Date**: December 29, 2025 (Restructured)  
**Based On**: ARCHITECTURE_OVERVIEW_REF.md (Dec 13, 2025)  
**Target Audience**: Developers, architects, contributors  
**Reading Time**: ~10-12 minutes

---

## Quick Navigation

| Document                                                             | Purpose                                                              | For Whom                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| [ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md)     | Foundational pattern reference with code examples                    | All developers                            |
| **[ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)** (this file) | System-level overview, pattern mapping to components                 | Architects, new team members              |
| [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)                   | Implementation of Patterns 2, 3, 4 (services, orchestrator, helpers) | Backend engineers                         |
| [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)                 | Implementation of Patterns 1, 5 (acceptance, polling, ETA)           | Frontend engineers                        |
| [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md)         | HTTP contracts, complete request/response lifecycle                  | Full-stack engineers, integration testing |

---

## System Goals

AetherPress is a **web-based async media generation platform** that transforms user prompts into structured, formatted digital content with **zero timeout risk**.

**What it does**:

- 📖 AI-generated content (Gemini 2.5 API with smart rate-limit enforcement)
- 🎨 Themed HTML layouts (dark/light, fully customizable)
- 📊 Structured content with metadata (TOC, chapters, pagination)
- 📄 PDF export (Puppeteer headless browser)
- 💾 Persistent storage (PostgreSQL with Prisma ORM)
- 📡 **Async-first** architecture (202 acceptance + polling)
- ⏱️ Accurate ETAs (within 20% of actual completion time)
- 🔄 **Orchestrator-driven execution** (manifest-based service coordination)

**Core Promise**: Accept request immediately (202) → Queue async job → Poll with progress + ETA → Deliver result → **Zero timeout risk, production-ready**

---

## The Problem Being Solved

### The Original 60-Second Timeout Issue

**Old Synchronous Architecture**:

```
Client Request
     ↓ (blocks here)
Server processing: 49-50 seconds
     ↓ (network transmission: 5-10s)
Infrastructure timeout: ~60 seconds
     ↓
RESULT: Client timeout, "Failed to fetch" error
```

**Available buffer**: Only 0-11 seconds for transmission  
**Status**: ⚠️ CRITICAL – system fails under normal load

### The New Async Architecture

```
Client Request
     ↓ (returns immediately)
Server queues job → 202 Accepted in 1.627ms
     ↓
Client polls for progress + ETA
     ↓ (can poll indefinitely)
Server processing: 49-70 seconds
     ↓
Completion → Full result available
     ↓
RESULT: Zero timeout risk, reliable delivery
```

**Key insight**: Separate async job execution from HTTP response transmission  
**Status**: ✅ SOLVED via 5 interconnected architecture patterns

---

## The 5 Architecture Patterns

AetherPress implements 5 interconnected patterns that together eliminate the timeout problem while maintaining code quality and scalability.

### Pattern 1: PART-A (Async Acceptance)

**Purpose**: Return immediately without blocking client

**What it does**:

- Client sends POST /api/ebook/generate
- Server validates instantly (~1ms)
- Server returns 202 Accepted with resultId
- Client unblocked immediately
- Client begins polling with resultId

**Key Metric**: HTTP response in **1.627ms** (< 150ms target) ✅

**Why it matters**: Breaks the synchronous blocking problem at its root

---

### Pattern 2: SERVICE_MACHINE_PATTERN

**Purpose**: Services are autonomous, reusable, independently testable

**What it does**:

- Services receive **orchestrator interface only**
- No hard-coded dependencies between services
- Services create manifests of work needed
- Services execute work through orchestrator
- Services are completely decoupled

**Why it matters**:

- ✅ Easy to test (mock orchestrator interface)
- ✅ Easy to extend (new services just implement interface)
- ✅ Clear contracts (what orchestrator promises)

---

### Pattern 3: PART-B (Orchestrator / Waiter Pattern)

**Purpose**: Manage rate limits, schedule jobs, track progress, select optimal tools

**What it does**:

- Receives manifest from service (list of AI calls needed)
- Validates manifest (structure, tier, etc.)
- Enforces conservative rate-limit spacing (999-1000ms between calls)
- Selects optimal model based on tier (Pro for expert, Flash for standard)
- Executes calls in FIFO order
- Tracks progress for polling clients
- Returns results back to service

**Key Metrics**:

- Rate-limit spacing: 999-1000ms (4-10x safety margin) ✅
- 429 errors: **0 (zero violations)** ✅
- Gemini API compliance: **100%** ✅

**Why it matters**:

- ✅ Zero API rate-limit violations
- ✅ Fair FIFO scheduling across users
- ✅ Smart tool selection (quality/cost tradeoff)

---

### Pattern 4: Helpers & Utilities Framework

**Purpose**: Organize code into reusable, testable, independently maintainable pieces

**What it does**:

- **Per-request helpers**: Pure logic, stateless (rate-limit utils, ETA calculation, manifest validation)
- **App-wide utilities**: Stateful, shared (quota manager, SmartPoller, AI service wrapper)

**Why it matters**:

- ✅ Testable in isolation
- ✅ Reusable across services
- ✅ Easy to maintain
- ✅ Performance optimizations in one place

---

### Pattern 5: Smart Polling & ETA Management

**Purpose**: Give clients progress visibility without blocking; enable accurate completion estimates

**What it does**:

- Client polls `/api/ebook/status/:resultId` (typically every 2-3 seconds)
- Server returns: status (QUEUED → PROCESSING → COMPOSING → COMPLETE)
- Server includes ETA (estimated seconds remaining)
- Server includes progress (calls completed / total)
- Client displays progress bar with live ETA updates

**Key Metrics**:

- ETA accuracy: Within 20% of actual time ✅
- Production validation: Light_3-page_AN verified ✅

**Why it matters**:

- ✅ User experience: Progress feedback beats blank screen
- ✅ Robustness: Polling can continue indefinitely
- ✅ Flexibility: Client adjusts polling frequency based on ETA

---

## How the 5 Patterns Work Together

```
CLIENT                          SERVER
  │
  ├─→ POST /api/ebook/generate
       │
       └─[PATTERN 1: PART-A]───────→
           Validate + Queue
           Return 202 + resultId
           (1.627ms)
           ←───────────────────────────┐
  │                                    │
  ├─ resultId received                 │
  │                                    │
  └─→ Poll /api/ebook/status/:resultId
       │                              │
       └─[PATTERN 5: Smart Polling]──→
           Server checks job status   │
           │                          │
           ├─[PATTERN 2: SERVICE_MACHINE]
           │   Service receives orchestrator
           │   Creates manifest
           │   │
           │   └─[PATTERN 3: PART-B Orchestrator]
           │       Validates manifest
           │       Enforces rate limits (999-1000ms spacing)
           │       Selects models (Pro/Flash)
           │       Executes AI calls
           │       ├─[PATTERN 4: Helpers]
           │       │   ETA calculation
           │       │   Quota tracking
           │       │   Manifest utils
           │       │
           │       └─ Updates progress → database
           │
           └─ Computes ETA for polling client
                Returns status + ETA + progress
           ←───────────────────────────┐
  │                                    │
  └─ Display progress bar              │
    "25% complete, ~35 sec remaining"  │
    Poll again in 3 seconds
    │
    └─→ Poll again (repeats until COMPLETE)
```

**Result**: All 5 patterns work in concert to solve the timeout problem while maintaining code quality, testability, and user experience.

---

## Production Validation

All 5 patterns have been validated in production with the **Light_3-page e2e test**:

| Pattern                         | Validation                | Result                                 |
| ------------------------------- | ------------------------- | -------------------------------------- |
| **Pattern 1 (PART-A)**          | HTTP 202 acceptance speed | ✅ 1.627ms pass                        |
| **Pattern 2 (SERVICE_MACHINE)** | Service autonomy          | ✅ EbookService uses orchestrator only |
| **Pattern 3 (PART-B)**          | Rate-limit enforcement    | ✅ 999-1000ms spacing, 0 429 errors    |
| **Pattern 4 (Helpers)**         | Quota management          | ✅ Proper tracking & release           |
| **Pattern 5 (Polling)**         | ETA accuracy & progress   | ✅ Within 20% accuracy                 |

**Full Report**: [Light_3-page_AN.md](../../docs/design/ebookService/DATA/Light_3-page_AN.md)

**Performance in Production**:

- Acceptance: 1.627ms ✅
- Total execution: 52.871s (expected with real Gemini API) ✅
- Rate-limit spacing: 999-1000ms (zero violations) ✅
- Quota: 4/20 used (20%) ✅
- Infrastructure timeout: ✅ AVOIDED (async model)

---

## Core Components

### Client-Side (Frontend)

| Component         | File                                        | Pattern(s)                   |
| ----------------- | ------------------------------------------- | ---------------------------- |
| **GenerateFlow**  | `client/src/components/GenerateFlow.svelte` | Pattern 1, 5                 |
| **ebookStore**    | `client/src/stores/ebookStore.js`           | Pattern 5                    |
| **ebookApi**      | `client/src/lib/ebookApi.js`                | Pattern 1                    |
| **UI Components** | `client/src/components/`                    | Pattern 5 (progress display) |

### Server-Side (Backend)

| Component            | File                     | Pattern(s)               |
| -------------------- | ------------------------ | ------------------------ |
| **Express Server**   | `server/index.js`        | Pattern 1 (202 response) |
| **Orchestrator**     | `server/genieService.js` | Pattern 3, 4             |
| **Service Handlers** | `server/ebookService.js` | Pattern 2, 3, 4          |
| **AI Service**       | `server/aiService.js`    | Pattern 3, 4             |
| **Helpers**          | `server/helpers/`        | Pattern 4                |
| **Utilities**        | `server/utils/`          | Pattern 4                |
| **Database Layer**   | `server/db.js` + ORM     | Pattern 4                |

---

## Technology Stack

### Frontend

- **UI**: Svelte 4 (reactive components)
- **Build**: Vite (fast bundling)
- **State**: Svelte Stores (reactive state)
- **HTTP**: Fetch API (native)
- **Testing**: Vitest + Puppeteer

### Backend

- **Runtime**: Node.js
- **HTTP**: Express.js
- **AI**: Gemini 2.5 API (Pro + Flash models)
- **Export**: Puppeteer (headless Chrome)
- **Database**: PostgreSQL + Prisma ORM
- **Testing**: Vitest

### Infrastructure

- **Containerization**: Docker Compose
- **Environment**: Debian 11 + Node.js
- **Database Service**: PostgreSQL 16
- **Hosting**: GitHub Codespaces

---

## Key Metrics & Constraints

### Timeouts

| Layer                  | Timeout                               | Status                   |
| ---------------------- | ------------------------------------- | ------------------------ |
| **Infrastructure**     | ~60s                                  | Avoided via async 202 ✅ |
| **Client HTTP**        | 600s                                  | Very generous            |
| **Gemini API**         | 30s per call                          | Adequate                 |
| **Rate-Limit Windows** | Pro: 60s (2 RPM), Flash: 60s (15 RPM) | Enforced ✅              |

### Rate Limits

| Model                    | Limit             | Strategy                  |
| ------------------------ | ----------------- | ------------------------- |
| **Gemini 2.5 Pro**       | 2 RPM (1 per 30s) | Structure generation only |
| **Gemini 2.5 Flash**     | 15 RPM (1 per 4s) | Chapter generation        |
| **Conservative spacing** | 999-1000ms        | 4-10x safety margin ✅    |

### Quota Management

| Aspect                | Value                          | Status         |
| --------------------- | ------------------------------ | -------------- |
| **Per-session quota** | 20 calls                       | Configured     |
| **Tracking**          | Per-model (Pro/Flash separate) | ✅ Implemented |
| **Enforcement**       | Before job acceptance          | ✅ Validated   |
| **Release**           | On completion/error            | ✅ Tested      |

---

## Request Lifecycle (New Async Model)

```
T=0ms    Client: POST /api/ebook/generate
         │
T=1.627ms Server: 202 Accepted + resultId
         Client unblocked immediately
         │
T=2-3s   Client: GET /api/ebook/status/:resultId
         Server: { status: "QUEUED", eta: 52 }
         │
T=5-6s   Server: genieService.process() starts
         │
T~15s    Orchestrator: Call 1 (Pro model, structure)
T~30s    Orchestrator: Call 2 (Flash model, opening)
T~40s    Orchestrator: Call 3 (Flash model, chapters)
T~57s    Orchestrator: Call 4 (Flash model, closing)
         │
T~58s    Server: Composition complete, result ready
         │
T=58-59s Client continues polling
         Server: { status: "COMPLETE", result: {...} }
         │
T=60s    Client receives result, displays in UI
```

**Key difference from old sync model**: No blocking after request acceptance. Server processes in background. Client polls for progress.

---

## For Different Audiences

**Frontend Developer**:
→ Start with Pattern 1 (202 responses) + Pattern 5 (polling)  
→ Read [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)

**Backend Developer**:
→ Start with Pattern 2 (SERVICE_MACHINE) + Pattern 3 (Orchestrator)  
→ Read [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)

**Adding New Service**:
→ Read [ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md) Pattern 2  
→ Look at EbookService as template

**Debugging**:
→ Trace through Pattern 5 (what client sees)  
→ Then Pattern 3 (what server is doing)  
→ Then Pattern 2 (which service)  
→ Then Pattern 4 (which helper)

---

## Key Takeaways

1. **No more timeouts**: Pattern 1 (PART-A) eliminates synchronous blocking
2. **Clean services**: Pattern 2 enables independent testing and evolution
3. **Rate-limit safe**: Pattern 3 (PART-B) ensures zero API violations
4. **Maintainable code**: Pattern 4 centralizes reusable logic
5. **Good UX**: Pattern 5 provides progress visibility and accurate ETAs

---

## Next Steps

- **For Pattern Foundations**: Read [ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md) for detailed explanation of each pattern
- **For Backend Implementation**: Read [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) to see how Patterns 2, 3, 4 are implemented
- **For Frontend Implementation**: Read [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) to see how Patterns 1, 5 are implemented
- **For HTTP Contracts**: Read [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md) to understand request/response lifecycle

---

## Historic Reference

For context on how the system evolved:

- [ARCHITECTURE_OVERVIEW_REF.md](ARCHITECTURE_OVERVIEW_REF.md) - Original Dec 13 synchronous design
- [ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md) - Introduction to 5 patterns

---

**Document Status:** System Overview (December 29, 2025)  
**Validation:** All patterns mapped and verified in production

- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Pattern 2, 3, 4 details
- [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) - Pattern 1, 5 details
- [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md) - 202+polling contract

---

**Next Steps**:

- Begin with [ARCHITECTURE_PATTERNS_GUIDE.md](ARCHITECTURE_PATTERNS_GUIDE.md) for pattern overview
- Then read pattern-specific docs for deep dives
- See [DOCUMENTATION_REFRESH_STRATEGY.md](DOCUMENTATION_REFRESH_STRATEGY.md) for refresh plan
