# Current Issues and Challenges

This document tracks current and upcoming challenges for the ChronosCraft project.
Historical issues and completed work can be found in the archive directory (e.g., `archive/issues-2025-05.md`).

## Active Issues

### Test Suite Issues (2025-06-06)

1. Export issues in calendar router resolved:

   - ✓ Fixed TS2309 error by properly structuring exports in `calendar.ts`
   - ✓ Verified with successful TypeScript compilation

2. Current test failures (6/8 failing):
   - Test suite hanging during execution
   - Affected test files:
     - `__tests__/validation.test.ts`
     - `__tests__/projectManagement.test.ts`
     - `__tests__/projectSaveLoad.test.ts`
     - `__tests__/pdfExport.test.ts`
     - `__tests__/googleCalendar.test.ts`
     - `__tests__/calendar.test.ts`
   - Next step: Address each failing test individually following one-issue-at-a-time approach

<!-- Add new issues above this line -->

## Upcoming Challenges

<!-- Add upcoming challenges above this line -->
