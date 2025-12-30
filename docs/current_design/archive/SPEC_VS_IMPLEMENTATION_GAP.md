# Specification vs Implementation Gap: genieService ↔ ebookService Interaction

**Date**: December 18, 2025 @ 4:05PM
**Branch**: `feat/ebook-nat-cont`

**Status**: Analysis of Current Working Implementation  
**Scope**: Architectural alignment assessment between documented design and actual behavior

---

## Executive Summary

The BACKEND_ARCHITECTURE specification describes genieService and ebookService as having **layered independence** with clear separation of concerns. The actual working implementation reveals a tighter coupling pattern: ebookService functions as a **choreography extension** of genieService rather than an autonomous service layer.

**Key Finding**: The system works—but the architectural narrative does not match the structural reality.

---

## Documented Design (BACKEND_ARCHITECTURE.md)

### Claimed Architecture

**Layer Model:**

```
HTTP Entry Point (index.js)
         ↓
Orchestration Layer (genieService)
    - Routes by mode
    - Enforces quota
    - Manages persistence
    - Composes HTML
         ↓
Service Layer (ebookService)
    - Pure business logic
    - Composition strategy (NAT-CONT_0)
    - Semantic tier declaration
    - INDEPENDENT from infrastructure
         ↓
Infrastructure Layer (aiService, geminiClient)
    - Model routing
    - API dispatch
    - Quota tracking
```

### Claimed Responsibilities & Firewall

**ebookService responsibilities:**

- ✅ Declare semantic tiers (expert vs standard)
- ✅ Compose coherent multi-part output
- ✅ Assemble pages into HTML
- ❌ Access quota management
- ❌ Access model selection
- ❌ Access persistence layer
- ❌ Access Gemini API directly

**Design Principle**: "ebookService is completely unaware of quotaTracker, geminiClient, persistence, rate limiting, or model selection."

### Claimed Benefits

Per BACKEND_ARCHITECTURE:

1. **Independence**: Services evolve without touching infrastructure
2. **Testability**: Mock only orchestratorProxy interface
3. **Replaceability**: Swap Gemini/Claude or SQLite/PostgreSQL without touching services
4. **Resilience**: Infrastructure constraints handled by orchestrator
5. **Clarity**: Business logic in service, infrastructure plumbing in orchestrator

---

## Actual Implementation Pattern

### What Really Happens

**ebookService execution model:**

```javascript
async handle(payload, orchestratorProxy) {
  // Step 1: Make a call via orchestratorProxy
  const structure = await orchestratorProxy.generate(
    structurePrompt,
    { callIndex: 0, tier: "expert" }
  );
  // ↓ Control transfers to genieService.orchestratorProxy.generate()

  // Step 2: Make another call via orchestratorProxy
  const chapter1 = await orchestratorProxy.generate(
    chapter1Prompt,
    { callIndex: 1, tier: "expert" }
  );
  // ↓ Control transfers to genieService.orchestratorProxy.generate()

  // Step 3-N: Repeat pattern for all chapters
  // ↓ Each call transfers to genieService

  // Final: Compose and return
  return { pages, html, metadata };
}
```

**Critical observation**: ebookService makes **zero autonomous decisions**. Every substantive operation flows through orchestratorProxy back into genieService:

- **Tier declaration** → genieService translates to model (expert→Pro, standard→Flash)
- **Content generation** → genieService checks quota, calls Gemini, records usage
- **Metadata assembly** → genieService provides (service only composes)
- **Persistence** → genieService handles (service never interacts)
- **Error handling** → genieService controls (service receives happy path only)

### Architectural Reality

```
HTTP Request
    ↓
genieService.process()
    ├─ [genieService controls: validation, persistence check, quota calculation]
    │
    ├─ Creates orchestratorProxy interface
    │
    └─→ ebookService.handle(payload, orchestratorProxy)
         │
         ├─ [ebookService declares semantic intent only]
         │
         └─→ Calls orchestratorProxy.generate()
             └─→ [genieService intercepts and controls:
                 ├─ Quota enforcement
                 ├─ Model selection
                 ├─ Gemini API call
                 ├─ Usage recording
                 └─ Error handling]

         └─→ Repeats for each component call

         └─ Returns composed pages/html

    ├─ [genieService controls: persistence, response formatting]
    │
    └─ Return final envelope
```

**The structural reality**: ebookService is not a layer—it's a **nested loop within genieService's control flow**.

---

## Specification vs Implementation: Side-by-Side Comparison

### Interaction Model

| Aspect                    | **Spec Claims**                                  | **Implementation Does**                                                                                  | **Gap**             |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------- |
| **Autonomy**              | ebookService is independent business logic owner | ebookService is a stateless choreography template with zero autonomous decision-making                   | Significant         |
| **Decision Authority**    | genieService routes; ebookService executes       | genieService controls every decision; ebookService sequences calls                                       | Understated in spec |
| **Separation**            | Clear layer boundary with firewall               | Tight coupling via orchestratorProxy callback pattern                                                    | Obfuscated          |
| **Error Handling**        | ebookService makes decisions on errors           | ebookService receives happy path only; errors thrown up to genieService                                  | Hidden in spec      |
| **Infrastructure Access** | ebookService cannot see infrastructure           | ebookService cannot _directly_ see, but indirectly depends on every orchestratorProxy call               | Partially true      |
| **Testability**           | Mock orchestratorProxy, service is testable      | Must mock entire genieService.orchestratorProxy.generate() to test ebookService                          | Misleading          |
| **Replaceability**        | Swap Gemini/Claude without touching service      | Tier declarations (expert/standard) are hardcoded to Pro/Flash; model strategy is genieService's concern | False premise       |

### Control Flow

| Aspect            | **Spec Model**                                                 | **Actual Implementation**                                     | **Reality**                  |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| **Direction**     | Downward dispatch + upward callback                            | Downward dispatch + synchronous callback loop                 | Synchronous, not truly async |
| **Ownership**     | genieService owns orchestration; ebookService owns composition | genieService owns everything; ebookService owns sequencing    | genieService is monolithic   |
| **Data Flow**     | Service returns pages; orchestrator composes HTML              | Service composes; orchestrator only formats envelope          | Spec location is wrong       |
| **Failure Modes** | Service throws; orchestrator catches                           | All errors thrown by orchestratorProxy; service never catches | No error handling in service |

### Dependency Graph

**Spec Claims:**

```
ebookService
    ↓ (calls)
orchestratorProxy (interface)
    ↓
genieService.orchestratorProxy.generate()
    ↓ (calls infrastructure invisible to service)
aiService, quotaTracker, database
```

**Actual:**

```
ebookService → orchestratorProxy (thin wrapper)
    ↓
genieService.orchestratorProxy.generate() (real decider)
    ├─ quotaTracker (direct access)
    ├─ aiService (direct access)
    ├─ database (direct access)
    └─ geminiClient (direct access)

Result: ebookService depends on genieService's full infrastructure knowledge
```

---

## What Works vs. What the Spec Says Works

### ✅ What Actually Works

1. **Composition Sequencing**: NAT-CONT_0 strategy correctly sequences structure → opening → chapters → closing
2. **Tier Declaration**: Calling `tier: "expert"` vs `tier: "standard"` does route to Pro vs Flash
3. **Output Assembly**: Pages, HTML, metadata are correctly composed
4. **Quota Enforcement**: Quota checks happen before ebookService runs
5. **Persistence**: Results are persisted (asynchronously, no service visibility)
6. **Happy Path Flow**: Request → generate → response works end-to-end

### ❌ What the Spec Says But Implementation Doesn't Support

1. **Independence**: ebookService cannot be tested standalone; it requires full orchestratorProxy mock
2. **Replaceability**: Tier names are hardcoded to models; can't swap Claude without changing tier declarations
3. **Service Autonomy**: ebookService has zero error handling; all errors thrown from orchestratorProxy
4. **Firewall**: ebookService indirectly depends on quota, persistence, and model selection via every orchestratorProxy call
5. **Layer Separation**: ebookService is not a layer; it's an inlined choreography loop within genieService's control

---

## The Architectural Pattern Actually Used

### Recognized Pattern: Strategy + Proxy Callback

**Pattern Name**: Strategy with Proxy-Mediated Orchestration (or "Nested Orchestration")

```javascript
// genieService creates a strategy:
const strategy = new EbookServiceStrategy();

// And provides a constrained proxy interface:
const proxy = {
  generate: async (prompt, meta) => {
    // genieService intercepts EVERY call
    // Makes all infrastructure decisions
    // Returns result to strategy
  },
};

// Strategy uses proxy to sequence operations:
strategy.execute(payload, proxy);
```

**This is not**:

- Independent service layer (service has no autonomy)
- Microservice pattern (service can't run separately)
- Plugin architecture (service is tightly bound to proxy interface)
- Separation of concerns (concerns are interleaved via proxy)

**This is**:

- **Nested orchestration** with a choreography template
- A way to organize code for readability, not architectural independence
- Dependency injection of behavior (proxy is injected)
- Inversion of control in reverse (service calls proxy, not called by orchestrator)

---

## Implications of the Gap

### Design Debt

1. **Misleading Architecture**: Documentation suggests independence that doesn't exist
2. **False Testability Claims**: Integration testing disguised as unit testing through orchestratorProxy mocking
3. **Coupling Disguised as Layering**: ebookService is tightly coupled to genieService's orchestratorProxy interface
4. **Scalability Illusion**: Adding wallArtService or calendarService requires same pattern; no true reusability
5. **Maintenance Risk**: Future developers expect independence; will be surprised by tight coupling

### Actual Advantages (Despite Gap)

1. **Code Organization**: Composition logic separated from orchestration logic (readability)
2. **NAT-CONT_0 Clarity**: Strategy pattern makes the tier-based approach explicit
3. **Hot-Swapping Strategies**: Different ebookService implementations could be injected (in theory)
4. **Persistence Transparency**: Service doesn't need to think about caching; orchestrator handles it

---

## What Should Be True vs. What Is True

### For the Spec to Match Implementation

**Option A: Acknowledge the True Pattern**

- Rename ebookService to `EbookCompositionStrategy` or `EbookChoreography`
- Document as "Orchestration-Mediated Sequencing" not "Service Layer"
- Remove claims about independence and replaceability
- Clarify: "ebookService is a constrained choreography template"

**Option B: Make Service Actually Independent**

- Give ebookService direct access to aiService
- Give ebookService quota awareness (check before each call)
- Let ebookService handle retry logic and errors
- Let ebookService make model decisions (not just tier declarations)
- Result: true service layer (at cost of more coupling with infrastructure)

**Current State: Hybrid**

- Documentation claims Option A (independence)
- Implementation is somewhere between A and B
- Causes confusion and architectural anti-patterns

---

## Conclusion

**The specification presents an architectural narrative of layered independence.** The actual implementation reveals a tighter, simpler pattern: **ebookService as a choreography template executed within genieService's control flow.**

**This is not a failure**—the system works. But the gap between stated design and actual structure creates:

- False expectations about reusability
- Misleading testability claims
- Coupling disguised as layering
- Maintenance burden (future developers will expect what the spec claims)

**The system's success despite this gap suggests**: either the gap is intentional (pragmatic hybrid), or the design debt has not yet surfaced as a problem.

---

## Recommendations

1. **Document the True Pattern**: Replace layer diagrams with orchestration + strategy diagrams
2. **Clarify Boundaries**: State what ebookService can/cannot do (not what it "theoretically could")
3. **Formalize the Proxy Interface**: Define orchestratorProxy as the contract between orchestrator and strategies
4. **Consider Refactoring** (if independence becomes necessary): Move quota/model decisions into ebookService
5. **Test Accurately**: Document that ebookService tests are integration tests (not unit tests)

---

**Status**: This gap does not block current functionality. It affects architectural clarity, maintainability, and future extensibility.
