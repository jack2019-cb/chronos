# Backend Logic Flow: /prompt to genieService — Consolidated (2025-10-23)

This document captures the current, actual implementation for the `/prompt` -> generation flow in the server. It summarizes the runtime wiring and the concrete modules in the codebase.

## High-level summary

- Controller: `POST /prompt` in `server/index.js` — validates input, delegates to `genieService.generate(prompt)`, attempts non-fatal DB persistence via `crud`, and returns a `{ success: true, data }` JSON payload.
- Service/Adapter: `server/genieService.js` — exposes `async generate(prompt)`, delegates to `sampleService.generateFromPrompt(prompt)` (awaits it), wraps result into `{ success: true, data: {...} }`, and provides helpers for file persistence.
- Business/Mock: `server/sampleService.js` — mock implementation; `async generateFromPrompt(prompt)` builds content (title/body), requests prompt save via `fileUtils.saveContentToFile(prompt)` (non-fatal), and returns `{ content, copies }`.
- Utilities: `server/utils/fileUtils.js` — async `saveContentToFile(content)` implemented with `fs.promises` and an atomic temp-write/rename helper; `readLatest()` remains available (sync) to load the latest saved prompt for legacy routes.

Implementation validated: 2025-10-24T12:00:00Z (UTC) — repository inspection confirmed the presence of the Phase 4 artifacts on branch `feature/genie-phase4-dedupe`: `server/prisma/schema.prisma` contains `normalizedHash`/`normalizedText`, the migration folder `server/prisma/migrations/20251023195558_add_normalized_hash/` exists, `server/utils/dbUtils.js` implements an upsert-based `createPrompt`, and `server/genieService.js` contains the persistence wiring. A small helper `server/utils/aiMockResponse.js` is present to build multi-page envelopes.

```
Client Request
   │
   ▼
┌────────────────────────────┐
│ POST /prompt               │
│ (Controller in server/)    │
└────────────────────────────┘
   │
   ▼
┌────────────────────────────┐        (optional, non-fatal)
│ genieService               │◀────────────────────────────────┐
│ (Service / Adapter)        │                                 │
└────────────────────────────┘                                 │
   │                                                           │
   │ calls/awaits                                             │
   ▼                                                          │
┌────────────────────────────┐                                │
│ sampleService              │                                │
│ (Business logic - async)   │── calls ──▶ fileUtils.saveContentToFile()
└────────────────────────────┘                                │
   │                                                          │
   ▼                                                          │
┌────────────────────────────┐                                │
│ server/utils/fileUtils.js  │                                │
│ (saveContentToFile / readLatest)                            │
└────────────────────────────┘                                │
```

## Backend logic: concise status (archived full doc to `docs/archive/BE2genie_logic-20251026-120000.md`)

Last updated: 2025-10-26T12:00:00Z

Purpose

- Concise record of what was implemented for the `/prompt` → generation flow, what is complete, and what remains before we enable persistence widely.

High-level flow (single line)

- POST /prompt → `server/genieService.generate(prompt)` → service builds AI response (mock/real) → optional persistence via `server/utils/dbUtils` (Prisma upsert on normalized hash) → return `{ success: true, data }`.

Completed (phases and concrete artifacts)

- Phase 0–3: feature flag `GENIE_PERSISTENCE_ENABLED`, normalization utility, controller switched to delegate to `genieService`, and test scaffolding — completed.
- Phase 4: DB dedupe and upsert — completed and merged to `aetherV0/anew-default-basic`. Concrete items present:
  - Prisma schema additions for `normalizedHash`/`normalizedText` and generated migration under `server/prisma/migrations/`.
  - `server/utils/dbUtils.js` implements upsert by normalized hash (with unit-test friendly fallback).
  - `server/genieService.js` wired to persist (behind flag) and compatibility wiring for test mode.
  - `server/utils/aiMockResponse.js` (multi-page envelope helper) and small dedupe scaffolding.

Status confidence and short note

- The Phase 4 code + migration exists and has been merged. There remains a verification gap: run full server tests and the CI Postgres concurrency job to prove the upsert/dedupe behavior under contention. Until those tests are observed green in CI/staging, consider the work implemented but not yet fully verified in production-like conditions.

Only remaining (pending) work — prioritized and succinct

1. Verify tests & CI with Postgres (highest priority)
   - Run full server test suite locally and in CI with Postgres available; ensure any test-mode wiring fixes are stable. Estimate: 0.5–1.0 hr.
2. CI Postgres concurrency validation
   - Add/verify a CI job that starts Postgres, runs `prisma migrate deploy` and the concurrency integration test that fires parallel identical prompts and asserts a single Prompt row. Estimate: 1.0–2.5 hr (write workflow + fix CI issues).
3. Add/finish unit tests for `dbUtils.createPrompt` upsert behavior (mock Prisma + fallback). Estimate: 1.0–3.0 hr.
4. Dedupe for non-empty DBs (only if any environment contains non-sample data)
   - Run `server/scripts/dedupe_prompts.js` dry-run and reconcile prior to applying unique constraint on populated DBs. (User confirmed no worthwhile data exists; if true this step is a quick verification.) Estimate: 0.5–2.0 hr if needed.
5. Gate and monitor rollout
   - Apply migrations in staging, enable `GENIE_PERSISTENCE_ENABLED=1` in staging, record baseline prompt-count, and observe for 3–6 hours. Estimate: 0.5 hr hands-on + 3–6 hr observation.

Quick reminders (useful)

- The repository includes safe fallbacks for local dev/tests (legacy `crud`/SQLite). Don't treat local green runs as proof of Postgres upsert safety — run the CI Postgres job.
- Feature flag must remain OFF in production until CI/staging verification is green.
- If you need me to add the CI workflow and concurrency test skeleton, say "Add CI job and concurrency test" and I will implement it.

Acceptance checklist (before enabling in production)

- [ ] Full server test suite passes with merged Phase 4 changes.
- [ ] CI Postgres concurrency test consistently green.
- [ ] Any non-empty DBs have been deduped or verified empty.

## Backend logic: concise status (archived full doc to `docs/archive/BE2genie_logic_2025-10-26T120000Z.md`)

Last updated: 2025-10-26T12:00:00Z

Purpose

- Concise record of what was implemented for the `/prompt` → generation flow, what is complete, and what remains before we enable persistence widely.

High-level flow (single line)

- POST /prompt → `server/genieService.generate(prompt)` → service builds AI response (mock/real) → optional persistence via `server/utils/dbUtils` (Prisma upsert on normalized hash) → return `{ success: true, data }`.

Completed (phases and concrete artifacts)

- Phase 0–3: feature flag `GENIE_PERSISTENCE_ENABLED`, normalization utility, controller switched to delegate to `genieService`, and test scaffolding — completed.
- Phase 4: DB dedupe and upsert — completed and merged to `aetherV0/anew-default-basic`. Concrete items present:
  - Prisma schema additions for `normalizedHash`/`normalizedText` and generated migration under `server/prisma/migrations/`.
  - `server/utils/dbUtils.js` implements upsert by normalized hash (with unit-test friendly fallback).
  - `server/genieService.js` wired to persist (behind flag) and compatibility wiring for test mode.
  - `server/utils/aiMockResponse.js` (multi-page envelope helper) and small dedupe scaffolding.

Status confidence and short note

- The Phase 4 code + migration exists and has been merged. There remains a verification gap: run full server tests and the CI Postgres concurrency job to prove the upsert/dedupe behavior under contention. Until those tests are observed green in CI/staging, consider the work implemented but not yet fully verified in production-like conditions.

Only remaining (pending) work — prioritized and succinct

1. Verify tests & CI with Postgres (highest priority)
   - Run full server test suite locally and in CI with Postgres available; ensure any test-mode wiring fixes are stable. Estimate: 0.5–1.0 hr.
2. CI Postgres concurrency validation
   - Add/verify a CI job that starts Postgres, runs `prisma migrate deploy` and the concurrency integration test that fires parallel identical prompts and asserts a single Prompt row. Estimate: 1.0–2.5 hr (write workflow + fix CI issues).
3. Add/finish unit tests for `dbUtils.createPrompt` upsert behavior (mock Prisma + fallback). Estimate: 1.0–3.0 hr.
4. Dedupe for non-empty DBs (only if any environment contains non-sample data)
   - Run `server/scripts/dedupe_prompts.js` dry-run and reconcile prior to applying unique constraint on populated DBs. (User confirmed no worthwhile data exists; if true this step is a quick verification.) Estimate: 0.5–2.0 hr if needed.
5. Gate and monitor rollout
   - Apply migrations in staging, enable `GENIE_PERSISTENCE_ENABLED=1` in staging, record baseline prompt-count, and observe for 3–6 hours. Estimate: 0.5 hr hands-on + 3–6 hr observation.

Quick reminders (useful)

- The repository includes safe fallbacks for local dev/tests (legacy `crud`/SQLite). Don't treat local green runs as proof of Postgres upsert safety — run the CI Postgres job.
- Feature flag must remain OFF in production until CI/staging verification is green.
- If you need me to add the CI workflow and concurrency test skeleton, say "Add CI job and concurrency test" and I will implement it.

Acceptance checklist (before enabling in production)

- [ ] Full server test suite passes with merged Phase 4 changes.
- [ ] CI Postgres concurrency test consistently green.
- [ ] Any non-empty DBs have been deduped or verified empty.
- [ ] Monitoring (prompt-count) in place and rollback plan ready.

Summary estimate to reach strong production confidence (excluding monitoring window): ~4–12 hours of focused work; add 3–6 hours observation after staging flip.

End of concise doc.

**Phase 6** — Docs, monitoring, cleanup (0.5–1 day)

- Update design docs and README
- Add structured logs and metrics
- Document final flow and feature flags

---

Last updated: October 23, 2025

## Phase 4 — completion (2025-10-24)

Status: Phase 4 work (DB dedupe via normalizedHash + upsert) is complete and merged into `aetherV0/anew-default-basic`.

Evidence / verification performed:

- Prisma schema and migration present under `server/prisma/`.
- `server/utils/dbUtils.js` implements an upsert path and exposes test helpers `_setPrisma` / `_resetPrisma` used by unit tests.
- Unit tests covering the upsert behavior exist (`server/__tests__/dbUtils.upsert.test.mjs`) and exercise normalizedHash generation.
- Local verification: `prisma generate` and migration apply were run during development; DB in dev/staging is expected to be empty for this rollout.

With Phase 4 finished, the immediate next step is a short, focused Phase 5 and a small set of follow-ups we can complete in a two-hour sprint.

## Two-hour sprint proposal (pick 1–2 items)

These tasks are scoped to be completable within a two-hour block. Pick one to start and I will implement it.

1. Finalize doc and housekeeping (20–30m)

   - Update this design doc (done), add a short PR description, and push any outstanding commits.
   - Add a small `shared/README.md` note about consolidated `test-results` artifacts.

2. Add a small concurrency integration job for CI (45–75m)

   - Add a GitHub Actions workflow `ci-postgres-concurrency.yml` that starts Postgres as a service, runs `npx --prefix server prisma migrate deploy`, and executes a single integration test that fires N parallel `POST /prompt` requests and asserts no duplicate Prompt rows are created.
   - This gives high-confidence verification that the upsert path is safe under contention.

3. Add/enable a focused integration test locally (60–90m)

   - Add `server/__tests__/concurrency.integration.test.mjs` which uses the Prisma client (requires `npx --prefix server prisma migrate dev` locally) and runs N parallel `dbUtils.createPrompt` calls with the same prompt text, asserting a single row exists.

4. Stabilize Playwright CI (30–60m)
   - Replace manual Playwright install with the official `microsoft/playwright-action` or ensure the smoke script runs from `client/` (already done) and remove any root-level artifacts; update workflows and test once.

Recommended pick for a 2-hour block

- Start with item 2 (CI Postgres concurrency job) if you want the highest confidence that Phase 4 is safe in PRs — I can implement the workflow and a small test skeleton and commit the changes.
- If you'd rather iterate locally first, pick item 3 (add the integration test) so you can run it inside the devcontainer before adding CI wiring.

Which should I start on now? If you say "Start CI job" I'll add the workflow and the integration test skeleton, commit, and run a quick YAML/linters check. If you say "Add local test" I'll add the test file and run it locally (if Postgres is available in your devcontainer), and report back with results.
