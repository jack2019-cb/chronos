# AetherPress Architecture Roadmap: Executive Summary — REVISED

**Date**: December 24, 2025 @ 12:25PM
**Status**: Revised — replaces historical roadmap (read-only archive preserved)

**Audience**: Architects, Tech Leads, Implementation Engineers

---

This document supersedes the previous `ARCHITECTURE_ROADMAP_EXECUTIVE.md` and contains a focused, implementation-oriented revision for Pattern 3: PART-B Orchestrator (Waiter Pattern). The rest of the original document remains valid as historical context.

## Executive Summary (abridged)

The original roadmap remains the foundation: move from synchronous, tightly-coupled service execution to an asynchronous, manifest-driven orchestration model that prevents infrastructure timeouts, eliminates rapid-fire quota errors, and yields highly reusable services. This revised document preserves those goals while expanding PART-B to specify a deterministic, testable, and implementable orchestration contract.

Key outcomes of this revision:

- Deterministic per-request scheduling contract (`computeSchedule`) that returns: per-call timeline, ETA, and reservations.
- Clear manifest schema and helper responsibilities (timingResolver, fifoScheduler, token-bucket adapter).
- Integration notes for `smartPoller`, `statusManager`, and `aiService` to consume the schedule with graceful 429 handling.

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

## Appendices (short)

- Example computeSchedule output (3-call manifest)

```json
{
  "schedule": [
    {
      "requestId": "r1",
      "model": "pro",
      "scheduledAtMs": 1700000000000,
      "estimatedDurationMs": 1200
    },
    {
      "requestId": "r2",
      "model": "pro",
      "scheduledAtMs": 1700000000250,
      "estimatedDurationMs": 1100
    },
    {
      "requestId": "r3",
      "model": "flash",
      "scheduledAtMs": 1700000000350,
      "estimatedDurationMs": 900
    }
  ],
  "etaMs": 3500,
  "estimatedCompletionAt": "2025-12-24T00:00:03.500Z",
  "summary": { "totalCalls": 3, "totalTokens": 45 }
}
```

For full implementation details, see helpers and tests planned in the repo: `server/helpers/timingResolver.ts` (computeSchedule) and tests under `__tests__`.

---

**Approval**: This revised document is the authoritative implementation roadmap for PART-B. Proceed with implementation tasks as outlined in the todo list.
