# AetherPress Architecture - PERF-VALIDATE Implementation: Fix Plan

**Date**: December 23, 2025 @ 4:10PM
**Branch**: `PERF-VALIDATE_Fixes`

**REFERENCE**: `PERF-VALIDATE_ROOT_CAUSE_ANALYSIS.md`

---

Purpose: describe the concrete implementation changes, tests, and instrumentation to definitively address the remaining PERF-VALIDATE failures while preserving the canonical design.

- **Goal**: bring failing tests into alignment by (A) fixing urgent runtime & state bugs, (B) adding instrumentation so ETA and call counts are measurable, and (C) reconciling tests to the canonically-designed manifest-driven scheduling (or document and approve any test-change).

- **Concrete code fixes (apply in order)**:

  1. **Preserve caller `resultId` in PART-A / entrypoint**
     - Accept `payload.resultId` from the request and pass it through to the orchestrator/workers so updates map to the same task id.
     - Files: `server/index.js`, `server/genieService.js` (or `process()` caller).
  2. **Harden status store (`smartPoller`/status manager)**
     - When updates arrive for unknown `resultId`, create a placeholder task with reasonable defaults (status: 'accepted', progressPercent: 0) rather than dropping updates.
     - Coerce `eta` to numeric; clamp negative/NaN values.
     - Files: `server/utilities/smartPoller.js`, `server/helpers/statusManager.js`.
  3. **Coerce and validate content types early**
     - Ensure `chapter.content` and other text fields are converted to strings before calling `.replace()` or similar string methods.
     - Files: `server/genieService.js`, `server/services/ebookService.js` (compose path).
  4. **Skip or stabilize rate-limiter during test runs**
     - Make rate-limiter a no-op when `NODE_ENV === 'test'` or when `DISABLE_RATE_LIMIT` is set to avoid 429 noise.
     - Files: `server/index.js`, middleware surrounding rate-limit.
  5. **Expose `totalRequests` and schedule telemetry from `timingResolver`**
     - Return `totalRequests` along with `schedule` and `totalEta`.
     - Files: `server/helpers/timingResolver.js`.
  6. **Instrument orchestrator to log schedule slots & per-call durations**
     - Add debug/telemetry logs for computed `schedule`, `totalRequests`, and measured per-call durations; aggregate into a short timing summary emitted to logs and fingerprints stored in in-memory test telemetry for assertions.
     - Files: `server/orchestrator.js`.

- **Tests and test updates**:

  - **Align `calls_total` assertions**: update PERF-VALIDATE test expectations to compute `expectedCalls = manifest.sequence.length` (or the canonical manifest-driven formula), or add a test helper that derives the expected value from the manifest used by the fixture.
  - **Add instrumentation assertions**: assert `totalRequests` is present and matches `calls_total` in status output; assert schedule length and that per-call durations sum close to observed runtime.
  - **Add race-condition test**: simulate update arriving before placeholder creation and assert the status store creates a placeholder and retains updates.
  - **Add unit tests for `timingResolver`**: cover several manifest shapes and assert `totalRequests`, per-call spacing, and `totalEta` calculation.

- **ETA calibration & measurement plan**:

  1. Instrument a controlled test run to record measured per-call durations (mocked `aiService` or network mocks) and the wall-clock time for each slot.
  2. Compute average per-tier latencies and spacing; compare against `modelLatencies` and `modelSpacing` constants.
  3. Adjust `modelLatencies` and `modelSpacing` (or add a `calibrationFactor`) so that `timingResolver.totalEta` falls within ±20% of the observed wall-clock durations for canonical fixtures.
  4. Re-run PERF-VALIDATE and record before/after metrics in `docs/PERF-VALIDATE_FIXES.md`.

- **Instrumentation & observability**:

  - Emit `timingResolver` output as an object in logs: `{totalRequests, scheduleSlots, totalEta}`.
  - Capture per-call durations and total wall-clock duration in a test-only in-memory telemetry collector accessible by perf tests.
  - Prefer structured logs (JSON) for easy assertion in tests.

- **Documentation / governance**:

  - If tests will be changed to match manifest-driven behavior, update `docs/ROADMAP_ADDENDUM_PERF_VALIDATE.md` and add an explicit design note describing the canonical formula and rationale.
  - If design changes are proposed instead, create a short RFC and record stakeholder approval before modifying implementation or tests.

- **Rollback & safety**:

  - Apply changes on branch `PERF-VALIDATE_Fixes` (current branch). Keep commits small and focused so any individual change can be reverted.
  - Run unit tests for changed modules first (`timingResolver`, `smartPoller`, `genieService`) before full perf runs.

- **Acceptance criteria**:
  - `totalRequests` present in status output and matches the count used by tests.
  - No runtime type errors from `compose()` in perf runs.
  - ETA error within ±20% on canonical 3-page and 5-page fixtures.
  - No 429s or rate-limit-induced variability in test runs when run in `test` env.

---

File created as the canonical implementation plan to complete the remaining fixes and to be referenced in the next session.

---

ADDENDUM — Design-first suggestions

Purpose: capture a minimal, design-first set of suggestions that preserve the manifest-driven FIFO design while making tests deterministic and production ETAs reliable.

- Enforce pure-arithmetic ETA in `timingResolver`:

  - `totalEta` must be computed solely from the manifest sequence using injected constants: `modelLatencies`, `modelSpacing`, and `fixedOverheads`.
  - Make these constants configurable via a single `timingConfig` object so tests can inject deterministic values.

- Tests should derive expectations from the manifest (not hard-coded formulas):

  - Update PERF-VALIDATE fixtures to compute `expectedCalls` and `expectedEta` using the same `timingConfig` the server uses in `test` mode.
  - This guarantees CI determinism and aligns tests with the canonical design.

- Make runtime calibration optional and opt-in:

  - Provide a `calibration` module that, when enabled (env var or config flag), measures a small warm-up batch and computes a `calibrationFactor` applied to `timingConfig` in production only.
  - Keep calibration disabled in `test` to preserve deterministic CI runs.

- Keep the orchestrator authoritative for timing and spacing:

  - Services continue to provide manifests (the “what”); the orchestrator remains the single source of truth for `eta`, `totalRequests`, and scheduling decisions (the “when”).

- Telemetry and logging contract (minimal):

  - `timingResolver` output: `{ totalRequests, scheduleSlots, totalEta, timingConfigUsed }`
  - `orchestrator` emits per-call timings: `{ callIndex, tier, scheduledAt, dispatchedAt, finishedAt, durationMs }` (test-only collector available for assertions)

- Recommended immediate actions (3-step):
  1. Wire `timingConfig` into `timingResolver` and allow injection via test fixtures. Update PERF-VALIDATE to use it. (Small, deterministic change.)
  2. Add telemetry fields above and assert them in perf tests. (Visibility for diagnostics.)
  3. Implement optional `calibration` as a separate PR and keep it disabled in CI until approved. (Production-only accuracy improvement.)

Rationale: this addendum keeps the design canonical (manifest + FIFO arithmetic) while addressing the real-world need for accurate ETAs and deterministic tests. Calibration remains optional so CI reliability is preserved.
