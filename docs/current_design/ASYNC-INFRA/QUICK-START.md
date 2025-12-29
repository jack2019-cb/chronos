# ASYNC-INFRA Quick Start

**Get the ASYNC-INFRA phase up and running in 5 minutes.**

## ⚡ TL;DR - Run Everything

```bash
# 1. Validate (< 10 seconds)
node scripts/validate-async-infra.js

# 2. Unit tests (< 30 seconds, no server needed)
node scripts/test-async-infra-unit.js

# 3. Start server in background/new terminal
npm start  # from server/ directory

# 4. Integration tests in another terminal (< 2 minutes)
node scripts/test-async-infra-comprehensive.js

# Expected: ✅ All tests pass!
```

---

## 📋 What You're Testing

| Component           | What It Does                             | Status         |
| ------------------- | ---------------------------------------- | -------------- |
| **PART-A**          | Returns 202 immediately, hands off async | ✅ Implemented |
| **PART-B**          | Fresh orchestrator with FIFO scheduling  | ✅ Implemented |
| **Helpers**         | Timing, scheduling, status management    | ✅ Implemented |
| **SmartPoller**     | App-wide job tracking                    | ✅ Implemented |
| **Status Endpoint** | GET /api/status/:resultId polling        | ✅ Implemented |

---

## 🚀 Quick Start Steps

### Step 1: Validate Files Exist (10s)

```bash
cd /workspaces/strawberry
node scripts/validate-async-infra.js
```

**Expected output**:

```
✅ timingResolver module
✅ fifoScheduler module
✅ statusManager module
✅ orchestrator module
✅ smartPoller utility
✅ POST /api/ebook/generate endpoint exists
✅ GET /api/status/:resultId endpoint exists
✅ VALIDATION PASSED - All ASYNC-INFRA components are in place!
```

If you see ❌, there's a missing file. Check file paths and re-run.

---

### Step 2: Run Unit Tests (30s)

**No server required for this step.**

```bash
node scripts/test-async-infra-unit.js
```

**Expected output**:

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

If you see ❌, there's a component issue. Check error message and fix the module.

---

### Step 3: Start the Server (30s setup)

**Open a new terminal or run in background**:

```bash
cd /workspaces/strawberry/server
npm start
```

**Wait for**:

```
Server listening on port 3001
```

If you see errors, check dependencies: `npm install`

---

### Step 4: Run Integration Tests (2 minutes)

**In another terminal**:

```bash
cd /workspaces/strawberry
node scripts/test-async-infra-comprehensive.js
```

**Expected output** (summary):

```
============================================================
TEST 1: PART-A - Async Acceptance
============================================================
✅ 1.1: Returns HTTP 202 (Accepted)
✅ 1.2: Response includes resultId
✅ 1.3: Response includes status
✅ 1.4: Response time < 500ms
✅ 1.5: Response includes polling instructions

[... more tests ...]

============================================================
SUMMARY
============================================================

✅ All test suites completed!
```

If you see ❌ on any test:

1. Check server logs (Terminal 1)
2. Look for error details
3. Verify endpoint is accessible

---

## 🧪 Manual Testing (Optional)

If you want to test without running test scripts:

### Test POST endpoint

```bash
curl -X POST http://localhost:3001/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write about renewable energy",
    "theme": "dark",
    "pageCount": 3
  }'
```

**Expected response** (HTTP 202):

```json
{
  "resultId": "12345678-1234-1234-1234-123456789012",
  "status": "queued",
  "message": "Your request is queued. Check status at /api/status/12345678-1234-1234-1234-123456789012"
}
```

### Test status endpoint

```bash
# Replace UUID with one from above
curl http://localhost:3001/api/status/12345678-1234-1234-1234-123456789012
```

**Expected response** (HTTP 200):

```json
{
  "resultId": "12345678-1234-1234-1234-123456789012",
  "status": "in-progress",
  "eta": 23,
  "elapsed_seconds": 5,
  "calls_completed": 1,
  "calls_total": 4,
  "progress_percent": 25,
  "estimated_remaining_seconds": 18,
  "message": "Processing call 2 of 4",
  "errors": null,
  "lastUpdatedAt": "2025-12-20T12:34:56.789Z"
}
```

---

## ✅ Success Criteria

**All 4 validators should show green**:

1. ✅ Validation script passes
2. ✅ Unit tests pass
3. ✅ Server starts without errors
4. ✅ Integration tests pass

If all 4 are green → **ASYNC-INFRA is working!** 🎉

---

## 🔧 Troubleshooting

| Problem                     | Solution                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| `Server won't start`        | Check npm install, port 3001 not in use, try `npm start -- --debug` |
| `Validation shows ❌`       | Files missing, check paths match exactly, re-run validation         |
| `Unit tests fail`           | Component issue, read error message carefully, check module code    |
| `Integration tests timeout` | Server not running, check Terminal 1, wait 10s for server startup   |
| `cURL returns 404`          | Port wrong, server not running, endpoint path misspelled            |

---

## 📊 What Gets Tested

### PART-A Async Acceptance

- ✅ POST /api/ebook/generate returns HTTP 202
- ✅ Response includes resultId for tracking
- ✅ Response time < 500ms (goal: < 150ms)
- ✅ No waiting for backend execution

### Status Polling

- ✅ GET /api/status/:resultId returns HTTP 200
- ✅ Status includes progress_percent (0-100)
- ✅ Status includes estimated_remaining_seconds
- ✅ Unknown resultId returns HTTP 404

### Helpers Framework

- ✅ timingResolver computes ETA + schedule
- ✅ fifoScheduler builds FIFO schedule
- ✅ statusManager tracks per-request status
- ✅ Proper spacing between calls

### Orchestrator

- ✅ Instantiates with resultId
- ✅ Captures manifest on first call
- ✅ Has all helpers injected
- ✅ Ready for service integration

### SmartPoller

- ✅ Tracks concurrent jobs
- ✅ Updates progress
- ✅ Marks complete/error
- ✅ Cleans up old jobs

### Performance

- ✅ Response time < 500ms
- ✅ Average < 200ms
- ✅ Handles concurrent requests
- ✅ Job completes in reasonable time

---

## 📈 Expected Performance

| Metric             | Value                        |
| ------------------ | ---------------------------- |
| POST response time | 50-100ms                     |
| GET response time  | 20-40ms                      |
| Job completion     | 20-30s (for 3-10 page ebook) |
| Concurrent jobs    | 5+                           |
| ETA accuracy       | ±5 seconds                   |

---

## 🎯 Next Steps

**After all tests pass ✅**:

1. **Review logs**: Check server logs for any warnings
2. **Verify data**: Generate a test ebook manually
3. **Check frontend**: Frontend should show progress updates
4. **Commit**: `git commit -m "feat(async-infra): PART-A, orchestrator, helpers, smartPoller"`
5. **Merge**: Create PR to merge ASYNC-INFRA → feat/ebook-nat-cont

---

## 📚 More Information

- **Full Testing Guide**: [ASYNC-INFRA-TESTING.md](ASYNC-INFRA-TESTING.md)
- **Implementation Details**: [IMPLEMENTATION-SUMMARY.md](IMPLEMENTATION-SUMMARY.md)
- **Architecture Guide**: [docs/ARCHITECTURE_IMPLEMENTATION_GUIDE.md](docs/ARCHITECTURE_IMPLEMENTATION_GUIDE.md)

---

**Status**: ✅ Ready to Test  
**Time to Full Test**: ~5 minutes  
**Expected Result**: All tests green 🟢
