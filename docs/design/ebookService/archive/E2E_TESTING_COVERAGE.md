# E2E Testing Coverage Report

**Current Status**: December 13, 2025  
**Branch**: `feat/ebook-revert`

---

## Overview

The project has a **comprehensive multi-layer testing strategy** for e2e scenarios, though some frontend e2e tests are currently **skipped** pending mock updates to canonical response shapes.

---

## Testing Infrastructure

### 1. **Unit Tests** ✅

- **Client**: Vitest (configured in [client/package.json](client/package.json))
  - `npm run test` - Run all tests
  - `npm run test:watch` - Watch mode
  - `npm run test:coverage` - Coverage report
- **Server**: Vitest with MOCK AI (configured in [server/package.json](server/package.json))
  - `npm run test` - `FORCE_MOCK_AI=1 vitest` (mocks Gemini)
  - `npm run test:run` - Single run with coverage
  - `npm run test:watch` - Watch mode

### 2. **Client E2E Tests** ⚠️ (Partially Skipped)

Located in [client/**tests**/](client/__tests__/):

| Test File                                 | Status         | Purpose                            |
| ----------------------------------------- | -------------- | ---------------------------------- |
| `flows.test.js`                           | 🔴 **SKIPPED** | Flow state management              |
| `frontend-integration.test.js`            | ✅ ACTIVE      | Frontend API integration           |
| `prompt-to-preview.integration.test.js`   | 🔴 **SKIPPED** | Prompt → Generate → Preview        |
| `preview.integration.test.js`             | ✅ ACTIVE      | Preview rendering                  |
| `persistence-refresh.integration.test.js` | 🔴 **SKIPPED** | Store persistence across refreshes |
| `store-driven-preview.test.js`            | ✅ ACTIVE      | Store-based preview logic          |

**Why Skipped**: Tests expect legacy API response shapes (`{ data: { content } }`). Current backend returns canonical envelope (`{ out_envelope: { pages, metadata, actions } }`). See [TESTS.md](client/__tests__/TESTS.md) for details.

### 3. **Server Tests** ✅

Located in [server/**tests**/](server/__tests__/):

| Test File                             | Purpose                   |
| ------------------------------------- | ------------------------- |
| `genieService.classifyPrompt.test.js` | Classification pipeline   |
| `export_text.test.js`                 | Text export functionality |
| `overrideService.test.js`             | Style override logic      |
| `demo-mode.integration.test.js`       | Demo mode e2e flow        |
| `preview.test.js`                     | Preview generation        |
| `tocGenerator.test.js`                | Table of contents         |

**Key**: All server tests run with `FORCE_MOCK_AI=1` to avoid Gemini API calls during CI.

### 4. **Backend Script-Based E2E Tests** ✅

Located in [scripts/](scripts/):

#### **test-export-roundtrip.js** (Most Comprehensive)

- **What it tests**: Full backend pipeline
  1. POST `/api/ebook/generate` with prompt
  2. Verify response contains `resultId`, chapters, HTML
  3. Export via direct content
  4. Export via persisted ID
  5. Validate PDFs are valid
- **Run**: `node scripts/test-export-roundtrip.js`
- **Status**: Active (no mocking required, tests against real/demo backend)

#### **test-step1.js**

- **What it tests**: HTML field flow and 3-layer logging
- **Target**: `/api/ebook/generate`
- **Run**: `node scripts/test-step1.js`

#### **test-generate-preview.js**

- **What it tests**: Generate content and preview
- **Run**: `node scripts/test-generate-preview.js`

#### **test-rate-limiter.js**

- **What it tests**: Rate limiting enforcement on ebook requests
- **Run**: `node scripts/test-rate-limiter.js`

#### **Other scripts**:

- `test-load-demo.js` - Demo loading
- `test-summer-suggestion.js` - Summer theme suggestions
- `test-title-debug.js` - Title field debugging
- `puppeteer_smoke_export.js` - Puppeteer/export verification

### 5. **GitHub Actions Workflows** ✅

Located in [.github/workflows/](../../.github/workflows/):

#### **Blocking Workflows** (PR required to pass)

- [ci-server-tests-pr.yml](../../.github/workflows/ci-server-tests-pr.yml)

  - Runs: `npm run test:ci` (server tests with coverage)
  - Status: **Required before merge**

- [ci-postgres.yml](../../.github/workflows/ci-postgres.yml)
  - Tests against Postgres database
  - **Required before merge**

#### **Non-Blocking Workflows** (PR info only)

- [ci-quick-smoke.yml](../../.github/workflows/ci-quick-smoke.yml)

  - Health check on `/health` endpoint
  - Allowed to fail

- [ci-playwright-generate-preview.yml](../../.github/workflows/ci-playwright-generate-preview.yml)

  - Playwright smoke test for generate → preview flow
  - Starts server + client locally
  - Non-blocking

- [playwright-smoke.yml](../../.github/workflows/playwright-smoke.yml)

  - Manual dispatch test
  - Parameterized URL

- [verify-export.yml](../../.github/workflows/verify-export.yml)
  - Export functionality verification

---

## What's Currently Being Tested for E2E

### ✅ **Actively Tested**

1. **Ebook Generation Pipeline**

   - Prompt → AI generation via Gemini
   - Quota management
   - Rate limiting
   - Response serialization
   - HTML generation

2. **Export Functionality**

   - Direct export (content in request)
   - ID-based export (persisted result)
   - PDF validity

3. **Server-Side Integration**

   - `/api/ebook/generate` endpoint
   - Response structure and validation
   - Error handling

4. **Demo Mode**
   - Full pipeline without AI calls
   - Static/template-based content

### ⚠️ **Incomplete/Pending**

1. **Frontend E2E** (3 tests skipped)

   - Mock API responses need update to canonical envelope shape
   - Affects: flow state management, persistence across page refresh, prompt→preview flow

2. **Fetch Failure Scenarios**

   - No tests for network timeout cases
   - No tests for server 5xx responses
   - No tests for JSON parse errors

3. **Long-Running Requests**
   - No tests for the 50+ second response time scenario
   - No tests for proxy/load balancer timeout behavior
   - No tests for connection keep-alive with long delays

---

## Recommended Next Steps for E2E Testing

### **Priority 1**: Fix Frontend E2E Tests

- Update mocks in skipped tests to use canonical `out_envelope` shape
- Re-enable: `flows.test.js`, `prompt-to-preview.integration.test.js`, `persistence-refresh.integration.test.js`
- **Time**: ~2-3 hours

### **Priority 2**: Add Fetch Failure Tests

Create a new test: `scripts/test-fetch-timeout.js`

- Simulate long response time (50+ seconds)
- Test with client timeout scenarios
- Verify error messages match investigation findings

### **Priority 3**: Add Network Resilience Tests

Create: `scripts/test-network-failures.js`

- Test proxy timeout scenarios
- Test connection drop scenarios
- Test partial response scenarios

### **Priority 4**: Monitor E2E Success Metrics

Add metrics to track:

- Response time percentiles (p50, p95, p99)
- Success/failure rates by failure mode
- Client-side error categorization

---

## Running Tests Locally

### Full Test Suite

```bash
# Client tests
cd client && npm run test

# Server tests (with mocked AI)
cd server && npm run test:ci

# Full coverage
cd server && npm run test:ci
```

### Specific E2E Scenarios

```bash
# Backend round-trip export test
node scripts/test-export-roundtrip.js

# Rate limiting verification
node scripts/test-rate-limiter.js

# Generate + preview
node scripts/test-generate-preview.js

# Ebook generation step 1
node scripts/test-step1.js
```

### Playwright Smoke Test

```bash
# Start server first
cd server && npm run dev

# In another terminal, run test
cd client && node ../scripts/test-generate-preview.js
```

---

## Current Issue: Ebook E2E Failure

The fetch failure preventing the user from receiving HTML content has:

- ✅ **Successful backend test**: `test-export-roundtrip.js` passes (generates → exports)
- ❌ **Failed frontend delivery**: User sees fetch error despite backend success
- 🔴 **No specific e2e test** for this fetch failure mode

**Solution**: Once fetch failure is reproduced and logged, create a regression test to prevent recurrence.

---

## Key Insights

1. **Tests exist but aren't integrated**: Script-based e2e tests work independently but aren't part of CI pipeline
2. **Frontend tests are outdated**: Canonical response shape change broke 3 e2e tests
3. **No client-specific e2e tests in workflows**: Playwright tests are manual/non-blocking
4. **Server tests are robust**: 20+ unit tests all passing with mocked AI
5. **Gap**: No tests for fetch/network failure modes with long response times

---

## References

- Test documentation: [client/**tests**/TESTS.md](client/__tests__/TESTS.md)
- Workflow documentation: [.github/workflows/WORKFLOWS-revised.md](../../.github/workflows/WORKFLOWS-revised.md)
- E2E roundtrip test: [scripts/test-export-roundtrip.js](../../scripts/test-export-roundtrip.js)
- Fetch error investigation: [FETCH_FAILURE_INVESTIGATION.md](FETCH_FAILURE_INVESTIGATION.md)
