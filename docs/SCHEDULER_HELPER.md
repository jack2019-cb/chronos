# Scheduler Helper — Design, Rationale, and Implementation

**Date:** December 24, 2025 @ 12:15PM
**Branch**: `PERF-VALIDATE_Fixes`

This document captures the issue, the chosen solution (aligned with the 3-page walkthrough), and a suggested implementation for the scheduler helper ("timingResolver" / "fifoScheduler") that computes an authoritative ETA and a per-call breakdown for manifests handed to the PART-B orchestrator.

**Status**: Draft — for review by architects and engineers.

---

## Problem

- Services issuing multiple model calls in tight succession experienced provider-side 429s and unstable behavior.
- Existing code fired calls as fast as possible and relied on ad-hoc fixes; that produced two failure modes:
  - rapid-fire to the same model (consecutive calls) triggered transient throttling, and
  - long-running requests hit infrastructure timeouts when synchronous blocking was used.
- The `WALKTHROUGH_3PAGE_EBOOK_CORRECTED.md` demonstrates the desired runtime behavior: the orchestrator receives a manifest, computes an ETA and schedule, and executes paced calls so the client can poll and never block.

## Chosen Solution (summary)

- Enforce per-model constraints using two orthogonal mechanisms:
  1. Long-window quota enforcement (sliding-window or token-bucket semantics). This prevents long-run quota violations (e.g., provider daily/minute limits).

2.  Short cooldown (rapid-fire) smoothing: a small, empirically tuned cooldown (e.g., 250ms for Pro/expert, 100ms for Flash/standard) applied to same-model consecutive calls to avoid transient 429s.

- The scheduler helper computes a deterministic schedule (start/end times) and overall ETA from the manifest plus model configs. It returns both an authoritative ETA and a detailed breakdown used by downstream utilities (smartPoller, progress UI, telemetry, billing).
- Model-switching does not inherently require a delay — only the destination model's constraints (tokens/next-available timestamp) matter.

## What the Helper Must Provide (contract)

- Input:

  - `manifest`: ordered array of calls with `callIndex` and `tier`/`model`.
  - `now`: canonical server timestamp (ms epoch) or a pluggable clock.
  - `modelConfigs`: per-model config { durationMs, cooldownMs, quotaPerMin | tokenBucketParams }.
  - `mode`: `heuristicCooldown` | `strictQuota` (configurable per environment).

- Output:
  - `schedule[]`: ordered list of per-call objects:
    - `{ callIndex, tier, model, startAt, endAt, durationMs, delayReason }`
    - `delayReason` ∈ { `none`, `cooldown`, `quota`, `globalCap` }
  - `etaMs`: total time until completion (ms) relative to `now`.
  - `estimatedCompletionAt`: absolute server timestamp for job completion.
  - `totalCalls`

Notes:

- All timestamps should be absolute server times (epoch ms) to make downstream utilities deterministic and avoid client/server drift.

## Scheduling Algorithm (sequential FIFO)

1. Set `prevEnd = now`.
2. For each call in manifest (in order):
   - `baseStart = prevEnd`.
   - `quotaDelay` = earliest t ≥ `baseStart` that satisfies the model's quota (computed via sliding-window or token-bucket). If `mode === heuristicCooldown` and quota unknown, treat `quotaDelay = baseStart`.
   - `cooldownDelay` = max(0, modelNextAvailable[model] - baseStart) where `modelNextAvailable` is a short-cooldown timestamp tracked per model.
   - `start = max(baseStart, quotaDelay, cooldownDelay, globalNextAvailable)` (global caps considered).
   - `end = start + durationMs(model)`.
   - Update `modelNextAvailable[model] = start + cooldownMs(model)`.
   - Record `delayReason` from which constraint caused `start > baseStart`.
   - `prevEnd = end`.
3. `etaMs = prevEnd - now`.

Implementation may use a token-bucket for quota enforcement. For provider-supplied `Retry-After` on 429, update `modelNextAvailable[model] = now + retryAfterMs` and recompute schedule.

## Example (3-page ebook manifest)

- Manifest: `{expert, expert, standard, expert}`
- Example modelConfigs (walkthrough):

  - expert: duration=6000ms, cooldown=250ms, quota=2/min (strict)
  - standard: duration=5000ms, cooldown=100ms, quota=15/min

- Heuristic cooldown mode (walkthrough behavior):

  - call0 expert → start=now, end=now+6000
  - call1 expert → baseStart=now+6000, cooldown → start=baseStart+250, end+=6000
  - call2 standard → baseStart=..., start=previousEnd+100, end+=5000
  - call3 expert → start=previousEnd+250, end+=6000
  - ETA ≈ 23.6s (matches WALKTHROUGH)

- Strict quota mode (literal 2 req/min expert): call3 must wait until the first expert start falls outside 60s window → ETA ≈ 66s. This demonstrates the difference between heuristic and strict modes.

## API (suggested)

Synchronous interface (pure function):

```ts
type ManifestItem = { callIndex: number; tier: string; model?: string };
type ModelConfig = {
  durationMs: number;
  cooldownMs: number;
  quotaPerMin?: number;
  burst?: number;
};

function computeSchedule(
  manifest: ManifestItem[],
  now: number,
  modelConfigs: Record<string, ModelConfig>,
  options?: { mode?: "heuristicCooldown" | "strictQuota"; globalCap?: number }
): {
  schedule: Array<any>;
  etaMs: number;
  estimatedCompletionAt: number;
  totalCalls: number;
};
```

Behavior: deterministic, testable, and side-effect free. A runtime scheduler may persist `modelNextAvailable` and token-bucket state in an app-wide utility used by the orchestrator runtime.

## Implementation suggestions

- Provide two layers:
  1. Pure helper `computeSchedule` (deterministic, no side-effects) used for ETA + dry-run.
  2. Runtime `scheduler` that maintains model state (buckets, next-available timestamps), consumes tokens, and applies `Retry-After` when 429 occurs.
- Make defaults configurable via environment (cooldown defaults, burst sizes, strict vs heuristic mode).
- Expose `simulate` flag to run schedule generation without consuming bucket tokens — useful for UI ETA generation before job start.
- Emit `delayReason` for each call so the smartPoller and UI can present why the job is waiting.
- Add unit tests covering: simple manifests, model-switches, bucket exhaustion, `Retry-After` handling, and deterministic outputs.

## Observability & downstream usage

- The orchestrator exposes the helper's `etaMs` to the `smartPoller` which decides when the frontend should poll next (e.g., wait 80% of ETA then poll frequently).
- The per-call `schedule` acts as the canonical timeline for `progressTracker`, `statusManager`, and operators to trace where a job is in real time.
- Persist the computed schedule with the job metadata so status endpoints can reconstruct progress even after restarts.

---

## Next steps (recommended)

1. Approve API contract and mode choices (`heuristicCooldown` default for low-latency UX).
2. Implement `computeSchedule` (pure TypeScript) in `server/helpers/timingResolver.ts` with unit tests.
3. Implement runtime `scheduler` (consumes tokens, persists modelNextAvailable) and wire into orchestrator utilities.
4. Add example manifests and automated tests validating the WALKTHROUGH outputs.

---

References: `docs/WALKTHROUGH_3PAGE_EBOOK_CORRECTED.md` — used as the canonical example for expected behavior.
