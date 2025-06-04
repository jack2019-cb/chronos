# Contributing to ChronosCraft AI

> **Note:** For detailed issues, API reference, and historical notes, see `/docs/addenda/`.

Thank you for your interest in contributing! This guide explains our workflow and development standards.

## Getting Started

1. First, read `CONFIGURATION.md` for environment setup
2. Ensure all services are properly configured (ports, environment variables)
3. Follow the local development setup below

## Project Structure

- `.devcontainer/` – Development environment configuration with Docker
- `client/` – React/Next.js frontend (port 3000)
  - `playwright/` – Integration tests
  - `src/app/` – Next.js application code
  - `__tests__/` – Unit tests
- `server/` – Node.js/Express backend (port 5000)
  - `prisma/` – Database schema and migrations
  - `routes/` – API endpoints
  - `__tests__/` – Unit tests
  - `bin/` – Server startup configuration
- `docs/` – Project documentation
  - `addenda/` – Additional documentation, changelog, and archived issues
- `scripts/` – Development and maintenance scripts

## Local Development

1. Use VS Code Dev Containers or GitHub Codespaces
2. Copy `.env.example` to `.env` in both client and server
3. Set required environment variables (see `CONFIGURATION.md`)
4. Start services:

   ```bash
   # Terminal 1 - Backend
   cd server && npm run dev

   # Terminal 2 - Frontend
   cd client && npm run dev
   ```

## Running Tests

- **Backend:**
  - `cd server && npm test` (runs Jest)
- **Frontend:**
  - `cd client && npm test` (runs React Testing Library)
- **Integration Tests:**
  - `./start-dev.sh` (runs Playwright tests with automated server startup/shutdown)
  - Or manually: `cd client && npx playwright test --project=chromium`
- Add/expand tests for new features and bugfixes
- Integration tests are in `client/playwright/`

## Test Automation

The project includes automated test workflows:

- `start-dev.sh` script automates the integration test process:
  1. Starts backend (port 5000)
  2. Starts frontend (port 3000)
  3. Runs Playwright integration tests
  4. Gracefully shuts down servers
- CI/CD runs all test suites via GitHub Actions

## Integration & End-to-End Testing

- The `start-dev.sh` script now uses a robust HTTP check to ensure the frontend is actually serving before running integration tests.
- Playwright test selectors have been updated for reliability (e.g., using getByRole for headings).
- If you encounter a 502 error when accessing the frontend, check Codespaces port forwarding, server logs, and ensure the frontend is running and accessible at http://localhost:3000.

To run full integration tests (backend + frontend + browser automation), use the `start-dev.sh` script in the project root. This script:

- Frees up ports 3000 and 5000
- Starts backend and frontend servers, waiting for each to be ready
- Runs Playwright integration tests
- Shuts down both servers after tests complete

**Usage:**

```zsh
./start-dev.sh
```

This is the recommended workflow for verifying backend/frontend integration and running Playwright tests locally or in CI.

## Linting & Formatting

- **Backend:** `cd server && npm run lint`
- **Frontend:** `cd client && npm run lint`
- Code should be formatted with Prettier (auto-format on save is recommended)

## CI/CD

- All PRs run backend CI (lint + test) via GitHub Actions
- Additional workflows for frontend and deploys are planned

## Documentation

- Update or add docs in the `docs/` directory as needed
- API documentation is generated via Swagger/OpenAPI (see `/server/docs` endpoint when available)

## Issues & Feature Requests

- Use GitHub Issues to report bugs or request features
- Please search for existing issues before opening a new one

---

Thank you for helping make ChronosCraft AI better!
