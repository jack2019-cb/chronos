# PART-B: Orchestrator as Service Provider (Waiter Pattern)

**Status**: DRAFT (Refined Design)  
**Date**: December 18, 2025  @ 5:35PM
**Branch**: `feat/ebook-nat-cont`  

**Purpose**: Define how autonomous services interact with orchestrator; no hard-coded dependencies  
**Related Documents**:

- [PART_A_AND_PART_B_CONCEPTUAL_FRAMEWORK.md](PART_A_AND_PART_B_CONCEPTUAL_FRAMEWORK.md) - Original (history)
- [SERVICE_MACHINE_PATTERN.md](SERVICE_MACHINE_PATTERN.md) - Service autonomy model
- [CONVERSATION_TRANSCRIPT.md](focus/CONVERSATION_TRANSCRIPT.md) - Design evolution

---

## Executive Summary

PART-B is the orchestrator (genieService) acting as a **waiter/service provider**. Services (ebookService, wallArtService, calendarService) are **customers** that request what they need without knowing implementation details.

**Core principle**: Services depend on `orchestrator.generate()` (generic interface), not on specific tools. If tools change, services remain unchanged.

---

## The Waiter Pattern

### Metaphor

```
Restaurant Analogy:

  CUSTOMER (ebookService)
    │ "I need content generated (expert tier)"
    │ "I need content generated (standard tier)"
    └─→ Places order with WAITER

  WAITER (genieService)
    │ Receives order
    │ Knows restaurant has: Chef A, Chef B, Chef C
    │ Decides which chef handles this order
    │ Manages timing, queue, sequencing
    ├─→ "Chef A, make this (expert tier)"
    ├─→ "Chef B, make this (standard tier)"
    └─→ Returns result to customer

  CUSTOMER receives result, doesn't know which chef made it
```

### Why This Matters

**Hard-coded approach** (mistake):

```javascript
// Service knows about specific tools
ebookService calls aiService directly
// If aiService → aiServices, code breaks
// If aiService → claudeService, service code changes
```

**Waiter pattern** (correct):

```javascript
// Service only knows about orchestrator
ebookService calls orchestrator.generate()
// If underlying tools change, service doesn't care
// Orchestrator handles the "how"
```

---

## Service Interface (Customer Request)

### Service Receives: Generic Orchestrator

```javascript
async function ebookService_handle(payload, resourceKit) {
  const { orchestrator, logger, config } = resourceKit;

  // Service ONLY depends on orchestrator interface
  // Does NOT import aiService, quotaTracker, etc.
  // Service does NOT know what orchestrator uses internally
}
```

### Service Calls: orchestrator.generate()

```javascript
async function ebookService_handle(payload, resourceKit) {
  const { orchestrator, logger, config } = resourceKit;

  // FIRST CALL: Include manifest
  const structure = await orchestrator.generate(
    structurePrompt,
    {
      tier: "expert",
      callIndex: 0,
      manifest: {
        totalRequests: 4,
        sequence: [
          { callIndex: 0, tier: "expert" },
          { callIndex: 1, tier: "expert" },
          { callIndex: 2, tier: "standard" },
          { callIndex: 3, tier: "expert" }
        ]
      }
    }
  );

  // SUBSEQUENT CALLS: No manifest
  const opening = await orchestrator.generate(
    openingPrompt,
    { tier: "expert", callIndex: 1 }
  );

  const middle = await orchestrator.generate(
    middlePrompt,
    { tier: "standard", callIndex: 2 }
  );

  const closing = await orchestrator.generate(
    closingPrompt,
    { tier: "expert", callIndex: 3 }
  );

  // Service composes result
  return {
    type: "ebook",
    pages: [structure, opening, middle, closing],
    html: await composeHTML(...),
    metadata: { cost: 4 }
  };
}
```

**What service declares**:

- ✅ `tier`: What quality level needed (expert vs standard)
- ✅ `callIndex`: Position in sequence
- ✅ `manifest`: (First call only) Total requests + sequence
- ✅ Nothing about implementation: No "aiService", no "Pro/Flash", no "quota"

---

## Orchestrator Interface (Waiter Fulfills Requests)

### What orchestrator.generate() Does

```javascript
// genieService instantiates the orchestrator
const orchestrator = {
  // Persistent state across all calls
  manifestReceived: false,
  manifest: null,
  eta: null,
  schedule: null,

  async generate(prompt, options) {
    // ─────────────────────────────────────────────
    // FIRST CALL: Capture manifest, compute ETA
    // ─────────────────────────────────────────────
    if (options.manifest && !this.manifestReceived) {
      this.manifestReceived = true;
      this.manifest = options.manifest;

      // WAITER ACTION 1: Compute timing
      this.eta = timeRegistry.compute(this.manifest);

      // WAITER ACTION 2: Build schedule
      this.schedule = buildFIFOSchedule(this.manifest);

      // WAITER ACTION 3: Update status
      statusMap.set(resultId, {
        status: "in-progress",
        eta: this.eta,
        calls_total: this.manifest.totalRequests,
        calls_completed: 0,
      });

      logger.info(
        `Manifest received: ${this.manifest.totalRequests} calls, ETA ${this.eta}s`
      );
    }

    // ─────────────────────────────────────────────
    // ALL CALLS: Enforce scheduling + spacing
    // ─────────────────────────────────────────────

    // Get the reserved time slot for this call
    const callSlot = this.schedule.calls[options.callIndex];

    logger.debug(
      `Call ${options.callIndex}: waiting until T+${callSlot.reservedTime}ms`
    );

    // WAITER ACTION 4: Enforce FIFO + spacing
    await waitUntil(callSlot.reservedTime);

    // ─────────────────────────────────────────────
    // WAITER DECIDES: Which tool to use?
    // ─────────────────────────────────────────────
    const selectedTool = this.selectTool(options.tier);
    // selectTool() returns: aiService | claudeService | etc.
    // Currently: returns aiService
    // Future: could return claudeService, anthropicService, etc.

    logger.info(
      `Call ${options.callIndex}: Using ${selectedTool.name} (${options.tier})`
    );

    // ─────────────────────────────────────────────
    // EXECUTE with selected tool
    // ─────────────────────────────────────────────
    const result = await selectedTool.generate(prompt, {
      tier: options.tier,
      model: tierToModel(options.tier), // Pro or Flash
    });

    // ─────────────────────────────────────────────
    // UPDATE PROGRESS
    // ─────────────────────────────────────────────
    statusMap.update(resultId, {
      calls_completed: options.callIndex + 1,
    });

    logger.debug(
      `Call ${options.callIndex}: Complete. Progress ${options.callIndex + 1}/${
        this.manifest.totalRequests
      }`
    );

    return result;
  },

  // WAITER'S DECISION: Which tool?
  selectTool(tier) {
    // Current: only aiService
    // Future: could be claudeService, anthropicService, etc.
    // Decision made by orchestrator, not service
    return aiService; // or based on config, user preference, etc.
  },
};

// Pass orchestrator to service
const resourceKit = {
  orchestrator, // ← Generic interface; service doesn't know what's inside
  logger, // ← For service debugging
  config, // ← Shared configuration
};

const result = await ebookService.handle(payload, resourceKit);
```

### What orchestrator Manages

| Responsibility          | Why Orchestrator                                 |
| ----------------------- | ------------------------------------------------ |
| **Manifest capture**    | Only orchestrator sees first call                |
| **ETA computation**     | timeRegistry is orchestrator's tool              |
| **FIFO scheduling**     | Orchestrator controls timing                     |
| **Spacing enforcement** | Orchestrator knows model limits                  |
| **Tool selection**      | Orchestrator decides which tool fulfills request |
| **Progress tracking**   | Orchestrator maintains status                    |
| **Quota enforcement**   | Orchestrator has quota awareness                 |

---

## Request Lifecycle with Waiter Pattern

### Timeline: 3-Page Ebook

```
T+0.00s   Frontend: POST /api/ebook/generate
T+0.05s   PART-A: Returns { resultId: "abc-123" }
T+0.10s   PART-B begins: ebookService.handle() called with orchestrator

T+0.15s   ebookService: First call
          orchestrator.generate(structurePrompt, {
            tier: "expert",
            callIndex: 0,
            manifest: { totalRequests: 4, ... }
          })

T+0.16s   Orchestrator:
          ├─ Receives manifest
          ├─ Computes ETA via timeRegistry: 42 seconds
          ├─ Builds FIFO schedule with Pro/Flash spacing
          ├─ Updates status: { eta: 42, calls_total: 4 }
          └─ Proceeds with call 0

T+0.17s   Orchestrator: selectTool(expert) → aiService
T+0.17s   Orchestrator: aiService.generate(structurePrompt, {tier: "expert", model: "pro"})

T+6.20s   Call 0 complete (Pro: 6 seconds)
T+6.20s   Orchestrator: updates status { calls_completed: 1 }
T+6.20s   Orchestrator: ebookService receives structure result

T+6.20s   ebookService: Second call
          orchestrator.generate(openingPrompt, {
            tier: "expert",
            callIndex: 1
            // NO manifest
          })

T+6.20s   Orchestrator: Get call slot [1]
T+6.45s   Orchestrator: wait until T+6.45s (Pro spacing: 250ms)
T+6.45s   Orchestrator: selectTool(expert) → aiService
T+6.45s   Orchestrator: aiService.generate(...)

T+12.50s  Call 1 complete
T+12.50s  Orchestrator: updates status { calls_completed: 2 }
T+12.50s  ebookService receives opening result

T+12.50s  ebookService: Third call
          orchestrator.generate(middlePrompt, {
            tier: "standard",
            callIndex: 2
          })

T+12.50s  Orchestrator: Get call slot [2]
T+12.65s  Orchestrator: wait until T+12.65s (Flash spacing: 100ms)
T+12.65s  Orchestrator: selectTool(standard) → aiService
T+12.65s  Orchestrator: aiService.generate(..., {tier: "standard", model: "flash"})

T+17.70s  Call 2 complete
T+17.70s  Orchestrator: updates status { calls_completed: 3 }
T+17.70s  ebookService receives middle chapters result

T+17.70s  ebookService: Fourth call
          orchestrator.generate(closingPrompt, {
            tier: "expert",
            callIndex: 3
          })

T+17.70s  Orchestrator: Get call slot [3]
T+17.80s  Orchestrator: wait until T+17.80s (Flash spacing: 100ms)
T+17.80s  Orchestrator: selectTool(expert) → aiService
T+17.80s  Orchestrator: aiService.generate(..., {tier: "expert", model: "pro"})

T+23.90s  Call 3 complete
T+23.90s  Orchestrator: updates status { calls_completed: 4 }
T+23.90s  ebookService receives closing result

T+23.95s  ebookService: Composes HTML, returns result

T+24.00s  PART-B complete: result returned to genieService
T+24.05s  genieService: Persist result, finalize
T+24.10s  statusMap: { status: "complete", result: {...} }

T+24.20s  Frontend: Polls /status/abc-123
T+24.20s  Response: { status: "complete", result: {...} }
T+24.25s  Frontend: Displays ebook
```

---

## Platform Scaling: No Hard-Coded Dependencies

### ebookService (Current)

```javascript
async handle(payload, resourceKit) {
  const { orchestrator } = resourceKit;

  const structure = await orchestrator.generate(prompt, {tier: "expert", callIndex: 0, manifest});
  const opening = await orchestrator.generate(prompt, {tier: "expert", callIndex: 1});
  const middle = await orchestrator.generate(prompt, {tier: "standard", callIndex: 2});
  const closing = await orchestrator.generate(prompt, {tier: "expert", callIndex: 3});

  return { pages, html, metadata };
}
```

### wallArtService (Future)

```javascript
async handle(payload, resourceKit) {
  const { orchestrator } = resourceKit;  // Same interface!

  const style = await orchestrator.generate(prompt, {tier: "standard", callIndex: 0, manifest});
  const art = await orchestrator.generate(prompt, {tier: "expert", callIndex: 1});

  return { html, metadata };
}
```

### calendarService (Future)

```javascript
async handle(payload, resourceKit) {
  const { orchestrator } = resourceKit;  // Same interface!

  const themes = await orchestrator.generate(prompt, {tier: "standard", callIndex: 0, manifest});
  const content = await orchestrator.generate(prompt, {tier: "standard", callIndex: 1});
  const holidays = await orchestrator.generate(prompt, {tier: "expert", callIndex: 2});

  return { html, metadata };
}
```

**All services use identical pattern**: Request via `orchestrator.generate()`. No dependencies on aiService, claudeService, or any specific tool.

---

## Tool Swapping: The Power of the Pattern

### Current: aiService Backend

```javascript
orchestrator.selectTool(tier) {
  return aiService;
}
```

**Service code**: No changes needed.

### Future: Add Claude Support

```javascript
orchestrator.selectTool(tier) {
  if (config.AI_PROVIDER === "claude") {
    return claudeService;
  }
  return aiService;  // fallback
}
```

**Service code**: No changes needed.

### Future: User Chooses Provider

```javascript
orchestrator.selectTool(tier) {
  const provider = getUserPreference();  // "gemini" | "claude" | "anthropic"

  switch (provider) {
    case "claude": return claudeService;
    case "anthropic": return anthropicService;
    default: return aiService;
  }
}
```

**Service code**: No changes needed.

### Future: Load Balancing

```javascript
orchestrator.selectTool(tier) {
  // Pick least-loaded service
  const services = [aiService, claudeService, anthropicService];
  return services.reduce((best, svc) =>
    svc.currentLoad < best.currentLoad ? svc : best
  );
}
```

**Service code**: No changes needed.

---

## Error Handling in Waiter Pattern

### Service Throws Error

```javascript
// If ebookService composition fails
throw {
  error: "ASSEMBLY_FAILED",
  message: "Cannot assemble ebook - missing components",
  missing: { chapters: [1, 3] },
};
```

Orchestrator catches and correlates (as per SERVICE_MACHINE_PATTERN).

### Orchestrator Handles Tool Failure

```javascript
async generate(prompt, options) {
  const selectedTool = this.selectTool(options.tier);

  try {
    const result = await selectedTool.generate(prompt, {...});
    // Success
    return result;
  } catch (err) {
    // Tool failed (Gemini error, network error, etc.)
    logger.error(`Tool ${selectedTool.name} failed:`, err);

    // Orchestrator decides: retry? fallback? fail?
    if (err.retryable && this.retryCount < 3) {
      return this.generate(prompt, options);  // retry
    }

    // Or: fallback to different tool
    if (err.provider_unavailable) {
      const fallback = this.selectFallback(options.tier);
      return fallback.generate(prompt, {...});
    }

    // Or: fail and propagate
    throw err;
  }
}
```

**Service is unaware**: Whether orchestrator retried, fell back, or failed. Service just gets result or error.

---

## Core Principles

### 1. Generic Interface, Specific Implementation

- **Service sees**: `orchestrator.generate()`
- **Orchestrator decides**: Which tool, when, with what spacing, retry strategy, etc.
- **Result**: Services stay simple; orchestrator handles complexity

### 2. Manifest-First Coordination

- **First call**: Service sends complete manifest (I need 4 calls total)
- **Orchestrator**: Captures manifest, computes ETA, builds schedule
- **Result**: Full visibility upfront; no surprises

### 3. FIFO + Spacing = Rate-Limiting

- **FIFO**: Services already produce calls in order (semantic)
- **Spacing**: Orchestrator enforces delays (250ms Pro, 100ms Flash)
- **Result**: Natural quota compliance, no rapid-fire

### 4. No Tool Hard-Coding

- Services don't import aiService
- Services don't know Pro/Flash model names
- Services don't manage spacing or quotas
- **Result**: Tools swappable without service changes

### 5. Reuse Across All Services

- ebookService, wallArtService, calendarService, poemService all follow identical pattern
- All receive `orchestrator` in resourceKit
- All call `orchestrator.generate()` with tier + callIndex + (manifest on first call)
- All return domain-specific results
- **Result**: Zero reinvention, maximum consistency

---

## Summary: The Waiter Pattern

```
Service (Customer)
  │ "I need content generated (expert tier)"
  │ "I need content generated (standard tier)"
  └─→ orchestrator.generate(...)

Orchestrator (Waiter)
  ├─ Captures what customer needs (manifest, tier, callIndex)
  ├─ Decides HOW to fulfill (which tool, when, with what spacing)
  ├─ Manages timing, quotas, sequencing
  └─→ Returns result to customer

Service (Customer)
  └─ Receives result, composes output
  └─ Returns final product
```

**No hard-coded dependencies. Pure decoupling. Full platform scalability.**

---

## Document Status

**Status**: DRAFT  
**Last Updated**: December 18, 2025  
**Key Insight**: Orchestrator acts as generic service provider (waiter); services request without knowing implementation
**Next**: Detailed manifest schema, time-registry logic, FIFO schedule building
