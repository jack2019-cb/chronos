# Bug Fix: NAT-CONT Model Routing - Architectural Solution

**Date**: December 15, 2025 @ 6:25PM  
**Status**: ✅ IMPLEMENTED (December 16, 2025 @ 1:15 AM)  
**Branch**: fix/nat-cont-model-routing (commit e11be06)  
**Severity**: High (Design violation)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
   - [Root Cause Analysis](#root-cause-analysis)
   - [Why Services Must Express Intent](#why-services-must-express-intent)
3. [Architectural Solution](#architectural-solution)
   - [Three-Layer Responsibility Model](#three-layer-responsibility-model)
   - [Semantic Intent Model](#semantic-intent-model)
   - [Why This Preserves Architectural Purity](#why-this-preserves-architectural-purity)
4. [Data Flow & Cost Calculation](#data-flow--cost-calculation)
   - [Pre-Dispatch Flow (genieService)](#pre-dispatch-flow-genieservice)
   - [Call Execution Flow (aiService)](#call-execution-flow-aiservice)
5. [Cost Calculation: Before vs After](#cost-calculation-before-vs-after)
   - [Old Calculation (Incorrect)](#old-calculation-incorrect)
   - [New Calculation (Correct)](#new-calculation-correct)
   - [Quota Check Implementation](#quota-check-implementation)
6. [Model Routing Examples](#model-routing-examples)
   - [Example 1: 3-Page Ebook](#example-1-3-page-ebook)
   - [Example 2: 10-Page Ebook](#example-2-10-page-ebook)
   - [Example 3: Future Services (Backward Compatibility)](#example-3-future-services-backward-compatibility)
7. [Backward Compatibility & Migration](#backward-compatibility--migration)
8. [Comparison: Old vs New Implementation](#comparison-old-vs-new-implementation)
9. [Testing Strategy](#testing-strategy)
10. [Supersession Statement](#supersession-statement)
11. [Summary](#summary)
12. [Architecture Note: GitHub Secrets Infrastructure](#architecture-note-github-secrets-infrastructure)

---

## Executive Summary

The previous fix for NAT-CONT model routing violated architectural principles by leaking infrastructure concerns (model selection) into the business logic layer. This document provides the correct architectural solution that maintains separation of concerns while enabling semantic routing decisions.

**Previous Approach (Flawed)**:

- ebookService directly specifies model names: `{ model: "gemini-2.5-pro" }`
- Violates separation principle: services should never know about models or tiers
- Creates tight coupling: future model changes require code rewrites across services
- Hardcodes infrastructure decisions (model names) in business logic

**Correct Approach (This Fix)**:

- ebookService expresses semantic intent: `{ callRole: "opening" }`
- genieService (orchestrator) interprets intent → determines cost and routing
- aiService executes routing based on provided routing map
- Zero model awareness in business logic, zero coupling

---

## Problem Statement

### Root Cause Analysis

The NAT-CONT_0 strategy requires semantic distinction of chapters:

- **Opening chapter**: Narrative voice consistency (requires Pro model quality)
- **Middle chapters**: Content generation at scale (Flash model efficiency)
- **Closing chapter**: Narrative closure and polish (requires Pro model quality)

The original callIndex-based routing model was designed for homogeneous patterns:

```
callIndex=0 → Pro (always)
callIndex>0 → Flash (always)
```

This binary routing cannot express: "callIndex=1 should be Pro, callIndex=2...N-1 should be Flash, callIndex=N should be Pro."

### Why Services Must Express Intent

From BACKEND_ARCHITECTURE.md, Infrastructure Accounting section:

> "The ebook service and future content services have **zero awareness** of quota tracking, rate-limiting, or any accounting mechanics."

Services **should** express business requirements:

- "I need these chapters with narrative quality"
- "I need these chapters at high volume"

But services should **not** name infrastructure solutions:

- "Use gemini-2.5-pro"
- "Use gemini-2.5-flash"

**The gap in current design**: No abstraction for services to express semantic complexity (which chapters are special?) without naming models.

---

## Architectural Solution

### Three-Layer Responsibility Model

```
┌─────────────────────────────────────────────────────────────┐
│ Business Layer (ebookService)                               │
│ ✓ Declares WHAT it needs (semantic intent)                  │
│ ✓ Declares HOW it wants chapters treated (role-based)       │
│ ✗ NEVER specifies models, infrastructure, or quotas         │
└────────────────────┬────────────────────────────────────────┘
                     │ Passes: contentRequirements with callRoles
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Orchestration Layer (genieService)                          │
│ ✓ Receives semantic requirements                            │
│ ✓ Interprets requirements → model mapping                   │
│ ✓ Calculates correct quota costs                            │
│ ✓ Enforces quota pre-checks                                │
│ ✓ Builds routing map for infrastructure                     │
│ ✗ NEVER touches business logic or content generation        │
└────────────────────┬────────────────────────────────────────┘
                     │ Passes: routingMap { callIndex → model }
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Infrastructure Layer (aiService)                            │
│ ✓ Dumb routing: maps callIndex → model via provided map     │
│ ✓ Maintains backward compatibility (default fallback)       │
│ ✗ NEVER makes decisions about content, roles, or costs      │
└─────────────────────────────────────────────────────────────┘
```

### Semantic Intent Model

Services express intent through **call roles**, not models:

```javascript
// ebookService declares requirements (semantic)
const contentRequirements = {
  calls: [
    { callIndex: 0, role: "structure", type: "pro-required" },
    { callIndex: 1, role: "opening", type: "pro-required" },
    {
      callIndex: 2,
      role: "content",
      type: "flash-optimized",
      count: pageCount - 2,
    },
    { callIndex: pageCount + 1, role: "closing", type: "pro-required" },
  ],
};

// genieService interprets requirements (infrastructure decision)
const roleToModel = {
  structure: "gemini-2.5-pro",
  opening: "gemini-2.5-pro",
  content: "gemini-2.5-flash",
  closing: "gemini-2.5-pro",
};

// Build routing map from requirements
const routingMap = buildRoutingMap(contentRequirements, roleToModel);
// Result: { 0: "pro", 1: "pro", 2: "flash", 3: "flash", ..., N+1: "pro" }

// aiService applies routing map (dumb routing)
const model =
  routingMap[callIndex] ||
  (callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash");
```

### Why This Preserves Architectural Purity

**Separation of Concerns**:

- ebookService: "I need narrative quality here" (business statement)
- genieService: "Narrative quality → expert tier, high volume → standard tier" (infrastructure interpretation)
- Configuration: Maps expert → `EXPERT_MODEL`, standard → `STANDARD_MODEL` (model selection)
- aiService: "callIndex 1 maps to this model" (dumb routing)

**No Coupling**:

- If model strategy changes (e.g., use Claude instead of Gemini), ebookService unchanged
- If new service needs complex routing, can reuse genieService's interpretation layer
- Infrastructure decisions centralized, not scattered across services

**No Information Leakage**:

- Services never mention models
- Services never mention quotas
- Services never mention API selection
- Services express only business intent

**Backward Compatibility**:

- Services without routing maps work as before (default callIndex behavior)
- Existing code paths unchanged
- New routing path is opt-in

---

## Data Flow & Cost Calculation

### Pre-Dispatch Flow (genieService)

```
1. Receive request: { mode: "ebook", pageCount: 10, ... }

2. Determine mode requirements:
   const requirements = getCallRequirements(mode, pageCount);
   // Returns: {
   //   calls: [
   //     { callIndex: 0, role: "structure", type: "pro-required" },
   //     { callIndex: 1, role: "opening", type: "pro-required" },
   //     ...
   //   ]
   // }

3. Calculate quota cost from roles (not from simple pageCount formula):
   const cost = calculateCostFromRequirements(requirements);
   // OLD (wrong): { pro: 1, flash: pageCount/2 }  [structure + chapters only]
   // NEW (correct): { pro: 3, flash: pageCount-2 }  [structure + opening + closing + middle]

4. Check quota with corrected cost:
   if (proStatus.available < 3 || flashStatus.available < pageCount-2) {
     throw 202; // Defer
   }

5. Build routing map:
   const routingMap = buildRoutingMap(requirements);
   // { 0: "pro", 1: "pro", 2: "flash", ..., pageCount+1: "pro" }

6. Dispatch to service WITH routing context:
   const result = await ebookService.handle(payload, { routingMap });
```

### Call Execution Flow (aiService)

```
ebookService.generateContentWithRotation(prompt, callIndex=1, options={})
  ↓
RealAIService.generateContent(prompt, callIndex=1)
  ↓
// Route model selection (with routing map if provided)
const routingMap = options?.routingMap || {};
const modelForIndex = routingMap[callIndex];
const model = modelForIndex ||
              (callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash");

// callIndex=1, routingMap={0:"pro", 1:"pro", ...}
// → routingMap[1] = "pro"
// → Makes call with Pro model ✓
  ↓
geminiClient.callGemini({ model: "gemini-2.5-pro", prompt })
  ↓
Make API call, track quota
```

---

## Cost Calculation: Before vs After

### Old Calculation (Incorrect)

```javascript
// Assumed: structure always Pro, chapters always Flash
const cost = {
  pro: 1, // Only structure
  flash: ceil(pageCount / 2), // All chapters
};

// For pageCount=10:
// { pro: 1, flash: 5 }

// PROBLEM: Doesn't account for opening/closing needing Pro!
// Actual usage will be: { pro: 3, flash: 8 }
// But system thinks: { pro: 1, flash: 5 }
// Result: May exhaust Pro quota unexpectedly
```

### New Calculation (Correct)

```javascript
// Interprets requirements: structure + opening + closing = Pro
//                         middle chapters = Flash
const cost = {
  pro: 3, // structure + opening + closing
  flash: pageCount - 2, // middle chapters only (N-2 chapters)
};

// For pageCount=10:
// { pro: 3, flash: 8 }  ← Matches actual usage pattern

// Pre-check ensures:
// IF (available_pro >= 3 AND available_flash >= 8) THEN proceed
// ELSE defer with accurate quota information
```

### Quota Check Implementation

```javascript
// In genieService.process()
async function process(payload) {
  const { mode, metadata } = payload;

  // Step 1: Get call requirements based on mode and metadata
  const requirements = getCallRequirements(mode, metadata);
  // For NAT-CONT ebook:
  // {
  //   calls: [
  //     { callIndex: 0, role: "structure", type: "pro-required" },
  //     { callIndex: 1, role: "opening", type: "pro-required" },
  //     { callIndex: 2 to N-1, role: "content", type: "flash-optimized" },
  //     { callIndex: N+1, role: "closing", type: "pro-required" }
  //   ]
  // }

  // Step 2: Calculate cost from requirements
  const cost = calculateCostFromRequirements(requirements);
  // { pro: 3, flash: pageCount - 2 }

  // Step 3: Check quota
  const flashStatus = quotaTracker.getStatus("flash");
  const proStatus = quotaTracker.getStatus("pro");

  if (
    flashStatus.availableQuota < cost.flash ||
    proStatus.availableQuota < cost.pro
  ) {
    const err = new Error("Insufficient quota");
    err.status = 202;
    err.proNeeded = cost.pro;
    err.proAvailable = proStatus.availableQuota;
    err.flashNeeded = cost.flash;
    err.flashAvailable = flashStatus.availableQuota;
    throw err;
  }

  // Step 4: Build routing map from requirements
  const routingMap = buildRoutingMap(requirements);
  // { 0: "pro", 1: "pro", 2: "flash", 3: "flash", ..., N+1: "pro" }

  // Step 5: Dispatch to service (guaranteed quota available)
  const handler = getServiceHandler(mode);
  const result = await handler(payload, { routingMap });

  return result;
}
```

---

## Model Routing Examples

### Example 1: 3-Page Ebook

```javascript
// pageCount = 3
// Structure: callIndex 0
// Opening: callIndex 1
// Content: callIndex 2 (only 1 middle chapter: 3-2 = 1)
// Closing: callIndex 3

const routingMap = {
  0: "gemini-2.5-pro", // Structure
  1: "gemini-2.5-pro", // Opening
  2: "gemini-2.5-flash", // Middle content
  3: "gemini-2.5-pro", // Closing
};

const cost = { pro: 3, flash: 1 };

// Call sequence:
// Call 0: Pro (structure)      ← callIndex 0 → routingMap[0] = "pro"
// Call 1: Pro (opening)        ← callIndex 1 → routingMap[1] = "pro"
// Call 2: Flash (middle)       ← callIndex 2 → routingMap[2] = "flash"
// Call 3: Pro (closing)        ← callIndex 3 → routingMap[3] = "pro"
```

### Example 2: 10-Page Ebook

```javascript
// pageCount = 10
// Structure: callIndex 0
// Opening: callIndex 1
// Content: callIndex 2-9 (8 middle chapters: 10-2 = 8)
// Closing: callIndex 10

const routingMap = {
  0: "gemini-2.5-pro", // Structure
  1: "gemini-2.5-pro", // Opening
  2: "gemini-2.5-flash", // Content
  3: "gemini-2.5-flash", // Content
  4: "gemini-2.5-flash", // Content
  5: "gemini-2.5-flash", // Content
  6: "gemini-2.5-flash", // Content
  7: "gemini-2.5-flash", // Content
  8: "gemini-2.5-flash", // Content
  9: "gemini-2.5-flash", // Content
  10: "gemini-2.5-pro", // Closing
};

const cost = { pro: 3, flash: 8 };

// Quota check:
// Requires: pro >= 3, flash >= 8
// Previous calculation (wrong) would check: pro >= 1, flash >= 5
// This caused overages in real usage
```

### Example 3: Future Services (Backward Compatibility)

```javascript
// poetryService (no special routing needed)
// Sends no routingMap to genieService

async function handle(payload) {
  // genieService doesn't pass routingMap
  const result = await aiService.generateContent(prompt, 0, {});
  // aiService receives: options = {}
  // routingMap undefined, uses default: callIndex 0 = Pro, others = Flash ✓
  return result;
}

// blogService (no special routing needed)
// Works same way
```

---

## Backward Compatibility & Migration

### No Breaking Changes

Services without explicit routing requirements continue to work:

```javascript
// Old code (still works):
const result = await aiService.generateContent(prompt, callIndex);

// aiService behavior:
if (!options?.routingMap) {
  // Default behavior: callIndex 0 → Pro, others → Flash
  const model = callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash";
}

// ✓ Existing services unaffected
// ✓ Existing tests pass
// ✓ No code churn in other services
```

### Migration Path

1. **genieService**: Add `getCallRequirements()` for each mode
   - NAT-CONT ebook: returns { calls: [...] }
   - Other modes: returns { calls: [] } (no special routing)
2. **aiService**: Add routing map awareness

   - Check `options?.routingMap` before fallback
   - Use default if not provided

3. **ebookService**: No changes initially

   - Old code with `{ callRole: "opening" }` works as service ignores it
   - Later: Can add validation, logging for semantic correctness

4. **Testing**: Add genieService routing tests
   - Verify cost calculation accuracy
   - Verify routing map building
   - Verify quota checks with new costs

---

## Comparison: Old vs New Implementation

### Old Implementation (What Was Tried)

```javascript
// ebookService (WRONG: leaks infrastructure concern)
const openingChapter = await aiSvc.generateContentWithRotation(
  openingPrompt,
  1,
  { model: "gemini-2.5-pro" } // ✗ Service names the model!
);
```

**Problems**:

- Service knows model name (architectural violation)
- Service knows Pro is "better" (infrastructure decision in business layer)
- If models change, service code changes (tight coupling)
- Doesn't propagate to aiService (options.model never used)
- Doesn't fix quota calculation (still thinks pro:1, flash:pageCount/2)

### New Implementation (Correct)

```javascript
// ebookService (CORRECT: expresses only semantic intent)
const openingChapter = await aiSvc.generateContentWithRotation(
  openingPrompt,
  1,
  { callRole: "opening" } // ✓ Semantic, not infrastructural
);
```

**Flow**:

```
ebookService: callRole: "opening"
    ↓
genieService interprets: opening → Pro model
    ↓
Builds routing map: { 1: "pro", ... }
    ↓
Calculates cost: { pro: 3, flask: ... }
    ↓
Checks quota with correct cost
    ↓
Passes routingMap to aiService
    ↓
aiService: routingMap[1] = "pro"
    ↓
Makes call with correct model
```

**Advantages**:

- Service expresses only semantic need
- Infrastructure interprets and decides
- Tight coupling eliminated
- Quota calculation accurate
- Future model changes isolated to genieService
- Backwards compatible
- Clean separation of concerns

---

## Testing Strategy

### Unit Tests (genieService)

```javascript
describe("getCallRequirements", () => {
  test("NAT-CONT ebook returns correct structure", () => {
    const req = getCallRequirements("ebook", {
      pageCount: 10,
      strategy: "nat-cont_0",
    });

    expect(req.calls).toEqual([
      { callIndex: 0, role: "structure", type: "pro-required" },
      { callIndex: 1, role: "opening", type: "pro-required" },
      // callIndex 2-9: content
      { callIndex: 10, role: "closing", type: "pro-required" },
    ]);
  });
});

describe("calculateCostFromRequirements", () => {
  test("NAT-CONT ebook: 10 pages = 3 Pro + 8 Flash", () => {
    const requirements = getCallRequirements("ebook", { pageCount: 10 });
    const cost = calculateCostFromRequirements(requirements);

    expect(cost).toEqual({ pro: 3, flash: 8 });
  });

  test("Simple ebook: 10 pages = 1 Pro + 5 Flash", () => {
    // Without NAT-CONT strategy
    const cost = calculateCostFromRequirements({ calls: [] }); // no special routing
    expect(cost).toEqual({ pro: 1, flash: 5 }); // default fallback
  });
});

describe("buildRoutingMap", () => {
  test("Routes structure, opening, closing to Pro; middle to Flash", () => {
    const requirements = {
      calls: [
        { callIndex: 0, role: "structure" },
        { callIndex: 1, role: "opening" },
        { callIndex: 2, role: "content" },
        { callIndex: 3, role: "content" },
        { callIndex: 4, role: "closing" },
      ],
    };

    const map = buildRoutingMap(requirements);
    expect(map).toEqual({
      0: "gemini-2.5-pro",
      1: "gemini-2.5-pro",
      2: "gemini-2.5-flash",
      3: "gemini-2.5-flash",
      4: "gemini-2.5-pro",
    });
  });
});
```

### Integration Tests (genieService + aiService)

```javascript
describe("Full request flow with routing map", () => {
  test("3-page ebook: correct models called in sequence", async () => {
    const mockGemini = {
      callGemini: jest.fn().mockResolvedValue({ text: "content" }),
    };

    const result = await genieService.process({
      mode: "ebook",
      pageCount: 3,
      strategy: "nat-cont_0",
    });

    // Verify Gemini was called 4 times with correct models
    expect(mockGemini.callGemini).toHaveBeenCalledTimes(4);

    // Call 0: Pro (structure)
    expect(mockGemini.callGemini.mock.calls[0][0].model).toBe("gemini-2.5-pro");

    // Call 1: Pro (opening)
    expect(mockGemini.callGemini.mock.calls[1][0].model).toBe("gemini-2.5-pro");

    // Call 2: Flash (middle)
    expect(mockGemini.callGemini.mock.calls[2][0].model).toBe(
      "gemini-2.5-flash"
    );

    // Call 3: Pro (closing)
    expect(mockGemini.callGemini.mock.calls[3][0].model).toBe("gemini-2.5-pro");
  });
});
```

---

## Supersession Statement

**This document supersedes:**

- BUG_FIX_NAT_CONT_MODEL_ROUTING_OPENING_CLOSING_CHAPTERS.md
- IMPLEMENTATION_NAT_CONT_MODEL_ROUTING_OPENING_CLOSING_CHAPTERS.md

**Reason**: The earlier fix attempted to solve the problem by passing model names into the service layer, which violates the architectural principle of separation of concerns documented in BACKEND_ARCHITECTURE.md. This document provides the correct solution that maintains architectural integrity while achieving the same functional outcome.

**Status of earlier documents**: Historical reference only. Do not implement. See IMPLEMENTATION_NAT_CONT_MODEL_ROUTING_ARCHITECTURE_FIX.md for the correct implementation approach.

---

## Summary

This fix solves the model routing problem through **architectural purity**, not workarounds:

1. **Services express intent** (semantic): "I need this chapter with narrative quality"
2. **Orchestrator interprets** (infrastructure): "Narrative quality → expert tier"
3. **Infrastructure executes** (dumb routing): "callIndex 1 → use expert tier model from map"

Result: No coupling, no information leakage, no architectural violations, backward compatible, future-proof.

---

## Architecture Note: GitHub Secrets Infrastructure

**Key Infrastructure Advantage**: The tier abstraction leverages existing GitHub secrets infrastructure:

```
GitHub Secrets:
├── GEMINI_VISION_API_URL    ← Expert tier (full reasoning, vision)
├── GEMINI_API_URL           ← Standard tier (text generation, volume)
└── [Future: CLAUDE_EXPERT_URL, CLAUDE_STANDARD_URL, etc.]
```

**Why This Matters**:

- **Services never know model names**: ebookService doesn't care if it's "Pro", "Opus", or "GPT-4"
- **Tiers remain abstract**: Services express "I need expert quality" → infra maps to GEMINI_VISION_API_URL
- **Infrastructure distinctions preserved**: Different API URLs ensure different backends handle requests correctly
- **Easy to extend**: Add new model family? Just add new env vars, no code changes
- **Already battle-tested**: GitHub secrets management for sensitive credentials is production-ready

**Implementation Pattern**:

```javascript
// Configuration (from GitHub secrets, environment-driven)
const MODEL_TIERS = {
  expert:
    process.env.GEMINI_VISION_API_URL ||
    "https://generativelanguage.googleapis.com/...",
  standard:
    process.env.GEMINI_API_URL ||
    "https://generativelanguage.googleapis.com/...",
};

// Services express tier (semantic):
//   → "I need expert tier" (no model name knowledge)
//
// Routing uses tier → URL mapping:
//   → tier: "expert" → MODEL_TIERS.expert → GEMINI_VISION_API_URL
//   → tier: "standard" → MODEL_TIERS.standard → GEMINI_API_URL
//
// Infrastructure selects model based on endpoint:
//   → GEMINI_VISION_API_URL automatically routes to gemini-2.5-pro
//   → GEMINI_API_URL automatically routes to gemini-2.5-flash
```

This approach:

- ✓ Uses existing GitHub secrets infrastructure
- ✓ Maintains complete tier abstraction
- ✓ Eliminates hardcoded model names entirely
- ✓ Allows service to distinguish expert from standard **without model awareness**
- ✓ Future-proof (new backends? Just add new secrets)
- ✓ Already secure and managed by GitHub
