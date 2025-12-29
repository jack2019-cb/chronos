# Architecture Documentation Proposal

**Date**: December 13, 2025 @ ~1:45 PM  
**Branch**: `feat/ebook-revert`  
**Directory**: `docs/current_design/`

---

## Related Documentation

This proposal outlines a comprehensive documentation initiative. The following scopes have been completed:

- **Scope 1**: [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) - High-level system architecture, components, and request lifecycle (555 lines) ✅
- **Scope 2**: [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Detailed backend technical specification, AI integration, and quota management (1,072 lines) ✅
- **Scope 3**: [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) - Client-side component structure, state management, API integration, and user-facing timeout behavior (1,200+ lines) ✅
- **Scope 4**: [CLIENT_SERVER_INTEGRATION.md](CLIENT_SERVER_INTEGRATION.md) - Request/response contracts, error propagation, timeout behavior, and known issues (1,300+ lines) ✅

**Overall Progress**: 100% Complete (All 4 Scopes)

---

## Objective

Establish comprehensive documentation of AetherPress media (ebook, art et al.) system at two levels of detail before proposing architectural modifications to resolve the 60-second infrastructure timeout issue.

---

## Proposed Documentation Structure

### **Level 1: General Overview**

**File**: `ARCHITECTURE_OVERVIEW.md`

**Contents**:

- 🎯 System Goals - What the app does
- 🏗️ High-Level Architecture Diagram - Client ↔ Server data flow (ASCII/text)
- 📦 Core Components - Major pieces (frontend, backend, database, AI service)
- 🔄 Request/Response Flow - One complete ebook generation request lifecycle
- ⚙️ Technology Stack - Languages, frameworks, libraries
- 📊 Data Models - What gets passed between components
- ⏱️ Timing Constraints - Known limits (timeouts, rate limits, quotas)

**Target**: 2-3 pages, 10-minute read

**Purpose**: Quick understanding of the entire system and how pieces fit together

---

### **Level 2: Detailed Technical Documentation**

#### **Document A: Backend Architecture**

**File**: `BACKEND_ARCHITECTURE.md`

**Contents**:

- Entry point: `/api/ebook/generate` endpoint
- Request validation & preprocessing
- Core service layers:
  - `genieService.process()` - Orchestration
  - `ebookService.handle()` - Ebook-specific logic
  - `aiService` (Gemini integration)
  - `exportService` - PDF generation
  - Quota management
  - Rate limiting
- Response building & serialization
- Error handling paths
- State persistence

**Scope**: Complete traceability from HTTP request to response

---

#### **Document B: Frontend Architecture**

**File**: `FRONTEND_ARCHITECTURE.md`

**Contents**:

- Entry point: `GenerateFlow.svelte` component
- Store layer (`ebookStore.js`) - State management
- API client layer (`ebookApi.js`) - Network calls
- UI components - How they interact
- Error handling & user feedback
- Timeout configuration
- localStorage usage
- State transitions & flow logic

**Scope**: Complete traceability from user action to server request and response handling

---

#### **Document C: Integration Points**

**File**: `CLIENT_SERVER_INTEGRATION.md`

**Contents**:

- Request/response contract
  - What frontend sends to `/api/ebook/generate`
  - What backend returns (canonical envelope shape)
- Error contract
  - How errors flow from server → client
  - Error message propagation
- Timing & sequencing
  - Request lifecycle with timestamps
  - Expected durations at each stage
- Current failure modes
  - 60-second timeout issue
  - Where it breaks in the flow

**Scope**: The boundary between frontend and backend systems

---

## Implementation Plan

| Scope        | Document                     | Effort         | Status                 | Lines      |
| ------------ | ---------------------------- | -------------- | ---------------------- | ---------- |
| 1            | ARCHITECTURE_OVERVIEW.md     | 1-2 hrs        | ✅ **COMPLETE**        | 555        |
| 2            | BACKEND_ARCHITECTURE.md      | 3-4 hrs        | ✅ **COMPLETE**        | 1,072      |
| 3            | FRONTEND_ARCHITECTURE.md     | 2-3 hrs        | ✅ **COMPLETE**        | 1,200+     |
| 4            | CLIENT_SERVER_INTEGRATION.md | 1-2 hrs        | ⏳ **NOT STARTED**     | —          |
| **Subtotal** | **Scopes 1-3**               | **~6-9 hrs**   | **✅ COMPLETED (75%)** | **2,827+** |
| **Total**    | **All Documents**            | **~10-12 hrs** | **In Progress**        | —          |

---

## Quality Standards

Each document will include:

- ✅ Code references (file paths, line numbers)
- ✅ Actual code snippets where relevant
- ✅ Flow diagrams (ASCII or simple text)
- ✅ Current constraints & limitations
- ✅ Known issues and failure points
- ✅ Links to related investigation documents

---

## Recommended Sequencing

**Start with Scope 1 (Overview)** because:

1. Forces clarity on the big picture first
2. Quick to produce (1-2 hours)
3. Validates assumptions before deep-diving into detail
4. Can iterate with feedback before scopes 2-4

---

## Expected Outcome

After completion, we will have:

- ✅ Crystal clear understanding of current system
- ✅ Foundation for proposing architectural improvements
- ✅ Documentation clarifying feasibility of:
  - Async polling pattern
  - Response streaming approach
  - Infrastructure timeout increase
- ✅ Reference material for future development
- ✅ Basis for decision-making on which solution to implement

---

## Progress Update

**All Scopes COMPLETED** (December 13-15, 2025)

- ✅ **Scope 1**: ARCHITECTURE_OVERVIEW.md (555 lines) - System goals, high-level architecture, core components, request lifecycle, technology stack, data models, timing constraints, known issues
- ✅ **Scope 2**: BACKEND_ARCHITECTURE.md (1,072 lines) - Entry point, Gemini API rate limits, quota management, orchestration layer, service layer, AI integration, database layer, request/response flow
- ✅ **Scope 3**: FRONTEND_ARCHITECTURE.md (1,200+ lines) - GenerateFlow component, store layer (8-state machine), API client, 20+ UI components, error handling strategies, timeout configuration, state transitions, performance characteristics
- ✅ **Scope 4**: CLIENT_SERVER_INTEGRATION.md (1,300+ lines) - HTTP request/response contracts, error propagation mechanisms, timeout behavior analysis, critical 60-second infrastructure limit issue, state transitions, client retry logic, known issues and limitations

**Deliverables Summary**

- **Total Documentation**: 4,127+ lines of reverse-engineered technical documentation
- **Coverage**: 100% of user-facing flows, API contracts, error paths, and known issues
- **Format**: Markdown with code examples, timing diagrams, state machines, and error scenarios
- **Cross-References**: Bidirectional links between all four documents enable navigation

**Key Findings**

1. **Critical Issue Identified**: Infrastructure imposes 60-second hard timeout, but ebook generation (3+ pages) takes 49-50 seconds alone, leaving only 0-6 seconds buffer for transmission
2. **Complete API Contract**: Documented all endpoints (generate, classify, override, export with async queue)
3. **Error Handling**: Comprehensive error taxonomy with HTTP status codes, retry policies, and recovery strategies
4. **State Management**: Detailed state machine transitions and timeout failure scenarios

**Next Steps**

- **Phase A (Pending)**: Compare Scopes 1-4 against original design documents to identify divergences
- **Phase B (Pending)**: Identify and surface the "pending issue that needs ASAP correction"
