# Contributing to ChronosCraft AI

Thank you for your interest in contributing! This guide explains our workflow, coding standards, and how to get started.

## Project Structure

- `.devcontainer/` – Only for dev environment setup
- `client/` – React/Next.js frontend
- `docs/` – Project documentation (including this file)
- `infra/` – For infrastructure-as-code (IaC) or deployment configs
- `scripts/` – For automation scripts (setup, lint, test, deploy, etc.)
- `server/` – Node.js/Express backend
- `.github/` – GitHub Actions workflows

## Branching Strategy

- `main`: Stable, production-ready code
- `dev`: Ongoing development and integration
- `feature/*`: Feature branches (merge to `dev` via PR)
- `hotfix/*`: Urgent fixes (merge to `main` and `dev`)

## Pull Requests & Code Review

- Open PRs against the `dev` branch
- Ensure all checks (lint, test, CI) pass before requesting review
- Use clear, descriptive PR titles and link related issues
- At least one approval required before merging

## Local Development

- Use VS Code Dev Containers or Codespaces for a consistent environment
- Secrets (e.g., database credentials) are managed via Codespace secrets
- For local dev, copy `.env.example` to `.env` and fill in required values

## Running Tests

- **Backend:**
  - `cd server && npm test` (runs Vitest)
- **Frontend:**
  - `cd client && npm test` (runs React Testing Library)
- Add/expand tests for new features and bugfixes

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
