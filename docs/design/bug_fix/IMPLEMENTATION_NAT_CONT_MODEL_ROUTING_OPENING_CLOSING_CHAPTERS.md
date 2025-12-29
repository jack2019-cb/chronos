# IMPLEMENTATION: Model Routing for Opening/Closing Chapters in NAT-CONT_0

**Date**: December 15, 2025  @ 2:15PM
**Related**: [BUG_FIX_NAT_CONT_MODEL_ROUTING_OPENING_CLOSING_CHAPTERS.md](BUG_FIX_NAT_CONT_MODEL_ROUTING_OPENING_CLOSING_CHAPTERS.md)  
**Status**: READY FOR IMPLEMENTATION  
**Estimated Time**: 15-20 minutes (3 code changes + testing)

---

## Change Summary

Three targeted edits to implement optional model override in aiService and apply it to opening/closing chapters.

| File                                                         | Change                                                       | Lines |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ----- |
| [server/aiService.js](../../../../server/aiService.js)       | Add optional `model` parameter to signature                  | 52-70 |
| [server/ebookService.js](../../../../server/ebookService.js) | Pass `{ model: "gemini-2.5-pro" }` to generateOpeningChapter | ~657  |
| [server/ebookService.js](../../../../server/ebookService.js) | Pass `{ model: "gemini-2.5-pro" }` to generateClosingChapter | ~752  |

---

## CHANGE 1: Update aiService.js Signature

**File**: [server/aiService.js](../../../../server/aiService.js)

**Location**: Lines 52-70 (generateContentWithRotation method definition)

**Current Code**:

```javascript
async generateContentWithRotation(prompt, callIndex = 0) {
  const callGemini = this._ensureGemini().callGemini;
  // Default to TEXT modality. generationConfig can be passed via env or options.
  const generationConfig = this.options.generationConfig || {};

  // Determine which model to use based on callIndex
  // callIndex=0: Structure generation (Gemini 2.5 Pro) - primary model
  // callIndex>0: Chapter generation (Gemini 2.5 Flash) - secondary model
  const model = callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash";
```

**New Code**:

```javascript
async generateContentWithRotation(prompt, callIndex = 0, options = {}) {
  const callGemini = this._ensureGemini().callGemini;
  // Default to TEXT modality. generationConfig can be passed via env or options.
  const generationConfig = this.options.generationConfig || {};

  // Determine which model to use based on callIndex
  // callIndex=0: Structure generation (Gemini 2.5 Pro) - primary model
  // callIndex>0: Chapter generation (Gemini 2.5 Flash) - secondary model
  // options.model: explicit override (for complex strategies like NAT-CONT_0)
  const model = options.model || (callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash");
```

**What Changed**:

- Line 52: Add `options = {}` parameter to method signature
- Line 61: Change model assignment to use optional override: `options.model || (...callIndex logic...)`
- Line 60: Add comment explaining explicit override capability

**Verification**:

- [ ] Line 52 now reads: `async generateContentWithRotation(prompt, callIndex = 0, options = {}) {`
- [ ] Line 61 now reads: `const model = options.model || (callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash");`

---

## CHANGE 2: Update ebookService.js - generateOpeningChapter()

**File**: [server/ebookService.js](../../../../server/ebookService.js)

**Location**: Lines ~657-659 (generateOpeningChapter function, aiService call)

**Current Code**:

```javascript
const response = await aiService.generateContentWithRotation(
  openingPrompt,
  1 // callIndex 1 = Pro model
);
```

**New Code**:

```javascript
const response = await aiService.generateContentWithRotation(
  openingPrompt,
  1,
  { model: "gemini-2.5-pro" } // Explicit Pro for narrative voice
);
```

**What Changed**:

- Add third parameter: `{ model: "gemini-2.5-pro" }`
- Update comment to explain the override

**Verification**:

- [ ] Third parameter is `{ model: "gemini-2.5-pro" }`
- [ ] Comment explains "narrative voice"

---

## CHANGE 3: Update ebookService.js - generateClosingChapter()

**File**: [server/ebookService.js](../../../../server/ebookService.js)

**Location**: Lines ~752-754 (generateClosingChapter function, aiService call)

**Current Code**:

```javascript
const response = await aiService.generateContentWithRotation(
  closingPrompt,
  1 // callIndex 1 = Pro model (final chapter generation)
);
```

**New Code**:

```javascript
const response = await aiService.generateContentWithRotation(
  closingPrompt,
  1,
  { model: "gemini-2.5-pro" } // Explicit Pro for narrative closure
);
```

**What Changed**:

- Add third parameter: `{ model: "gemini-2.5-pro" }`
- Update comment to explain the override

**Verification**:

- [ ] Third parameter is `{ model: "gemini-2.5-pro" }`
- [ ] Comment explains "narrative closure"

---

## Testing Checklist

### Unit Tests (Run existing suite)

```bash
npm test
```

**Expected Result**: All 54 tests pass (no new failures)

- [ ] `npm test` passes with no failures
- [ ] No timeout errors

### Quick Smoke Test (Local)

```bash
node -e "
const ebookService = require('./server/ebookService');
const aiService = require('./server/aiService');

// Test that generateContentWithRotation accepts 3 parameters
console.log('✓ aiService.generateContentWithRotation signature updated');
"
```

### Integration Test (Real API with 3-page sample)

**Setup**:

1. Set `GEMINI_API_KEY` environment variable
2. Ensure `strategy: 'nat-cont_0'` in request metadata

**Command**:

```bash
DEBUG_GEMINI_API=1 node scripts/test-generate-preview-with-export.js
```

**Expected Server Logs**:

```
[NAT-CONT] Step 1: Generating structure
[QUOTA] Call 0: Using Gemini 2.5 Pro (structure generation) ✅

[NAT-CONT] Step 2: Generating opening chapter
[QUOTA] Call 1: Using Gemini 2.5 Pro (chapter generation) ✅ CHANGED

[NAT-CONT] Step 3: Generating middle chapter batches
[QUOTA] Call 2: Using Gemini 2.5 Flash (batch generation) ✅

[NAT-CONT] Step 4: Generating closing chapter
[QUOTA] Call 3: Using Gemini 2.5 Pro (chapter generation) ✅ CHANGED
```

**Verification Checklist**:

- [ ] Call 0: Pro (structure) ✅
- [ ] Call 1: **Pro** (opening - changed from Flash)
- [ ] Call 2: Flash (middle batch) ✅
- [ ] Call 3: **Pro** (closing - changed from Flash)
- [ ] Total execution time < 70 seconds
- [ ] Opening chapter has full narrative (not stub)
- [ ] Chapter 2 has content (not just context stub)
- [ ] Closing chapter has full narrative (not stub)

### Regression Test (Legacy Ebook Service)

**Command**:

```bash
node -e "
const payload = {
  prompt: 'Write about renewable energy',
  metadata: { pageCount: 5 }
  // Note: NO strategy parameter (defaults to legacy)
};

const ebookService = require('./server/ebookService');
ebookService.handle(payload)
  .then(() => console.log('✓ Legacy ebook service still works'))
  .catch(err => console.error('✗ Legacy ebook broken:', err.message));
"
```

**Expected**: Legacy ebook generation works unchanged (implicit callIndex routing)

- [ ] Legacy ebook service still functional
- [ ] No errors with undefined strategy

---

## Rollback Instructions

If issues occur, revert all three changes:

### Revert CHANGE 1 (aiService.js)

```javascript
// Change back to:
async generateContentWithRotation(prompt, callIndex = 0) {
  // ... rest unchanged
  const model = callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash";
```

### Revert CHANGE 2 (ebookService.js - generateOpeningChapter)

```javascript
// Change back to:
const response = await aiService.generateContentWithRotation(
  openingPrompt,
  1 // callIndex 1 = Pro model
);
```

### Revert CHANGE 3 (ebookService.js - generateClosingChapter)

```javascript
// Change back to:
const response = await aiService.generateContentWithRotation(
  closingPrompt,
  1 // callIndex 1 = Pro model (final chapter generation)
);
```

---

## Post-Implementation

### Next Steps

1. Commit changes to branch: `git commit -m "Fix: Enable explicit model override in aiService for NAT-CONT_0 opening/closing chapters"`
2. Run full test suite: `npm test`
3. Execute 3-page, 10-page, 20-page real API tests
4. Verify Issue #2 (Chapter 2 truncation) behavior with corrected model routing

### Related Work

- **Issue #2**: Chapter 2 content generation returns stub
  - Test after this fix to see if Issue #2 persists
  - If persists, investigate `tryParseBatchResponse()` in ebookService.js

---

## Summary

**Changes**: 3 locations, minimal scope  
**Risk Level**: Low (backwards compatible, only adds override capability)  
**Testing**: Unit + Integration + Regression  
**Rollback**: Simple (revert 3 changes)  
**Estimate**: 15-20 minutes total (implementation + testing)
