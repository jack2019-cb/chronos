# Pipeline Separation: NAT-CONT_0 Final (Clean Implementation)

**Date**: December 18, 2025 @ 4:10PM
**Branch**: `feat/ebook-nat-cont`  
**Status**: Target Specification (Pending Implementation)  
**Purpose**: Formalize the end-result of pipeline separation for NAT-CONT_0 branch — completely pure, zero legacy contamination

---

## Executive Summary

**Goal**: `feat/ebook-nat-cont` branch must be completely clean of legacy sequential code, strategy detection conditionals, and any fallback logic. The branch implements **only** NAT-CONT_0 orchestration with semantic tier-based routing.

**Current Gap**: PIPELINE_SEPARATION_IMPLEMENTATION describes the architecture, but the actual codebase still contains:

- ❌ `if (strategy === "nat-cont_0")` conditionals
- ❌ `handleLegacy()` implementation (200+ lines)
- ❌ callIndex-based routing fallback for Flash
- ❌ Legacy sequential loop in `ebookService.js`
- ❌ Strategy detection in `genieService.js`

**This Document**: Specifies exactly what the final, clean state should be.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Target Architecture](#target-architecture)
3. [Code Deletion Manifest](#code-deletion-manifest)
4. [File Structure: Final State](#file-structure-final-state)
5. [Documentation Updates Required](#documentation-updates-required)
6. [Verification Checklist](#verification-checklist)
7. [Why This Matters](#why-this-matters)
8. [Implementation Order](#implementation-order)
9. [Success Criteria](#success-criteria)
10. [Related Documents](#related-documents)

---

## Target Architecture: `feat/ebook-nat-cont`

### Core Principle

This branch contains **only** the NAT-CONT_0 orchestration strategy. No legacy code. No conditionals. No fallbacks.

```
REQUEST
   ↓
genieService.process(payload)
   ├─ Check persistence cache
   ├─ Calculate NAT-CONT_0 cost: 1 + ceil(pageCount/2)
   ├─ Enforce quota
   └─ Dispatch to NAT-CONT_0 ebook orchestrator (no branching)
      ↓
ebookService.handle(payload)
   ├─ Phase 1: Structure [Expert, Pro, callIndex=0]
   ├─ Phase 2: Opening [Expert, Pro, callIndex=1]
   ├─ Phase 3: Middle Chapters [Standard, Flash, callIndex=2..N-1]
   └─ Phase 4: Closing [Expert, Pro, callIndex=N]
      ↓
RESPONSE (200 or 202)
```

**Key Point**: No `if (strategy === ...)` anywhere. The deployed branch IS the strategy.

---

## Code Deletion Manifest

### From `server/ebookService.js`

**DELETE Lines 41-43** (strategy comments):

```javascript
❌ Supports multiple generation strategies via metadata.strategy:
❌ - "nat-cont_0": NAT-CONT (Pro for structure/ch1/final, Flash for batches)
❌ - undefined/default: Legacy sequential single-chapter generation
```

**DELETE Lines 64** (strategy parameter extraction):

```javascript
❌ strategy = undefined,
```

**DELETE Lines 103-140** (entire conditional dispatch):

```javascript
❌ // Strategy dispatch: NAT-CONT_0 for optimized generation
❌ if (strategy === "nat-cont_0") {
❌   console.log("[EBOOK] Using strategy: nat-cont_0 (Narrative Continuity)");
❌   const result = await handleNARRATIVE_CONT_0(payload, aiSvc);
❌   // ... (NAT-CONT result formatting)
❌   return { ... };
❌ }
❌
❌ // Legacy implementation for default strategy
❌ console.log("[EBOOK] Using strategy: legacy (default sequential generation)");
```

**DELETE Lines 142-1121** (entire legacy sequential implementation):

- `handleLegacy()` function
- Sequential for-loop chapter generation
- callIndex-based routing logic
- All fallback logic
- All comments referencing legacy approach

**KEEP ONLY**: Lines that implement NAT-CONT_0 logic (call `handleNARRATIVE_CONT_0()` directly without conditionals)

**Result**: `handle()` function becomes:

```javascript
async function handle(payload, classification) {
  // Input validation
  // AI service setup

  // Direct NAT-CONT_0 orchestration (NO conditionals)
  const result = await handleNARRATIVE_CONT_0(payload, aiSvc);

  // Format response
  return {
    pages: result.pages,
    html: result.html,
    metadata: { ..., model: "nat-cont_0" },
    actions: { ... }
  };
}
```

---

### From `server/genieService.js`

**DELETE references to strategy detection** (if present):

```javascript
❌ if (metadata?.strategy === 'nat-cont_0') { ... }
❌ else { ... legacy path ... }
```

**KEEP**: Direct NAT-CONT_0 dispatch:

```javascript
✓ case "ebook":
    const ebookService = require("./ebookService");
    result = await ebookService.handle(payload, classification);
    break;
```

---

### From `server/aiService.js`

**DELETE** (if present): Legacy callIndex-only routing:

```javascript
❌ if (callIndex === 0) return "pro";
❌ else return "flash"; // fallback routing
```

**KEEP**: Semantic tier-based resolution:

```javascript
✓ function resolveModel(tier) {
    const preferred = tierPreferences[tier];
    if (availableModels.includes(preferred)) return preferred;
    return availableModels[0]; // graceful degrade
  }
```

---

### From `server/quotaTracker.js`

**DELETE** (if present): Legacy global counter logic:

```javascript
❌ let callCount = 0; // Global counter
❌ function recordCall() { callCount++; }
```

**KEEP**: NAT-CONT_0 quota tracking:

```javascript
✓ function recordCall(model) {
    // Track by model (Pro vs Flash) if needed
    // or implement NAT-CONT_0 specific quota logic
  }
```

---

## File Structure: Final State

### `server/ebookService.js` (Cleaned)

```
├─ Exports: handle(payload, classification)
├─ Imports:
│   ├─ aiService (createAIService)
│   └─ Supporting utilities
│
├─ handle() function
│   ├─ Input validation (prompt, pageCount, theme, etc.)
│   ├─ Create AI service
│   └─ Direct call: handleNARRATIVE_CONT_0(payload, aiSvc)
│       (NO conditionals, NO fallback logic)
│   └─ Format and return NAT-CONT_0 result
│
├─ handleNARRATIVE_CONT_0(payload, aiSvc) — the ONLY strategy
│   ├─ Phase 1: Structure [Expert Tier, Pro]
│   ├─ Phase 2: Opening [Expert Tier, Pro]
│   ├─ Phase 3: Middle Chapters [Standard Tier, Flash, batched]
│   └─ Phase 4: Closing [Expert Tier, Pro]
│
└─ Supporting functions (compose HTML, format pages, etc.)
```

### `server/genieService.js` (Cleaned)

```
├─ calculateCostForMode(mode, metadata)
│   └─ For ebook: return 1 + ceil(pageCount/2) [NAT-CONT_0 cost]
│
├─ process(payload)
│   ├─ Persistence check
│   ├─ Cost calculation (NAT-CONT_0 cost model)
│   ├─ Quota enforcement
│   └─ Direct service dispatch (ebookService.handle)
│       (NO strategy detection, NO branching)
│
└─ Supporting functions
```

---

## Documentation Updates Required

### `BACKEND_ARCHITECTURE.md`

Update to reflect:

- ✅ Single strategy: NAT-CONT_0 only
- ✅ Remove "Two Strategies" references
- ✅ Remove all "Legacy Sequential" sections
- ✅ Show only NAT-CONT_0 architecture
- ✅ Update ToC to reflect single strategy

Header:

```
**Branch**: `feat/ebook-nat-cont` (NAT-CONT_0 only, legacy-free)
```

---

## Verification Checklist

After implementation, verify:

- [ ] `grep -r "strategy" server/ebookService.js` → No matches (or only NAT-CONT_0 mentions)
- [ ] `grep -r "handleLegacy" server/` → No matches
- [ ] `grep -r "if.*legacy" server/` → No matches
- [ ] `grep -r "callIndex === 0" server/aiService.js` → Only tier-based routing remains
- [ ] `ebookService.handle()` is <50 lines (no massive conditional block)
- [ ] All tests pass for NAT-CONT_0 path only
- [ ] Code review: No legacy sequential logic visible anywhere

---

## Why This Matters

Per PIPELINE_SEPARATION doctrine:

> "Each branch is completely self-contained. No cross-branch dependencies. No runtime conditionals. No strategy detection in code."

**Current state violates this**: Code has both strategies with conditionals.

**Target state achieves this**: Code has only NAT-CONT_0, zero legacy, pure implementation.

**Result**:

- Clarity: Read `ebookService.js` and see only NAT-CONT_0 logic
- Performance: No runtime strategy detection overhead
- Maintainability: Update NAT-CONT_0 without touching legacy concerns
- Deployment: Deploy this branch → always NAT-CONT_0, guaranteed

---

## Implementation Order

1. **Delete legacy sequential code** from `server/ebookService.js` (lines 142-1121)
2. **Simplify `handle()` function** to call `handleNARRATIVE_CONT_0()` directly
3. **Remove strategy detection** from `server/genieService.js`
4. **Clean up `server/aiService.js`** to remove callIndex fallback logic
5. **Update all imports/exports** to reflect new structure
6. **Run tests** to ensure NAT-CONT_0 path works correctly
7. **Update documentation** to reflect pure NAT-CONT_0 architecture
8. **Commit** with message: "feat(ebook): clean pipeline separation — remove legacy from feat/ebook-nat-cont"

---

## Success Criteria

### Code Cleanliness

- ✅ Zero strategy detection conditionals
- ✅ Zero legacy function implementations
- ✅ Zero fallback logic for Flash routing
- ✅ Direct NAT-CONT_0 orchestration only

### Documentation Accuracy

- ✅ BACKEND_ARCHITECTURE.md shows only NAT-CONT_0
- ✅ Branch header states "legacy-free"
- ✅ No "Two Strategies" references
- ✅ All flow diagrams show NAT-CONT_0 only

### Deployment Guarantee

- ✅ Deploy this branch → 100% NAT-CONT_0 behavior
- ✅ No strategy parameter needed in requests
- ✅ No runtime decision points
- ✅ Pure, lean, focused implementation

---

## Related Documents

- [PIPELINE_SEPARATION_BLUEPRINT.md](PIPELINE_SEPARATION_BLUEPRINT.md) — Architectural vision
- [PIPELINE_SEPARATION_IMPLEMENTATION.md](PIPELINE_SEPARATION_IMPLEMENTATION.md) — Implementation plan (prescriptive)
- [BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md) — System architecture (to be updated)
- [BACKEND_ARCHITECTURE_REF4.md](../BACKEND_ARCHITECTURE_REF4.md) — Historical reference (previous version)

---

**Status**: Ready for implementation. This document serves as the authoritative specification for achieving complete pipeline separation on `feat/ebook-nat-cont`.
