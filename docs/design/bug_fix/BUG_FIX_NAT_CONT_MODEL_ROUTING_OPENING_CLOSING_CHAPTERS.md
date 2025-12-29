# DESIGN MISS FIX: Model Routing for Opening/Closing Chapters in NAT-CONT_0

**Date**: December 15, 2025  
**Issue**: BUG_NAT_CONT_DESIGN_IMPLEMENTATION_MISSES.md (Issue #1)  
**Category**: Design Miss (Dual Approach Problem)  
**Status**: FIX SPECIFICATION

---

## Problem Statement

**This is not a bug, but a design miss where two incompatible routing approaches were allowed to coexist:**

1. **Approach 1 (aiService.js)**: Simple implicit routing — callIndex=0→Pro, all others→Flash
2. **Approach 2 (NAT-CONT_0)**: Complex orchestration — opening/closing chapters should also use Pro

These approaches conflict: NAT-CONT_0 calls `generateOpeningChapter()` with callIndex=1 expecting Pro, but aiService.js routing treats callIndex=1 as Flash.

**Design Intent**: NAT-CONT_0 strategy specifies opening and closing chapters should use Pro model for narrative voice and thematic closure.

**Actual Behavior**:

- Call 0 (Structure) → Pro ✅
- Call 1 (Opening Chapter) → Pro (intended) but Flash (actual) ❌
- Call 2+ (Middle Batch) → Flash ✅
- Call 3 (Closing Chapter) → Pro (intended) but Flash (actual) ❌

**Root Cause**: The architecture allowed two routing strategies but only implemented the simpler one. The complex strategy (NAT-CONT_0) was designed to override default routing, but no mechanism existed to do so.

---

## Architectural Authority

**Reference**: [BACKEND_ARCHITECTURE.md § Architectural Patterns → Model Routing via callIndex](../../../docs/current_design/BACKEND_ARCHITECTURE.md#model-routing-via-callindex)

The architecture establishes:

> "The backend implements implicit model selection through the `callIndex` parameter propagated from orchestrator to AI service to client."

**Key Principle**:

```
Benefits:
- Semantic clarity: `callIndex` indicates call position, which implies model
- Separation: Service doesn't hardcode model names (easier to update)
- Traceability: Logs show `callIndex` for debugging
- Future-proof: Can add complexity without changing interfaces
```

**Architecture Constraint**:

```
What Stays in the Service Layer: Business logic only
What Stays in the Infrastructure Layers:
  - aiService: "Based on callIndex, which model?"
  - Services: "Generate content"
```

---

## Solution: Implement the Missed Design Intent

**Enable dual-approach routing** by adding an **optional explicit model parameter** to aiService, allowing:

- **Approach 1**: Simple services use implicit callIndex routing (unchanged, legacy ebook)
- **Approach 2**: Complex services override routing when their design intent requires it (NAT-CONT_0)

### Design Decision: Optional Model Override

Extend aiService to support an optional `model` parameter in `generateContentWithRotation()`:

```javascript
// Implicit routing (Approach 1 - legacy, unchanged):
aiService.generateContentWithRotation(prompt, 0); // Selects Pro via callIndex
aiService.generateContentWithRotation(prompt, 1); // Selects Flash via callIndex

// Explicit override (Approach 2 - NAT-CONT_0):
aiService.generateContentWithRotation(prompt, 1, { model: "gemini-2.5-pro" });
// Overrides default callIndex routing, selects Pro explicitly for opening chapter
```

**Why This Approach**:

1. ✅ **Implements Dual-Approach Design**: Supports both simple and complex routing strategies
2. ✅ **Backwards Compatible**: Legacy services unchanged, use implicit routing
3. ✅ **Enables NAT-CONT_0**: Complex orchestration can request Pro explicitly when needed
4. ✅ **Minimal Coupling**: Services only override when their design requires it
5. ✅ **Maintains Separation**: aiService stays responsible for routing logic

---

## Code Changes

### 1. Update aiService.js

**File**: [server/aiService.js](../../../../server/aiService.js)

**Change**: Extend `generateContentWithRotation()` to accept optional model parameter

**Location**: Lines 60-75 (Model selection logic)

```javascript
// Before:
async generateContentWithRotation(prompt, callIndex = 0) {
  const model = callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash";
  // ... rest of logic
}

// After:
async generateContentWithRotation(prompt, callIndex = 0, options = {}) {
  // If explicit model provided via options, use it; otherwise route via callIndex
  const model = options.model || (callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash");
  // ... rest of logic
}
```

**Rationale**:

- Maintains implicit callIndex routing as default
- Allows explicit model override for special cases (NAT-CONT_0 opening/closing)
- Follows principle: infrastructure (aiService) handles routing, service (ebookService) only overrides when needed

---

### 2. Update ebookService.js - generateOpeningChapter()

**File**: [server/ebookService.js](../../../../server/ebookService.js)

**Change**: Pass explicit model parameter for opening chapter

**Location**: Line ~657 (generateOpeningChapter function)

```javascript
// Before:
const response = await aiService.generateContentWithRotation(
  openingPrompt,
  1 // callIndex 1 = Pro model
);

// After:
const response = await aiService.generateContentWithRotation(
  openingPrompt,
  1,
  { model: "gemini-2.5-pro" } // Explicit Pro for narrative voice
);
```

**Rationale**:

- Opening chapter requires Pro for establishing narrative voice and atmospheric setup
- Explicit model parameter ensures Pro is selected, not relying on callIndex assumption

---

### 3. Update ebookService.js - generateClosingChapter()

**File**: [server/ebookService.js](../../../../server/ebookService.js)

**Change**: Pass explicit model parameter for closing chapter

**Location**: Line ~752 (generateClosingChapter function)

```javascript
// Before:
const response = await aiService.generateContentWithRotation(
  closingPrompt,
  1 // callIndex 1 = Pro model (final chapter generation)
);

// After:
const response = await aiService.generateContentWithRotation(
  closingPrompt,
  1,
  { model: "gemini-2.5-pro" } // Explicit Pro for narrative closure
);
```

**Rationale**:

- Closing chapter requires Pro for narrative closure and thematic resolution
- Explicit model parameter ensures Pro is selected, preventing routing deviation

---

## Impact Analysis

### What Changes

| Component                 | Before   | After    | Impact                 |
| ------------------------- | -------- | -------- | ---------------------- |
| **Opening Chapter Model** | Flash ❌ | Pro ✅   | Design intent achieved |
| **Closing Chapter Model** | Flash ❌ | Pro ✅   | Design intent achieved |
| **Middle Batch Model**    | Flash ✅ | Flash ✅ | No change (correct)    |
| **Structure Model**       | Pro ✅   | Pro ✅   | No change (correct)    |

### What Doesn't Change

- ✅ All other services remain unchanged (implicit callIndex routing works)
- ✅ Legacy ebook generation strategy unaffected
- ✅ Quota tracking unchanged (still tracks Pro and Flash separately)
- ✅ Rate limiting unchanged
- ✅ API calls unchanged (just routed to correct model)

### Performance Implications

**Expected Change**: Minimal impact on overall execution time

- Opening chapter: Same API latency (~15s), just with Pro instead of Flash
- Closing chapter: Same API latency (~15s), just with Pro instead of Flash
- Total execution: May increase slightly (Pro might be slightly slower than Flash for content generation, but is semantically correct for complex narrative tasks)

**Quota Impact**:

- Changes allocation from: 1 Pro + 5 Flash
- To: 3 Pro + 3 Flash (for 3-page ebook)
- Pro quota window: 2 calls/minute available (current plan uses only 1)
- **Result**: Still within quota limits ✅

---

## Testing Strategy

### Unit Test Coverage

1. **Test: Opening chapter uses Pro model**

   - Mock aiService.generateContentWithRotation
   - Verify called with `{ model: "gemini-2.5-pro" }`

2. **Test: Closing chapter uses Pro model**

   - Mock aiService.generateContentWithRotation
   - Verify called with `{ model: "gemini-2.5-pro" }`

3. **Test: Middle batch chapters use Flash model**
   - Mock aiService.generateContentWithRotation
   - Verify called without model override (defaults to Flash via callIndex)

### Integration Test

1. Real API test (3-page Bold theme)

   - Execute handleNARRATIVE_CONT_0()
   - Verify server logs show:

     ```
     [NAT-CONT] Step 1: Generating structure
     [QUOTA] Call 0: Using Gemini 2.5 Pro (structure generation) ✅

     [NAT-CONT] Step 2: Generating opening chapter
     [QUOTA] Call 1: Using Gemini 2.5 Pro (chapter generation) ✅ FIXED

     [NAT-CONT] Step 3: Generating middle chapter batches
     [QUOTA] Call 2: Using Gemini 2.5 Flash (batch generation) ✅

     [NAT-CONT] Step 4: Generating closing chapter
     [QUOTA] Call 3: Using Gemini 2.5 Pro (chapter generation) ✅ FIXED
     ```

   - Verify all chapters have full content (not stubs)
   - Verify execution time and timeout buffer

---

## Validation Criteria

**Fix is successful when**:

1. ✅ Opening chapter generation passes `{ model: "gemini-2.5-pro" }` to aiService
2. ✅ Closing chapter generation passes `{ model: "gemini-2.5-pro" }` to aiService
3. ✅ Server logs show Pro model used for opening and closing chapters
4. ✅ Real API test generates full narrative content for opening and closing chapters
5. ✅ All 54 unit tests still pass
6. ✅ NAT-CONT_0 feature flag still functional

---

## Architectural Alignment

**This fix strengthens architectural integrity by**:

1. **Respecting Separation of Concerns**: aiService handles routing, services only override when needed
2. **Maintaining Backwards Compatibility**: Existing implicit callIndex routing unchanged
3. **Enabling Future Complexity**: More sophisticated services (e.g., different models for different sections) can extend the optional model parameter
4. **Preserving Testability**: Services remain independently testable with mocked aiService

**Reference**: [BACKEND_ARCHITECTURE.md § Infrastructure Accounting as Separate Plumbing](../../../docs/current_design/BACKEND_ARCHITECTURE.md#infrastructure-accounting-as-separate-plumbing)

---

## Deployment Notes

- No database migration required
- No configuration changes required
- Backwards compatible (existing code unaffected)
- Can be deployed independently
- Recommended to test 10-page and 20-page samples after deployment to verify timeout behavior with corrected model routing

---

## Post-Fix Investigation

**After this fix is deployed, investigate**:

- Issue #2: Chapter 2 content generation returns stub instead of real content
  - May be related to batch API response parsing
  - Test with corrected model routing to see if Chapter 2 issue persists
  - If it does, investigate `tryParseBatchResponse()` logic in ebookService.js
