## BE2 Genie — Complete Logic & Roadmap

Last updated: 2025-10-27

## Big picture (how it all works)

- Client issues a generation request (POST /prompt or POST /genie). Controller validates input and delegates to `genieService`.
- `genieService.generate(prompt)` is the canonical runtime entrypoint. It follows this high-level sequence:

  1. Optionally (feature-flag controlled) perform a read-first lookup: normalize the prompt, compute a stable key/hash, and query recent persisted prompts for a match.
  2. If a persisted AI result exists for the matched prompt, return the cached result envelope (content, copies/pages, metadata, promptId/resultId).
  3. Otherwise, delegate to a generator (demo `sampleService` or an AI orchestrator) to build canonical content and page/copy artifacts.
  4. Return the generation envelope immediately to the caller, and (best-effort) attempt to persist the prompt and AI result behind-the-scenes. Tests can optionally await persistence.

- Persistence:

  - `dbUtils` is the Prisma-backed shim that implements `createPrompt(...)` and `createAIResult(...)`. `createPrompt` computes a normalized string via `normalizePrompt()` and a stable SHA-256 `normalizedHash` and performs an atomic `upsert` keyed by `normalizedHash` to deduplicate.
  - `genieService` will fall back to the legacy `crud` implementation when `dbUtils`/Prisma is unavailable (dev/test fallback).

- Feature flags and test hooks:
  - `GENIE_PERSISTENCE_ENABLED` controls whether read-first lookup and persistence run.
  - `GENIE_PERSISTENCE_AWAIT` (test-mode) forces persistence to be awaited synchronously so tests can observe writes.
  - `genieService` exposes test injection helpers and `_lastPersistencePromise` for deterministic tests.

## What has been implemented (evidence)

- Controller delegation: `server/index.js` delegates generation requests to `genieService`.
- `server/genieService.js` fully implements the read-first + generation + best-effort persistence flow, with recovery paths for uniqueness errors and multiple fallbacks (`dbUtils`, then `crud`). Test hooks and flags are present.
- Normalization helper: `server/utils/normalizePrompt.js` is used to normalize prompt text prior to hashing and comparisons.
- Persistence shim: `server/utils/dbUtils.js` implements lazy Prisma initialization and functions: `createPrompt`, `createAIResult`, `getAIResultById`, `getPrompts`. `createPrompt` computes `normalizedHash` and uses `prisma.prompt.upsert`.
- Prisma schema & migration: `server/prisma/schema.prisma` contains `normalizedText` and `normalizedHash @unique`. A migration (`migrations/..._add_normalized_hash`) exists and includes a unique index creation step.
- Fall-back legacy persistence: `server/crud.js` remains available and is used as a fallback when Prisma isn't available.
- Seeding & smoke helpers: `server/scripts/seed-dev.js`, `seed-dev.sh`, `scripts/smoke_genie_persist_test.js`, and export smoke/in-process test helpers (`run_export_test_inproc.js`, export tests) exist and are documented in `server/README.md`.
- Dedupe script skeleton: `server/scripts/dedupe_prompts.js` exists (dry-run mode) to detect duplicate prompts by normalized hash.

## What needs implementing (gaps & risk areas)

1. Verification & test coverage

   - Targeted unit tests that assert `dbUtils.createPrompt` upsert behavior under race conditions and uniqueness constraint recovery are missing. Current tests and smoke scripts exist but don't simulate concurrent upsert failure + recovery.
   - CI job(s) that bring up Postgres and run Postgres-backed concurrency/integration tests are not visibly configured.

2. Data migration for existing duplicates

   - Migration adds a unique index on `normalizedHash` and will fail if duplicates exist. A safe and tested dedupe/apply workflow is required to prepare production data (reassign ai_result rows, delete duplicates, or merge rows) before enforcing the unique constraint.

3. Export-from-persisted-content enforcement

   - Design docs require exports to be derived from persisted canonical content (for auditability/dedupe). There is documentation and export tests, and `genieService` returns `promptId`/`resultId` when persisted, but the runtime rule "exports must call persisted read" is not programmatically enforced. An explicit `getPersistedContent(promptId)` API or an ExportService that reads persisted data should be implemented and tested.

4. CI/automation and stress testing

   - A reproducible CI workflow that brings up Postgres, runs concurrency stress tests, and validates dedupe/upsert behavior is needed.

5. Observability and production safeguards

   - Structured logging, metrics (export/persistence errors, dedupe events, persistence latency), and alerts are not integrated. Basic job metrics and log-rotation exist, but production-grade observability should be added.

6. Dedupe apply tooling
   - `dedupe_prompts.js` is a skeleton. The apply-path (reassigning ai_results, deleting duplicates, backups, safety checks) must be implemented and tested against staging snapshots.

## Actionables (what to do, acceptance criteria, estimates)

Priority A — make persistence safe & tested

1. Add unit/integration test(s) for `dbUtils.createPrompt` upsert + recovery

   - Work: create Vitest unit that mocks Prisma to simulate unique constraint error on `upsert` and validate recovery path (getPrompts fallback) in `genieService` as well as direct tests of `dbUtils.createPrompt` behavior via a test harness that uses a Postgres test DB.
   - Acceptance: tests reproducibly pass locally and in CI; demonstrates behavior when two concurrent creations race (one succeeds, other recovers to existing id).
   - Estimate: 4–8 hours (write tests, mock Prisma, run locally, add docs).

2. Add a CI job for Postgres-backed tests and concurrency validation
   - Work: GitHub Actions workflow that brings up Postgres service, runs `npm --prefix server run test:run` with a small concurrency stress test that performs multiple concurrent POST /genie requests and verifies at-most-one-prompt per normalizedHash created and no crashes.
   - Acceptance: workflow runs, passes, and artifacts (test logs) available. Job must include `GENIE_PERSISTENCE_ENABLED=1` and replicate AWAIT flag where appropriate for deterministic checks.
   - Estimate: 6–12 hours (workflow authoring, small test harness, iteration on flaky cases).

Priority B — Prepare database for unique index

3. Implement safe dedupe apply in `server/scripts/dedupe_prompts.js`
   - Work: extend skeleton to implement non-dry-run steps: for each hash with >1 prompt, choose canonical record (earliest createdAt), reassign `aIResult.promptId` rows from duplicates to canonical prompt id, optionally merge metadata, then delete duplicate prompts. Add a `--preview` (dry-run) and `--apply --backup` mode that creates SQL dumps of affected rows before mutation.
   - Acceptance: script when run with `--preview` shows exact SQL or planned actions; when `--apply --backup` it writes backup files, performs changes on staging snapshot, passes verification tests (export reads canonical content) and logs all changes.
   - Estimate: 8–16 hours (careful DB work, test on staging snapshot, add rollbacks and safety checks).

Priority B — Enforce export-from-persisted rule

4. Implement `getPersistedContent(promptId)` and audit export paths
   - Work: add a small API in `genieService` (or a thin ExportService) that reads canonical content and builds PDF-ready HTML from persisted AI result (or prompt+ai_result join). Update export handlers to call it. Add tests verifying export output equals persisted canonical content when `promptId` supplied.
   - Acceptance: export tests assert that exported PDF artifacts include metadata linking to `promptId`/`normalizedHash` and read content only from DB when `EXPORT_ENABLED` is set.
   - Estimate: 6–12 hours (service + tests + minor export adjustments).

Priority C — Observability & operational readiness

5. Add structured logging and metrics instrumentation

   - Work: standardize logs (JSON), add counters for persistence success/failure, dedupe events, persistence latency; expose Prometheus endpoint or push metrics; add lightweight dashboards/alerts for persistence failures.
   - Acceptance: metrics are emitted in test runs and CI artifacts show counters; documented in `server/README.md` with env and deployment notes.
   - Estimate: 8–16 hours (pick a small metrics client, instrument points, add runbook notes).

6. Add concurrency stress harness (optional but recommended)
   - Work: small script that fires N parallel POST /genie requests with identical prompt payload to verify only one prompt row created and no duplicate AI results persisted. Use local Postgres or CI job.
   - Acceptance: harness demonstrates correct behaviour; added to CI as optional smoke.
   - Estimate: 4–8 hours.

Operational tasks (small)

- Update README to include exact CI env vars and run commands for the new workflows — 1–2 hours.
- Add test matrix entry in `WORKFLOWS.md` (or GitHub Actions) to run the Postgres concurrency tests — 2–4 hours.

## Minimal immediate plan (first 2 days)

Day 0–1 (2–8 hours)

- Write unit test mocking Prisma to verify `dbUtils.createPrompt` upsert success and uniqueness-recovery path. (4–8h)
- Add concurrency stress harness script (simple parallel POST test). (2–4h)

Day 1–2 (6–12 hours)

- Add GitHub Actions workflow that brings up Postgres and runs the new tests (CI iteration and stabilization). (6–12h)

Follow-up week (8–24 hours)

- Implement the `dedupe_prompts.js` apply path and prove it on staging snapshot (8–16h).
- Implement `getPersistedContent` and audit export logic; make export tests assert persisted source (6–12h).

## Where to begin (concrete next step I can take now)

- I can author the Vitest unit that mocks Prisma and asserts the upsert + recovery logic in `genieService` and `dbUtils.createPrompt`. This is a fast, high-value step that will catch regressions and let CI rely on deterministic behavior.

If you want I will create that unit test next. Otherwise, I can scaffold the GitHub Actions job or flesh out the dedupe apply script first.

---

Files & places to look while implementing:

- `server/genieService.js` — generation + persistence logic
- `server/utils/dbUtils.js` — Prisma upsert & helper functions
- `server/prisma/*` — schema and migrations
- `server/scripts/dedupe_prompts.js` — existing skeleton
- `server/scripts/*` — seeder and smoke helpers
- `server/__tests__/` — add Vitest tests and harness

End of plan.
