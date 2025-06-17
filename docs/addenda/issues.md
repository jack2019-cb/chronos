# Phase 1: NEXT_STEPS Implementation Plan

> **Notice:** Some or most of the to-dos below may already be implemented. For each item, you must:
>
> 1. Check if it exists.
> 2. Verify and test that it works as intended.
> 3. If not present or not working, implement and test it.

This document provides explicit, actionable steps for Phase 1. Each section is structured for immediate implementation by any coder (human or agentic).

---

## 1. App Bootstrapping

- [ ] Ensure both backend (`server/`) and frontend (`client/`) apps have minimal working code (e.g., hello world endpoint/page).
- [ ] Confirm both apps start and respond as expected.

---

## 2. Database Setup

- [ ] Configure Prisma in `server/` for PostgreSQL.
- [ ] Define initial data models in `prisma/schema.prisma` (User, Calendar, Event).
- [ ] Run migrations to create tables.
- [ ] Document DB setup in `server/README.md`.

---

## 3. Calendar Model & CRUD Endpoints

- [ ] Implement `Calendar` model in Prisma schema.
- [ ] Scaffold backend endpoints for full CRUD:
  - POST `/calendar` (create)
  - GET `/calendar/:id` (read)
  - PUT `/calendar/:id` (update)
  - DELETE `/calendar/:id` (delete)
- [ ] Add error handling and type definitions.
- [ ] Ensure database persistence for all operations.
- [ ] Write tests for all endpoints.

---

## 4. PDF Export (Basic)

- [ ] Implement a backend endpoint to export a calendar as PDF.
- [ ] Use a library (e.g., pdf-lib) for PDF generation.
- [ ] Add a test to verify PDF output.

---

## 5. GenAI API Integration (Stub/Mock)

- [ ] Scaffold a backend endpoint for GenAI integration (e.g., `/genai/suggest`).
- [ ] Implement a mock or stub response.
- [ ] Document how to replace with real integration later.

---

## 6. Developer Experience

- [ ] Update all documentation for new endpoints and setup steps.
- [ ] Ensure all scripts (`npm run dev`, `npm run test`, etc.) work from a clean checkout.
- [ ] Add or update `.env.example` files.
- [ ] Confirm linting and formatting tools are configured and passing.

---

## 7. Testing

- [ ] Write or update tests for all new features.
- [ ] Ensure at least 80% code coverage for backend logic.
- [ ] Add end-to-end tests for calendar and PDF export flows.

---

**Start with Section 1 and proceed sequentially. Each section is actionable and self-contained.**
