# NAT-CONT Phase 3: Implementation Plan

**Status**: APPROVED & READY TO EXECUTE  
**Date**: December 15, 2025 @ 12:30PM
**Branch**: feat/nat-cont-impl  
**Gate Decisions**: ✅ LOCKED

---

## Executive Summary

Phase 3 is now approved with locked gate decisions. Implementation can proceed immediately with:

- **Feature flag**: DEFAULT-ON (auto-use NAT-CONT_0 in production)
- **Performance validation**: 3 real ebook generations (3-page, 10-page, 20-page)
- **Narrative review**: Prototype-stage spot-check (simplified, no formal review required)
- **Estimate**: 1 day to complete all tasks

---

## Gate Decisions (APPROVED ✅)

### 1. Feature Flag Strategy: DEFAULT-ON ✅

**Decision**: NAT-CONT_0 will be AUTO-ENABLED in production

**What this means**:

- No manual feature flag toggle needed for users
- Strategy parameter defaults to "nat-cont_0" in ebookService.handle()
- Backward compatibility maintained (legacy mode still available)
- Configuration centralized in one location

**Implementation approach**:

- Update ebookService.handle() to set default strategy = "nat-cont_0"
- Keep legacy mode as fallback for edge cases
- No environment variables or config files needed for MVP

---

### 2. Performance Validation Scope: 3 Real Ebook Generations ✅

**Decision**: Validate performance with 3 real Gemini API calls

**Sample generation requirements**:

- **Sample 1**: 3-page ebook (minimum range validation)
- **Sample 2**: 10-page ebook (mid-range validation)
- **Sample 3**: 20-page ebook (maximum range validation)

**Performance expectations**:

- Each should complete <45 seconds (code-level prediction)
- Timeout buffer: 15+ seconds remaining (60s infrastructure limit - 45s processing)
- All calls should use real Gemini API (Pro + Flash routing)

**How to execute**:

1. Create test ebook payload for each size (3, 10, 20 pages)
2. Time each generation from start to HTML completion
3. Record actual timings vs expected <45s
4. Document results in Phase 3 completion update

---

### 3. Narrative Review Scope: Prototype Spot-Check ✅

**Decision**: Simplified QA spot-check (NOT formal full review)

**What's included**:

- QA manual review of 1-2 generated ebooks
- Verify narrative coherence (chapters flow together)
- Verify context passing works (opening → middle → closing chapters are cohesive)
- Spot-check for AI quality issues

**What's NOT included**:

- Full production-level narrative review
- Formal QA sign-off document
- Comprehensive test coverage
- User feedback collection

**How to execute**:

1. Generate 1-2 of the performance validation samples
2. Read through generated ebook content
3. Verify narrative flows and makes sense
4. Document any issues (if none, just mark as "QA spot-check PASSED")

---

## Phase 3 Implementation Checklist

### Task 1: Configure Feature Flag (DEFAULT-ON)

**Location**: [server/ebookService.js](server/ebookService.js) - handle() function

**Current code** (around line 96-98):

```javascript
handle(payload, strategy, aiService) {
  // Currently accepts optional strategy parameter
  // If not provided, uses legacy mode
}
```

**Required change**:

```javascript
handle(payload, strategy, aiService) {
  // If strategy not provided, default to nat-cont_0
  const activeStrategy = strategy || 'nat-cont_0';
  // ... rest of implementation
}
```

**Verification**:

- [ ] Existing tests still pass (backward compatibility)
- [ ] New calls without strategy parameter use nat-cont_0
- [ ] Legacy mode still works if explicitly requested

**Time estimate**: 15 minutes

---

### Task 2: Execute 3-Page Ebook Performance Validation

**Objective**: Generate 3-page ebook, measure time, verify <45s completion

**Steps**:

1. Create test payload for 3-page ebook (can use existing demo data)
2. Call handle(payload) with DEFAULT-ON feature flag
3. Measure total time from start to HTML completion
4. Record actual timing

**Expected result**: <45 seconds (timeout buffer 15s+)

**How to test**:

```bash
# Run from project root
node scripts/test-nat-cont-3page.js
# Should output: Completed in X seconds
```

**Time estimate**: 20 minutes (if script exists) or 40 minutes (if need to create test script)

---

### Task 3: Execute 10-Page Ebook Performance Validation

**Objective**: Generate 10-page ebook, measure time, verify <45s completion

**Steps**:

1. Create test payload for 10-page ebook
2. Call handle(payload) with DEFAULT-ON feature flag
3. Measure total time from start to HTML completion
4. Record actual timing

**Expected result**: <45 seconds (timeout buffer 15s+)

**How to test**:

```bash
node scripts/test-nat-cont-10page.js
```

**Time estimate**: 20 minutes

---

### Task 4: Execute 20-Page Ebook Performance Validation

**Objective**: Generate 20-page ebook, measure time, verify <45s completion

**Steps**:

1. Create test payload for 20-page ebook
2. Call handle(payload) with DEFAULT-ON feature flag
3. Measure total time from start to HTML completion
4. Record actual timing

**Expected result**: <45 seconds (timeout buffer 15s+)

**How to test**:

```bash
node scripts/test-nat-cont-20page.js
```

**Time estimate**: 20 minutes

---

### Task 5: QA Spot-Check Narrative Coherence

**Objective**: Manual review of 1-2 generated ebooks to verify narrative quality

**Steps**:

1. Pick 1-2 of the performance validation samples
2. Open generated ebook HTML in browser
3. Read through to verify:
   - Chapters flow logically from opening → middle → closing
   - Content is cohesive (context passing is working)
   - No obvious AI generation artifacts
4. Document findings (or mark as PASSED if no issues)

**Expected result**: Narrative coherence verified, or issues documented

**Time estimate**: 15 minutes

---

### Task 6: Update Progress Documentation

**Location**: [NAT-CONT_IMPLEMENTATION_PROGRESS.md](NAT-CONT_IMPLEMENTATION_PROGRESS.md)

**Updates needed**:

1. Replace "Performance timings [TBD]" with actual values:
   - 3-page: X seconds
   - 10-page: X seconds
   - 20-page: X seconds
2. Update QA findings (narrative coherence: PASSED or issues documented)
3. Mark Phase 3 as COMPLETED
4. Update final document status to "READY FOR DEPLOYMENT"

**Time estimate**: 10 minutes

---

### Task 7: Production Deployment Readiness

**Checklist before deployment**:

- [ ] Feature flag configured (DEFAULT-ON)
- [ ] All 3 performance samples completed <45s
- [ ] QA spot-check passed
- [ ] Documentation updated
- [ ] All tests still passing (54/54)
- [ ] Code reviewed (optional for MVP)

**Deployment steps** (not included in Phase 3, but documented for clarity):

1. Commit final changes to feat/nat-cont-impl
2. Create PR to main
3. Merge after approval
4. Deploy to production (feature already enabled by default)

**Time estimate**: 5 minutes (checklist + commit)

---

## Time Breakdown

| Task                       | Estimated Time             | Status         |
| -------------------------- | -------------------------- | -------------- |
| Feature flag configuration | 15 min                     | ⏳ NOT STARTED |
| 3-page validation          | 20 min                     | ⏳ NOT STARTED |
| 10-page validation         | 20 min                     | ⏳ NOT STARTED |
| 20-page validation         | 20 min                     | ⏳ NOT STARTED |
| QA spot-check              | 15 min                     | ⏳ NOT STARTED |
| Documentation update       | 10 min                     | ⏳ NOT STARTED |
| Deployment readiness       | 5 min                      | ⏳ NOT STARTED |
| **TOTAL**                  | **105 minutes (~1.5 hrs)** | 🔄 IN PROGRESS |

---

## Success Criteria

✅ **Phase 3 Complete When**:

1. Feature flag configured to DEFAULT-ON
2. All 3 performance samples (3, 10, 20 page) generated successfully
3. All 3 samples complete in <45 seconds
4. QA spot-check confirms narrative coherence
5. NAT-CONT_IMPLEMENTATION_PROGRESS.md updated with Phase 3 completion
6. All 54 existing tests still passing

---

## Known Risks & Mitigation

| Risk                                   | Impact | Mitigation                                                                 |
| -------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Real Gemini API times out              | HIGH   | If >45s, check if Gemini API is slow or code has issue; backoff and retry  |
| QA spots narrative issues              | MEDIUM | Document issues, may require follow-up improvements                        |
| Tests break with feature flag change   | HIGH   | Run full test suite before marking complete                                |
| Actual performance worse than expected | MEDIUM | If <45s but close (40-44s), buffer is still adequate; document and proceed |

---

## Next Steps After Phase 3

Once Phase 3 complete:

1. ✅ Feature is production-ready
2. ✅ Performance validated with real Gemini API
3. ✅ Narrative quality spot-checked
4. ✅ Ready to deploy to main branch
5. Potential Phase 4 (future, not now):
   - Formal narrative review process
   - Extended performance benchmarking
   - Full regression testing
   - Monitoring/alerting in production

---

## References

- [NAT-CONT_IMPLEMENTATION_PROGRESS.md](NAT-CONT_IMPLEMENTATION_PROGRESS.md) — Overall progress tracking
- [NAT-CONT_HANDOFF.md](NAT-CONT_HANDOFF.md) — Checkpoint state
- [server/ebookService.js](server/ebookService.js) — Implementation code (lines 555-1095)
- [server/**tests**/ebookService.nat-cont.test.js](server/__tests__/ebookService.nat-cont.test.js) — Test suite (706 lines, 54/54 passing)

---

**Status**: READY TO EXECUTE  
**Approval**: Gate decisions locked  
**Last Updated**: December 15, 2025  
**Target Completion**: December 16, 2025
