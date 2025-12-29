# Service Machine Pattern: Architecture for Platform Scaling

**Date**: December 18, 2025  @ 4:40PM
**Branch**: `feat/ebook-nat-cont`

**Status**: Architectural Pattern Definition (Brainstorm Session Outcome)  
**Context**: Platform design refactoring to support future services (wallArtService, calendarService, poemService, etc.)  
**Related**: [SPEC_VS_IMPLEMENTATION_GAP.md](SPEC_VS_IMPLEMENTATION_GAP.md) - Current implementation analysis

---

## Overview

The **Service Machine Pattern** defines how future services (ebookService, wallArtService, calendarService, etc.) should operate on the AetherPress platform.

**Core Concept**: Services are **machines** - specialized, autonomous task executors that own their business logic completely, take required resources from the orchestrator, and report failures clearly without managing infrastructure concerns.

---

## Table of Contents

1. [Overview](#overview)
2. [The Machine Metaphor](#the-machine-metaphor)
3. [Pattern Architecture](#pattern-architecture)
4. [Service Machine Contract](#service-machine-contract)
   - [Input: Resource Kit](#input-resource-kit)
   - [Output: Success Case](#output-success-case)
   - [Output: Failure Case](#output-failure-case)
5. [Service Machine Examples](#service-machine-examples)
   - [ebookService - The Ebook Machine](#ebookservice---the-ebook-machine)
   - [wallArtService - The Wall Art Machine](#wallartservice---the-wall-art-machine-hypothetical)
6. [Orchestrator's Role: Correlation & Context](#orchestrators-role-correlation--context)
   - [1. Machine Diagnostic](#1-machine-diagnostic)
   - [2. Quota Accounting](#2-quota-accounting)
   - [3. Request History & Utility Context](#3-request-history--utility-context)
   - [Combined Error Report](#combined-error-report)
7. [Platform Scaling Benefits](#platform-scaling-benefits)
   - [Adding a New Service](#adding-a-new-service)
   - [Adding a New Utility](#adding-a-new-utility)
8. [Principles](#principles)
   - [Service Autonomy](#service-autonomy)
   - [Utility Responsibility](#utility-responsibility)
   - [Error Information Flow](#error-information-flow)
9. [Checklist for New Services](#checklist-for-new-services)
10. [Related Documentation](#related-documentation)
11. [Status](#status)

---

## The Machine Metaphor

### What a Machine Is

A **service machine** (e.g., ebookService):

- Takes well-defined **inputs**: structure, chapters, images, metadata
- Performs a **specific task**: assemble these into an ebook
- Returns a **result**: complete ebook or failure report
- Operates **independently**: knows nothing about quota, persistence, or infrastructure

### What a Machine Knows

✅ **Owns**:

- How to sequence its work (structure → chapters → closing)
- What tiers it needs (expert tier for structure, standard for chapters)
- How to assemble outputs (composition logic)
- What it requires to succeed (inputs needed)
- What went wrong (diagnostic report)

❌ **Does NOT own**:

- Where inputs come from (utility: aiService)
- Quota accounting (utility: quotaTracker)
- Persistence mechanics (utility: persistence layer)
- Model selection (utility: aiService tier→model mapping)
- Export pipelines (utility: exportService)
- Error recovery strategies (orchestrator's job)
- Retry logic (orchestrator's job)

---

## Pattern Architecture

```
┌─────────────────────────────────┐
│     HTTP Request (index.js)     │
└────────────────┬────────────────┘
                 ↓
┌─────────────────────────────────┐
│  genieService (Orchestrator)    │
├─────────────────────────────────┤
│  1. Validate input              │
│  2. Check persistence cache     │
│  3. Calculate cost              │
│  4. Check quota availability    │
│  5. Prepare resourceKit         │
└────────────────┬────────────────┘
                 ↓
        ╔════════════════════╗
        ║  Resource Kit      ║
        ╠════════════════════╣
        ║ • aiService        ║
        ║ • quotaTracker     ║
        ║ • persistence      ║
        ║ • exportService    ║
        ║ • logger           ║
        ║ • config           ║
        ╚════════════════════╝
                 ↓
    ┌────────────────────────────┐
    │ SERVICE MACHINE SELECTION  │
    ├────────────────────────────┤
    │ if mode === "ebook"        │
    │   → ebookService.handle()  │
    │ if mode === "wallArt"      │
    │   → wallArtService.handle()│
    │ if mode === "calendar"     │
    │   → calendarService.handle()
    │ etc.                       │
    └────────────┬───────────────┘
                 ↓
    ┌────────────────────────────┐
    │ SERVICE MACHINE EXECUTION  │
    ├────────────────────────────┤
    │ Autonomous business logic  │
    │ • Uses resourceKit         │
    │ • Calls aiService.generate │
    │ • Composes output          │
    │ • Reports errors clearly   │
    │ • Returns result or error  │
    └────────────┬───────────────┘
                 ↓
┌─────────────────────────────────┐
│  genieService (Error Handler)   │
├─────────────────────────────────┤
│  ON SUCCESS:                    │
│  • Record quota usage           │
│  • Persist result               │
│  • Build response envelope      │
│                                 │
│  ON FAILURE (Fatal Error):      │
│  • Correlate quota accounting   │
│  • Correlate request history    │
│  • Correlate utility errors     │
│  • Build comprehensive report   │
│  • Return error envelope        │
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│     HTTP Response to Client     │
└─────────────────────────────────┘
```

---

## Service Machine Contract

### Input: Resource Kit

Every service receives the same standardized resource kit from the orchestrator:

```javascript
const resourceKit = {
  // AI generation with tier-based model routing
  aiService: {
    generate(prompt, { tier, callIndex }),
    // tier: "expert" (→ Pro), "standard" (→ Flash)
    // Returns: { content, metadata }
    // Throws: { code, message, details, retryable }
  },

  // Quota management (transactional)
  quotaTracker: {
    reserve(cost),           // Lock quota before work
    record(cost),            // Commit quota after success
    getStatus(),             // Check window/availability
    // NO cancel() - utility manages reservation state
  },

  // Data persistence
  persistence: {
    findByPrompt(prompt),    // Check cache
    save(result),            // Store result
    retrieve(resultId),      // Load result
    getRequestHistory(prompt) // Fetch attempt history
  },

  // File/export pipeline
  exportService: {
    generatePDF(html, options),
    saveToFile(data, path),
    uploadToCloud(data)
  },

  // Observability
  logger: {
    debug(msg, data),
    info(msg, data),
    error(msg, err),
    warn(msg, data)
  },

  // Shared configuration
  config: {
    MAX_PAGES: 50,
    MODEL_TIERS: { expert: "pro", standard: "flash" },
    TIMEOUT_GENERATION: 600000,
    // ... constants shared across all services
  }
};
```

### Output: Success Case

Service returns a result object:

```javascript
{
  type: "ebook",                    // Service type identifier
  id: "result-uuid",                // Unique result ID
  pages: [...],                     // Content pages
  html: "<html>...</html>",         // Rendered output
  metadata: {
    cost: 6,                        // Quota cost incurred
    duration_ms: 52000,             // Time taken
    model_calls: [
      { tier: "expert", model: "pro", duration_ms: 5000 },
      { tier: "standard", model: "flash", duration_ms: 20000 },
      ...
    ]
  }
}
```

### Output: Failure Case

Service throws a fatal error:

```javascript
throw {
  error: "ASSEMBLY_FAILED",
  message: "Cannot assemble ebook - missing required components",

  // What the MACHINE diagnostically reports
  missing: {
    chapters: [1, 3, 5],
    images: ["cover", "chapter_2_hero"],
    metadata: ["title"],
  },

  // Service may include context about what it tried
  attempted: {
    structure: { success: true, size: 2048 },
    chapter_1: { success: false, reason: "empty_response" },
    chapter_2: { success: true, size: 4096 },
    chapter_3: { success: false, reason: "api_error" },
    chapter_4: { success: true, size: 3500 },
    chapter_5: { success: false, reason: "timeout" },
  },
};
```

**Important**: Service does NOT interpret why components are missing, does NOT manage quota cleanup, does NOT decide whether to retry. It simply reports the diagnostic.

---

## Service Machine Examples

### ebookService - The Ebook Machine

```javascript
async function handle(payload, resourceKit) {
  const { aiService, quotaTracker, logger } = resourceKit;

  // MACHINE OWNS: Business logic
  const cost = this.calculateCost(payload);
  const reservation = quotaTracker.reserve(cost);

  try {
    // Step 1: Generate structure (expert tier)
    const structure = await aiService.generate(
      this.generateStructurePrompt(payload),
      { tier: "expert", callIndex: 0 }
    );

    // Step 2: Generate chapters (standard tier, batched)
    const chapters = [];
    for (let i = 0; i < payload.pageCount / 2; i++) {
      const chapter = await aiService.generate(
        this.generateChapterPrompt(payload, i),
        { tier: "standard", callIndex: i + 1 }
      );
      chapters.push(chapter);
    }

    // Step 3: Generate closing (expert tier)
    const closing = await aiService.generate(
      this.generateClosingPrompt(payload),
      { tier: "expert", callIndex: chapters.length + 1 }
    );

    // MACHINE OWNS: Composition logic
    if (!structure || !chapters.length || !closing) {
      throw {
        error: "ASSEMBLY_FAILED",
        message: "Cannot assemble ebook - missing required components",
        missing: {
          structure: !structure,
          chapters: !chapters.length,
          closing: !closing,
        },
      };
    }

    const html = this.composeHTML(structure, chapters, closing, payload);

    return {
      type: "ebook",
      id: generateId(),
      pages: [structure, ...chapters, closing],
      html,
      metadata: {
        cost,
        duration_ms: Date.now() - startTime,
      },
    };
  } catch (err) {
    // MACHINE does NOT manage cleanup
    // MACHINE does NOT decide retry strategy
    // MACHINE just throws
    logger.error("ebookService error", err);
    throw err;
  }
}
```

### wallArtService - The Wall Art Machine (Hypothetical)

```javascript
async function handle(payload, resourceKit) {
  const { aiService, exportService, logger } = resourceKit;

  const cost = 2;
  const reservation = quotaTracker.reserve(cost);

  try {
    // MACHINE OWNS: Art-specific business logic
    const styleAnalysis = await aiService.generate(
      this.generateStylePrompt(payload),
      { tier: "standard", callIndex: 0 }
    );

    const artDescription = await aiService.generate(
      this.generateArtPrompt(payload, styleAnalysis),
      { tier: "expert", callIndex: 1 }
    );

    if (!styleAnalysis || !artDescription) {
      throw {
        error: "ASSEMBLY_FAILED",
        message: "Cannot generate wall art - missing components",
        missing: {
          style: !styleAnalysis,
          description: !artDescription,
        },
      };
    }

    // MACHINE OWNS: Art composition (NOT export mechanics)
    const artHTML = this.composeArt(styleAnalysis, artDescription, payload);
    const pdfFile = await exportService.generatePDF(artHTML, {
      format: "poster",
      dimensions: "24x36",
    });

    return {
      type: "wall-art",
      id: generateId(),
      format: "pdf",
      html: artHTML,
      metadata: { cost },
    };
  } catch (err) {
    logger.error("wallArtService error", err);
    throw err; // MACHINE doesn't manage cleanup
  }
}
```

---

## Orchestrator's Role: Correlation & Context

When a service throws a fatal error, **genieService correlates three sources**:

### 1. Machine Diagnostic

What the service reported:

```javascript
{
  error: "ASSEMBLY_FAILED",
  missing: { chapters: [1, 3, 5] }
}
```

### 2. Quota Accounting

The orchestrator maintains quota context:

```javascript
const accounting = {
  cost_calculated: 6,
  quota_reserved: true,
  quota_committed: false, // Never made it to commit
  window_status: {
    before: "48/50 available",
    after_failure: "48/50 still available", // Quota reverted
  },
};
```

### 3. Request History & Utility Context

The orchestrator has logs of what happened:

```javascript
const history = {
  attempt_number: 2,
  previous_failures: 1,
  total_time_spent_ms: 95000,
  utility_errors: [
    {
      service: "aiService",
      call_index: 2,
      model: "gemini-2.5-flash",
      error: "EMPTY_RESPONSE",
      reason: "Gemini returned empty chapter response",
    },
  ],
};
```

### Combined Error Report

genieService builds comprehensive response:

```javascript
try {
  result = await serviceInstance.handle(payload, resourceKit);
  quotaTracker.record(cost);
  await persistence.save(result);
  return buildSuccessEnvelope(result);
} catch (err) {
  // CORRELATE: Machine + Accounting + History

  const errorReport = {
    // Machine's diagnostic
    error: err.error,
    message: err.message,
    missing: err.missing,

    // Orchestrator's accounting
    accounting: {
      quota_reserved: reservationWasMade,
      quota_committed: quotaWasCommitted,
      cost_calculated: cost,
      window_status: quotaTracker.getStatus(),
    },

    // Orchestrator's history
    history: {
      attempt_number: (await persistence.getRequestHistory(prompt)).length,
      total_time_spent_ms: getTotalTime(),
      previous_failures: countPreviousFailures(),
    },

    // Utility context (from logs)
    utility_context: {
      errors: await getUtilityErrorLog(requestId),
      // What utility errors caused the machine to fail?
    },
  };

  return res.status(500).json({
    ...errorReport,
    timestamp: new Date().toISOString(),
    requestId: reqId,
  });
}
```

**Client receives complete diagnostic**:

```json
{
  "error": "ASSEMBLY_FAILED",
  "message": "Cannot assemble ebook - missing required components",
  "missing": {
    "chapters": [1, 3, 5]
  },
  "accounting": {
    "quota_reserved": true,
    "quota_committed": false,
    "cost_calculated": 6,
    "window_status": {
      "callCount": 48,
      "limit": 50,
      "availableQuota": 2,
      "windowExpiresInMs": 12000
    }
  },
  "history": {
    "attempt_number": 2,
    "previous_failures": 1,
    "total_time_spent_ms": 95000
  },
  "utility_context": {
    "errors": [
      {
        "service": "aiService",
        "call_index": 2,
        "error": "EMPTY_RESPONSE",
        "model": "gemini-2.5-flash",
        "reason": "Gemini returned empty chapter response"
      },
      {
        "service": "aiService",
        "call_index": 4,
        "error": "TIMEOUT",
        "model": "gemini-2.5-flash",
        "reason": "API call exceeded 30s timeout"
      }
    ]
  },
  "requestId": "req-xyz-123",
  "timestamp": "2025-12-18T14:32:45.123Z"
}
```

---

## Platform Scaling Benefits

### Adding a New Service

To add `calendarService`:

```javascript
// 1. Create service file
// /server/calendarService.js
export async function handle(payload, resourceKit) {
  // Own your business logic
  // Use provided resourceKit
  // Return result or throw fatal error
}

// 2. Register in genieService
switch (mode) {
  case "calendar":
    result = await calendarService.handle(payload, resourceKit);
    break;
}

// 3. Done! No infrastructure changes needed.
```

**Why this scales**:

- ✅ New service uses same resourceKit (no reinvention)
- ✅ Same error handling pattern (no new error logic)
- ✅ Same quota tracking (no quota duplication)
- ✅ Same persistence interface (no data model changes)
- ✅ Orchestrator unchanged (no orchestration changes)

### Adding a New Utility

To add a `cachingLayer`:

```javascript
// 1. Create utility
// /server/utils/cachingLayer.js
export { cache, retrieve, invalidate };

// 2. Add to resourceKit in genieService
const resourceKit = {
  aiService,
  quotaTracker,
  persistence,
  exportService,
  cachingLayer, // NEW
  logger,
  config,
};

// 3. All services instantly inherit caching!
// No service changes needed.
```

---

## Principles

### Service Autonomy

| Aspect            | Service Owns      | Orchestrator Owns |
| ----------------- | ----------------- | ----------------- |
| Business logic    | ✅ How to compose | ❌                |
| Task sequencing   | ✅ Order of steps | ❌                |
| Error diagnosis   | ✅ What failed    | ❌                |
| Resource requests | ✅ What it needs  | ❌                |
| Cleanup/rollback  | ❌                | ✅                |
| Quota decisions   | ❌                | ✅                |
| Persistence       | ❌                | ✅                |
| Error recovery    | ❌                | ✅                |
| Retry strategy    | ❌                | ✅                |

### Utility Responsibility

Utilities own their own **state management**:

- quotaTracker manages reservation state (no service cancel calls needed)
- persistence manages transaction consistency
- exportService manages file cleanup
- aiService manages retry mechanics

Services use utilities; utilities manage themselves.

### Error Information Flow

```
Utility throws specific error
    ↓
Service catches or rethrows
    ↓
Orchestrator catches
    ↓
Orchestrator correlates with accounting + history + utility logs
    ↓
Client receives comprehensive report
```

No information lost; full transparency maintained.

---

## Checklist for New Services

To add a new service following the Machine Pattern:

- [ ] Service receives resourceKit (only parameter, besides payload)
- [ ] Service owns business logic (composition, sequencing, decisions)
- [ ] Service calls aiService.generate() (not orchestratorProxy callbacks)
- [ ] Service calls quotaTracker.reserve() at start
- [ ] Service throws fatal error with `missing` or `attempted` fields
- [ ] Service does NOT manage quota cleanup
- [ ] Service does NOT manage persistence
- [ ] Service does NOT manage export
- [ ] Service does NOT retry
- [ ] Service does NOT decide retry strategy
- [ ] Service errors include diagnostic details (not generic messages)

---

## Related Documentation

- [SPEC_VS_IMPLEMENTATION_GAP.md](SPEC_VS_IMPLEMENTATION_GAP.md) - Analysis of current gap between spec and implementation
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Current backend technical specification
- [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) - System goals and high-level architecture

---

## Status

**Pattern Definition**: Complete  
**Implementation Guidance**: Ready for adoption  
**Rollout**: Pending architecture review and refactoring plan

This pattern defines how future services should be built and how the orchestrator should manage them for a scalable, maintainable platform.
