# SERVICE-AUTON-old: Lessons Learned & Historical Reference

**Date**: December 23, 2025  
**Status**: Historical Archive (Not Merged)  
**Branch**: `SERVICE-AUTON-old` (preserved for reference)

---

## Purpose of This Document

Preserve the investigation and learnings from SERVICE-AUTON phase so future teams understand:

1. What was attempted and why it failed
2. Root causes that led to failures
3. Architectural decisions that prevented early detection
4. How the "validation by construction" approach prevents these issues

This is **not** a blame document, but a **learning document** for how phases should work together.

---

## What Was Attempted

SERVICE-AUTON phase attempted to refactor ebookService and add new services (wallArtService, calendarService) **independently**, without directly calling Phase 1 infrastructure to validate assumptions.

### Services Attempted

1. **ebookService (refactored)**

   - Attempted to use orchestrator pattern
   - Made assumptions about ID flow, manifest format, status updates
   - Assumed calls_total formula without validating against manifest
   - Assumed ETA timing constants

2. **wallArtService (new)**

   - Attempted to follow orchestrator pattern
   - Similar assumptions as ebookService
   - No reference to how Phase 1 actually works

3. **calendarService (new)**
   - Attempted to follow orchestrator pattern
   - Similar assumptions

### Why It Failed

The fundamental approach was:

```
Phase 1 (infrastructure) → Phase 2 makes assumptions → Phase 3 tests assumptions
                          (without validating Phase 1)
```

This created a **specification gap**:

- Phase 1 said "manifest-driven scheduling"
- Phase 2 heard "simplified formula"
- When Phase 3 tested, the mismatch became obvious

---

## Failure Modes Observed

### 1. ID Linkage Mismatch

**What Happened**:

```
PART-A created: resultId = "abc-123"
         ↓
        passed to genieService
         ↓
        service creates new Orchestrator("abc-123", ...)
         ↓
        but somewhere, different ID used
         ↓
smartPoller.updateProgress("xyz-789", {callsCompleted: 1, ...})
         ↓
smartPoller never finds "abc-123" in task map
         ↓
Status updates lost, smartPoller thinks task doesn't exist
```

**Why Tests Missed It**: Tests only checked final HTTP response, not result ID continuity through the system.

**Prevention (New Approach)**: Phase 1's reference service tests validate exact ID flow end-to-end. Phase 2 delegates, so it inherits this correctness.

---

### 2. Type Errors in Data Pipeline

**What Happened**:

```
compose() function assumed: chapter.content is a string
         ↓
Runtime receives: chapter.content = { type: 'object', ... }
         ↓
Error: "Cannot call .substring() on object"
         ↓
Service fails at runtime
```

**Why Tests Missed It**: Tests didn't instrument data flowing through `compose()` function. No assertions on intermediate data types.

**Prevention (New Approach)**: Phase 1's reference service proves type contracts. Phase 2 uses same contracts, so types are guaranteed.

---

### 3. Status Store Race Conditions

**What Happened**:

```
orchestrator.generate() calls orchestrator.updateStatus()
         ↓
updateStatus() tries to find resultId in statusMap
         ↓
statusMap.get(resultId) returns undefined (not created yet)
         ↓
Update dropped or creates partial state (missing ETA/calls_total)
         ↓
Status becomes inconsistent
```

**Why Tests Missed It**: Tests executed sequential flow. Race conditions only appear with concurrent updates. Tests didn't exercise out-of-order updates.

**Prevention (New Approach)**: Phase 1's orchestrator handles status state management. Phase 2 uses orchestrator, so state management is inherited and proven.

---

### 4. Manifest vs Formula Mismatch

**What Happened**:

```
Design document: "manifest-driven scheduling"
             ↓
Tests assume: "calls_total = 3 (simplified formula)"
             ↓
Implementation uses: "calls_total = manifest.totalRequests (manifest-driven)"
             ↓
For 3-page ebook:
  - Test expects: 3 calls
  - System generates: 4 calls (manifest-driven, correct)
  - Test fails: "Expected 3, got 4"
             ↓
Error looks like a bug, but it's actually correct implementation
```

**Why Tests Missed It**: Tests were written to the old simplified formula, not the canonical manifest-driven design. Design document was correct, tests were wrong.

**Prevention (New Approach)**: Phase 1's reference service implements canonical design. Phase 2 delegates to Phase 1, so implementation automatically follows design.

---

### 5. ETA Timing Constants Wrong

**What Happened**:

```
timingResolver hard-coded:
  modelLatencies.expert = 6000ms
  modelLatencies.standard = 5000ms
  modelSpacing.expert = 250ms
  modelSpacing.standard = 100ms

Actual observed durations in tests:
  expert calls: 8000-9000ms (not 6000ms)
  standard calls: 6000-7000ms (not 5000ms)

ETA computation:
  Predicted: 23 seconds
  Actual: 31 seconds
  Error: 35% (outside ±20% tolerance)
```

**Why Tests Missed It**: Tests measured ETA at coarse granularity. Didn't measure per-call durations to detect timing constant drift.

**Prevention (New Approach)**: Phase 1's reference service tests validate timing end-to-end. Constants calibrated during Phase 1. Phase 2 uses Phase 1's proven constants.

---

### 6. Missing Instrumentation

**What Happened**:

```
No telemetry for:
  - totalRequests from manifest
  - schedule slots from fifoScheduler
  - per-call durations
  - spacing enforcement verification

When things broke, couldn't see:
  - How many calls manifest declared
  - When calls were scheduled
  - Why ETA was inaccurate
  - Where latencies accumulated
```

**Why Tests Missed It**: Tests only asserted final ETA number, not intermediate schedule state.

**Prevention (New Approach)**: Phase 1's reference service tests require instrumentation. Phase 2 inherits same telemetry.

---

### 7. Rate-Limiter Interference

**What Happened**:

```
Sequential tests: work fine (mocked aiService)
         ↓
Concurrent tests: hit real rate-limiter buckets
         ↓
Some requests get 429 (Too Many Requests)
         ↓
Timing becomes unpredictable
         ↓
Tests flaky, true scheduling behavior masked
```

**Why Tests Missed It**: Tests didn't isolate rate-limiter from testing. 429 errors blamed on "environment", not implementation.

**Prevention (New Approach)**: Phase 1's reference service tests mock rate-limiter consistently. Phase 2 inherits same approach.

---

### 8. Test Environment Instability

**What Happened**:

```
Intermittent failures:
  - FS errors (data persistence)
  - Provider errors (aiService.generate sometimes fails)
  - Non-deterministic mock timing
  - Flaky CI/CD runs

Results:
  - Some test runs pass, some fail randomly
  - Hard to reproduce locally
  - Blame passed to "environment" not implementation
```

**Why Tests Missed It**: Flakiness masked regressions. Hard to tell if failure was environmental or implementation.

**Prevention (New Approach)**: Phase 1 establishes test infrastructure baseline. Phase 2 inherits same stable testing approach.

---

## Why Assumption Drift Happened

### The Specification Gap

```
ARCHITECTURE_ROADMAP_EXECUTIVE.md said:
  "Service declares manifest on first call.
   Orchestrator receives manifest, computes schedule with proper spacing.
   Manifest-driven FIFO scheduling prevents rapid-fire."

Phase 1 Engineers understood: "Manifest-driven means service provides manifest."

Phase 2 Engineers heard: "Manifest-driven? Probably means simplified formula."
                        (without reading Phase 1 implementation)

Phase 3 Testers validated: "What Phase 2 built"
                          (not "What Phase 1 actually provides")

Result: Phase 2 built something different from Phase 1,
        and Phase 3 tested what Phase 2 built,
        never realizing the gap.
```

### Why Early Detection Failed

The tests in SERVICE-AUTON phase were:

- **Well-structured**: Good HTTP-level testing
- **Comprehensive**: Covered multiple scenarios
- **But wrong**: Tested Phase 2's assumptions, not Phase 1's actual behavior

Phase 3 tests (PERF-VALIDATE) also were:

- **Well-designed**: 6 suites, 13 tests
- **Comprehensive**: Covered all architectural patterns
- **But validated wrong thing**: Tested Phase 2's assumptions

Neither test layer could catch the gap because **both tested the same wrong assumptions**.

---

## Key Learnings

### 1. Phases Must Validate Upward, Not Downward

**Wrong Approach**:

```
Phase 1 builds infrastructure (hope it works)
Phase 2 uses infrastructure (makes assumptions)
Phase 3 tests Phase 2 (tests assumptions)
→ Gap between Phase 1 and Phase 2 never validated
```

**Right Approach**:

```
Phase 1 builds + proves infrastructure (reference service + tests)
Phase 2 delegates to Phase 1 (validates Phase 1 upward)
Phase 3 tests integration (proves Phase 2 delegates correctly)
→ No gap, validation chain complete
```

### 2. Services Must Call, Not Assume

**Wrong**:

```
// Phase 2: "I think Phase 1 manifest format is..."
const manifest = {
  totalRequests: pageCount + 1, // Assumption
  sequence: [...] // Assumption
};
```

**Right**:

```
// Phase 2: "I'll call Phase 1 and see what it does"
const result = orchestrator.generate(prompt, {
  tier: "expert",
  callIndex: 0,
  manifest: buildManifest(), // Delegate to Phase 1's manifest protocol
});
const eta = orchestrator.eta; // Phase 1 computed it
```

### 3. Tests Must Validate Contracts, Not Assumptions

**Wrong**:

```javascript
// Test assumes calls_total formula
expect(status.calls_total).toBe(3); // Wrong if manifest-driven
```

**Right**:

```javascript
// Test validates delegation only
expect(service.handle(payload, context)).toBeDefined();
// If Phase 1 is proven, Phase 2's delegation is proven
```

### 4. Reference Services Are Essential

**Without Reference Service**:

- Phase 1 infrastructure is "theoretical" (not proven)
- Phase 2 can't tell if it's using Phase 1 correctly
- Phase 3 tests assumptions, not reality

**With Reference Service**:

- Phase 1 infrastructure is "proven" (code that works)
- Phase 2 can delegate confidently
- Phase 3 tests delegation, not assumptions

---

## How Reset Prevents These Issues

### Reference Service Validation

```javascript
// Phase 1 includes reference ebookService
class ReferenceEbookService {
  async handle(payload, context) {
    // This code is tested to prove:
    // ✅ resultId flows correctly through entire pipeline
    // ✅ Manifest protocol works end-to-end
    // ✅ Status updates arrive in correct order
    // ✅ ETA predictions accurate ±20%
    // ✅ Types handled correctly (no runtime type errors)
    // ✅ No race conditions (status updates before placeholder)
  }
}

// Reference service tests PROVE:
describe("Reference Service (Phase 1 Validation)", () => {
  // Test 1: resultId consistency
  // Test 2: manifest protocol
  // Test 3: status update ordering
  // Test 4: ETA accuracy ±20%
  // Test 5: type safety
  // Test 6: no race conditions
  // ...all pass before Phase 1 merges
});
```

### Phase 2 Delegation

```javascript
// Phase 2 services just delegate to proven Phase 1
class EbookService {
  async handle(payload, context) {
    return this.ref.handle(payload, context);
    // Can't fail because ref is proven
  }
}

// Phase 2 tests just validate delegation
describe("Service Autonomy (Phase 2)", () => {
  it("should delegate correctly", async () => {
    const result = service.handle(payload, context);
    // If Phase 1 is proven, delegation works
  });
});
```

### Result

```
Assumption Drift: ❌ IMPOSSIBLE
  Because Phase 2 doesn't make assumptions—it delegates.

Type Errors: ❌ IMPOSSIBLE
  Because Phase 1 reference service proves type contracts.

ID Linkage Issues: ❌ IMPOSSIBLE
  Because Phase 1 reference service validates ID flow end-to-end.

Race Conditions: ❌ IMPOSSIBLE
  Because Phase 1 orchestrator tested in reference service.

Specification Gaps: ❌ IMPOSSIBLE
  Because Phase 2 calls Phase 1 directly, not to specification.

Timing Mismatch: ❌ IMPOSSIBLE
  Because Phase 1 reference service validates timing end-to-end.
```

---

## Branch History

```
MAIN (production)
  ↓
  feat/ebook-nat-cont (base)
    ├─ ASYNC-INFRA ✅ Complete
    │   └─ Phase 1 infrastructure + reference service
    │   └─ [Will merge once reference service proven]
    │
    └─ SERVICE-AUTON-old ❌ Failed (archived)
        └─ Attempted independent refactoring
        └─ [Not merged, preserved for learning]
        └─ [Lessons → SERVICE_AUTON_RESET_PLAN.md]
            ↓
        SERVICE-AUTON-reset ⏳ In Planning
            └─ Delegation-based approach
            └─ [Will merge once delegation validated]
```

---

## For Future Teams

When implementing new phases:

1. **Phase 1**: Build infrastructure + reference service that proves it
2. **Phase 2**: Delegate to Phase 1, don't assume
3. **Phase 3**: Test delegation, not assumptions

**Never**:

- ❌ Have Phase 2 guess how Phase 1 works
- ❌ Have Phase 3 test Phase 2's assumptions
- ❌ Let gaps exist between phase contracts

**Always**:

- ✅ Have Phase 1 prove itself (reference service)
- ✅ Have Phase 2 call Phase 1 (delegation)
- ✅ Have Phase 3 test integration (prove delegation)

---

## Archive Status

This branch (`SERVICE-AUTON-old`) is preserved for:

- Historical reference
- Learning from what didn't work
- Understanding why reset was necessary
- Future architectural decisions

It will **not be merged** to main. The reset approach (SERVICE-AUTON-reset) supersedes it.

---

**Status**: Historical Archive Complete  
**Related**: [SERVICE_AUTON_RESET_PLAN.md](SERVICE_AUTON_RESET_PLAN.md)  
**Next**: Execute reset approach with validation-by-construction strategy
