# Current Issues and Challenges

This document tracks current and upcoming challenges for the ChronosCraft project.
Historical issues and completed work can be found in the archive directory (e.g., `archive/issues-2025-05.md`).

## Active Issues

### Test Suite Issues (2025-06-10)

1. Export issues in calendar router resolved:

   - ✓ Fixed TS2309 error by properly structuring exports in `calendar.ts`
   - ✓ Verified with successful TypeScript compilation

2. Test Suite Status: **ALL PASSING**

   - All server and client tests now pass, including robust error handling for database failures (DELETE endpoint)
   - Used Jest mocking to reliably simulate database errors in tests
   - Test suite is now stable and reliable

   a. `__tests__/validation.test.ts`: ✅ FIXED
   b. `__tests__/calendar.test.ts`: ✅ FIXED (including DELETE error handling)
   c. `__tests__/projectManagement.test.ts`: ✅ FIXED
   d. `__tests__/projectSaveLoad.test.ts`: ✅ FIXED
   e. `__tests__/pdfExport.test.ts`: ✅ FIXED
   f. `__tests__/googleCalendar.test.ts`: ✅ FIXED

   - Recurring TypeScript pitfall: Do not use `return res.status(...).json(...)` or `return res.send(...)` in Express route handlers typed as `void`. Instead, call these methods without returning their result, and use `return;` if you need to exit early. This prevents TS2322 errors and test failures. (See 2025-06-10 troubleshooting)

   Action Plan:

   1. Run each test in isolation using `jest -t <testName>`
   2. Document specific errors for each test
   3. Fix one test at a time, committing each fix separately
   4. Verify fix doesn't impact other tests
   5. Update status in this document after each fix

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

   - Recurring TypeScript pitfall: Do not use `return res.status(...).json(...)` or `return res.send(...)` in Express route handlers typed as `void`. Instead, call these methods without returning their result, and use `return;` if you need to exit early. This prevents TS2322 errors and test failures. (See 2025-06-10 troubleshooting)

   Action Plan:

   1. Run each test in isolation using `jest -t <testName>`
   2. Document specific errors for each test
   3. Fix one test at a time, committing each fix separately
   4. Verify fix doesn't impact other tests
   5. Update status in this document after each fix

<!-- Add new issues above this line -->

## Upcoming Challenges

<!-- Add upcoming challenges above this line -->
