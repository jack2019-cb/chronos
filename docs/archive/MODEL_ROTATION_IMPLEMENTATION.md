# Model Rotation Implementation Guide

**Date**: December 11, 2025  
**Branch**: `feat/ebook-revert`  
**Status**: Archival/Never implemented  
**Audience**: Engineers implementing the feature  
**Time Estimate**: 1-2 hours

---

## Overview

This guide walks through consolidating separate methods and implementing model rotation across the Gemini API call chain.

**Changes Required:**

1. `server/geminiClient.js` - Add callIndex parameter, map to model URLs
2. `server/aiService.js` - Consolidate methods, pass callIndex through chain
3. `server/ebookService.js` - Update calls to use single method with callIndex

---

## Step 1: Modify geminiClient.callGemini()

### Current State

```javascript
async function callGemini({
  prompt,
  modality = "TEXT",
  generationConfig = {},
  imageB64 = null,
}) {
  const apiUrl = (isText ? process.env.GEMINI_API_URL_TEXT : ...) || process.env.GEMINI_API_URL;
  // ... always uses default URL
}
```

### Changes Needed

**Add callIndex parameter and model selection logic:**

```javascript
async function callGemini({
  prompt,
  modality = "TEXT",
  generationConfig = {},
  imageB64 = null,
  callIndex = null,  // NEW: Enable model rotation
}) {
  // NEW: Model selection based on callIndex
  let apiUrl, rawKey;

  if (callIndex !== null && callIndex === 0) {
    // Structure call: Use Gemini 2.5 Pro
    apiUrl = process.env.GEMINI_API_URL_VISION || process.env.GEMINI_API_URL;
    rawKey = process.env.GEMINI_API_KEY_VISION || process.env.GEMINI_API_KEY;
  } else if (callIndex !== null && callIndex > 0) {
    // Chapter calls: Use Gemini 2.5 Flash
    apiUrl = process.env.GEMINI_API_URL || process.env.GEMINI_API_URL_TEXT;
    rawKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_TEXT;
  } else {
    // No rotation: Use modality-based selection (existing logic)
    apiUrl = (isText ? process.env.GEMINI_API_URL_TEXT : ...) || process.env.GEMINI_API_URL;
    rawKey = (isText ? process.env.GEMINI_API_KEY_TEXT : ...) || process.env.GEMINI_API_KEY;
  }

  // ... rest of function unchanged
}
```

### Implementation Steps

1. Find line ~170 in geminiClient.js where callGemini is declared
2. Add `callIndex = null` to function parameters
3. Replace URL selection logic with model-based selection
4. Add debug logging for model choice

### Testing

```bash
# Test structure call (should use Pro)
curl -X POST http://localhost:3000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Test","theme":"light","pageCount":3}'

# Check logs: [QUOTA] Call 0: Using Gemini 2.5 Pro
```

---

## Step 2: Consolidate aiService Methods

### Current State

```javascript
class RealAIService {
  async generateContent(prompt) {
    // Actual API call
    return await callGemini({ prompt, modality: "TEXT" });
  }

  async generateContentWithRotation(prompt, callIndex = 0) {
    // Logs intent, then calls generateContent()
    console.log(`[QUOTA] Call ${callIndex}: Using ${...}`);
    return this.generateContent(prompt);  // ❌ callIndex lost
  }
}
```

### Changes Needed

**Merge into single method, pass callIndex through:**

```javascript
class RealAIService {
  /**
   * Generate content with optional model rotation
   * @param {string} prompt - The prompt text
   * @param {number|null} callIndex - Call index for model rotation
   *   - null: No rotation (use default/modality-based selection)
   *   - 0: Structure call (use Pro)
   *   - >0: Chapter call (use Flash)
   */
  async generateContent(prompt, callIndex = null) {
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("Prompt must be a non-empty string");
    }

    const geminiModule = this._ensureGemini();
    const callGemini = geminiModule.callGemini;
    const quotaTracker = geminiModule.quotaTracker;

    // Quota check
    const quotaCheck = quotaTracker.recordCall();
    if (!quotaCheck.success) {
      throw new Error(`Gemini quota limit: ${quotaCheck.message}`);
    }

    // Log model intent (NEW)
    if (callIndex !== null) {
      const modelName = callIndex === 0 ? "Pro" : "Flash";
      console.log(`[QUOTA] Call ${callIndex}: Using Gemini 2.5 ${modelName}`);
    }

    // API call with callIndex (CHANGED)
    try {
      const resp = await callGemini({
        prompt: String(prompt),
        modality: "TEXT",
        generationConfig: this.options.generationConfig || {},
        callIndex, // NEW: Pass callIndex to control model selection
      });

      if (!resp || resp.ok === false) {
        throw new Error(
          `Gemini call failed: ${resp?.error || "Unknown error"}`
        );
      }

      // Response parsing (unchanged)
      const text = resp.text || resp.rawText || JSON.stringify(resp.json) || "";
      const lines = text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);

      return {
        content: {
          title: lines[0]?.slice(0, 200) || "Generated Content",
          body: lines.slice(1).join("\n\n") || text,
          layout: "ai-generated",
        },
        metadata: {
          model: resp.json?.model || "gemini",
          status: resp.status,
        },
      };
    } catch (err) {
      throw err;
    }
  }
}
```

**Delete generateContentWithRotation() method** - no longer needed

### Implementation Steps

1. Find RealAIService class in aiService.js
2. Modify generateContent() signature to accept callIndex parameter
3. Add model selection logging
4. Pass callIndex to callGemini() call
5. Delete generateContentWithRotation() method entirely
6. Update MockAIService if it has similar methods

### Testing

```javascript
// Test that callIndex is properly passed through
const aiSvc = createAIService();
const result = await aiSvc.generateContent("Test prompt", 0);
// Expect logs: [QUOTA] Call 0: Using Gemini 2.5 Pro
```

---

## Step 3: Update ebookService Calls

### Current State

```javascript
// Line ~120 in ebookService.js
let structureResp = await aiSvc.generateContentWithRotation(structurePrompt, 0);

// Line ~190
chapterResp = aiSvc.generateContentWithRotation(contentPrompt, i + 1);
```

### Changes Needed

**Update all calls to use single consolidated method:**

```javascript
// Line ~120: Structure generation
let structureResp = await aiSvc.generateContent(structurePrompt, 0);

// Line ~190: Chapter generation
chapterResp = await aiSvc.generateContent(contentPrompt, i + 1);
```

### Implementation Steps

1. Find all calls to `generateContentWithRotation()` in ebookService.js
2. Replace with `generateContent()` (same method name, different parameters)
3. Verify callIndex values (0 for structure, i+1 for chapters)
4. No other changes needed

### Testing

```bash
# Generate 3-page ebook
# Expected logs:
# [QUOTA] Call 0: Using Gemini 2.5 Pro
# [QUOTA] Call 1: Using Gemini 2.5 Flash
# [QUOTA] Call 2: Using Gemini 2.5 Flash
# [QUOTA] Call 3: Using Gemini 2.5 Flash
```

---

## Environment Variables

Ensure these are configured:

```bash
# Pro model (structure)
GEMINI_API_URL_VISION=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent

# Flash model (chapters)
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent

# API key (same for both)
GEMINI_API_KEY=AIza...

# Enable real AI
USE_REAL_AI=1
```

**Note**: If `GEMINI_API_URL_VISION` not set, fallback to `GEMINI_API_URL`

---

## Code Review Checklist

- [ ] callIndex parameter added to callGemini()
- [ ] Model selection logic correctly maps callIndex → URL
- [ ] generateContentWithRotation() method deleted from aiService
- [ ] generateContent() accepts optional callIndex parameter
- [ ] Logging shows correct model for each call
- [ ] All ebookService calls updated to use single method
- [ ] callIndex values match intended use (0=Pro, >0=Flash)
- [ ] Quota tracking still works with new implementation
- [ ] No breaking changes to MockAIService interface
- [ ] Tests pass: `npm test` (should be no changes needed)

---

## Integration Testing

### Test 1: Verify Structure Uses Pro

```bash
curl -X POST http://localhost:3000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A magical story about a dragon",
    "theme": "light",
    "pageCount": 3
  }' 2>&1 | grep "Using Gemini 2.5"

# Expected: [QUOTA] Call 0: Using Gemini 2.5 Pro
```

### Test 2: Verify Chapters Use Flash

```bash
# Same request as above, check logs for:
# [QUOTA] Call 0: Using Gemini 2.5 Pro
# [QUOTA] Call 1: Using Gemini 2.5 Flash
# [QUOTA] Call 2: Using Gemini 2.5 Flash
# [QUOTA] Call 3: Using Gemini 2.5 Flash
```

### Test 3: Verify Quota Tracking

```bash
curl http://localhost:3000/api/quota-status
# Expected: callCount should increment by 4 for a 3-page ebook
```

### Test 4: MockAIService Still Works

```bash
USE_REAL_AI=0 npm test
# All tests should pass without modification
```

---

## Rollback Plan

If issues arise:

1. Revert aiService to previous version (git checkout)
2. Keep geminiClient changes (backward compatible)
3. Debug specific failure point
4. No schema migrations or data changes, so safe to revert

---

## Performance Considerations

- **Negligible overhead**: callIndex selection adds ~1ms
- **No additional API calls**: Just routing to different endpoint
- **Quota unchanged**: Still 20 calls/minute total
- **Network latency**: May vary between Pro and Flash, not directly controlled

---

## Success Metrics

After implementation:

1. ✅ Generate 3-page ebook → 4 API calls (1 Pro + 3 Flash)
2. ✅ Server logs show correct model for each call
3. ✅ Quota status endpoint shows 4 calls recorded
4. ✅ No "Failed to generate" errors (if API available)
5. ✅ HTML output valid and complete
6. ✅ All existing tests pass

---

## Troubleshooting

| Issue                    | Cause                                   | Fix                                                                      |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------ |
| All calls use Flash      | callIndex not passed to callGemini      | Add callIndex parameter to callGemini call in generateContent            |
| Structure fails with 400 | Wrong Pro URL format                    | Verify GEMINI_API_URL_VISION includes `:generateContent`                 |
| callIndex is undefined   | Missing parameter in ebookService calls | Ensure ebookService passes callIndex (0 for structure, i+1 for chapters) |
| Quota not incremented    | quotaTracker not called                 | Check that quotaTracker.recordCall() is called before API                |

---

## Related Files

- Architecture: `docs/design/MODEL_ROTATION_ARCHITECTURE.md`
- Gemini Models Reference: `docs/reference/GEMINI_MODELS_REFERENCE.md` - Specs for Pro/Flash, capabilities, config recommendations
- Current tests: `server/__tests__/aiService.test.js`
- Ebook service: `server/ebookService.js` (lines 95-220)
- API client: `server/geminiClient.js` (lines 170+)

---

**Owner**: Engineering Team  
**Status**: 🟢 READY TO IMPLEMENT
