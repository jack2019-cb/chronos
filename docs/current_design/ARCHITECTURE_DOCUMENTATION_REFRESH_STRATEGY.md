# Documentation Refresh Strategy
## Pattern-Based Architecture Restructure (Option B)

**Date**: December 29, 2025  @ 5:45PM
**Branch**: `feat/B_Frontend_option2`  
**Directory**: `docs/current_design/`

**Context**: Architecture completely redesigned and implemented; supporting docs are outdated  
**Approach**: Clean restructure around 5 implemented architecture patterns  
**Rationale**: No legacy baggage, no confusion, maximum clarity

---

## Executive Summary

**The Problem**: Documentation from Dec 13-15 describes synchronous architecture with 60-second timeout issues. Current system implements completely different async architecture with 5 interconnected patterns.

**The Solution**: Replace stale docs with pattern-based documentation that directly maps to implemented architecture. No hybrid approach, no "what changed" sections—just clean, current docs.

**Expected Outcome**: Crystal-clear documentation of current system organized around the patterns that define it.

---

## Current State Analysis

### What Architecture Changed

| Aspect | Old (Dec 13-15) | Current Implementation | Status |
|--------|-----------------|------------------------|--------|
| **Response Model** | Synchronous 200 | Async 202 + polling | ✅ Implemented |
| **Service Design** | Direct dependencies | Orchestrator pattern | ✅ Implemented |
| **Timing Model** | Linear (49-50s → timeout) | Manifest-driven with ETAs | ✅ Implemented |
| **Rate Limiting** | Basic enforcement | Conservative 999-1000ms spacing | ✅ Validated |
| **Quota System** | Basic tracking | Release mechanism + edge cases | ✅ Validated |
| **Error Handling** | Timeout-based | Polling-based with recovery | ✅ Implemented |
| **Architecture Framework** | Implicit/unclear | 5 Explicit Patterns | ✅ Defined |

### What's Currently Stale

- ❌ ARCHITECTURE_OVERVIEW.md - Describes synchronous flow
- ❌ BACKEND_ARCHITECTURE.md - Missing orchestrator as central pattern
- ❌ FRONTEND_ARCHITECTURE.md - Describes old timeout handling, not polling
- ❌ CLIENT_SERVER_INTEGRATION.md - Shows old 200 contract, not 202+polling

### Sources of Truth (Current)

1. **ARCHITECTURE_ROADMAP_EXECUTIVE.md** - Strategic blueprint (5 patterns, 3 problems, success criteria)
2. **ARCHITECTURE_IMPLEMENTATION_GUIDE.md** - Tactical implementation (4 phases, code specs)
3. **PERF_VALIDATE_02_PROGRESS.md** - Test validation (25 tests, all patterns confirmed)
4. **Light_3-page_AN.md** - Production validation (real Gemini API, all patterns working)
5. **SERVICE_AUTON_RESET_IMPLEMENTATION.md** - Implementation specifics

---

## Why Option B (Pattern-Based Restructure)

**Advantages**:
- ✅ Direct mapping to what's actually implemented
- ✅ No "legacy" confusion—clean slate
- ✅ Patterns become the organizing principle
- ✅ Easier to reference and discuss ("Pattern 3 shows..." vs "in the orchestrator section...")
- ✅ Time-efficient: rewrite aligned with reality, not incremental patching

**Time Savings**:
- No need to maintain old docs + transition docs
- No "what changed" sections cluttering each file
- Single coherent narrative

---

## Phase 1: Current State Capture & Planning

### Phase 1 Deliverables

**1.1 Document Current Architecture Mapping**
- [ ] List the 5 patterns with one-sentence definition each
- [ ] Map old doc sections → new pattern homes
- [ ] Identify what stays, what goes, what's new

**1.2 Identify Key Implementation Details**
- [ ] Gather code references from IMPLEMENTATION_GUIDE
- [ ] Note test coverage from PERF_VALIDATE_02
- [ ] Extract production metrics from Light_3-page_AN
- [ ] Document edge cases and known limitations

**1.3 Define New Document Structure**
- [ ] Decide section order within each doc
- [ ] Define cross-reference strategy between docs
- [ ] Plan code example locations
- [ ] Determine TOC depth and navigation

**1.4 This Document (DOCUMENTATION_REFRESH_STRATEGY.md)**
- [ ] Current state analysis (THIS SECTION)
- [ ] Phase 1 tasks (THIS SECTION)
- [ ] Phase 2 detailed task list (BELOW)
- [ ] Issues to surface during refresh (BELOW)
- [ ] Success criteria (BELOW)

---

## Phase 2: Pattern-Based Documentation Rewrite

### Overview of New Structure

```
NEW DOCUMENTATION HIERARCHY
├── ARCHITECTURE_OVERVIEW.md (550-600 lines)
│   ├─ System Goals
│   ├─ The 5 Architecture Patterns (brief intro)
│   ├─ Request Lifecycle (202 async model)
│   ├─ Technology Stack
│   ├─ Deployment Model
│   └─ Known Constraints
│
├── PATTERN_1_PART_A_ASYNC_ACCEPTANCE.md (400-500 lines)
│   ├─ Purpose & Problem Solved
│   ├─ How It Works (client perspective)
│   ├─ Implementation (server code)
│   ├─ 202 Response Contract
│   ├─ SmartPoller Integration
│   ├─ Performance Metrics
│   └─ Edge Cases & Error Handling
│
├── PATTERN_2_SERVICE_MACHINE.md (400-500 lines)
│   ├─ Purpose & Problem Solved
│   ├─ Service Autonomy Principle
│   ├─ Orchestrator Interface Design
│   ├─ How Services Use It (EbookService example)
│   ├─ Adding New Services
│   ├─ Testing Strategy
│   └─ Known Limitations
│
├── PATTERN_3_PART_B_ORCHESTRATOR.md (600-700 lines)
│   ├─ Purpose & Problem Solved
│   ├─ Orchestrator Architecture
│   ├─ Manifest Protocol (generation, validation, comparison)
│   ├─ FIFO Scheduling
│   ├─ Rate-Limit Enforcement
│   ├─ Dynamic Tool Selection
│   ├─ Performance Characteristics
│   ├─ Edge Cases (quota exhaustion, timeouts)
│   └─ Debugging & Monitoring
│
├── PATTERN_4_HELPERS_AND_UTILITIES.md (400-500 lines)
│   ├─ Purpose & Problem Solved
│   ├─ Per-Request Helpers (pure logic)
│   ├─ App-Wide Utilities (state management)
│   ├─ Separation of Concerns
│   ├─ Creating New Helpers
│   ├─ Testing Utilities
│   └─ Performance Implications
│
├── PATTERN_5_SMART_POLLING_AND_ETA.md (500-600 lines)
│   ├─ Purpose & Problem Solved
│   ├─ Polling Architecture (client)
│   ├─ ETA Computation (server)
│   ├─ Progress Tracking
│   ├─ Accuracy & Timing
│   ├─ UI Integration
│   ├─ Timeout Prevention
│   └─ User Experience Implications
│
└── INTEGRATION_GUIDE.md (600-800 lines)
    ├─ Complete Request Lifecycle (with timestamps)
    ├─ Error Propagation (server → client)
    ├─ State Machine (202 acceptance → completion)
    ├─ Timeout Behavior (polling timeout vs infra timeout)
    ├─ Quota Management (tracking, release, edge cases)
    ├─ Rate-Limit Interactions (user experience)
    ├─ Database Persistence (intermediate states)
    ├─ Known Issues (export endpoint, SLA expectations)
    └─ Troubleshooting Guide
```

### Phase 2 Detailed Task List

#### Section A: ARCHITECTURE_OVERVIEW.md (550-600 lines)

- [ ] **System Goals** (30-50 lines)
  - What AetherPress does (ebook generation, art creation, etc.)
  - Business objectives vs technical constraints

- [ ] **The 5 Architecture Patterns (Brief Overview)** (100-150 lines)
  - One paragraph per pattern
  - How they work together
  - Reference to detailed pattern docs

- [ ] **Request Lifecycle (New Async Model)** (150-200 lines)
  - Client initiates request → 202 response
  - Job queued → polling begins
  - Orchestrator processes manifest
  - Polling returns completion
  - Include timing diagram

- [ ] **Technology Stack** (50-80 lines)
  - Frontend: Svelte, Vite, Vitest
  - Backend: Node.js, Express
  - AI: Gemini 2.5 API
  - Database: (current storage approach)

- [ ] **Deployment Model** (30-50 lines)
  - Current deployment
  - Infrastructure constraints (60-second limit, why it matters)

- [ ] **Known Constraints** (40-80 lines)
  - Infrastructure timeout
  - Gemini API rate limits (Pro 250ms, Flash 100ms)
  - Quota system (20 calls per session)
  - Real-world latencies (7-16s per call)

#### Section B: PATTERN_1_PART_A_ASYNC_ACCEPTANCE.md (400-500 lines)

- [ ] **Purpose & Problem Solved** (30-50 lines)
  - Why async? (timeout problem)
  - How 202 solves it
  - Business value (user experience)

- [ ] **How It Works** (80-120 lines)
  - Client sends request
  - Server validates instantly
  - Returns 202 with resultId
  - SmartPoller task created
  - Code snippet: `/api/ebook/generate` endpoint

- [ ] **Implementation Details** (100-150 lines)
  - HTTP response code (202)
  - Response envelope structure
  - SmartPoller integration
  - Queue assignment
  - Code: genieService.process() entry point

- [ ] **202 Response Contract** (50-80 lines)
  - Request schema
  - Response schema
  - resultId format
  - Example payload

- [ ] **SmartPoller Integration** (40-60 lines)
  - How job gets queued
  - Task lifecycle
  - Polling endpoints

- [ ] **Performance Metrics** (30-50 lines)
  - Target: 1.627ms response time
  - Actual production: verified in Light_3-page_AN
  - How to monitor

- [ ] **Edge Cases & Error Handling** (50-80 lines)
  - Request validation failure (400)
  - Quota exhaustion before accept
  - Service temporarily unavailable (503)
  - How errors affect polling

#### Section C: PATTERN_2_SERVICE_MACHINE.md (400-500 lines)

- [ ] **Purpose & Problem Solved** (30-50 lines)
  - Service autonomy principle
  - Why it matters (testability, reusability)
  - What problem it solves (hard-coded dependencies)

- [ ] **Service Autonomy Principle** (60-100 lines)
  - Services receive orchestrator interface only
  - No direct dependencies between services
  - Communication through manifest
  - Benefits and constraints

- [ ] **Orchestrator Interface Design** (80-120 lines)
  - What interface services receive
  - Key methods/properties
  - Constraints on service behavior
  - Code: IOrchestrator interface

- [ ] **How Services Use It (EbookService Example)** (100-150 lines)
  - EbookService.handle() implementation
  - How it receives orchestrator
  - How it uses manifest
  - How it calls AI service through orchestrator
  - Code: actual ebookService.js snippets

- [ ] **Adding New Services** (50-80 lines)
  - What you need to implement
  - Interface contract
  - Manifest expectations
  - Testing requirements

- [ ] **Testing Strategy** (40-60 lines)
  - Unit test a service (mock orchestrator)
  - Integration test (real orchestrator)
  - Quota implications

- [ ] **Known Limitations** (40-60 lines)
  - Services can't talk to each other directly
  - Must go through manifest
  - Latency implications
  - Debugging considerations

#### Section D: PATTERN_3_PART_B_ORCHESTRATOR.md (600-700 lines)

- [ ] **Purpose & Problem Solved** (40-60 lines)
  - Why manifest-driven execution?
  - Rate-limit problem it solves
  - Service selection problem it solves

- [ ] **Orchestrator Architecture** (100-150 lines)
  - High-level design
  - Key components (manifest executor, rate limiter, scheduler)
  - Request flow through orchestrator
  - ASCII diagram: manifest → scheduling → execution → result

- [ ] **Manifest Protocol** (200-250 lines)
  - **Generation**: How services create manifests
  - **Structure**: Required fields (totalRequests, sequence, etc.)
  - **Validation**: What makes a valid manifest
  - **Comparison**: How manifests are compared (old vs new)
  - **Execution**: How orchestrator processes manifests
  - Code examples: manifest generation, validation

- [ ] **FIFO Scheduling** (50-80 lines)
  - How jobs are queued
  - Priority (all equal FIFO)
  - Job state tracking

- [ ] **Rate-Limit Enforcement** (80-120 lines)
  - Conservative spacing (999-1000ms)
  - Pro vs Flash model requirements (250ms vs 100ms)
  - Why conservative?
  - Safety margin analysis (4-10x)
  - Code: rateLimitManager

- [ ] **Dynamic Tool Selection** (60-100 lines)
  - How tier determines model (expert → Pro, standard → Flash)
  - Cost implications
  - Quality implications
  - Fallback behavior

- [ ] **Performance Characteristics** (60-100 lines)
  - Throughput (jobs/second)
  - Latency (per-step timing)
  - Bottlenecks (API latency, rate limits)
  - Scaling characteristics

- [ ] **Edge Cases** (60-100 lines)
  - Quota exhaustion mid-execution
  - API timeout during execution
  - Service crashes during execution
  - Recovery mechanisms

- [ ] **Debugging & Monitoring** (40-60 lines)
  - Log locations
  - Metrics to monitor
  - Common failure patterns

#### Section E: PATTERN_4_HELPERS_AND_UTILITIES.md (400-500 lines)

- [ ] **Purpose & Problem Solved** (30-50 lines)
  - Code organization principle
  - Reusability goal
  - Testing goal

- [ ] **Per-Request Helpers** (100-150 lines)
  - What are they? (pure logic, stateless)
  - Where they live (helpers.js)
  - Examples: rate limit utilities, ETA calculation, manifest validation
  - How to add new ones
  - Code: actual helper examples

- [ ] **App-Wide Utilities** (100-150 lines)
  - What are they? (stateful, shared across requests)
  - Where they live (utilities/)
  - Examples: quota manager, SmartPoller, AI service cache
  - Initialization and lifecycle
  - Code: actual utility examples

- [ ] **Separation of Concerns** (50-80 lines)
  - Why split? (testability, reusability, maintenance)
  - Clear boundaries
  - Dependency direction

- [ ] **Creating New Helpers** (50-80 lines)
  - Step-by-step guide
  - Testing requirements
  - Documentation expectations

- [ ] **Testing Utilities** (40-60 lines)
  - Mock factories
  - Test data builders
  - Assertion helpers

- [ ] **Performance Implications** (30-50 lines)
  - Memory usage
  - Caching strategies
  - Cleanup requirements

#### Section F: PATTERN_5_SMART_POLLING_AND_ETA.md (500-600 lines)

- [ ] **Purpose & Problem Solved** (40-60 lines)
  - Why polling? (vs webhooks, vs server-sent events)
  - UX benefit (progress visibility)
  - Implementation simplicity

- [ ] **Polling Architecture (Client)** (120-180 lines)
  - How client polls (interval, backoff)
  - Endpoint structure (`/api/ebook/status/:resultId`)
  - Response handling
  - State transitions
  - Code: GenerateFlow polling logic

- [ ] **ETA Computation (Server)** (100-150 lines)
  - How ETAs are calculated from manifest
  - Accuracy (within 20%)
  - Real-world accuracy (Light_3-page validation)
  - Adjustment strategies
  - Code: ETA calculation algorithm

- [ ] **Progress Tracking** (80-120 lines)
  - What progress means (completed API calls, composition status)
  - How it's tracked (manifest position)
  - How it's reported to client
  - Visualization examples

- [ ] **Accuracy & Timing** (80-120 lines)
  - Expected accuracy range (20% tolerance)
  - Real-world production numbers
  - Factors affecting accuracy (API latency variance)
  - How to monitor accuracy

- [ ] **UI Integration** (60-100 lines)
  - Progress bar implementation
  - ETA display
  - User expectations
  - Handling delayed responses

- [ ] **Timeout Prevention** (60-100 lines)
  - Polling timeout vs infrastructure timeout
  - How polling prevents infrastructure timeout
  - Timeout detection
  - Retry logic

- [ ] **User Experience Implications** (40-60 lines)
  - Perceived performance
  - Progress feedback importance
  - Network condition handling
  - Mobile considerations

#### Section G: INTEGRATION_GUIDE.md (600-800 lines)

- [ ] **Complete Request Lifecycle** (150-200 lines)
  - Detailed timeline with timestamps
  - Each step with code reference
  - Expected latencies at each stage
  - Diagram: request flow with timing

- [ ] **Error Propagation** (100-150 lines)
  - Server error → client handling
  - Error types (validation, timeout, quota, service)
  - HTTP status codes
  - Error message format
  - Retry strategies

- [ ] **State Machine** (100-150 lines)
  - States: QUEUED → PROCESSING → COMPOSING → COMPLETE
  - State transitions
  - How polling tracks state
  - Diagram: state machine with transitions

- [ ] **Timeout Behavior** (80-120 lines)
  - Polling timeout (client gives up)
  - Infrastructure timeout (60-second hard limit)
  - How 202 pattern prevents infrastructure timeout
  - What happens if job exceeds timeout
  - Recovery options

- [ ] **Quota Management** (100-150 lines)
  - Quota checking before accept (202)
  - Quota tracking during execution
  - Quota release on completion
  - Quota release on error
  - Edge case: what if quota exhausted mid-execution

- [ ] **Rate-Limit Interactions** (80-120 lines)
  - User experience (perceived wait time)
  - Conservative spacing (999-1000ms) impact
  - Why necessary (Gemini API limits)
  - Scaling implications

- [ ] **Database Persistence** (60-100 lines)
  - What gets persisted (interim manifests, quotas, job status)
  - Cleanup strategy
  - Recovery from crashes
  - Data retention policy

- [ ] **Known Issues** (40-80 lines)
  - Export endpoint 400 error (investigation needed)
  - SLA expectations (49-70s real-world, not 30s mock)
  - Performance over SLA (documented, expected)
  - Theme application timing
  - Edge cases to monitor

- [ ] **Troubleshooting Guide** (60-100 lines)
  - Common failure scenarios
  - Diagnostic steps
  - Log interpretation
  - When to escalate

---

## Issues to Surface During Refresh

The act of rewriting docs will naturally surface:

### Critical Issues

**Issue 1: Export Endpoint 400 Error**
- Observed in Light_3-page_AN.md during middle chapter generation
- Non-blocking but concerning
- Need to understand: Is this expected? Is it being logged properly?

**Issue 2: Theme Application Timing**
- When is theme applied? During generation or composition?
- How does async + manifest protocol affect theme handling?
- Any race conditions?

**Issue 3: Error Handling During Polling**
- What errors can happen during polling?
- How does client recover?
- What triggers permanent failure vs retry?

### Important Issues

**Issue 4: Rate-Limit User Experience**
- Conservative 999-1000ms spacing—is it noticeable to user?
- Does it cause user frustration?
- Any way to optimize without violating limits?

**Issue 5: Quota Cleanup Edge Cases**
- What happens to quota if job fails mid-execution?
- Is quota properly released in all error scenarios?
- Stranded quota detection?

**Issue 6: Database Persistence**
- What interim state gets persisted?
- Cleanup strategy for incomplete jobs?
- Recovery from crashes?

### Documentation Issues

**Issue 7: Code Reference Staleness**
- File locations changed?
- Line numbers changed?
- Function signatures changed?

**Issue 8: Performance Baseline**
- Mock testing vs real API latencies
- SLA targets appropriate for production?
- Need to document expected ranges?

---

## Success Criteria

### Documentation Quality

- [ ] All 5 patterns clearly explained (1-2 pages each)
- [ ] Code examples are current and accurate
- [ ] Cross-references between docs work
- [ ] No references to old architecture remain
- [ ] Performance metrics aligned with Light_3-page_AN validation

### Completeness

- [ ] Every pattern has dedicated doc
- [ ] Integration guide covers all key flows
- [ ] Edge cases documented
- [ ] Known issues surface clearly

### Usability

- [ ] Developer can understand complete system in 2 hours
- [ ] Developer can find code reference for any pattern
- [ ] Developer can add new service/helper/pattern
- [ ] Developer can debug production issues

### Discoverability

- [ ] Table of contents in each doc
- [ ] Cross-reference links work
- [ ] Index or master reference doc
- [ ] Search-friendly (clear terminology)

---

## Timeline Estimate

| Phase | Task | Effort | Timeline |
|-------|------|--------|----------|
| 1 | Current state capture | 2-3 hours | This session |
| 2A | Pattern 1 (PART-A) | 3-4 hours | Next session |
| 2B | Pattern 2 (SERVICE_MACHINE) | 3-4 hours | Next session |
| 2C | Pattern 3 (PART-B) | 4-5 hours | Session after |
| 2D | Pattern 4 (Helpers) | 3-4 hours | Session after |
| 2E | Pattern 5 (Polling/ETA) | 4-5 hours | Session after |
| 2F | Overview + Integration | 4-5 hours | Final session |
| 2G | Review + fix cross-references | 2-3 hours | Polish session |
| **Total** | **All phases** | **25-35 hours** | **1-2 weeks** |

---

## Next Action

**Phase 1 Output**: This document (DOCUMENTATION_REFRESH_STRATEGY.md)

**Phase 2 Kickoff**: Begin with ARCHITECTURE_OVERVIEW.md rewrite, followed by pattern documents in order (1-5), then Integration Guide, then cleanup.

**Success Metric**: When complete, no developer should ever need to reference old Dec 13-15 docs; current docs fully explain the implemented system.

