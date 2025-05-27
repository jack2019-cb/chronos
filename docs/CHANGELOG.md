# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project initialized: monorepo structure with `client` and `server`
- Added initial documentation and vision
- All markdown documentation in docs/ for cleanliness
- README.md files in client and server
- .env.example shell files present in both client and server
- Basic calendar API endpoint with months data
- Frontend calendar creator components
- Initial calendar display grid component
- Basic test suite for calendar functionality

### Changed

- Migrated calendar API to TypeScript
- Implemented full CRUD operations for calendar API
- Added comprehensive test coverage for calendar endpoints
- Enhanced error handling for calendar operations

### Technical Debt Resolved

- Complete TypeScript implementation for calendar routes
- Achieved 100% statement coverage and 84% branch coverage in tests
- Added proper type definitions for all API interfaces

### In Progress

- Calendar API implementation
  - [✓] Full CRUD operations completed
  - [✓] Error handling implemented
  - [ ] Event handling enhancement planned
  - [ ] External calendar integration pending
  - [ ] PDF export functionality pending
