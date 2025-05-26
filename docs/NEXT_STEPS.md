# Next Steps for ChronosCraft AI

## Recent Progress (as of 2025-05-25)

- Cleaned up and standardized the `client/` directory structure for Next.js best practices
- Added a sample smoke test to `client/__tests__/` to verify frontend test setup
- Successfully fixed all frontend test failures (5 tests across 3 suites now passing)
- Removed Babel configuration in favor of SWC transformation
- Added proper Next.js mocks in `jest.setup.ts`
- Updated Next.js configuration for proper test environment
- Created comprehensive documentation of Babel removal in `BABEL_REMOVAL.md`
- All backend and frontend tests are now passing
- The development environment is managed by a dev container with pre-installed tools

## Immediate Priority

### Frontend (client/)

- [ ] Begin implementing core calendar creation UI (select year/month, event input, etc.)
- [ ] Set up API integration with backend endpoints (e.g., `/calendar`)
- [ ] Start building GenAI prompt UI and output preview
- [ ] Verify frontend UI accessibility in Codespaces environment

### Backend (server/)

- Gradually migrate backend code to TypeScript (rename files, update imports/exports)
- Expand API endpoints: calendar data, event CRUD, PDF/PNG export, project save/load
- Add database integration (PostgreSQL with Prisma)
- Implement authentication and user/project persistence
- Add/expand backend tests for new endpoints and business logic

### General

- Keep documentation up to date as features are added
- Review and update MVP checklist and roadmap as milestones are reached
- Ensure all code passes linting and tests before merging to `dev`
- Note: The dev container ensures a consistent environment for all contributors, so onboarding and setup are simplified. Focus on configuration and feature development rather than tool installation.

---

_You are ready to continue building out ChronosCraft AI!_
