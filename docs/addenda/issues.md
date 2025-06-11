# Current Issues and Challenges

> **Reminder:** Keep `NEXT_STEPS.md` up-to-date. Remove completed items and past notices so it always reflects the current and next actionable work.

This document tracks current and upcoming challenges for the ChronosCraft project.
Historical issues and completed work can be found in the archive directory (e.g., `archive/issues-2025-06-05.md`).

## Active Issues

### CI/CD Improvements (2025-06-10)

1. **Set up Playwright integration tests in CI**

   - Add Playwright test run to GitHub Actions workflow ✓
   - Ensure Playwright tests run on PRs and main branch ✓
   - Decision (2025-06-11): Implementing full browser support (Chromium, Firefox, WebKit) ✓
     - Rationale: Development-only requirement, sufficient space available (~706MB total)
     - Benefits: Complete cross-browser testing coverage
   - Added health checks and process management ✓
   - Remaining Robustness TODOs (for future improvement):
     - Add retry mechanism for flaky tests
     - Implement parallel test execution optimization
     - Add test result reporting to PR comments
   - Timebox: 1 hour

2. **Add automated linting to CI**

   - Integrate ESLint for server ✓
   - Add lint script to server package.json ✓
   - Add lint steps to CI workflow ✓
   - Client already has Next.js lint support ✓
   - Testing: Need to verify lint failure fails CI build
   - Timebox: 1 hour

3. **Implement production build verification in CI**

   - Add build step for both client and server in CI
   - Fail CI if build fails
   - Timebox: 1 hour

4. **Set up code coverage reporting**

   - Integrate Jest coverage reporting in CI
   - Upload coverage artifact for review
   - Timebox: 1 hour

5. **Create deployment workflow for staging**
   - Draft GitHub Actions workflow for staging deployment (can be a placeholder)
   - Document required secrets and environment variables
   - Timebox: 1 hour

<!-- Add new issues above this line -->

## Upcoming Challenges

<!-- Add upcoming challenges above this line -->
