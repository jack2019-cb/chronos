# Next Steps for ChronosCraft AI

> **Note:** For detailed issues, API reference, and historical notes, see `/docs/addenda/`.

## Current Status (2025-06-04)

### Active Branch: feature/calendar-api

- Location: `/workspaces/caramel`
- Last Completed: Database integration with Prisma, including CRUD operations and tests
- Currently Working: Documentation updates and preparing for branch merge
- Next Action: PDF export endpoint implementation

### Key Files Modified

- `/server/prisma/schema.prisma` - New database schema
- `/docs/CONTRIBUTING.md` - Updated CI/CD documentation
- `/.github/workflows/ci.yml` - Current CI configuration
- `/docs/CONFIGURATION.md` - Updated environment configuration

### Ready to Work On

1. Calendar API Enhancement:

   - Next: Implement PDF export endpoint (`/server/routes/calendar.ts`)
   - Then: Add external calendar service integration
   - Finally: Implement project save/load functionality

2. CI/CD Pipeline:
   - Current file: `/.github/workflows/ci.yml`
   - Required changes documented in `CONTRIBUTING.md`
   - Focus on Playwright integration first

## Recent Progress (as of 2025-05-27)

- Cleaned up and standardized the `client/` directory structure for Next.js best practices
- Added a sample smoke test to `client/__tests__/` to verify frontend test setup
- Successfully fixed all frontend test failures (5 tests across 3 suites now passing)
- Removed Babel configuration in favor of SWC transformation
- Added proper Next.js mocks in `jest.setup.ts`
- Updated Next.js configuration for proper test environment
- Created comprehensive documentation of Babel removal in `BABEL_REMOVAL.md`
- All backend and frontend tests are now passing
- The development environment is managed by a dev container with pre-installed tools
- Completed calendar API CRUD operations with TypeScript
- Achieved 100% test coverage for calendar API endpoints
- Added comprehensive error handling for calendar API

## Immediate Priority

### CI/CD Enhancements

As documented in `CONTRIBUTING.md`, the following CI/CD improvements are needed:

- [ ] Add Playwright integration tests to CI pipeline
- [ ] Implement production build verification steps
- [ ] Add automated linting checks to CI workflow
- [ ] Set up code coverage reporting and tracking
- [ ] Create deployment workflows for staging/production environments

### Frontend (client/)

- [✓] Begin implementing core calendar creation UI (select year/month, event input, etc.)
- [✓] Set up API integration with backend endpoints (e.g., `/calendar`)
- [ ] Start building GenAI prompt UI and output preview
- [ ] Verify frontend UI accessibility in Codespaces environment

### Backend (server/)

- Database Integration (PostgreSQL with Prisma):

  - [✓] Create Prisma schema (`/server/prisma/schema.prisma`)
  - [✓] Initialize database and run first migration
  - [✓] Update calendar routes to use Prisma Client
  - [✓] Add error handling for database operations
  - [✓] Write database integration tests

- Calendar API Implementation:

  - [✓] Define proper data models for calendar events
  - [✓] Implement CRUD operations for events
  - [✓] Add PDF export endpoint (`/server/routes/calendar.ts`)
  - [✓] Google Calendar Integration (Phase 1 - Mock Implementation):

    1. Create service layer for calendar integration:
       - [✓] Set up `services/googleCalendar.ts` with interface
       - [✓] Implement mock data provider
       - [✓] Add integration tests with mock data
    2. Add new endpoints:
       - [✓] GET `/calendar/google/auth` (mock OAuth flow)
       - [✓] GET `/calendar/google/callback` (mock token handling)
       - [✓] GET `/calendar/google/events` (return mock events)
       - [✓] POST `/calendar/google/import` (simulate import)
    3. Error handling:
       - [✓] Add specific error types for calendar integration
       - [✓] Implement proper error responses
    4. Testing:
       - [✓] Unit tests for service layer
       - [✓] Integration tests for endpoints
       - [✓] Error handling tests
    5. Documentation:
       - [✓] Update API documentation
       - [✓] Add integration guide

  - [ ] Google Calendar Integration (Phase 2 - Production): [Moved to V0.2]

    1. Setup Requirements:
       - [ ] Create Google Cloud Project
       - [ ] Enable Calendar API
       - [ ] Configure OAuth 2.0 credentials
       - [ ] Set up OAuth consent screen
    2. Implementation:
       - [ ] Real OAuth flow integration
       - [ ] Token storage and refresh handling
       - [ ] Real Calendar API integration
       - [ ] Rate limiting and quota management
    3. Security:
       - [ ] Secure credential storage
       - [ ] Token encryption
       - [ ] Access scope management

  - [ ] Add project save/load functionality
  - [ ] Implement GenAI integration for themes
  - [ ] Improve test coverage:
    - [✓] Cover error handling in `lib/errors.ts` (improved from 60% to 100%)
    - [✓] Improve Project Management API coverage (achieved 90.9%)
    - [🔄] Complete calendar route coverage (current: 82.5%)
      - [ ] Fix DELETE /calendar/:id endpoint
      - [ ] Add validation edge case tests
      - [ ] Cover remaining uncovered lines (270-272)
    - [🔄] Improve Google Calendar Integration coverage (current: 84.44%)
      - [ ] Add error condition tests (lines 13-16)
      - [ ] Improve request validation coverage (lines 36, 54, 66, 78)
      - [ ] Test mock implementation edge cases

## Current Test Coverage Status

Overall backend coverage: 88.67% (up from 87.35%)

- Statements: 88.67%
- Branches: 75.58%
- Functions: 91.18%
- Lines: 88.67%

- [✓] Complete TypeScript migration for calendar API
- [ ] Implement authentication and user/project persistence

### General

- Keep documentation up to date as features are added
- Review and update MVP checklist and roadmap as milestones are reached
- Ensure all code passes linting and tests before merging to `dev`
- Note: The dev container ensures a consistent environment for all contributors, so onboarding and setup are simplified. Focus on configuration and feature development rather than tool installation.

## Immediate Technical Debt Sprint (2025-05-28)

- Migrate all backend JavaScript files to TypeScript
- Review and expand test coverage for backend and frontend
- Audit and update documentation for all APIs and modules
- Document progress and completion in CHANGELOG.md and issues.md

## Branch Integration (2025-06-04)

### Pre-Merge Requirements

- [✓] Complete database integration with Prisma
- [ ] Finish calendar API implementation
- [ ] Complete documentation updates from Technical Debt Sprint

### Merge Process

1. Update and verify test coverage:
   - [ ] Backend Jest tests
   - [ ] Frontend Jest tests
   - [ ] Integration tests
2. Prepare merge:
   - [ ] Create temporary merge branch from dev
   - [ ] Test merge in temporary branch
   - [ ] Verify database migrations
3. Final merge:
   - [ ] Merge feature/calendar-api into dev
   - [ ] Verify deployment configuration
   - [ ] Update deployment documentation

---

_You are ready to continue building out ChronosCraft AI!_
