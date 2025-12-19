# PIPELINE SEPARATION — Implementation Plan

**Date**: December 16, 2025 @ 10:50AM  
**Last Updated**: December 17, 2025  
**Purpose**: Pipeline separation implementation using two feature branches from `feat/ebook-revert`: `feat/ebook-legacy` (legacy sequential) and `feat/ebook-nat-cont` (NAT-CONT iteration).

---

## Summary (one line)

Two feature branches created from `feat/ebook-revert`: `feat/ebook-legacy` (legacy sequential) and `feat/ebook-nat-cont` (NAT-CONT iteration). Branches are actively deployed with incremental commits.

---

## Goals 🎯

- Move fast with minimal blast radius (feature-level work, not a full project).
- Keep commits small and verifiable.
- Ensure safe tests, staging validation, and quick rollback.

---

## What we will do (short checklist)

- [x] Create branches from `feat/ebook-revert`:
  - [x] `feat/ebook-legacy` — legacy sequential, minimal NAT‑CONT toggles.
  - [x] `feat/ebook-nat-cont` — NAT‑CONT iteration (reservation, batching, idempotency).
- [x] Add implementation docs to each branch and commit.
- [x] No PRs to `main`; branches reviewed/iterated in-place.
- [x] Add minimal instrumentation (timestamps) to `server/ebookService.js` and `server/geminiClient.js`.
- [x] Add unit tests & smoke test scaffolds (legacy unit test, NAT‑CONT tests validated).
- [ ] Deploy each branch to isolated staging and run smoke tests (local tests passing).
- [ ] Iterate with small focused changes until features stabilize (work continues in the feature branches).

---

## Status (current)

- **Branches created & pushed**: ✅ `feat/ebook-legacy`, `feat/ebook-nat-cont` (both branched from `feat/ebook-revert`).
- **Docs**: ✅ Implementation docs committed; per-branch READMEs at `docs/BRANCHES/feat-ebook-legacy.md` and `docs/BRANCHES/feat-ebook-nat-cont.md`.
- **Instrumentation**: ✅ Timing logs added to `server/geminiClient.js` and `server/ebookService.js` (processingTimeMs in metadata).
- **Tests**: ✅ `server/__tests__/ebookService.legacy.test.js` (legacy). NAT‑CONT test suite (`server/__tests__/ebookService.nat-cont.test.js`) passes. All tests passing locally.
- **No PRs to main**: ✅ By design; branches iterated in-place.
- **CI / Staging**: ✅ Local tests pass. Staging deployment pending (can proceed when ready).
- **Baseline Reference**: ✅ `fix/nat-cont-model-routing` preserved as historical reference.

**Last updated**: 2025-12-17

---

## Next immediate steps

1. Add reservation & idempotency tests to `feat/ebook-nat-cont` (recommended next priority).
2. Add a 60s‑boundary smoke test that mocks Gemini delays and validates client behavior and persisted results.
3. Deploy each branch to isolated staging and run smoke tests (if staging available).
4. Add monitoring dashboards for processingTimeMs and quota reservation metrics.

---

---

## Branch creation commands (run from repo root)

```bash
# Branches already created from feat/ebook-revert:
git fetch origin

# To work on legacy:
git checkout feat/ebook-legacy

# To work on nat-cont:
git checkout feat/ebook-nat-cont

# Reference baseline (historical):
git checkout feat/ebook-revert
```

---

## Minimal PR templates

Title (legacy):
`chore(ebook): create feat/ebook-legacy — legacy-only ebook generation`

Body (legacy):

- Purpose: Create a branch to maintain and iterate on the legacy sequential ebook generation approach.
- Scope: Add docs, tests, and small cleanup commits that remove runtime NAT‑CONT toggles.
- Acceptance criteria: Unit tests for sequential flow, smoke test for 3/8 page ebooks pass in staging.

Title (nat-cont):
`feat(ebook): create feat/ebook-nat-cont — nat-cont iteration`

Body (nat-cont):

- Purpose: Branch for NAT‑CONT experimentation (model-aware quota, reservation, batching).
- Scope: Add reservation API, idempotent result persistence, and small experiments (async job or streaming proof-of-concept).
- Acceptance criteria: Tests for reservation semantics, idempotency, and the 60s boundary smoke test pass in staging.

---

## Minimal tests (must-have)

- Unit: `ebookService` sequential path (legacy) — generate 3 and 8 page ebooks; validate expected number of gemini calls.
- Unit: `quotaTracker.reserve()` semantics (nat-cont) — reserve that fails/succeeds as expected.
- Integration: Simulate long-run flow where backend processing finishes ~50s and response is transmitted slowly; ensure client behavior (retry/status) is acceptable.

---

## Instrumentation (2–3 small changes)

Add high-level timestamps and logs:

**In** `server/ebookService.js` inside `handle(payload)`:

```js
const start = Date.now();
console.log(`[EBOOK] start: ${start} requestId=${requestId}`);
// after structure
console.log(
  `[EBOOK] structureDone at ${Date.now()} elapsed=${Date.now() - start}ms`
);
// after chapters
console.log(
  `[EBOOK] chaptersDone at ${Date.now()} elapsed=${Date.now() - start}ms`
);
// after compose
console.log(
  `[EBOOK] composeDone at ${Date.now()} elapsed=${Date.now() - start}ms`
);
```

**In** `server/geminiClient.js` in `callGemini`:

```js
const callStart = Date.now();
console.log(
  `[GEMINI] callStart model=${model} callIndex=${callIndex} at=${callStart}`
);
// on success:
console.log(
  `[GEMINI] callSuccess model=${model} elapsed=${Date.now() - callStart}ms`
);
```

Emit `processingTimeMs` into the response metadata when possible.

---

## Staging & smoke validation

- Deploy `feat/ebook-legacy` → `staging-legacy` and `feat/ebook-nat-cont` → `staging-natcont` (or run locally if staging not available).
- Run the 60s boundary smoke test:
  - Trigger an 8-page ebook generation that finishes in ~49–50s (by mocking Gemini delays if needed).
  - Observe logs: structureDone, chaptersDone, composeDone.
  - Check whether response transmission completes, client receives result, or fallback polling obtains persisted result.

---

## Rollback & safety

- Keep commits small and revertible.
- Revert PR and redeploy previous image if staging or canary fails.
- Keep `fix/nat-cont-model-routing` read-only as the reference baseline.

---

## Minimal governance

- Each PR: small scope, passing unit tests, one reviewer approval, and an integration smoke test for the 60s boundary.
- No heavy RFC needed up-front; add a short RFC only if a cross-cutting design decision is required.

---

## Next immediate steps (automatable)

1. Create `feat/ebook-legacy` and `feat/ebook-nat-cont` branches from `fix/nat-cont-model-routing` and push.
2. Commit this file to each branch and open draft PRs for both.
3. Add instrumentation commit to `feat/ebook-legacy` and create a tiny test for the sequential path.
4. Add quota reservation test & idempotency test in `feat/ebook-nat-cont`.

---

If you'd like, I can create the branches now, commit this file, and open the draft PRs (I can also add the instrumentation commits and smoke tests as follow-ups). Say the word and I’ll proceed with branch creation and PRs.
