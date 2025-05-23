# Next Steps for ChronosCraft AI

## Recent Progress (as of 2025-05-23)

- Cleaned up and standardized the `client/` directory structure for Next.js best practices
- Added a sample smoke test to `client/__tests__/` to verify frontend test setup
- Bootstrapped backend (`server/`) with Express, Mocha, and a working test suite
- Added TypeScript configuration (`tsconfig.json`) to backend for future migration
- Implemented `/calendar` API endpoint in backend and verified with automated tests
- All backend and frontend smoke/API tests are passing

## Next Steps

### Frontend (client/)
- Add/expand automated tests for UI components and hooks in `__tests__/`
- Begin implementing core calendar creation UI (select year/month, event input, etc.)
- Set up API integration with backend endpoints (e.g., `/calendar`)
- Add Prettier and ESLint config if custom rules are needed
- Start building GenAI prompt UI and output preview

### Backend (server/)
- Gradually migrate backend code to TypeScript (rename files, update imports/exports)
- Expand API endpoints: calendar data, event CRUD, PDF/PNG export, project save/load
- Add database integration (e.g., PostgreSQL with Prisma or another ORM)
- Implement authentication and user/project persistence
- Add/expand backend tests for new endpoints and business logic

### General
- Keep documentation up to date as features are added
- Review and update MVP checklist and roadmap as milestones are reached
- Ensure all code passes linting and tests before merging to `dev`

---

_You are ready to continue building out ChronosCraft AI!_
