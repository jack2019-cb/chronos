# Model Rotation Architecture

**Date**: December 11, 2025 @ 1:20PM
**Branch**: `feat/ebook-revert`  
**Status**: Archival/Never implemented  
**Purpose**: Enable efficient Gemini API quota distribution across Pro and Flash models

---

## Problem Statement

The Gemini free tier provides a single API key with shared quota across multiple models:

- **Gemini 2.5 Pro**: Better reasoning, structured outputs
- **Gemini 2.5 Flash**: Faster, lower latency

**Current Architecture Limitation:**

- All API calls use a single model (Flash)
- Quota exhaustion on one model blocks both structure and chapter generation
- No distribution mechanism to balance load across available models

**Desired Outcome:**

- Structure generation uses Pro (better for outlining)
- Chapter generation uses Flash (faster, sufficient for content)
- Same API key distributes quota across both models
- Quota exhaustion on one doesn't block the other

---

## Solution: Unified Model Rotation

### Design Principle

**Single unified method with optional model selection**

Instead of separate `generateContent()` and `generateContentWithRotation()` methods:

- Consolidate into one method: `generateContent(prompt, callIndex)`
- `callIndex` parameter enables or disables model rotation
- Information flows through entire call chain

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│ ebookService.handle()                                       │
│ ├─ Structure call: generateContent(prompt, callIndex=0)    │
│ └─ Chapter calls: generateContent(prompt, callIndex=1..N)  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│ aiService.RealAIService.generateContent()                   │
│ ├─ Logs model intent based on callIndex                     │
│ ├─ Checks quota via quotaTracker                            │
│ └─ Calls geminiClient.callGemini(prompt, callIndex)        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│ geminiClient.callGemini()                                   │
│ ├─ Receives callIndex                                       │
│ ├─ Maps callIndex → model → API URL                         │
│ │   ├─ callIndex = 0 → Pro (GEMINI_API_URL_VISION)         │
│ │   └─ callIndex > 0 → Flash (GEMINI_API_URL)              │
│ ├─ Makes HTTP POST request                                  │
│ └─ Returns response                                         │
└─────────────────────────────────────────────────────────────┘
```

### Call Sequence Diagram

**Structure Generation (callIndex=0):**

```
ebookService: generateContent(prompt, 0)
    ↓
aiService: Logs "[QUOTA] Call 0: Using Gemini 2.5 Pro"
    ↓
geminiClient: Maps callIndex=0 → Pro model
    ↓
API: POST to gemini-2.5-pro endpoint
    ↓
Response: Structure outline (JSON)
```

**Chapter Generation (callIndex=1,2,3...):**

```
ebookService: generateContent(prompt, 1)
    ↓
aiService: Logs "[QUOTA] Call 1: Using Gemini 2.5 Flash"
    ↓
geminiClient: Maps callIndex=1 → Flash model
    ↓
API: POST to gemini-2.5-flash endpoint
    ↓
Response: Chapter content
```

---

## Key Design Decisions

| Decision                                        | Rationale                                     | Trade-offs                           |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------------ |
| **Single method with optional callIndex**       | Simpler API surface, no redundant wrappers    | callIndex=null disables rotation     |
| **callIndex as numeric code (0=Pro, >0=Flash)** | Maps naturally to structure/chapter sequences | Requires documentation               |
| **URL selection in callGemini**                 | Keeps API selection logic centralized         | callGemini needs callIndex parameter |
| **Quota tracking remains unchanged**            | Already working, no need to modify            | Quota tracked per-key, not per-model |
| **No retry/fallback logic**                     | Keeps design simple, avoids masking issues    | If Pro fails, entire structure fails |

---

## Quota Distribution Behavior

**Free Tier Assumption:**

- Single API key = 20 calls/minute shared quota
- Quota is distributed across models (not per-model)
- Exceeding 20 calls total → 429 Too Many Requests

**Example: 3-page ebook**

```
Request 1: Structure (Pro)     → 1 call total
Request 2: Chapter 1 (Flash)   → 2 calls total
Request 3: Chapter 2 (Flash)   → 3 calls total
Request 4: Chapter 3 (Flash)   → 4 calls total
Total: 4 calls / 20 min limit  → 80% quota remaining
```

**Benefit of Rotation:**

- If only Flash was used: all 4 calls on one model
- With rotation: 1 call on Pro, 3 on Flash = better distribution
- Single API key still has shared quota, but requests spread across models

---

## Error Handling

**Model-specific errors:**

- If Pro returns 503 (overloaded) → Structure generation fails
- If Flash returns 503 (overloaded) → Only that chapter fails
- QuotaTracker handles 429 errors globally (applies to entire ebook)

**Fallback Strategy:**

- No automatic fallback between models (keep simple)
- Caller (ebookService) decides whether to retry, defer, or fail

---

## Future Extensions

**Option A: Fallback Rotation**

- If Pro fails → retry with Flash for structure
- Requires async fallback logic

**Option B: Per-Model Quota Tracking**

- Track calls separately for Pro vs Flash
- Better visibility into model-specific usage
- Requires QuotaTracker redesign

**Option C: Dynamic Model Selection**

- Choose model based on prompt complexity/length
- Use ML/heuristics to estimate call cost
- More sophisticated, higher implementation cost

---

## Success Criteria

✅ Model rotation implemented and tested  
✅ Structure uses Pro API endpoint  
✅ Chapters use Flash API endpoint  
✅ Quota tracking remains accurate (20 calls/min)  
✅ Error messages clearly indicate which model was used  
✅ No performance regression (rotation adds negligible overhead)  
✅ Code is simpler than feat/revert-original version

---

## Related Documentation

- **Implementation Guide**: `docs/design/MODEL_ROTATION_IMPLEMENTATION.md`
- **Branch Strategy**: `docs/design/BRANCH_STRATEGY_FEAT_EBOOK_REVERT.md`
- **Gemini Models Reference**: `docs/reference/GEMINI_MODELS_REFERENCE.md` - Detailed specs, capabilities, and recommendations for Pro vs Flash models
- **Quota System**: Implemented as pure accounting module in orchestrator (ebookService)

---

**Owner**: Architecture Review  
**Status**: 🟢 READY FOR IMPLEMENTATION
