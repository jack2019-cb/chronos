# # ChronosCraft AI – Issues (Shared Code: NEXT_STEPS Implementation Plan)

> **Notice:** Some or most of the to-dos below may already be implemented. For each item, you must:
>
> 1. Check if it exists.
> 2. Verify and test that it works as intended.
> 3. If not present or not working, implement and test it.

This document provides explicit, actionable steps for implementing the Shared Code package and npm workspaces. Each section is structured for immediate implementation by any coder (human or agentic).

---

## 1. Create Shared Package

- [x] Ensure a `shared/` directory exists at the project root.
- [x] Add a `package.json` to `shared/` with name, version, and type/module fields.
- [x] Add a `README.md` to `shared/` describing its purpose and usage.

---

## 2. Set Up NPM Workspaces

- [x] Add a `workspaces` field to the root `package.json` including `server/`, `client/`, and `shared/`.
- [x] Run `npm install` at the root to link all workspaces.
- [x] Verify that dependencies can be shared and local imports work.

---

## 3. Shared Utilities and Types

- [x] Move or create utility functions, constants, and TypeScript types used by both frontend and backend into `shared/` (e.g., `shared/utils/`, `shared/types/`).
- [x] Export these utilities/types from `shared/` so they can be imported in both `server/` and `client/`.
- [x] Update imports in `server/` and `client/` to use the shared package.

---

## 4. Developer Experience

- [x] Update documentation in `shared/README.md` with usage examples.
- [x] Ensure all scripts (`npm run dev`, `npm run test`, etc.) work from a clean checkout.
- [ ] Add or update `.env.example` files if needed for shared code.
- [ ] Confirm linting and formatting tools are configured and passing in `shared/`.

---

## 5. Testing

- [ ] Write or update tests for all shared utilities and types.
- [ ] Ensure shared code is covered by tests in both backend and frontend.

---

**Start with Section 1 and proceed sequentially. Each section is actionable and self-contained.**
