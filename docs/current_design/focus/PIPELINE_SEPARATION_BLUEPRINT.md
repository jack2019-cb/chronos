# Three-Branch Divorce: Complete Git Separation

**Date**: December 16, 2025 @ 9:20AM
**Purpose**: Separate Legacy and NAT-CONT_0 approaches into completely independent Git branches  
**Status**: Architecture Blueprint (Pre-Implementation)

---

## Table of Contents

1. [The Three-Branch Model](#the-three-branch-model) - Visual diagram and overview
2. [The Divorce Process](#the-divorce-process) - Current state vs desired state
3. [Deployment Model](#deployment-model) - How branches are deployed
4. [Code Cleanup: What Gets Removed](#code-cleanup-what-gets-removed) - Specific deletions per branch
5. [Benefits of Complete Divorce](#benefits-of-complete-divorce) - Why this approach wins
6. [Migration Checklist](#migration-checklist) - Step-by-step implementation guide
7. [Summary: Three Branches, Complete Independence](#summary-three-branches-complete-independence) - Final recap

---

## The Three-Branch Model

```
                            main (baseline)
                                 │
                ┌───────────────┬┴─────────────────┐
                │               │                  │
                ↓               ↓                  ↓

    fix/nat-cont-model-routing  legacy-sequential  natcont-elegant
    ═══════════════════════════════════════════════════════════════

    REFERENCE                   NEW BRANCH          NEW BRANCH
    (UNTOUCHED)                 (Active)            (Active)

    Purpose:                    Purpose:            Purpose:
    Keep original NAT-CONT_0    Deploy Legacy       Deploy Your
    as baseline for comparison  approach only       Elegant solution

    Contains:                   Contains:           Contains:
    • Model-aware quota         • Sequential gen    • [Your approach]
    • Semantic routing          • Global quota      • Model-aware quota
    • Batch generation          • callIndex routing • Advanced routing
    • {pro, flash} costs        • Integer costs     • Optimized logic

    Status:                     Status:             Status:
    Do not modify               Ready to deploy     Ready to deploy
```

---

## The Divorce Process

### Current State (Coupled)

```
main branch
├─ Legacy sequential code
├─ NAT-CONT_0 code
├─ if (metadata.strategy === 'nat-cont_0') branching
├─ Shared quota infrastructure
└─ Both approaches compete for resources
```

### Desired State (Divorced)

**Three independent branches, zero coupling:**

#### Branch 1: legacy-sequential (NEW)

```bash
# Create from main
git checkout main
git checkout -b legacy-sequential

# THEN REMOVE:
❌ All NAT-CONT_0 code paths
❌ Strategy detection logic
❌ Model-aware quota tracking
❌ Batch generation code
❌ Tier-based routing
❌ Semantic call requirements

# KEEP:
✓ Sequential for-loop generation (1 chapter per call)
✓ callIndex-based routing (0→Pro, >0→Flash)
✓ Single global 20-call window quota
✓ Integer cost calculation
✓ Clean, linear code paths
```

#### Branch 2: natcont-elegant (NEW)

```bash
# Create from fix/nat-cont-model-routing
git checkout fix/nat-cont-model-routing
git checkout -b natcont-elegant

# THEN IMPLEMENT:
✓ Your sophisticated, elegant solution
✓ Model-aware quota (separate Pro/Flash windows)
✓ Advanced semantic routing
✓ Batch generation (or your approach)
✓ Tier-based allocation (or your approach)
✓ Zero legacy code paths

# REMOVE:
❌ All legacy sequential code
❌ callIndex-only routing fallback
❌ Global quota window logic
❌ Strategy detection
```

#### Branch 3: fix/nat-cont-model-routing (REFERENCE)

```bash
# DO NOT MODIFY
# Serves as historical baseline for original NAT-CONT_0
# Can use for comparison with natcont-elegant improvements
```

---

## Deployment Model

### One Branch, One Deployment

```
Environment Configuration:
ACTIVE_BRANCH = 'legacy' | 'natcont'

Deploy legacy-sequential:
  └─ Sequential chapter generation
  └─ Global quota
  └─ Simple routing
  └─ Pure legacy implementation

Deploy natcont-elegant:
  └─ Your elegant implementation
  └─ Model-aware quota
  └─ Advanced routing
  └─ Pure NAT-CONT_0 implementation
```

### No Runtime Strategy Detection

```javascript
// ❌ Does NOT exist in deployed code:
if (metadata.strategy === "nat-cont_0") {
  // ...
} else {
  // ...
}

// ✓ Instead: Branch itself determines behavior
// Deploy legacy-sequential → always sequential
// Deploy natcont-elegant → always your approach
// No conditionals, no strategy detection, no runtime overhead
```

---

## Code Cleanup: What Gets Removed

### From legacy-sequential Branch

```javascript
// ❌ DELETE from server/ebookService.js:
async function handleNARRATIVE_CONT_0(payload) { ... }
const batchSize = 3;  // Batch-related constants
async function generateChapterBatch(chapters) { ... }

// ❌ DELETE from server/genieService.js:
function calculateCostFromRequirements(requirements) { ... }
function buildRoutingMap(requirements, modelTiers) { ... }
function getCallRequirements(mode, metadata) { ... }
if (metadata?.strategy === 'nat-cont_0') { ... }

// ❌ DELETE from server/aiService.js:
const routingMap = options.routingMap;  // routing map support
if (routingMap) { ... }

// ❌ DELETE from server/quotaTracker.js:
const proCount = { ... }  // Model-specific tracking
const flashCount = { ... }
// Keep only: single global counter, 20-call/60s window

// KEEP: Sequential for-loop generation
for (let i = 1; i <= pageCount; i++) {
  const chapter = await aiService.generateContent(...);
}
```

### From natcont-elegant Branch

```javascript
// ❌ DELETE from server/ebookService.js:
for (let i = 1; i <= pageCount; i++) {
  // Sequential loop
  const chapter = await aiService.generateContent(prompt, { callIndex: i });
  chapters.push(chapter);
}

// ❌ DELETE from server/genieService.js:
function calculateCostForMode(mode, metadata) {
  // Integer cost
  return 1 + Math.ceil(pageCount / 2);
}

// ❌ DELETE from server/aiService.js:
if (callIndex === 0) return "pro";
else return "flash"; // Simple routing

// ❌ DELETE from server/quotaTracker.js:
let callCount = 0; // Global counter
function recordCall() {
  callCount++;
}

// ✓ IMPLEMENT: Your elegant approach
```

---

## Benefits of Complete Divorce

| Aspect            | Benefit                                                      |
| ----------------- | ------------------------------------------------------------ |
| **Code Clarity**  | Each approach visible, no conditionals obscuring logic       |
| **Performance**   | No runtime strategy detection overhead                       |
| **Testing**       | Test one approach at a time, pure isolation                  |
| **Maintenance**   | Update legacy without affecting elegant (or vice versa)      |
| **Optimization**  | Optimize each for its specific strategy, unconstrained       |
| **Deployment**    | Choose branch → deploy → done. No runtime decisions.         |
| **Git History**   | Clean diverging branches, easy to track changes              |
| **Debugging**     | Single code path per deployment, linear execution            |
| **Documentation** | Each branch documents only its approach                      |
| **Future**        | Add more strategies as new branches (no monolithic codebase) |

---

## Migration Checklist

### Create legacy-sequential Branch

```
□ git checkout main && git pull
□ git checkout -b legacy-sequential
□ Remove all NAT-CONT_0 code (see cleanup section above)
□ Test: npm test (should pass for legacy path)
□ Commit: "Create legacy-sequential branch: pure sequential implementation"
□ git push origin legacy-sequential
```

### Create natcont-elegant Branch

```
□ git checkout fix/nat-cont-model-routing
□ git checkout -b natcont-elegant
□ Implement your elegant solution
□ Test: npm test (should pass for elegant path)
□ Commit: "Create natcont-elegant branch: [your description]"
□ git push origin natcont-elegant
```

### Keep fix/nat-cont-model-routing Untouched

```
□ No modifications to fix/nat-cont-model-routing
□ Optionally: Add branch protection rules (if team preference)
□ Mark in documentation as "Reference, historical"
```

---

## Summary: Three Branches, Complete Independence

```
BEFORE DIVORCE (Coupled):
  main
  ├─ Legacy AND NAT-CONT_0 code mixed
  ├─ Strategy detection conditional
  └─ Shared, contested infrastructure

AFTER DIVORCE (Divorced):
  main (baseline)
    │
    ├─ fix/nat-cont-model-routing (REFERENCE)
    │  └─ Keep as-is, don't modify
    │
    ├─ legacy-sequential (ACTIVE)
    │  └─ Pure legacy, no NAT-CONT_0, deployable
    │
    └─ natcont-elegant (ACTIVE)
       └─ Pure elegant, no legacy, deployable

Deploy one branch at a time.
Each branch is completely self-contained.
No cross-branch dependencies.
No strategy detection in code.
No runtime conditionals.
No shared state conflicts.

The elegant solution can shine without legacy constraints.
The legacy approach remains clean and maintainable.
```

---

**Ready for implementation?** Once branches are created, your more powerful and elegant approach can be fully realized in the natcont-elegant branch without any legacy baggage.

**Date**: December 16, 2025 @ 9:20AM
**Purpose**: Separate Legacy and NAT-CONT_0 into completely independent Git branches  
**Status**: Architecture Blueprint (Pre-Implementation)

---

## Three-Branch Architecture

```
                            main (baseline)
                                 │
                ┌────────────────┬┴────────────────┐
                │                │                 │
                ↓                ↓                 ↓

    fix/nat-cont-model-routing  legacy-sequential  natcont-elegant
    (REFERENCE, UNTOUCHED)      (NEW BRANCH)       (NEW BRANCH)

    Status: Do Not Modify       Status: Active     Status: Active
    Purpose: Historical ref     Purpose: Deploy    Purpose: Deploy
             for NAT-CONT_0              Legacy              New Approach

    Contains: NAT-CONT_0        Contains: Legacy   Contains: Elegant
              (current state)            approach           approach

    ├─ Model-aware quota        ├─ Global quota    ├─ [User's sophisticated
    ├─ Semantic routing         ├─ Simple routing     solution]
    ├─ Batch generation         ├─ Sequential gen  ├─ Model-aware quota
    ├─ {pro, flash} costs       ├─ Integer costs   ├─ Advanced routing
    ├─ All NAT-CONT_0 logic     └─ Clean linear    └─ Optimized approach
    └─ Full codebase               code

    ✓ Never modified            ✓ No NAT-CONT_0    ✓ No legacy code
    ✓ Reference point           ✗ No legacy code   ✗ No legacy code
    ✓ Git history preserved     ✗ Not current
                                ✗ Not elegant
```

## Branch Independence Guarantee

Each branch is **completely self-contained**:

### fix/nat-cont-model-routing (Reference, Untouched)

```
server/
├─ index.js                          ← HTTP handler
├─ ebookService.js                   ← NAT-CONT_0 generation
├─ aiService.js                      ← Semantic routing
├─ geminiClient.js                   ← API wrapper
├─ quotaTracker.js                   ← Model-aware quota
├─ genieService.js                   ← {pro, flash} cost calculation
└─ [all other modules unchanged]
```

### legacy-sequential (New Branch from main)

```
server/
├─ index.js                          ← HTTP handler
├─ ebookService.js                   ← Sequential generation (LEGACY)
├─ aiService.js                      ← callIndex routing (LEGACY)
├─ geminiClient.js                   ← API wrapper
├─ quotaTracker.js                   ← Global 20-call window (LEGACY)
├─ genieService.js                   ← Integer cost calculation (LEGACY)
└─ [all other modules unchanged]

DELETED/REMOVED:
❌ All NAT-CONT_0 references
❌ Semantic routing code
❌ Model-aware quota logic
❌ Batch generation code
❌ {pro, flash} cost calculation
```

### natcont-elegant (New Branch from main or fix/nat-cont-model-routing)

```
server/
├─ index.js                          ← HTTP handler
├─ ebookService.js                   ← [User's elegant implementation]
├─ aiService.js                      ← [User's elegant routing]
├─ geminiClient.js                   ← [User's elegant API wrapper]
├─ quotaTracker.js                   ← [User's elegant quota system]
├─ genieService.js                   ← [User's elegant orchestration]
└─ [all other modules unchanged]

DELETED/REMOVED:
❌ All legacy sequential code
❌ callIndex-only routing
❌ Global quota window logic
❌ Integer cost calculation
❌ Conditional strategy detection
```

---

## Branch Creation Strategy

### Step 1: Create legacy-sequential Branch

**From**: main branch
**Purpose**: Extract and clean up legacy approach only

```bash
git checkout main
git pull origin main
git checkout -b legacy-sequential
```

**Then remove**:

- All NAT-CONT_0 code paths
- All semantic routing logic
- All model-aware quota tracking
- All batch generation code
- All tier-based allocation

**Result**: Pure legacy implementation with zero NAT-CONT_0 contamination

### Step 2: Create natcont-elegant Branch

**From**: fix/nat-cont-model-routing (or main as base)
**Purpose**: Implement your sophisticated, elegant approach

```bash
git checkout fix/nat-cont-model-routing
git checkout -b natcont-elegant
```

**Then implement**: Your more powerful and elegant solution

**Result**: Pure NAT-CONT_0 implementation with zero legacy contamination

### Step 3: Keep fix/nat-cont-model-routing Untouched

**Status**: Reference branch, no further changes
**Purpose**: Historical record of the original NAT-CONT_0 approach
**Git**: Mark as read-only in team conventions (branch protection if desired)

---

## Deployment Model: One Branch Per Environment

Unlike the within-branch approach, **each branch is deployed independently**:

### Deployment Configuration

```
Environment Variable / Config Parameter:
ACTIVE_BRANCH = 'legacy' | 'natcont'

If ACTIVE_BRANCH === 'legacy':
  └─ Deploy: legacy-sequential branch
     ├─ Sequential chapter generation
     ├─ Global 20-call quota window
     ├─ Simple callIndex routing
     └─ Pure legacy implementation

If ACTIVE_BRANCH === 'natcont':
  └─ Deploy: natcont-elegant branch
     ├─ [User's sophisticated approach]
     ├─ Model-aware quota tracking
     ├─ Advanced semantic routing
     └─ Pure elegant implementation
```

### No Runtime Strategy Detection

**Key Difference**: There is **NO** metadata.strategy detection in the deployed code.

```javascript
// ❌ DOES NOT EXIST in deployed branch:
if (metadata.strategy === "nat-cont_0") {
  // NAT-CONT_0 code
} else {
  // Legacy code
}
// This conditional branching is eliminated entirely

// ✓ INSTEAD: Branch itself determines behavior
// Deploy legacy-sequential → always sequential
// Deploy natcont-elegant → always elegant approach
```

### Simple, Linear Code

Each deployed branch contains **only its approach**:

**legacy-sequential branch** (deployed):

```javascript
// server/ebookService.js
async function handle(payload) {
  // Generate structure (Pro)
  const structure = await aiService.generateContent(prompt, {
    callIndex: 0,
  });

  // Generate chapters sequentially (Flash)
  const chapters = [];
  for (let i = 1; i <= pageCount; i++) {
    const chapter = await aiService.generateContent(prompt, {
      callIndex: i,
    });
    chapters.push(chapter);
  }

  // Compose HTML
  const html = composeHTML(structure, chapters, theme);

  return { content, chapters, html, metadata };
}
```

**natcont-elegant branch** (deployed):

```javascript
// server/ebookService.js
async function handle(payload) {
  // [User's elegant implementation - no conditionals, no legacy code]
}
```

---

## Request Flow: No Strategy Detection

### In server/index.js (HTTP Handler)

```javascript
app.post("/api/ebook/generate", async (req, res, next) => {
  try {
    // 1. Parse & validate input
    const { prompt, metadata } = req.body;
    await validateInput(prompt, metadata);

    // 2. Process request
    const result = await ebookService.handle({
      prompt,
      metadata,
      requestId: generateRequestId(),
    });
    // Note: ebookService behavior determined by deployed branch
    // - legacy-sequential branch: sequential generation
    // - natcont-elegant branch: elegant approach

    // 3. Format & return response
    const response = formatResponse(result);
    res.json(response);
  } catch (error) {
    next(error);
  }
});
```

**No strategy detection.** The deployed branch determines the behavior.

    // 2. Detect strategy
    const strategy = metadata?.strategy || "legacy";
    console.log(`[DISPATCH] Detected strategy: ${strategy}`);

    // 3. Route to appropriate pipeline
    let result;

    if (strategy === "nat-cont_0") {
      // Use NAT-CONT_0 pipeline
      const natcontPipeline = require("./pipelines/natcont");
      result = await natcontPipeline.handle({
        prompt,
        metadata,
        requestId: generateRequestId(),
      });
    } else {
      // Use Legacy pipeline (default)
      const legacyPipeline = require("./pipelines/legacy");
      result = await legacyPipeline.handle({
        prompt,
        metadata,
        requestId: generateRequestId(),
      });
    }

    // 4. Format response (shared envelope)
    const response = formatResponse(result, strategy);
    res.json(response);

} catch (error) {
next(error);
}
});

```

---

## Branch Purity Guarantee

### Each Branch is Isolated

**legacy-sequential** contains:
```

✓ Legacy implementation only
✓ Sequential generation
✓ Global quota window (20-call/60s)
✓ Simple callIndex routing
✓ Integer cost calculation

❌ NO NAT-CONT_0 code
❌ NO semantic routing
❌ NO model-aware quota
❌ NO batch generation
❌ NO tier-based allocation
❌ NO strategy detection logic

```

**natcont-elegant** contains:
```

✓ Your elegant implementation
✓ [Sophisticated approach details TBD]
✓ Model-aware quota
✓ Advanced semantic routing
✓ Batch generation (or better)

❌ NO legacy sequential code
❌ NO callIndex-only routing
❌ NO global quota window
❌ NO integer cost calculation
❌ NO conditional branching
❌ NO strategy detection logic

```

**fix/nat-cont-model-routing** (untouched):
```

✓ Reference branch
✓ Current NAT-CONT_0 state preserved

❌ NO MODIFICATIONS

```

---

## Testing Strategy: Branch-Specific

### legacy-sequential Branch Tests
```

server/**tests**/
├─ ebook.sequential.test.js
│ ├─ Test: Sequential chapter generation
│ ├─ Test: callIndex routing (0→Pro, >0→Flash)
│ └─ Test: Response envelope format
├─ quota.global.test.js
│ ├─ Test: Global 20-call window
│ ├─ Test: Auto-rotation at 60s
│ └─ Test: Single quota pool
└─ legacy_end_to_end.test.js
└─ Test: Full 10-page generation flow

```

### natcont-elegant Branch Tests
```

server/**tests**/
├─ ebook.elegant.test.js
│ ├─ Test: [User's generation approach]
│ ├─ Test: [User's routing approach]
│ └─ Test: Response envelope format
├─ quota.modelaware.test.js
│ ├─ Test: Model-aware Pro/Flash windows
│ └─ Test: [User's quota approach]
└─ natcont_end_to_end.test.js
└─ Test: Full generation flow

````

### No Cross-Branch Testing

**Forbidden**:
```javascript
❌ // Don't test both branches in same test file
❌ import legacyQuota from 'legacy-sequential/quotaTracker'
❌ import natcontQuota from 'natcont-elegant/quotaTracker'

✓ Each branch tests itself independently
✓ Deployment determines which tests run
````

**Callers**: Only `server/index.js` calls this.

---

### Orchestrator: `pipelines/{strategy}/orchestrator.js`

**Responsibility**: Pre-request quota check, cost calculation, service dispatch

**Exports**:

```javascript
module.exports = {
  async process(payload) {
    // payload = { prompt, metadata, requestId }
    // 1. Calculate cost (different per pipeline)
    // 2. Check quota (different per pipeline)
    // 3. Call service handler
    // returns { content, chapters, html, metadata }
  },
};
```

**Legacy Details**:

- `calculateCostForMode(mode, metadata)` → single integer
- `quotaTracker.getStatus()` → { callCount, availableQuota, ... }

**NAT-CONT_0 Details**:

- `calculateCostFromRequirements(requirements)` → { pro, flash }
- `quotaTracker.getStatus()` → { pro: {...}, flash: {...} }
- `buildRoutingMap(requirements)` → { 0: 'pro', 1: 'flash', ... }

---

### EbookService: `pipelines/{strategy}/ebookService.js`

**Responsibility**: Content generation (structure + chapters + HTML composition)

**Exports**:

```javascript
module.exports = {
  async handle(payload) {
    // payload = { prompt, metadata, requestId }
    // Guaranteed quota available from orchestrator
    // returns { content, chapters, html, metadata }
  },
};
```

**Legacy Details**:

- Sequential: callIndex=0 (Pro), callIndex=1..N (Flash)
- Each chapter is separate API call
- Simple linear flow

**NAT-CONT_0 Details**:

- Tiered: callIndex=0 (Pro/Expert), callIndex=1..N (Flash/Standard in batches)
- Chapters batched 2-3 per request
- Semantic tier-based generation
- Narrative continuity metadata

---

### AI Service: `pipelines/{strategy}/aiService.js`

**Responsibility**: Abstraction between service and API client, model selection

**Exports**:

```javascript
module.exports = {
  async generateContent(prompt, options) {
    // options = { callIndex } (legacy)
    //         or { tier, count, routingMap } (natcont)
    // returns { text, model, timestamp }
  },
};
```

**Legacy Details**:

- Router: `callIndex === 0 ? 'pro' : 'flash'`
- Simple binary selection
- No semantic information

**NAT-CONT_0 Details**:

- Router: `routingMap[callIndex]` or tier-based lookup
- Semantic tier information available
- Batch-aware generation

---

### Gemini Client: `pipelines/{strategy}/geminiClient.js`

**Responsibility**: HTTP calls to Gemini API, quota tracking

**Exports**:

```javascript
module.exports = {
  async callGemini(request) {
    // request = { model, prompt, ...options }
    // returns { text, model, timestamp }
  },
};
```

**Legacy Details**:

- Calls `quotaTracker.recordCall(model)`
- Tracker ignores model, just increments counter

**NAT-CONT_0 Details**:

- Calls `quotaTracker.recordCall(model)`
- Tracker tracks model-specific window (Pro vs Flash)
- May return different quota information

---

### Quota Tracker: `pipelines/{strategy}/quotaTracker.js`

**Responsibility**: Track API call usage within quota limits

**Exports**:

```javascript
module.exports = {
  recordCall(model) {
    // model = 'gemini-2.5-pro' or 'gemini-2.5-flash'
    // Legacy: ignores model, increments global counter
    // NAT-CONT_0: tracks model-specific window
  },

  getStatus(model?) {
    // Legacy: returns { callCount, availableQuota, ... }
    // NAT-CONT_0: returns { pro: {...}, flash: {...} }
  },
};
```

**Legacy Implementation**:

```javascript
// Single global 60-second window
const LIMIT = 20;
let callCount = 0;
let windowStart = Date.now();

function recordCall(model) {
  // model parameter ignored
  callCount++;
}

function getStatus() {
  return { callCount, availableQuota: LIMIT - callCount, ... };
}
```

**NAT-CONT_0 Implementation**:

```javascript
// Separate windows for Flash (15 RPM) and Pro (2 RPM)
const FLASH_LIMIT = 15;
const PRO_LIMIT = 2;
const WINDOW_MS = 60 * 1000;

let flashCount = 0, proCount = 0;
let flashStart = Date.now(), proStart = Date.now();

function recordCall(model) {
  // model = 'gemini-2.5-pro' or 'gemini-2.5-flash'
  if (model.includes('pro')) proCount++;
  else if (model.includes('flash')) flashCount++;
}

function getStatus(model?) {
  return {
    pro: { callCount: proCount, availableQuota: PRO_LIMIT - proCount, ... },
    flash: { callCount: flashCount, availableQuota: FLASH_LIMIT - flashCount, ... }
  };
}
```

---

## Testing Strategy

### Unit Tests: Pipeline-Specific

**Legacy Pipeline Tests**:

```
server/pipelines/legacy/__tests__/
├─ orchestrator.test.js
│  ├─ Test: Single integer cost calculation
│  ├─ Test: Global 20-call quota enforcement
│  └─ Test: 202 deferral on insufficient quota
├─ ebookService.test.js
│  ├─ Test: Sequential chapter generation
│  ├─ Test: callIndex routing (0→Pro, >0→Flash)
│  └─ Test: HTML composition
├─ aiService.test.js
│  ├─ Test: callIndex-based model selection
│  └─ Test: Mock vs Real AI service
└─ quotaTracker.test.js
   ├─ Test: Global counter increments
   ├─ Test: Window auto-rotation at 60s
   └─ Test: Single quota pool (all models mixed)
```

**NAT-CONT_0 Pipeline Tests**:

```
server/pipelines/natcont/__tests__/
├─ orchestrator.test.js
│  ├─ Test: {pro, flash} cost calculation
│  ├─ Test: Model-aware quota enforcement
│  └─ Test: buildRoutingMap() correctness
├─ ebookService.test.js
│  ├─ Test: Tier-based chapter batching
│  ├─ Test: Semantic routing via routingMap
│  └─ Test: Narrative continuity metadata
├─ aiService.test.js
│  ├─ Test: Semantic routing vs callIndex routing
│  └─ Test: routingMap override behavior
└─ quotaTracker.test.js
   ├─ Test: Separate Flash and Pro windows
   ├─ Test: Pro window auto-rotation (60s)
   ├─ Test: Flash window auto-rotation (60s)
   └─ Test: Independent quota pools
```

### Integration Tests: Pipeline as a Whole

```
server/__tests__/pipelines/
├─ legacy_end_to_end.test.js
│  ├─ Test: 10-page ebook → sequential generation
│  ├─ Test: Quota exhaustion behavior
│  └─ Test: Response envelope format
└─ natcont_end_to_end.test.js
   ├─ Test: 10-page ebook → batch generation
   ├─ Test: Model-aware quota exhaustion
   └─ Test: Response envelope format
```

### Zero Cross-Pipeline Tests

**Forbidden**:

```javascript
❌ // Don't do this:
const legacyQuota = require('server/pipelines/legacy/quotaTracker');
const natcontQuota = require('server/pipelines/natcont/quotaTracker');
// They are completely independent - testing one doesn't validate the other
```

---

## Migration Path: Current → Separated

### Phase 1: Create New Structure (No Changes to Existing)

```
✓ Create server/pipelines/legacy/ directory structure
✓ Create server/pipelines/natcont/ directory structure
✓ Create server/shared/ directory for common utilities
✓ Copy existing implementations to appropriate locations
✓ Update imports within each pipeline
✓ Add strategy detection logic to server/index.js
✓ Run both pipelines in parallel (test mode)
```

### Phase 2: Validation (Both Pipelines Active, Legacy Default)

```
✓ Route metadata.strategy === 'legacy' to legacy pipeline
✓ Route metadata.strategy === 'nat-cont_0' to natcont pipeline
✓ Route metadata.strategy === undefined to legacy (default)
✓ Compare outputs: both should generate valid ebooks
✓ Monitor quota behavior: independent per pipeline
✓ Run production traffic with optional strategy in metadata
```

### Phase 3: Deprecation (Legacy Phase-Out)

```
✓ Default: metadata.strategy = 'nat-cont_0' (switch default)
✓ Warn on legacy usage: "Legacy pipeline deprecated as of vX.Y.Z"
✓ Set expiration: "Legacy pipeline will be removed in vX.Y+1.Z"
✓ Document migration: Users update their requests
```

### Phase 4: Removal (Legacy Deleted)

```
✓ Remove server/pipelines/legacy/ directory entirely
✓ Update documentation
✓ Release as major version bump
```

---

## Naming Conventions

### Branch Names

- `pipelines/legacy/` - Sequential generation (current approach)
- `pipelines/natcont/` - NAT-CONT_0 Narrative Continuity (new approach)

### File Names

- Both pipelines have same internal structure (orchestrator.js, ebookService.js, etc.)
- File names are identical; distinguished by directory path
- No suffix like `_legacy` or `_natcont` needed (directory provides context)

### Import Examples

**Legacy Usage**:

```javascript
const pipeline = require("./pipelines/legacy");
const { orchestrator } = require("./pipelines/legacy/orchestrator");
const { quotaTracker } = require("./pipelines/legacy/quotaTracker");
```

**NAT-CONT_0 Usage**:

```javascript
const pipeline = require("./pipelines/natcont");
const { orchestrator } = require("./pipelines/natcont/orchestrator");
const { quotaTracker } = require("./pipelines/natcont/quotaTracker");
```

### Shared Utilities (No Suffix)

```javascript
const { validateInput } = require("../shared/validateInput");
const { formatResponse } = require("../shared/responseFormatter");
```

---

## Benefits of This Architecture

| Aspect                | Benefit                                                     |
| --------------------- | ----------------------------------------------------------- |
| **Clarity**           | Each pipeline is self-contained, easy to understand         |
| **Independence**      | No cross-pipeline coupling, no shared state conflicts       |
| **Testability**       | Test each pipeline in isolation, no mocking across paths    |
| **Maintainability**   | Update one pipeline without affecting the other             |
| **Performance**       | Optimize each pipeline for its specific strategy            |
| **Debugging**         | Logs clearly indicate which pipeline is active              |
| **Deprecation**       | Remove legacy pipeline without touching NAT-CONT_0          |
| **Future Strategies** | Add pipelines/strategy3/, pipelines/strategy4/, etc. easily |
| **Documentation**     | Each pipeline has its own architecture guide                |

---

## Quick Reference: What Changes vs What Stays

### What Changes

- ✅ File organization (pipelines/ subdirectories)
- ✅ Import paths (require('./pipelines/legacy') vs require('./pipelines/natcont'))
- ✅ Quota tracker implementations (single global vs model-aware)
- ✅ Cost calculation (integer vs {pro, flash})
- ✅ Strategy detection in server/index.js

### What Stays the Same

- ✅ API contract (POST /api/ebook/generate)
- ✅ Request schema (prompt, metadata)
- ✅ Response envelope (success, data, error)
- ✅ Database layer (db.js, Prisma)
- ✅ Other services (poetry, blog, etc.)
- ✅ Client code (no changes needed)

---

## Next Steps

1. **Create directory structure** (pipelines/legacy/, pipelines/natcont/, shared/)
2. **Migrate existing code** to pipelines/legacy/ (copy current implementations)
3. **Implement NAT-CONT_0 stack** in pipelines/natcont/ (with model-aware quota)
4. **Update server/index.js** to detect strategy and route accordingly
5. **Write pipeline-specific tests** for each path
6. **Validate both paths** produce correct results
7. **Document each pipeline** with architecture details

---

**Ready to implement?** This blueprint provides the structure. Once executed, the elegant NAT-CONT_0 approach can be unleashed fully.
