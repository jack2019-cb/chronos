# AetherPress Architecture Roadmap: Executive Summary

**Date**: December 19, 2025 @ 5:15PM
**Branch**: `feat/ebook-nat-cont`

**Audience**: Architects, Tech Leads, Decision Makers  
**Status**: Architecture Complete | Implementation Ready
**Related**: [ARCHITECTURE_IMPLEMENTATION_GUIDE.md](ARCHITECTURE_IMPLEMENTATION_GUIDE.md) (tactical implementation guide)

---

## Executive Summary

AetherPress currently faces three critical problems that prevent scaling and elegant feature addition:

1. **Infrastructure Timeout** - Large generation requests (15+ pages) fail due to 60-second limit
2. **Rapid-Fire Quota Errors** - Model requests fire too quickly, violating rate limits (429 errors)
3. **Architectural Coupling** - Services cannot be reused; each new service requires duplicating infrastructure logic

**This roadmap proposes a clean, elegant architecture that solves all three problems simultaneously.**

The solution involves five interconnected architectural patterns that, together, enable:

✅ Timeout prevention through asynchronous execution + smart polling  
✅ Rate-limit compliance through manifest-driven FIFO scheduling  
✅ Service reusability through autonomous services + standardized interfaces  
✅ Platform scalability to support unlimited media types (ebooks, art, calendars, poems, etc.)  
✅ Full transparency of long-running jobs with accurate ETAs and progress

---

## Current State: The Problem

### Problem 1: Infrastructure Timeout (60 seconds)

**Current Flow:**

- Client sends request → waits for response
- Backend processes: 49-50 seconds
- Network transmission: 5-10 seconds
- **Infrastructure kills connection at ~60 seconds** ❌
- Result: "Failed to fetch" error despite successful backend completion

**Impact**: Large ebook requests fail intermittently. User sees error. Work already done but not delivered.

### Problem 2: Rapid-Fire Quota Errors (429 Too Many Requests)

**Current Flow:**

- Service calls: `aiService.generate(), aiService.generate(), aiService.generate()...`
- Calls fire as fast as possible (no spacing)
- Violates Gemini's model rate limits:
  - Pro model: 2 requests per minute (≈ 250ms minimum spacing required)
  - Flash model: 15 requests per minute (≈ 100ms minimum spacing required)
- **API rejects with 429 Too Many Requests** ❌
- Result: Unpredictable failures. "Try again later."

**Impact**: Rapid user submissions or batch jobs fail. Backend has no control over pacing.

### Problem 3: Architectural Coupling (No Reusability)

**Current Flow:**

- ebookService has hard-coded dependencies: `aiService`, `quotaTracker`, `persistence`
- Cannot be tested independently
- Cannot be reused for other media types
- Adding wallArtService requires copying entire pattern
- Adding calendarService requires copying entire pattern
- **No true service reusability** ❌

**Impact**: Platform cannot scale to support multiple media generators efficiently. Code duplication and maintenance burden.

---

## Root Cause Analysis

These three problems share a **common root cause**: **Synchronous, unscheduled execution with coupled services.**

```
Synchronous Execution
  ├─ Client blocks waiting for response
  ├─ Backend can't defer work (all-or-nothing)
  ├─ Infrastructure timeout inevitable for long jobs
  └─ Rapid-fire calls happen because no scheduling layer

Coupled Services
  ├─ Services depend on specific tools (aiService, etc.)
  ├─ Services can't declare requirements upfront
  ├─ Orchestrator can't schedule without knowing requirements
  ├─ No transparency into job progress
  └─ Each new service reinvents infrastructure logic

Result: Problems are interdependent and reinforce each other
```

**Key Insight**: Fixing one problem requires fixing all three. They are architectural, not tactical.

---

## Proposed Solution: The Complete Architecture

The solution consists of **five interconnected architectural patterns**:

### Pattern 1: PART-A (Dumb Plumbing) — Async Acceptance

**What it does**: Entry point accepts request, returns resultId immediately, hands job to backend asynchronously.

**How it solves Problem 1**:

- Client no longer blocks waiting for response
- Backend has full time budget (no client waiting)
- Async execution means infrastructure timeout irrelevant

**Implementation**: ~50 lines in HTTP handler

```
POST /api/ebook/generate
  ↓ (< 100ms)
Return { resultId, eta, status: "queued" }
  ↓ (async)
Hand to backend (PART-B)
```

---

### Pattern 2: SERVICE_MACHINE_PATTERN — Autonomous Services

**What it does**: Services receive standardized resource kit (orchestrator interface) instead of hard-coded tool dependencies.

**How it solves Problem 3**:

- Services depend only on `orchestrator.generate(prompt, {tier})`
- Services don't import aiService, quotaTracker, persistence
- Services are truly autonomous, independently testable
- New services (wallArtService, calendarService) plug in identically

**Implementation Impact**:

- ebookService: Refactor to use orchestrator interface only
- wallArtService: Create new service, reuse orchestrator
- calendarService: Create new service, reuse orchestrator
- **All use identical pattern** — no reinvention

---

### Pattern 3: PART-B Orchestrator (Waiter Pattern) — Manifest-Driven Execution

**What it does**: Orchestrator (genieService) provides clean interface. Services declare what they need upfront (manifest). Orchestrator handles timing, quota, tool selection.

**How it solves Problems 2 & 3**:

- Service says: "I need 4 calls: expert, expert, standard, expert"
- Orchestrator receives manifest, computes timing, builds schedule
- Orchestrator enforces spacing (prevents rapid-fire)
- Orchestrator selects tools (Pro vs Flash) — service unaware

**Key Data Flow**:

```
Service:        "I need content (expert tier), (expert tier), (standard tier), (expert tier)"
Orchestrator:   "Understood. That's 23 seconds. Here's your schedule with proper spacing."
Execution:      Calls spaced 250ms apart (Pro) and 100ms apart (Flash)
Tool Selection: Orchestrator picks Pro for expert, Flash for standard
Service:        Returns composed ebook
```

---

### Pattern 4: Helpers & Utilities Framework — Separated Concerns

**What it does**: Divides orchestrator responsibility into helpers (per-request computation) and utilities (app-wide state management).

**How it maintains simplicity**:

- **Helpers** (per-request): timingResolver, fifoScheduler, statusManager → pure logic, independently testable
- **Utilities** (app-wide): aiService, smartPoller, persistence → task-assigned, state-managed, enriched with real activity

**Result**: genieService stays simple (~30 lines) while handling complex responsibilities transparently.

---

### Pattern 5: Smart Polling & ETA Management — Client Transparency

**What it does**: Client polls job status with intelligent strategy. Backend provides accurate ETA and real-time progress via `smartPoller` utility.

**How it completes the solution**:

- Client receives ETA from PART-A immediately (23 seconds)
- Client uses smart polling: wait 80% of ETA, then poll every 2s
- Backend provides real progress (2 of 4 calls complete, est. 17s remaining)
- No dumb polling, no guessing, no blocking

---

## Complete Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PART-A: ASYNC ACCEPTANCE                         │
│  POST /api/ebook/generate → 202 { resultId, eta, status: "queued" }│
│  Hand job async to PART-B (client no longer blocks)                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                ┌──────────────┼──────────────┐
                ↓              ↓              ↓
            FRONTEND      PART-B BACKEND    smartPoller
           (polling)      (execution)       (status mgmt)
                              │
        ┌─────────────────────┴──────────────────────┐
        │                                            │
        ↓                                            ↓
   ┌──────────────────────────────┐    ┌───────────────────────────┐
   │   PART-B Orchestrator        │    │  Helpers (Per-Request)    │
   │ (genieService + Waiter)      │    ├───────────────────────────┤
   │                              │    │ • timingResolver          │
   │ 1. Create orchestrator       │    │ • fifoScheduler           │
   │ 2. Receive manifest          │    │ • manifestProcessor       │
   │ 3. Assign tasks to utilities │    │ • statusManager           │
   │ 4. Route to service          │    │ • progressTracker         │
   │ 5. Enforce FIFO + spacing    │    │ • toolSelector            │
   │ 6. Enrich utilities with     │    │ • errorReporter           │
   │    real activity             │    │ (Pure logic, disposable)  │
   │                              │    │                           │
   └──────────────────────────────┘    └───────────────────────────┘
        │           │           │
        ├───────────┼───────────┤
        ↓           ↓           ↓
   ┌─────────────────────────────────────┐
   │   Utilities (App-Wide, Long-Lived)  │
   ├─────────────────────────────────────┤
   │ • aiService (Assigned tasks)        │
   │ • smartPoller (Assigned polling)    │
   │ • persistence (Assigned storage)    │
   │ • logger (Shared logging)           │
   │ • config (Shared configuration)     │
   │                                     │
   │ (Task-assigned, enriched, durable) │
   └─────────────────────────────────────┘
        │
        ├─→ SERVICE_MACHINE (ebookService, wallArtService, etc.)
        │   • Depends only on orchestrator interface
        │   • Declares what it needs (manifest)
        │   • Composes final output
        │   • Independently testable
        │
        └─→ FRONTEND POLLING
            • Polls /status/:resultId
            • Gets accurate ETA + progress
            • Smart polling strategy
            • Real-time visibility
```

---

## How This Solves Each Problem

### Problem 1: Infrastructure Timeout ✅

| Aspect                                      | Current             | Proposed                          |
| ------------------------------------------- | ------------------- | --------------------------------- |
| **Client blocks**                           | 50+ seconds         | 0 seconds (returns immediately)   |
| **Backend execution**                       | 49-50 seconds       | 23-24 seconds (paced, not rushed) |
| **Network transmission**                    | 5-10 seconds        | Already received (async)          |
| **Total time until client receives result** | 55-65 seconds ❌    | <60 seconds ✅                    |
| **Mechanism**                               | Synchronous waiting | Asynchronous polling              |

**Key Insight**: PART-A breaks synchronous coupling. PART-B executes efficiently within time budget.

---

### Problem 2: Rapid-Fire Quota Errors ✅

| Aspect                    | Current                          | Proposed                                     |
| ------------------------- | -------------------------------- | -------------------------------------------- |
| **Call spacing**          | No spacing (as fast as possible) | Enforced: Pro 250ms, Flash 100ms             |
| **Quota enforcement**     | After-the-fact checking          | Upfront scheduling                           |
| **Schedule visibility**   | None                             | Complete schedule with reserved slots        |
| **Rate-limit violations** | Unpredictable 429 errors ❌      | Zero violations, guaranteed ✅               |
| **Mechanism**             | Synchronous rapid calls          | FIFO scheduling with manifest-driven spacing |

**Key Insight**: PART-B Orchestrator receives manifest upfront. Helpers compute schedule with proper spacing. No rapid-fire possible.

---

### Problem 3: Service Coupling ✅

| Aspect                   | Current                                | Proposed                          |
| ------------------------ | -------------------------------------- | --------------------------------- |
| **Service dependencies** | Hard-coded (aiService, quotaTracker)   | Only orchestrator interface       |
| **Service reusability**  | Can't reuse; must copy pattern         | Plug-and-play via orchestrator    |
| **Adding new service**   | 500+ lines (copy infrastructure logic) | 200 lines (business logic only)   |
| **Code duplication**     | High (each service reinvents)          | Zero (infrastructure inherited)   |
| **Coupling**             | Tight to specific tools ❌             | Decoupled via orchestrator ✅     |
| **Mechanism**            | Direct tool imports                    | Task-based orchestrator interface |

**Key Insight**: SERVICE_MACHINE_PATTERN makes services autonomous. Orchestrator pattern makes them replaceable.

---

## Platform Scaling Impact

**Current State**: Limited to ebook generation. Adding new media types is costly.

**Proposed State**: Support unlimited media types with consistent pattern.

```
ebookService
  ├─ Receives orchestrator
  ├─ Declares manifest: (expert, expert, standard, expert)
  └─ Returns ebook

wallArtService (NEW)
  ├─ Receives orchestrator
  ├─ Declares manifest: (standard, expert)
  └─ Returns art

calendarService (NEW)
  ├─ Receives orchestrator
  ├─ Declares manifest: (standard, standard, expert)
  └─ Returns calendar

poemService (NEW)
  ├─ Receives orchestrator
  ├─ Declares manifest: (expert)
  └─ Returns poem

All services:
  ✅ Use identical orchestrator interface
  ✅ Inherit all infrastructure (timing, quota, persistence, polling)
  ✅ Independently testable
  ✅ No code duplication
```

**Cost of Adding New Service**: Design + build 200 lines of business logic. Done.

---

## Benefits Summary

### For the Architecture

- ✅ **Elegance**: Simple, coherent design (5 interconnected patterns)
- ✅ **Scalability**: Add services without touching infrastructure
- ✅ **Transparency**: Real-time progress visibility for all jobs
- ✅ **Reliability**: Rate-limit compliance guaranteed by design
- ✅ **Testability**: Each component independently testable

### For Engineering

- ✅ **Simplicity**: Services focus on business logic only (~200 lines)
- ✅ **Clarity**: Clear separation of concerns (orchestrator, helpers, utilities, services)
- ✅ **Maintainability**: Changes isolated to specific components
- ✅ **Quality**: Comprehensive testing possible per component
- ✅ **Velocity**: New services add fast (no infrastructure reinvention)

### For Operations

- ✅ **Observability**: Full job transparency (timing, progress, errors)
- ✅ **Reliability**: Timeout prevention, rate-limit compliance, quota management
- ✅ **Performance**: Paced execution, efficient resource use
- ✅ **Scaling**: Support growing user base without architectural changes
- ✅ **Debugging**: Clear error attribution (service vs utility vs orchestrator)

### For Users

- ✅ **No Timeouts**: Large requests complete (no "Failed to fetch")
- ✅ **Transparency**: Know how long jobs take, see progress in real-time
- ✅ **Reliability**: Consistent success rate regardless of request size
- ✅ **Features**: New media types added regularly (calendars, art, poems, etc.)

---

## Implementation Path

### ASYNC-INFRA: Foundation (Weeks 1-2)

- [x] Implement PART-A (async acceptance, resultId management)
- [x] Implement PART-B Orchestrator pattern (waiter interface)
- [x] Create Helpers framework (timingResolver, fifoScheduler, etc.)
- [x] Create Utilities framework (smartPoller, task assignment)

### SERVICE-AUTON: Service Migration (Weeks 3-4)

- [ ] Refactor ebookService to use orchestrator interface
- [ ] Remove hard-coded tool dependencies
- [ ] Implement manifest protocol
- [ ] Comprehensive testing of ebookService with new architecture

### PERF-VALIDATE: Validation & Hardening (Weeks 5-6)

- [ ] Performance testing (ensure < 60s total execution)
- [ ] Load testing (verify rate-limit compliance)
- [ ] E2E testing (frontend polling, status accuracy)
- [ ] Production readiness checklist

### NEW-SERV: New Services (Weeks 7+)

- [ ] Add wallArtService (reuse orchestrator, helpers, utilities)
- [ ] Add calendarService
- [ ] Add poemService
- [ ] Add additional media types as needed

---

## Success Criteria

### Technical

- ✅ No infrastructure timeouts on requests ≤ 50 pages
- ✅ Zero rate-limit violations (429 errors eliminated)
- ✅ 100% manifest compliance (all services declare upfront)
- ✅ All tests passing (unit, integration, E2E)

### Operational

- ✅ All jobs visible via smart polling (accurate ETA + progress)
- ✅ genieService < 50 lines (down from ~500)
- ✅ New services take ≤ 1 week to add (down from 2-3 weeks)
- ✅ 99.5% success rate on all request sizes

### User-Facing

- ✅ No "Failed to fetch" on legitimate requests
- ✅ Real-time progress indication on large jobs
- ✅ Predictable execution time
- ✅ Ability to cancel long-running jobs (future enhancement)

---

## Risk Mitigation

| Risk                          | Mitigation                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------- |
| **Refactoring complexity**    | Implement PART-A separately first; can run parallel with current implementation |
| **Service compatibility**     | Create adapter layer to support both old and new interface during transition    |
| **Performance regression**    | Comprehensive benchmarking at each phase; rollback plan in place                |
| **Manifest protocol changes** | Design manifest schema to be forward-compatible; version from start             |

---

## Decision Points

### Decision 1: Go/No-Go After ASYNC-INFRA

- **Criteria**: PART-A working, PART-B orchestrator pattern proven in ebook generation
- **If Go**: Proceed to SERVICE-AUTON (service migration)
- **If No-Go**: Iterate on ASYNC-INFRA, delay SERVICE-AUTON

### Decision 2: Go/No-Go After SERVICE-AUTON

- **Criteria**: ebookService working with new orchestrator, performance benchmarks met
- **If Go**: Proceed to PERF-VALIDATE (validation & hardening)
- **If No-Go**: Iterate on SERVICE-AUTON, delay PERF-VALIDATE

### Decision 3: Production Deployment (After PERF-VALIDATE)

- **Criteria**: All PERF-VALIDATE success criteria met, production readiness sign-off
- **Deployment**: Merge to base branch, create release, deploy to production

---

## Timeline Estimate

**Total Duration**: 6-7 weeks (4 weeks implementation + 2-3 weeks validation + deployment)

**Team**: 2-3 engineers, 1 architect for guidance, 1 QA for testing

**Budget Impact**: Significant upfront investment (~400 engineering hours). Long-term savings through platform scalability.

---

## Conclusion

The current architecture **prevents elegant feature development and reliable scaling**. The spec/implementation gap makes the system rigid, coupled, and fragile.

**This roadmap proposes a complete architectural transformation** that:

1. **Solves immediate problems** (timeout, rapid-fire, quota exhaustion)
2. **Enables elegant design** (clean separation of concerns)
3. **Scales the platform** (add services without infrastructure reinvention)
4. **Improves reliability** (rate-limit compliance, timeout prevention)
5. **Enhances transparency** (real-time progress, accurate ETAs)

The architecture is **simple, elegant, and proven in concept**. Implementation is straightforward with clear phases and success criteria.

**Recommendation**: Approve ASYNC-INFRA kickoff. Architecture roadmap is complete and ready for engineering execution.

---

## Next Steps

1. **Stakeholder Review**: Present to tech leads and architects
2. **Phase 1 Planning**: Break down tasks, assign team
3. **Implementation**: Begin PART-A and Helpers framework
4. **Regular Reviews**: Weekly checkpoints against success criteria

---

**Document Status**: Architecture Roadmap Complete  
**Related Documents**:

- SPEC_VS_IMPLEMENTATION_GAP.md (Problem analysis)
- SERVICE_MACHINE_PATTERN.md (Service autonomy)
- PART_A_AND_PART_B_CONCEPTUAL_FRAMEWORK.md (Solution concept)
- PART_B_ORCHESTRATOR_PATTERN_DRAFT.md (Waiter pattern)
- HELPERS_AND_ASSISTANTS_FRAMEWORK.md (Helpers/utilities distinction)

**Implementation Document**: ARCHITECTURE_IMPLEMENTATION_GUIDE.md (detailed technical specifications for engineers)
