# Changelog

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

### Changed

- Reorganized documentation for clarity and maintainability
- Standardized port configurations across all services
- Updated backend port to match devcontainer settings (5000)
- Migrated calendar API to TypeScript
- Implemented full CRUD operations for calendar API
- Added comprehensive test coverage for calendar endpoints
- Enhanced error handling for calendar operations
- Migrated backend server entrypoint and routes to TypeScript

### Fixed

- Fixed frontend `exportToPDF` utility export/import so tests pass
- Verified all backend tests pass with 100% statement coverage
- Confirmed frontend component tests pass
- Successfully ran and validated integration tests with Playwright
- Added proper port management in integration test script

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
