# ASYNC-INFRA Testing Guide

**Phase**: ASYNC-INFRA (Foundation)  
**Status**: Ready for Testing  
**Last Updated**: December 20, 2025

## Overview

This document explains how to validate and test the ASYNC-INFRA phase implementation, which includes:

- **PART-A**: Async acceptance (returns 202 immediately, hands off async)
- **PART-B Orchestrator**: Fresh per-request orchestrator with FIFO scheduling
- **Helpers Framework**: Stateless per-request computation
- **Utilities Framework**: App-wide state management (smartPoller)

## Components Implemented

### Core Files

```
server/
├── helpers/
│   ├── timingResolver.js    # Computes ETA + schedule from manifest
│   ├── fifoScheduler.js     # Builds FIFO schedule with spacing
│   ├── statusManager.js     # Per-request status tracking
│   └── index.js             # Exports all helpers
├── utilities/
│   └── smartPoller.js       # Singleton job tracker
├── orchestrator.js          # Fresh per-request orchestrator
└── index.js                 # Modified POST/GET endpoints
```

### Endpoints Implemented

```
POST /api/ebook/generate
  Request:  { prompt, theme, pageCount, colorPalette, fontSizeScale }
  Response: 202 { resultId, status, message }

GET /api/status/:resultId
  Request:  (no body)
  Response: 200 { resultId, status, eta, progress_percent, ... }
           404 { error: "Job not found" }
```

## Running Tests

### 1. Validate Component Structure

Verify all files are in place:

```bash
cd /workspaces/strawberry
node scripts/validate-async-infra.js
```

Expected output:

```
✅ timingResolver module
✅ fifoScheduler module
✅ statusManager module
✅ helpers index (exports)
✅ orchestrator module
✅ smartPoller utility
✅ POST /api/ebook/generate endpoint exists
✅ GET /api/status/:resultId endpoint exists
✅ VALIDATION PASSED - All ASYNC-INFRA components are in place!
```

### 2. Run Unit Tests

Test individual components in isolation (no server required):

```bash
cd /workspaces/strawberry
node scripts/test-async-infra-unit.js
```

This tests:

- `timingResolver` - ETA computation, scheduling, tier handling
- `fifoScheduler` - Schedule building from timing
- `statusManager` - Status initialization, progress tracking
- `orchestrator` - Instantiation, manifest capture, helper injection
- `smartPoller` - Task assignment, progress updates, completion

Expected output:

```
============================================================
timingResolver
============================================================
✅ should compute correct ETA for 4-call expert manifest
✅ should maintain spacing between calls
✅ should handle mixed tier manifest
...

✅ All unit tests passed!
```

### 3. Run Comprehensive Integration Tests

Test end-to-end flow with running server:

#### Step 1: Start the Server

```bash
cd /workspaces/strawberry/server
npm start
```

Wait for output:

```
Server listening on port 3001
```

#### Step 2: Run Integration Tests (new terminal)

```bash
cd /workspaces/strawberry
node scripts/test-async-infra-comprehensive.js
```

Expected output:

```
╔════════════════════════════════════════════════════════════╗
║     ASYNC-INFRA: COMPREHENSIVE TEST SUITE                  ║
║     Testing PART-A, Helpers, Orchestrator, SmartPoller    ║
╚════════════════════════════════════════════════════════════╝

============================================================
TEST 1: PART-A - Async Acceptance
============================================================
✅ 1.1: Returns HTTP 202 (Accepted)
✅ 1.2: Response includes resultId
✅ 1.3: Response includes status
✅ 1.4: Response time < 500ms
✅ 1.5: Response includes polling instructions

============================================================
TEST 2: Status Polling Endpoint
============================================================
✅ 2.1: Status endpoint returns 200
✅ 2.2: Response includes resultId
✅ 2.3: Response includes status field
✅ 2.4: Response includes message
✅ 2.5: Can poll multiple times
✅ 2.6: Non-existent resultId returns 404

...

============================================================
SUMMARY
============================================================

✅ All test suites completed!
```

## Test Suites Explained

### TEST 1: PART-A - Async Acceptance

Validates:

- POST /api/ebook/generate returns HTTP 202
- Response includes resultId for job tracking
- Response time < 500ms (async acceptance is fast)
- Response includes polling instructions

```javascript
POST /api/ebook/generate
→ HTTP 202 + { resultId: "uuid", status: "queued", ... }
→ Response in ~50-100ms
```

### TEST 2: Status Polling Endpoint

Validates:

- GET /api/status/:resultId accessible and returns 200
- Response includes required fields (status, progress, ETA)
- Can poll multiple times (status updates)
- Non-existent resultId returns 404

```javascript
GET /api/status/:resultId
→ HTTP 200 + { resultId, status, progress_percent, eta, ... }
→ Polling works: status changes as job progresses
```

### TEST 3: Helpers Framework

Validates:

- timingResolver computes ETA + schedule from manifest
- fifoScheduler builds FIFO schedule with proper spacing
- statusManager initializes and tracks status
- All helpers export expected functions

### TEST 4: Orchestrator

Validates:

- Orchestrator instantiates with resultId
- Orchestrator has all required helpers injected
- Orchestrator ready to capture manifest
- Can be instantiated with custom helpers (for testing)

### TEST 5: SmartPoller Utility

Validates:

- SmartPoller loads as singleton
- Can assign tasks
- Can update progress
- Can mark complete/error
- Returns null for unknown tasks
- Can list active tasks

### TEST 6: Error Handling

Validates:

- Invalid prompt (empty) returns 400
- Invalid theme returns 400
- Invalid page count (out of range) returns 400
- Invalid font scale (out of range) returns 400

### TEST 7: End-to-End Integration

Validates:

- Full flow: submit → poll → complete
- Job transitions to terminal state (complete/error)
- Job completes within reasonable time
- Status updates during job execution

### TEST 8: Performance (Response Time)

Validates:

- 5 consecutive requests all return < 200ms average
- No request takes > 500ms
- All requests respond within 1 second

## Expected Behavior

### Successful Request Flow

```
1. Client: POST /api/ebook/generate
   ↓ (< 100ms)
2. Server: Returns HTTP 202 + { resultId: "abc123", status: "queued" }
   ↓
3. Client: GET /api/status/abc123
   ↓ (< 50ms)
4. Server: Returns { status: "in-progress", progress: 0%, eta: 23s }
   ↓ (client waits/polls)
5. Backend: genieService.process() starts async
   - Orchestrator captures manifest from service
   - Computes ETA and schedule
   - Executes calls with FIFO + spacing
   - Updates smartPoller with progress
   ↓ (~20-30 seconds later)
6. Backend: Job completes, smartPoller.markComplete() called
   ↓
7. Client: GET /api/status/abc123
   ↓ (< 50ms)
8. Server: Returns { status: "complete", result: {...} }
```

### Error Cases

```
1. Empty prompt → 400 Bad Request
2. Invalid theme → 400 Bad Request
3. Page count out of range → 400 Bad Request
4. Font scale out of range → 400 Bad Request
5. Non-existent resultId → 404 Not Found
```

## Interpreting Test Results

### ✅ All Tests Pass

- All ASYNC-INFRA components working correctly
- Safe to proceed to SERVICE-AUTON phase
- No integration issues detected

### ❌ Some Tests Fail

Check the failure details:

1. **File structure errors**: Check file paths and existence
2. **Helper function errors**: Check helper implementations
3. **Orchestrator errors**: Check orchestrator.js instantiation
4. **SmartPoller errors**: Check utilities/smartPoller.js
5. **Endpoint errors**: Check index.js (HTTP handlers)
6. **Performance errors**: May be due to system load, retry
7. **E2E errors**: Check server logs for backend issues

## Monitoring the Tests

### Terminal 1: Server Logs

```bash
cd /workspaces/strawberry/server
npm start
# Watch for:
# - [PART-A] Job accepted: <resultId>
# - [PART-B] Job completed: <resultId>
# - HTTP 202 responses
# - Status polling requests
```

### Terminal 2: Test Execution

```bash
node scripts/test-async-infra-comprehensive.js
# Watch test progress and results
```

### Terminal 3: Manual Testing (Optional)

```bash
# Test POST endpoint
curl -X POST http://localhost:3001/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a guide about solar energy",
    "theme": "dark",
    "pageCount": 3
  }'

# Response: HTTP 202 + { resultId: "...", status: "queued" }

# Then poll status
curl http://localhost:3001/api/status/abc123
# Response: { status: "in-progress", progress_percent: 25, ... }
```

## Next Steps After Testing

### If All Tests Pass ✅

1. Commit ASYNC-INFRA implementation:

   ```bash
   git add -A
   git commit -m "feat(async-infra): Implement PART-A, orchestrator, helpers, smartPoller"
   git push origin ASYNC-INFRA
   ```

2. Create pull request to merge into `feat/ebook-nat-cont`

3. After merge, proceed to SERVICE-AUTON phase:
   - Refactor ebookService with SERVICE_MACHINE_PATTERN
   - Add manifest protocol support
   - Create additional services (wallArtService, etc.)

### If Tests Fail ❌

1. Check error messages in test output
2. Review server logs for backend errors
3. Verify file paths and content
4. Check for missing dependencies
5. Re-run specific failing tests with `-v` flag (when available)

## Architecture Overview

```
REQUEST FLOW:
┌─────────────────────────────────────────────────────────┐
│ Client                                                  │
└────────────────┬────────────────────────────────────────┘
                 │ POST /api/ebook/generate
                 │ (< 100ms response time)
                 ↓
┌─────────────────────────────────────────────────────────┐
│ PART-A: Async Acceptance (index.js)                     │
├─────────────────────────────────────────────────────────┤
│ 1. Validate input                                       │
│ 2. Generate resultId                                    │
│ 3. Initialize status in smartPoller                     │
│ 4. Return HTTP 202 immediately                          │
│ 5. Hand off genieService.process() async (Promise)      │
└────────────┬──────────────────────────────────────────┬─┘
             │                                          │
      Async Execution                        Client polls GET
      (no waiting)                        /api/status/:resultId
             │                                   (< 50ms)
             ↓                                          ↓
┌─────────────────────────────────────────────────────────┐
│ PART-B: Orchestrator (orchestrator.js)                  │
├─────────────────────────────────────────────────────────┤
│ Fresh per-request orchestrator:                         │
│ 1. Service calls orchestrator.generate()                │
│ 2. First call: manifest captured                        │
│ 3. Helpers compute timing + schedule                    │
│ 4. All calls: enforce FIFO + spacing                    │
│ 5. Select model (expert→Pro, standard→Flash)           │
│ 6. Execute via aiService                               │
│ 7. Update smartPoller with progress                     │
└────────────┬──────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────┐
│ Helpers Framework                                       │
├─────────────────────────────────────────────────────────┤
│ • timingResolver: manifest → ETA + schedule             │
│ • fifoScheduler: timing → FIFO schedule                 │
│ • statusManager: per-request status tracking            │
└─────────────────────────────────────────────────────────┘

             │
             ↓
┌─────────────────────────────────────────────────────────┐
│ Utilities Framework                                     │
├─────────────────────────────────────────────────────────┤
│ smartPoller (singleton):                                │
│ • Manages all concurrent job status                     │
│ • Enriches with orchestrator progress                   │
│ • Returns status to polling endpoint                    │
│ • Cleans up old jobs (24h expiry)                       │
└─────────────────────────────────────────────────────────┘

             │
             ↓
      Job Completes
      smartPoller.markComplete()
             │
             ↓
    GET /api/status/:resultId
    Returns { status: "complete", result: {...} }
             │
             ↓
          Client
```

## Performance Targets

These are the targets for ASYNC-INFRA phase:

| Metric                   | Target          | Notes                            |
| ------------------------ | --------------- | -------------------------------- |
| POST response time       | < 150ms         | PART-A acceptance (before async) |
| GET status time          | < 50ms          | Status polling (lightweight)     |
| ETA accuracy             | ±5s             | Computed upfront from manifest   |
| FIFO spacing enforcement | ±50ms           | Pro: 250ms, Standard: 100ms      |
| Job completion time      | < 50s           | Varies by pageCount (3-10 pages) |
| Concurrent jobs          | 5+ simultaneous | SmartPoller scales linearly      |

## Troubleshooting

### Server won't start

```bash
# Check if port 3001 is in use
lsof -i :3001

# Check dependencies
npm install

# Run with verbose logging
npm start -- --debug
```

### Tests hang or timeout

1. Check if server is running
2. Verify network connectivity to localhost:3001
3. Check server logs for errors
4. Try reducing test timeout values
5. Kill and restart server

### Status endpoint returns 404

- Job may have completed and been cleaned up
- SmartPoller has 24-hour expiry on completed jobs
- Try with a fresh resultId

### Tests report low performance

- Check system load: `top` or `htop`
- Network latency: `ping localhost`
- Disk I/O: `iostat`
- Restart server if memory usage is high

## References

- [ARCHITECTURE_IMPLEMENTATION_GUIDE.md](../docs/ARCHITECTURE_IMPLEMENTATION_GUIDE.md) - Detailed specs
- [ARCHITECTURE_ROADMAP_EXECUTIVE.md](../docs/ARCHITECTURE_ROADMAP_EXECUTIVE.md) - Design decisions
- Test files: `scripts/test-async-*.js`

---

**Status**: ✅ Implementation Complete, Ready for Testing  
**Next Phase**: SERVICE-AUTON (Service Migration)
