# feat/ebook-nat-cont — Branch README

## Purpose

Isolate the **NAT‑CONT** (Narrative Continuity) iteration so experimentation can continue with model-aware quotas, reservation semantics, batch generation, and idempotency. This branch is intended for iterative experimentation that may be replaced by a more elegant solution later.

Base branch: `fix/nat-cont-model-routing`
Status: Experimental / In progress
Owner: TBD

DO NOT MERGE TO `main` — This branch is intentionally isolated for exploration.

## Quick commands

# Run NAT-CONT tests locally (server package):

cd server
FORCE_MOCK_AI=1 npm test -- **tests**/ebookService.nat-cont.test.js

## Notes

- Add targeted tests for reservation semantics and idempotency.
- Use the reservation pattern (reserve → generate → commit/release) to avoid mid-job 202 deferrals.
- Keep commits small and focused; mark experiments clearly in commit messages.

## Related docs

- `docs/current_design/PIPELINE_SEPARATION_IMPLEMENTATION.md` — Implementation plan and guidance for these feature branches.
