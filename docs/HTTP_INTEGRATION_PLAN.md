# HTTP Integration Layer: Proper Architecture Plan

**Date**: December 28, 2025  
**Branch**: `SERVICE-AUTON-reset-http` (sub-feature branch)  
**Status**: PLANNING (not yet implemented)  
**Issue**: Endpoints created incorrectly - using direct service invocation instead of `genieService` routing

---

## The Problem With Current Approach

Current implementation creates endpoints that:

```javascript
// ❌ WRONG: Direct async IIFE invocation
(async () => {
  const WallArtService = require("./services/wallArtService");
  const wallArtService = new WallArtService();
  // ... directly call service
})();
```

**Why this is wrong**:

1. Bypasses `genieService` orchestration layer
2. Doesn't use existing quota/permission checks
3. Doesn't follow ebook pattern already proven in codebase
4. Creates duplicate async handling logic
5. Won't integrate with monitoring/logging infrastructure

---

## The Correct Approach: Extend genieService

### Architecture Overview

```
HTTP Request
    ↓
POST /api/wall-art/analyze (endpoint)
    ↓
genieService.process({ mode: "wall-art", ... })  ← Single entry point
    ↓
Routes to correct service based on mode
    ↓
WallArtService (business logic)
    ↓
Orchestrator (Phase 1 infrastructure)
    ↓
Result → smartPoller → Status endpoint
```

This matches the ebook pattern exactly.

---

## Implementation Plan

### Step 1: Extend genieService to Support New Modes

**File**: `server/genieService.js`

**Changes**:

1. Add mode handlers for `wall-art` and `calendar`
2. Import services: `WallArtService`, `CalendarService`
3. Route in `process()` method:
   ```javascript
   async process(payload) {
     const { mode } = payload;

     switch (mode) {
       case "ebook":
         // existing ebook logic
       case "wall-art":
         return this.handleWallArt(payload);
       case "calendar":
         return this.handleCalendar(payload);
       // ...
     }
   }
   ```

**Methods to add**:

- `handleWallArt(payload)` - validates, creates Orchestrator, invokes WallArtService
- `handleCalendar(payload)` - validates, creates Orchestrator, invokes CalendarService

---

### Step 2: Update Endpoints to Use genieService

**File**: `server/index.js`

**WallArt Endpoint** (`POST /api/wall-art/analyze`):

```javascript
app.post("/api/wall-art/analyze", async (req, res) => {
  // Validate inputs
  const { prompt, style, dimensions } = req.body;

  // Return 202 immediately
  const resultId = uuidv4();
  smartPoller.assignTask(resultId, { eta: null, totalCalls: null });
  res.status(202).json({ resultId, status: "queued", ... });

  // Hand off to genieService (same as ebook pattern)
  genieService
    .process({
      resultId,
      mode: "wall-art",
      prompt,
      metadata: { style, dimensions }
    })
    .then(result => smartPoller.markComplete(resultId, result))
    .catch(err => smartPoller.markError(resultId, err));
});
```

**Calendar Endpoint** (`POST /api/calendar/generate`):
Same pattern, but with:

```javascript
genieService.process({
  resultId,
  mode: "calendar",
  prompt,
  metadata: { month, year, theme },
});
```

---

### Step 3: Refactor Services to Accept Orchestrator Context

**Current service signature** (WallArtService, CalendarService):

```javascript
async handle(payload, context) {
  const { orchestrator, onProgress } = context;
  // Service uses orchestrator directly
}
```

**These are correct** ✓ - keep as-is. Services are designed to work with Orchestrator + onProgress callback.

---

### Step 4: Create genieService Helper Methods

**New helper in genieService**:

```javascript
async handleWallArt(payload) {
  const { resultId, prompt, metadata } = payload;
  const { style, dimensions } = metadata;

  // Validate
  if (!prompt || !style) throw new Error("Invalid parameters");

  // Create orchestrator
  const Orchestrator = require("./orchestrator");
  const helpers = require("./helpers");
  const orchestrator = new Orchestrator(resultId, helpers);

  // Invoke service
  const WallArtService = require("./services/wallArtService");
  const service = new WallArtService();

  return service.handle(
    { resultId, prompt, style, dimensions },
    {
      orchestrator,
      onProgress: (update) => {
        const smartPoller = require("./utilities/smartPoller");
        smartPoller.updateProgress(resultId, update);
      }
    }
  );
}

async handleCalendar(payload) {
  // Identical pattern, different service
}
```

---

### Step 5: Update Existing Ebook Endpoint (If Different)

**Current ebook endpoint** uses:

```javascript
genieService.process({
  resultId,
  mode: "ebook",
  prompt,
  metadata: { theme, pageCount, ... }
})
```

**Verify** this pattern works and apply same pattern to new endpoints.

---

## Benefits of This Approach

✅ **Consistent**: Uses same pattern as ebook (proven, tested)  
✅ **Maintainable**: Single entry point (genieService) for all generation modes  
✅ **Integrated**: Leverages existing quota, monitoring, logging  
✅ **Testable**: Can test genieService mode routing separately  
✅ **Scalable**: Adding new services just means adding new mode handler

---

## Comparison: Wrong vs Right

| Aspect         | Wrong (Current) | Right (Planned)         |
| -------------- | --------------- | ----------------------- |
| Async handling | Direct IIFE     | Via genieService        |
| Quota checks   | None            | Via genieService        |
| Monitoring     | None            | Via genieService        |
| Pattern        | New/unique      | Matches ebook           |
| Logging        | Basic           | Integrated              |
| Error handling | Local           | Via genieService        |
| Testing        | Endpoint only   | genieService + endpoint |

---

## Implementation Checklist

- [ ] **Step 1**: Extend genieService with `handleWallArt()` and `handleCalendar()` methods
- [ ] **Step 2**: Update `/api/wall-art/analyze` to use `genieService.process()`
- [ ] **Step 3**: Update `/api/calendar/generate` to use `genieService.process()`
- [ ] **Step 4**: Remove direct service imports from endpoints
- [ ] **Step 5**: Remove async IIFE from endpoints
- [ ] **Step 6**: Test both endpoints return 202 immediately
- [ ] **Step 7**: Verify status endpoint returns orchestrator metadata
- [ ] **Step 8**: Run performance tests
- [ ] **Step 9**: Commit and create PR from SERVICE-AUTON-reset-http → SERVICE-AUTON-reset

---

## Key Insight

The ebook endpoint already solved this problem correctly. We should **copy that exact pattern** rather than inventing a new one:

**Ebook pattern** (working):

1. Endpoint validates input
2. Endpoint returns 202 immediately with resultId
3. Endpoint hands off to `genieService.process()`
4. genieService routes based on mode
5. Service logic executes async
6. Result → smartPoller → Status endpoint

**Our new endpoints should follow the same 5-step pattern exactly.**

---

**Status**: Ready to implement when you return  
**Estimated Time**: 2-3 hours  
**Risk**: Low (following proven pattern)  
**Complexity**: Medium (requires understanding genieService routing)
