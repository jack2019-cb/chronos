# ChronosCraft AI Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-05-28

### Added

- Created comprehensive `CONFIGURATION.md` for setup and environment details
- Consolidated all port configurations and environment settings in one place
- Project initialized: monorepo structure with `client` and `server`
- Added initial documentation and vision
- Basic calendar API endpoint with months data
- Frontend calendar creator components
- Initial calendar display grid component
- Basic test suite for calendar functionality
- Added GitHub Actions workflow for automated CI (backend & frontend tests)
- Added Playwright integration test scaffold and configuration
- Added start-dev.sh script to automate backend/frontend startup and integration testing
- TypeScript interfaces for CalendarCreator component
- Proper type safety for state management and event handlers
- Updated React type definitions to latest versions
- Implemented CORS support in Express backend
- Added frontend environment configuration for API URL

### Changed

- Server TypeScript configuration updated to use Node16 module system
- Aligned module resolution settings for better compatibility
- Reorganized documentation for clarity and maintainability
- Standardized port configurations across all services
- Updated backend port to match devcontainer settings (5000)
- Migrated calendar API to TypeScript
- Implemented full CRUD operations for calendar API
- Added comprehensive test coverage for calendar endpoints
- Enhanced error handling for calendar operations
- Migrated backend server entrypoint and routes to TypeScript
- Consolidated documentation in /docs/addenda directory
- Removed redundant documentation files
- Updated NEXT_STEPS.md to reflect completed backend database setup steps

### Fixed

- Fixed frontend `exportToPDF` utility export/import so tests pass
- Verified all backend tests pass with 100% statement coverage
- Confirmed frontend component tests pass
- Successfully ran and validated integration tests with Playwright
- Added proper port management in integration test script
- Month selection bug in CalendarCreator:
  - Now maintains at least one month selected
  - Sorts months in chronological order
  - Fixed state management issue with month toggle
- HTTP 502 error in Codespaces environment
- Month selection bug in CalendarCreator component

### Technical Debt Resolved

- Complete TypeScript implementation for calendar routes
- Achieved 100% statement coverage and 84% branch coverage in tests
- Added proper type definitions for all API interfaces
- Standardized port configuration across all services

### Test Coverage & Documentation

- Removed legacy JS tests from server/**tests**
- Added/expanded tests for uncovered modules
- Created centralized configuration documentation
- Updated API.md with current and planned endpoints

### In Progress

- Calendar API implementation
  - [✓] Full CRUD operations completed
  - [✓] Error handling implemented
  - [ ] Event handling enhancement planned
  - [ ] External calendar integration pending
  - [ ] PDF export functionality pending

---

### Actionables Checklist (as of 2025-06-25)

- [ ] Event handling enhancement for Calendar API
- [ ] Implement external calendar integration
- [ ] Complete PDF export functionality
- [ ] Fix backend startup in start-dev.sh (Node.js ESM/TypeScript .ts execution issue)
- [ ] **Migrate all server-side tests from Jest to Vitest.**
  - **Reason:** This action is required due to lack of compliance with the documented project specification: all server-side tests must use Vitest (see README). The use of Jest for backend tests led to ESM/TypeScript incompatibility and test failures. Future updates must verify and adhere to project specs before implementation.
  - [ ] Inventory all server-side test files and categorize by complexity/dependency.
  - [ ] Install and configure Vitest in the server package (add `test:vitest` script).
  - [ ] Migrate one simple, isolated test file to Vitest and verify it passes.
  - [ ] Migrate remaining test files to Vitest, one by one or in small batches.
  - [ ] Ensure Vitest test setup applies all Prisma migrations to the test database before running.
  - [ ] Remove Jest dependencies, configs, and scripts from the backend.
  - [ ] Update documentation and scripts to reference only Vitest for backend tests.
  - [ ] Run the full Vitest suite and confirm all server-side tests pass.
  - [ ] Review and clean up any ESM/TypeScript or database setup issues discovered during migration.

## [Unreleased] - 2025-05-29

### Added

- Database integration completed:
  - Installed and initialized Prisma ORM in the backend
  - Implemented Calendar and Event models in `prisma/schema.prisma` with correct relations
  - Created and ran initial database migrations
  - Successfully set up PostgreSQL in dev container
  - Configured database connection and environment variables

### Changed

- Updated docker-compose configuration for improved database connectivity:
  - Added health checks for PostgreSQL container
  - Configured proper network setup between app and database
  - Added explicit hostname for database service
  - Set proper environment variables for database connection

### Fixed

- Resolved database connection issues in dev container setup
- Fixed Prisma client generation and database migration process

### Technical Debt

- Improved dev container configuration for better database reliability
