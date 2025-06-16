# ChronosCraft AI – Issues (Sprint: Bootstrapping & Dependency Management – Backend)

> This document tracks actionable, focused issues for the current backend bootstrapping sprint. Historical issues are archived.

## Backend Bootstrapping Tasks

### 1. Initialize Node.js/Express app with TypeScript in `server/`

- Set up a new Node.js/Express project in the `server/` directory using TypeScript.
- Ensure the app runs with `npm run dev` or equivalent.
- Commit the initial project structure.

### 2. Add Prisma ORM for PostgreSQL

- Install Prisma and set up the initial Prisma schema in `server/prisma/schema.prisma`.
- Configure PostgreSQL connection (use environment variables).
- Run `prisma init` and create the first migration.
- Document database setup in `server/README.md`.

### 3. Use dotenv for local config, environment variables in devcontainer

- Install and configure `dotenv` for local development.
- Create a `.env` or `.env.local` file in `server/` (do not commit this file).
- Document required environment variables in `server/README.md`.
- Ensure devcontainer setup supports environment variables for local/CI/CD.

### 4. Set up Jest, Supertest, and ESLint with full test coverage

- Install and configure Jest for backend unit/integration tests.
- Install and configure Supertest for API endpoint testing.
- Install and configure ESLint for backend code linting.
- Add a sample test to verify the setup.
- Ensure all tests and linting pass with `npm test` and `npm run lint`.

---

> Next: Once all backend bootstrapping tasks are complete, proceed to shared code and MVP implementation roadmap tasks.
