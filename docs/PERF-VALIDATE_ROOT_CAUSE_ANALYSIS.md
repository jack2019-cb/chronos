# AetherPress Architecture - PERF-VALIDATE Phase: Root Cause Analysis

**Date**: December 23, 2025 @ 4:10PM
**Branch**: `PERF-VALIDATE_Fixes`

**REFERENCE**: `PERF-VALIDATE_TEST_SUMMARY.md` and `PERF-VALIDATE_TEST_FAILS.md`

---

Purpose: capture the likely theoretical root causes that produced the PERF-VALIDATE failures and explain why the phase tests did not catch them earlier.

## Summary of observed failure modes:

- **Unknown task updates / missing resultId linkage**: PART-A created one `resultId` while the orchestrator/worker used a different id, causing `smartPoller`/status store to ignore updates or treat them as separate tasks.
- **Runtime type errors**: parts of the pipeline (e.g., `compose()`/chapter handling) assumed `chapter.content` was a string and threw when it wasn't.
- **Status store ordering/race conditions**: status updates arriving before the status placeholder exists were dropped or produced partial state (missing ETA/calls_total), or created inconsistent progress values.
- **Rate-limiter interference under test concurrency**: concurrent perf tests hit token-buckets/limits and produced 429 noise and timing variability that masked true scheduling behavior.
- **Manifest vs simplified formula mismatch**: tests and older walkthroughs assumed a simplified `calls_total` formula; the implementation follows manifest-driven scheduling producing different counts (e.g., a 3-page manifest yields 4 calls as designed).
- **ETA prediction model mismatch**: timing constants (`modelLatencies`, `modelSpacing`) used in `timingResolver` did not match observed mocked durations, producing ETA errors beyond the ±20% acceptance window.
- **Insufficient instrumentation**: lack of `totalRequests`, schedule telemetry, and per-call durations made it hard to measure where latencies accumulated.
- **Test environment instability**: intermittent FS/provider errors and non-deterministic mock timing in the test environment caused flakiness and partially masked regressions.

## Why the phase tests missed these issues:

- **Assumption drift between design and test**: tests expecting the simplified calls_total formula did not validate the manifest-driven sequence length; this allowed an implementation that followed the canonical manifest behavior to appear as a failure under the test's expectation.
- **Missing assertions for intermediate state**: phase tests primarily asserted final outcomes (status complete, ETA numeric) and not intermediate schedule slots or totalRequests, so partial early drops or placeholders were not well asserted.
- **Poorly instrumented timing checks**: tests measured ETA at coarse granularity without measuring per-call durations; timing model drift was not visible until aggregate ETA exceeded tolerance.
- **Race conditions and ordering**: tests executed the full end-to-end flow but did not exercise or assert on out-of-order updates (e.g., update arriving before placeholder creation), so race-induced data loss went unnoticed.
- **Test-run variability**: intermittent environmental failures (FS/provider errors, rate-limiter 429s) introduced noise; flaky runs made it difficult to reproduce and root-cause issues quickly.

## Short summary (actionable takeaways):

- Tests must be aligned to the canonical, manifest-driven design (or the design must be explicitly changed and documented).
- Add assertions and instrumentation that validate the schedule, `totalRequests`, and per-call telemetry as part of perf tests.
- Harden the status store to accept updates for unknown tasks, and coerce/validate types earlier to avoid runtime type errors.

---

File created to preserve the investigation context so future sessions resume without loss.
