# AetherPress Architecture Roadmap: Executive Summary — REVISED (Full)

**Date**: December 24, 2025 @ 12:35PM
**Branch**: `feat/ebook-nat-cont`

**Audience**: Architects, Tech Leads, Decision Makers
**Status**: Revised — authoritative implementation roadmap (historic copy preserved)

---

## Executive Summary

This revised roadmap preserves the original architecture and recommendations while providing an expanded, implementation-focused specification for Pattern 3: PART-B Orchestrator (Waiter Pattern). The changes are intentionally small and localized: PART-B now includes a deterministic scheduling contract, manifest schema guidance, runtime enforcement notes, and a clear test strategy to make implementation straightforward and auditable.

The solution still targets the same three problems:

1. Infrastructure Timeout — remove client blocking and rely on async acceptance (PART-A)
2. Rapid-Fire Quota Errors — enforce spacing via manifest-driven scheduling (PART-B)
3. Architectural Coupling — provide an orchestrator interface so services remain autonomous

The rest of the document remains functionally the same as the historical roadmap; the following sections present the original material with the revised PART-B embedded for implementation.

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

### Pattern 3: PART-B Orchestrator (Waiter Pattern) — Manifest-Driven Execution (REVISED)

Purpose

- PART-B (the Orchestrator) receives a service-declared manifest that lists required calls (tool, tier, token-estimates, idempotency, metadata) and returns a deterministic schedule before any external side-effects occur. The orchestrator then executes the schedule via utilities (aiService, persistence, smartPoller) while emitting observable progress.

Core Principles

- Manifest-First: Services declare needs up-front; orchestrator never infers or issues calls outside the manifest.
- Pure Scheduling: A side-effect-free helper computes the schedule deterministically from inputs (manifest, now, modelConfigs, options).
- Two-layer enforcement: (A) per-request reservations (schedule), (B) runtime enforcement (token-bucket, next-available) to handle drift and multi-tenant contention.
- Graceful 429 handling: honor provider `Retry-After`, escalate backoff, and update downstream schedule / ETA consistently.

Manifest Schema (recommended)

- manifest: {
  - id: string
  - requests: [{ id: string, tier: 'expert'|'standard'|'flash'|'pro', estTokens?: number, timeoutMs?: number, idempotent?: boolean, metadata?: {} }]
  - priority?: number
  - createdAt?: ISOString
}

Scheduling Contract (API)

- computeSchedule(manifest, now, modelConfigs, options) -> {
  - schedule: [{ requestId, model, scheduledAtMs, estimatedDurationMs, reason }]
  - etaMs: number,
  - estimatedCompletionAt: ISOString
  - summary: { totalCalls, totalTokens, mode }
}

Notes on Inputs

- modelConfigs: per-model capabilities and provider-declared quotas (e.g., window length, maxRequests, burst allowance).
- options: { mode: 'heuristicCooldown'|'strictQuota', cooldowns?: {expertMs, standardMs}, allowBurst?: boolean }

Algorithm (summary)

- 1. Expand manifest into a linear FIFO list (respect manifest ordering unless priority overrides exist).
- 2. Map each requested tier to a preferred model and an empirical cooldown (default heuristics: expert 250ms, standard 100ms) unless `strictQuota` mode is specified.
- 3. If `strictQuota` is requested, run a quota-reservation pass: compute sliding-window or token-bucket reservations that respect provider `maxRequests` per window.
- 4. Produce scheduledAt timestamps by merging per-model next-available times with per-call cooldowns, producing a compact, deterministic timeline.
- 5. Estimate per-call durations using modelConfigs (latency estimates) and compute ETA as the last scheduledAt + estimatedDuration.
- 6. Return the schedule object (pure) so callers and UI can rely on exact reservation times.

Scheduling Modes

- heuristicCooldown (default): fast, low-latency scheduling using empirical inter-call spacings to avoid transient 429s. Best for single-tenant predictable jobs.
- strictQuota: enforces provider-declared ceilings (token-bucket or sliding-window) guaranteeing zero violation even under contention. Best for shared/multi-tenant production.

Runtime Enforcement and Utilities

- The schedule is a reservation, not a lock. Runtime utilities must enforce it:
  - `aiService` accepts reservations and ensures calls do not execute before `scheduledAt`.
  - `token-bucket` service (app-wide) decorates `aiService` to ensure multi-request consistency and fairness.
  - When a 429 occurs, the runtime must: honor `Retry-After`, mark affected slot(s) as failed/rescheduled, compute a minimal backoff, and emit corrected ETA updates to the smartPoller/status manager.

Error & Retry Semantics

- Idempotent requests: safe to retry automatically with backoff.
- Non-idempotent requests: surface to orchestrator to decide compensation (skip, manual retry, operator action).
- 429 handling: translate provider `Retry-After` into schedule adjustments; do not treat transient 429 as a total failure unless repeated beyond a threshold.

Observability & Smart Polling

- PART-B must return the initial ETA and the full schedule to PART-A response so clients can implement `smartPoller` strategies.
- The orchestrator emits progress events: { requestId, startedAt, completedAt, status, actualDurationMs } so `statusManager` can reconcile predicted vs actual progress and present accurate ETAs.

Testing & Determinism Guarantees

- The `computeSchedule` helper is pure and fully testable given fixed `now` and `modelConfigs`.
- Unit tests should cover: FIFO ordering, cooldown heuristics, strict-quota reservations, 429-reschedule behavior, and ETA computation.

Integration Notes (where to implement)

- Helpers (per-request): `server/helpers/timingResolver.ts` — implement `computeSchedule` here.
- Runtime enforcement (app-wide): `server/utils/tokenBucket.ts`, `server/aiService.ts` — implement enforcement and `Retry-After` handling.
- Orchestrator (genieService): keep ~30 lines: call `computeSchedule`, persist schedule, hand to worker pool/aiService for execution.
- UI/status: `smartPoller` consumes initial ETA, subscribes to progress events, and updates client polling cadence.

Rollout Recommendations

- Phase 1: Implement `computeSchedule` with `heuristicCooldown` and instrument non-blocking logging of reservations.
- Phase 2: Add `strictQuota` mode and a token-bucket adapter; run load tests to validate zero 429s under realistic concurrency.
- Phase 3: Switch orchestrator default to `strictQuota` for multi-tenant production; allow per-job overrides for latency-sensitive jobs.

Migration Notes

- Preserve the existing historical roadmap file as read-only archive.
- Point project README and design references to this REVISED document for implementation guidance.

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

### ASYNC-INFRA: Foundation (Weeks 1-2) ✅ Done (See docs/current_design/ASYNC_INFRA)

- [x] Implement PART-A (async acceptance, resultId management)
- [x] Implement PART-B Orchestrator pattern (waiter interface)
- [x] Create Helpers framework (timingResolver, fifoScheduler, etc.)
- [x] Create Utilities framework (smartPoller, task assignment)

### SERVICE-AUTON: Service Migration (Weeks 3-4) ✅ Done (See docs/current_design/SERVICE-AUTON)

- [x] Refactor ebookService to use orchestrator interface
- [x] Remove hard-coded tool dependencies
- [x] Implement manifest protocol
- [x] Comprehensive testing of ebookService with new architecture

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

**Document Status**: Architecture Roadmap Complete — REVISED (implementation-focused)
**Related Documents**:

- SPEC_VS_IMPLEMENTATION_GAP.md (Problem analysis)
- SERVICE_MACHINE_PATTERN.md (Service autonomy)
- PART_A_AND_PART_B_CONCEPTUAL_FRAMEWORK.md (Solution concept)
- PART_B_ORCHESTRATOR_PATTERN_DRAFT.md (Waiter pattern)
- HELPERS_AND_ASSISTANTS_FRAMEWORK.md (Helpers/utilities distinction)

**Implementation Document**: ARCHITECTURE_IMPLEMENTATION_GUIDE.md (detailed technical specifications for engineers)
