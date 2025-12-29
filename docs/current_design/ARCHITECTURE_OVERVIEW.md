# AetherPress Architecture Overview

**Date**: December 13, 2025 @ 2:10PM
**Scope**: Scope 1 - General System Overview  
**Target Audience**: Developers, maintainers, stakeholders  
**Reading Time**: ~10-12 minutes

**Related**: See [ARCHITECTURE_DOCUMENTATION_PROPOSAL.md](ARCHITECTURE_DOCUMENTATION_PROPOSAL.md) for documentation project overview and Scopes 2-4

---

## System Goals

AetherPress is a **web-based media generation platform** that transforms user prompts into structured, formatted digital content. The system specializes in **ebook generation** - at this stage of progress- producing multi-page documents with:

- 📖 AI-generated content (using Gemini 2.5 API)
- 🎨 Themed HTML layouts (dark/light themes, customizable styling)
- 📊 Structured metadata (TOC, chapter management, pagination)
- 📄 PDF export capabilities (via Puppeteer)
- 💾 Persistent storage (PostgreSQL with Prisma ORM)

**Core Promise**: Accept a user prompt → Generate a complete, professional-quality ebook → Deliver as HTML or PDF.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Svelte + Vite)                   │
├─────────────────────────────────────────────────────────────────┤
│  GenerateFlow.svelte                                            │
│    └─ Orchestrates entire user generation flow                  │
│    └─ Manages UI state (input → generating → complete/error)    │
├─────────────────────────────────────────────────────────────────┤
│  Store Layer (Svelte Stores)                                    │
│    ├─ ebookStore.js  ← State management for generation          │
│    ├─ flowStore.js   ← UI flow state                            │
│    └─ Other stores   ← Theme, settings, etc.                    │
├─────────────────────────────────────────────────────────────────┤
│  API Client Layer (ebookApi.js)                                 │
│    └─ fetchWithTimeout() → POST /api/ebook/generate             │
│    └─ 600s timeout (10 minutes)                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/JSON
                             │
┌────────────────────────────┴────────────────────────────────────┐
│                        SERVER (Express.js)                      │
├─────────────────────────────────────────────────────────────────┤
│  HTTP Entry Point                                               │
│    └─ POST /api/ebook/generate                                  │
│       ├─ Request validation & preprocessing                     │
│       └─ Rate limiting & quota enforcement                      │
├─────────────────────────────────────────────────────────────────┤
│  Orchestration Layer (genieService.js)                          │
│    └─ process() ← Routes requests to appropriate handlers       │
├─────────────────────────────────────────────────────────────────┤
│  Service Layer                                                  │
│    ├─ ebookService.handle()  ← Ebook-specific generation        │
│    ├─ aiService              ← Gemini 2.5 API calls             │
│    └─ exportService          ← PDF generation (Puppeteer)       │
├─────────────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                           │
│    ├─ Database: PostgreSQL + Prisma ORM (Active, Schema: VALID) │
│    ├─ Gemini API ← AI content generation                        │
│    └─ Puppeteer ← Headless browser for PDF export               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Client-Side (Frontend)

| Component         | File                                        | Purpose                                                                  |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| **GenerateFlow**  | `client/src/components/GenerateFlow.svelte` | Main UI orchestrator; manages user input, generation flow, error display |
| **ebookStore**    | `client/src/stores/ebookStore.js`           | Svelte store for ebook generation state (prompt, status, result, error)  |
| **ebookApi**      | `client/src/lib/ebookApi.js`                | HTTP client; wraps fetch with timeout (600s), error handling, logging    |
| **Theme**         | `client/src/stores/`                        | User-selected theme, color palette, font sizes                           |
| **UI Components** | `client/src/components/`                    | Input panel, generation progress, error panel, preview viewer            |

**Data Flow**: User Action → GenerateFlow → ebookStore.generate() → ebookApi.generateEbook() → fetch(POST /api/ebook/generate)

### Server-Side (Backend)

| Component          | File                                       | Purpose                                                                               |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Express Server** | `server/index.js`                          | HTTP server, middleware setup, route handlers                                         |
| **Orchestrator**   | `server/genieService.js`                   | Routes requests; selects handler (ebookService, etc.); manages persistence            |
| **Ebook Handler**  | `server/ebookService.js`                   | Core ebook generation logic; calls AI service, builds pages, structures content       |
| **AI Service**     | `server/aiService.js`                      | Wraps Gemini 2.5 API; manages model selection (Pro for structure, Flash for chapters) |
| **Export Service** | `server/exportService.js`                  | PDF generation via Puppeteer; handles page composition                                |
| **Database Layer** | `server/db.js` + `server/utils/dbUtils.js` | Prisma ORM with PostgreSQL backend (schema valid, active)                             |
| **Rate Limiting**  | `server/index.js`                          | Express middleware; 100 req/15-min window (global)                                    |

**Data Flow**: HTTP Request → Validation → genieService.process() → ebookService.handle() → aiService calls → Response Assembly → HTTP Response

---

## Request/Response Lifecycle

### Complete Ebook Generation Flow

```
TIMELINE                          CLIENT                 SERVER
─────────────────────────────────────────────────────────────────

T=0s
   │
   ├─ User enters prompt
   ├─ Clicks "Generate"
   │
   └────→ POST /api/ebook/generate ─────────→
                                              │
                                              ├─ Validate input
                                              ├─ Check quota (model-aware)
                                              │  ├─ Flash: 15 RPM limit
                                              │  └─ Pro: 2 RPM limit
                                              ├─ Rate limit check (100 req/15min global)
                                              │
                                              ├─ Call Gemini (Structure)
                                              │  └─ Generate TOC, chapter titles
                                              │     Duration: ~10-15s
T~15s                                         │
                                              ├─ Call Gemini (Chapters) [1..N]
                                              │  └─ Generate chapter content
                                              │  └─ Model rotation: Pro→Flash
                                              │     Duration: ~20-30s
T~45s                                         │
                                              ├─ Compose HTML
                                              │  ├─ Build page tree
                                              │  ├─ Apply theme/styling
                                              │  ├─ Serialize to string
                                              │  Duration: ~2-5s
T~50s                                         │
                                              ├─ Build response envelope
                                              │  ├─ { success, data: {content, chapters, html, metadata} }
                                              │  └─ Size: ~30-50KB typically
                                              │
                                              ├─ Begin transmission ─────────→
                                              │
                                              │  ⚠️  INFRASTRUCTURE TIMEOUT RISK
                                              │      If response transmission takes
                                              │      >~10 seconds, Codespaces
                                              │      (~60s total) may timeout

T~60s                                         ←─ FAILURE: Connection dropped
                                                  (Infrastructure timeout)
                                                  Client receives:
                                                  TypeError: Failed to fetch

OR

T~50-55s ←───────── Response received ←─────┤
   │
   ├─ JSON parse success
   ├─ Store result in ebookStore
   ├─ Update UI to "Complete"
   │
   └─ User sees generated ebook preview
```

### Request Envelope (Client → Server)

```javascript
POST /api/ebook/generate
Content-Type: application/json

{
  "prompt": "Write an ebook about sustainable living",
  "metadata": {
    "theme": "dark",
    "pageCount": 8,
    "colorPalette": "standard",
    "fontSizeScale": 1.0
  }
}
```

### Response Envelope (Server → Client)

```javascript
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 45289

{
  "success": true,
  "data": {
    "content": {
      "title": "Ebook: sustainable living...",
      "body": "..."
    },
    "chapters": [
      { "title": "Chapter 1: Introduction", "body": "..." },
      { "title": "Chapter 2: Home Energy", "body": "..." },
      ...
    ],
    "html": "<html>...</html>",  // Full 30KB+ HTML
    "metadata": {
      "model": "ebook-v1",
      "pages": 8,
      "generatedAt": "2025-12-13T...",
      "processingTimeMs": 49432
    }
  }
}
```

---

## Technology Stack

### Frontend

| Layer                | Technology         | Purpose                                  |
| -------------------- | ------------------ | ---------------------------------------- |
| **UI Framework**     | Svelte 4           | Reactive components, state binding       |
| **Build Tool**       | Vite               | Fast module bundling, dev server         |
| **HTTP Client**      | Fetch API          | Native browser HTTP with AbortController |
| **State Management** | Svelte Stores      | Reactive state containers                |
| **Testing**          | Vitest + Puppeteer | Unit tests, E2E tests with mock server   |

### Backend

| Layer                  | Technology                  | Purpose                                    |
| ---------------------- | --------------------------- | ------------------------------------------ |
| **Runtime**            | Node.js                     | JavaScript execution                       |
| **HTTP Server**        | Express.js                  | Route handling, middleware pipeline        |
| **HTTP Logging**       | Morgan                      | Request/response logging                   |
| **Rate Limiting**      | express-rate-limit          | 100 requests per 15-minute window (global) |
| **CORS**               | express.cors                | Cross-origin request handling              |
| **AI API**             | Gemini 2.5 (Pro + Flash)    | Content generation                         |
| **Browser Automation** | Puppeteer                   | PDF generation via headless Chrome         |
| **Database**           | PostgreSQL + Prisma         | Persistent storage, relational ORM         |
| **JSON**               | `express.json` (50MB limit) | Request/response parsing                   |

### Infrastructure & Deployment

| Layer                       | Technology           | Purpose                                                |
| --------------------------- | -------------------- | ------------------------------------------------------ |
| **Container Orchestration** | Docker Compose       | Two-service setup: `app` (Node.js) + `db` (PostgreSQL) |
| **Dev Container**           | Debian 11 + Node.js  | Linux base, Chrome, Puppeteer pre-installed            |
| **Database Service**        | PostgreSQL 16        | Service: `db`, Port: 5432, Volume: `postgres-data`     |
| **App Service**             | Node.js (Debian)     | Service: `app`, Depends on: `db` healthy, Port: 3000   |
| **Health Checks**           | Docker health probes | `app`: HTTP /health (10s), `db`: pg_isready (30s)      |
| **Environment**             | devcontainer.env     | Safe defaults: aether_dev DB, postgres/postgres creds  |
| **Hosting**                 | GitHub Codespaces    | Dev environment, ephemeral, min 4 CPUs                 |
| **Version Control**         | Git                  | Source control, CI/CD hooks                            |

---

## Containerization & Startup Sequence

**Dev Environment Setup** (`.devcontainer/docker-compose.yml`):

1. **Service Startup Order**

   - PostgreSQL `db` service starts first (port 5432)
   - Waits for health check: `pg_isready` with auth verification
   - Node.js `app` service depends on `db` being healthy

2. **App Initialization** (`postCreateCommand`)

   - Install client dependencies (npm, Playwright)
   - Install server dependencies (npm, skip Puppeteer download)
   - Wait for PostgreSQL availability (60s timeout)
   - Export `DATABASE_URL` pointing to `db:5432/aether_dev`
   - Run Prisma: `prisma generate` + `prisma db push --accept-data-loss`
   - Start dev servers: `concurrently` runs `client npm run dev` + `server npm run dev`

3. **Port Forwarding**

   - 5173 → Vite dev server (auto-opens preview on connect)
   - 3000 → Express.js server
   - 5432 → PostgreSQL (for debugging)

4. **Environment Variables**

   - Safe defaults in `devcontainer.env` (postgres/postgres, aether_dev database)
   - Gemini API keys loaded from local environment
   - Chrome path: `/usr/bin/google-chrome-stable` (system Chrome, not Puppeteer's bundled)
   - `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` (uses system Chrome)

5. **Data Persistence**
   - PostgreSQL volume: `postgres-data` (survives container restarts)
   - Application code mounted from host: `/workspaces` (cached, read/write)

---

## Data Models

### Core Entities

#### Prompt

```javascript
{
  id: number,
  userId: string,
  text: string,
  metadata: {
    theme: "dark" | "light",
    pageCount: number (3-20),
    colorPalette: string,
    fontSizeScale: number
  },
  createdAt: timestamp,
  status: "pending" | "generating" | "complete" | "error"
}
```

#### Ebook Content

```javascript
{
  id: number,
  promptId: number,
  title: string,
  chapters: Array<{
    id: number,
    title: string,
    body: string,
    order: number,
    content: {...}
  }>,
  html: string,       // Full serialized HTML (~30-50KB)
  htmlMetadata: {
    wordCount: number,
    pageCount: number,
    lastUpdated: timestamp
  },
  metadata: {
    theme: string,
    generatedAt: timestamp,
    processingTimeMs: number,
    aiModel: "gemini-2.5-pro" | "gemini-2.5-flash"
  }
}
```

#### Quota Tracking (Model-Aware)

```javascript
{
  windowId: "flash" | "pro",              // Separate tracking per model
  callCount: number,                      // Calls in current 60-second window
  limit: number,                          // 15 (Flash) or 2 (Pro)
  availableQuota: number,                 // limit - callCount
  windowStartMs: timestamp,               // When current window started
  windowResetAtMs: timestamp,             // When window resets
  windowExpiredMs: number,                // Milliseconds until window expires
  percentUsed: number,                    // 0-100%
  isExpired: boolean                      // Has 60s window elapsed?
}
```

---

## Timing Constraints

### Timeouts

### Timeouts

| Layer                 | Timeout             | Notes                                                     |
| --------------------- | ------------------- | --------------------------------------------------------- |
| **Client Fetch**      | 600,000 ms (10 min) | Generous; not the limiting factor                         |
| **Infrastructure**    | ~60,000 ms (60 sec) | Codespaces hard limit; response must complete before this |
| **Gemini API Call**   | 30,000 ms (30 sec)  | Per API call (structure or chapter)                       |
| **Flash Window**      | 60 seconds          | 15 RPM limit (1 call per 4 seconds)                       |
| **Pro Window**        | 60 seconds          | 2 RPM limit (1 call per 30 seconds) - **BOTTLENECK**      |
| **Global Rate Limit** | 15 minutes (window) | 100 requests per 15-minute window across all clients      |

### Typical Performance

| Stage                     | Duration    | Notes                                          |
| ------------------------- | ----------- | ---------------------------------------------- |
| **Request Validation**    | <100 ms     | Input parsing, quota check                     |
| **Gemini Structure Call** | 10-15 s     | Generate TOC, chapter titles                   |
| **Gemini Chapter Calls**  | 20-30 s     | 1-N chapters with model rotation               |
| **HTML Composition**      | 2-5 s       | Build page tree, apply theme                   |
| **Response Transmission** | 5-10 s      | Serialize JSON, transmit ~30-50KB over network |
| **Total Backend Time**    | **49-50 s** | Dominates the lifecycle                        |

### Quota System

**Important**: Quota enforcement is **model-aware** and tracks Gemini 2.5 Flash and Pro separately per Google's free tier limits:

| Model                | RPM (Free Tier) | RPD (Free Tier) | Strategy                               |
| -------------------- | --------------- | --------------- | -------------------------------------- |
| **Gemini 2.5 Flash** | 15 RPM          | ~1,500 RPD      | Default for chapters (high-volume)     |
| **Gemini 2.5 Pro**   | 2 RPM           | ~50 RPD         | Structure generation only (bottleneck) |

**Cost Model**:

- **Ebook**: 1 Pro call (structure) + ceil(pageCount/2) Flash calls (chapters)
- **Example**: 10-page ebook = 1 Pro + 5 Flash = total 6 calls across two quotas

**Quota Enforcement**:

- Orchestrator (genieService) checks BOTH Flash and Pro availability before service dispatch
- If either quota insufficient: return 202 deferral response
- Client retries after window reset (~60 seconds)

**Reference**: See [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md#gemini-api-rate-limits-corrected) for detailed quota management and model-aware tracking strategy

### Current Infrastructure Bottleneck

```
Backend generation time:          49-50 seconds
Codespaces total timeout limit:   ~60 seconds
Network transmission time:        5-10 seconds
Available buffer:                 ~0-11 seconds

Status: ⚠️  CRITICAL - Margin insufficient

Additional Constraint (Free Tier):
Pro model quota:                  2 RPM (1 call per 30 seconds)
→ Single 10-page ebook ties up 30 seconds of Pro quota
→ Back-to-back requests will queue
Available time for transmission: ~10-11 seconds

Status: ⚠️  MARGINAL
Response transmission often exceeds available time,
causing "Network error: Failed to fetch" at client.
```

**Impact**: Users see generation success in logs but receive fetch error in UI.

---

## Known Issues & Constraints

### Active Issues

1. **60-Second Infrastructure Timeout**

   - **Symptom**: Backend processes successfully (~50s), but client receives "Network error: Failed to fetch"
   - **Root Cause**: Codespaces timeout (~60s) cuts connection before 30-50KB response fully transmits
   - **Current Mitigation**: None—documented in [FETCH_FAILURE_INVESTIGATION.md](../design/ebookService/DATA/FETCH_FAILURE_INVESTIGATION.md)
   - **Proposed Solutions**: See [ARCHITECTURE_DOCUMENTATION_PROPOSAL.md](#expected-outcome)

2. **Payload Size Limits**

   - **Current**: 50MB for JSON, 50MB for URL-encoded (verified December 13, 2025)
   - **Status**: ✅ Adequate for current ebook sizes (~30-50KB)

3. **E2E Test Coverage**
   - **Status**: Comprehensive test suite exists (~20+ tests)
   - **Issue**: Some frontend tests skipped pending mock updates
   - **Details**: [E2E_TESTING_COVERAGE.md](../design/ebookService/DATA/E2E_TESTING_COVERAGE.md)

### Database Configuration

- **Type**: PostgreSQL relational database
- **ORM**: Prisma (active, schema valid)
- **Status**: ✅ Operational (verified December 13, 2025)
- **Port**: 5432 (forwarded in devcontainer)
- **Notes**: Docker Compose manages PostgreSQL service (`db` service)

---

## Component Interaction Example

### Scenario: User generates a 5-page ebook about "AI in Education"

```
[GenerateFlow.svelte]
  │
  ├─ User enters: "AI in Education"
  ├─ Selects: dark theme, 5 pages
  │
  └─→ [ebookStore.generate()]
       │
       └─→ [ebookApi.generateEbook()]
            │
            └─→ fetch(POST /api/ebook/generate, {
                  prompt: "AI in Education",
                  metadata: { theme: "dark", pageCount: 5, ... }
                })
                 │
                 └─→ [HTTP Network Request] ─────→

                                                  [server/index.js]
                                                   POST /api/ebook/generate
                                                   │
                                                   ├─ Validate input ✓
                                                   ├─ Check quota ✓ (19/20 remain)
                                                   ├─ Rate limit ✓
                                                   │
                                                   └─→ [genieService.process()]
                                                       │
                                                       └─→ [ebookService.handle()]
                                                           │
                                                           ├─→ [aiService.generateStructure()]
                                                           │   └─ Gemini 2.5 Pro
                                                           │   └─ Generate TOC
                                                           │   └─ Duration: 10-12s
                                                           │
                                                           ├─→ [aiService.generateChapter()] x5
                                                           │   └─ Gemini 2.5 Flash
                                                           │   └─ Duration: 20-25s
                                                           │
                                                           └─→ [composeHTML()]
                                                               └─ Build theme
                                                               └─ Serialize
                                                               └─ Duration: 3-4s
                                                           │
                                                           └─→ Response envelope
                                                               { success: true, data: {...} }
                 │
                 ←───── HTTP Response (30-40KB) ←─────
                 │
                 ├─ JSON.parse() ✓
                 └─→ [ebookStore.updateResult()]
                      │
                      └─→ [GenerateFlow.svelte] updates UI
                           │
                           └─ Displays generated ebook preview
                              Shows: 5 chapters, dark theme applied
```

---

## Summary

AetherPress combines a **Svelte frontend** with an **Express.js backend**, orchestrating AI content generation via Gemini 2.5 API (with model-aware quota tracking) into professional ebook layouts.

**Key Constraints**:

1. Infrastructure timeout: ~60 seconds (backend takes 49-50s, leaving 5-10s for transmission)
2. Pro model quota: 2 RPM free tier (critical bottleneck for structure generation)
3. Flash model quota: 15 RPM free tier (ample for chapter generation)

**Current State**: Functional for ebooks under ideal conditions; infrastructure timeout and Pro quota create latency/throughput constraints.

**Scope Progress**:

- ✅ Scope 1: ARCHITECTURE_OVERVIEW.md (this document) - General overview with accurate quota info
- ✅ Scope 2: BACKEND_ARCHITECTURE.md - Complete backend detail including model-aware quota strategy
- ⏳ Scope 3: FRONTEND_ARCHITECTURE.md (pending)
- ⏳ Scope 4: CLIENT_SERVER_INTEGRATION.md (pending)

---

## Reference Links

- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Backend detail, quota management, API integration
- [FETCH_FAILURE_INVESTIGATION.md](../design/ebookService/DATA/FETCH_FAILURE_INVESTIGATION.md) - Root cause analysis of 60s timeout
- [PAYLOAD_SIZE_LIMITS.md](../design/ebookService/DATA/PAYLOAD_SIZE_LIMITS.md) - Payload verification (50MB limits adequate)
- [E2E_TESTING_COVERAGE.md](../design/ebookService/DATA/E2E_TESTING_COVERAGE.md) - Test suite status
- [ARCHITECTURE_DOCUMENTATION_PROPOSAL.md](ARCHITECTURE_DOCUMENTATION_PROPOSAL.md) - Overall documentation plan
- [Gemini API Rate Limits](https://ai.google.dev/pricing) - Official Google documentation
