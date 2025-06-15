# Current Issues and Challenges

This document tracks current and upcoming challenges for the ChronosCraft project.
Historical issues and completed work can be found in the archive directory (e.g., `archive/issues-2025-06-05.md`).

## Active Issues

### Test Suite Issues (2025-06-06)

1. Export issues in calendar router resolved:

   - ✓ Fixed TS2309 error by properly structuring exports in `calendar.ts`
   - ✓ Verified with successful TypeScript compilation

2. Test Suite Status (6/8 failing):

   - Common Issue: Test suite hanging during execution
   - Resolution Progress:

   a. `__tests__/validation.test.ts`:

   - Status: ✅ FIXED (2025-06-06)
   - Issue: Newly created test for validateCalendarInput
   - Resolution: Test passes in isolation (3 tests passed)
   - Coverage Note: Low coverage in calendar.ts (16.03%), but validation-specific code works

   b. `__tests__/calendar.test.ts`:

   - Status: ⚠️ PARTIALLY FIXED (2025-06-06)
   - Issue: 40/41 tests passing
   - Remaining Issue: DELETE endpoint test failing
     - Expected: 500 Internal Server Error
     - Actual: 204 No Content
   - Next Step: Fix error handling in delete endpoint

   c. `__tests__/projectManagement.test.ts`:

   - Status: ⏳ Pending
   - Issue: Unrelated changes in project management files
   - Next Step: Park changes and verify test in current state

   d. `__tests__/projectSaveLoad.test.ts`:

   - Status: ⏳ Pending
   - Issue: To be investigated
   - Next Step: Run test in isolation

   e. `__tests__/pdfExport.test.ts`:

   - Status: ⏳ Pending
   - Issue: To be investigated
   - Next Step: Run test in isolation

   f. `__tests__/googleCalendar.test.ts`:

   - Status: ⏳ Pending
   - Issue: To be investigated
   - Next Step: Run test in isolation

   Action Plan:

   1. Run each test in isolation using `jest -t <testName>`
   2. Document specific errors for each test
   3. Fix one test at a time, committing each fix separately
   4. Verify fix doesn't impact other tests
   5. Update status in this document after each fix

<!-- Add new issues above this line -->

## Upcoming Challenges

<!-- Add upcoming challenges above this line -->
