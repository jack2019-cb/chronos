# Rate-Limiter Testing Guide

**Date**: December 12, 2025  
**Status**: Ready for Testing  
**Branch**: `feat/burst-rate-limiter`

## Overview

This guide walks through testing the burst rate-limiter implementation across 6 test scenarios defined in RATE-LIMITER-FEATURE.md.

## Prerequisites

1. ✅ Rate-limiter implementation complete
2. ✅ Model routing implementation complete
3. ✅ Code committed to `feat/burst-rate-limiter` branch
4. Server running with `USE_REAL_AI=1` (requires valid GEMINI API credentials)
5. Environment variables configured (see Setup section)

## Setup

### Environment Configuration

Create or update `.env` in the server directory:

```bash
# Required: Gemini API credentials
GEMINI_API_KEY=<your-api-key>
GEMINI_API_URL=<your-api-url>

# Enable real AI (required for testing)
USE_REAL_AI=1

# Optional: Model-specific endpoints
# GEMINI_API_URL_PRO=<pro-model-url>
# GEMINI_API_URL_FLASH=<flash-model-url>

# Rate-limiter configuration (will change per test)
# Test 1: RATE_LIMIT_MIN_DELAY_MS=0
# Test 2: RATE_LIMIT_MIN_DELAY_MS=1000
RATE_LIMIT_MIN_DELAY_MS=1000
```

### Start Server

```bash
cd server
npm install  # if needed
npm start
```

Server should log:

```
[1] listening on 0.0.0.0:8000
```

## Test Execution

### Automated Test Suite

Run all tests automatically:

```bash
cd scripts
node test-rate-limiter.js
```

This runs Tests 1-4. Expected output:

```
╔════════════════════════════════════════════════════════════════════╗
║           RATE-LIMITER TEST SUITE                                  ║
╚════════════════════════════════════════════════════════════════════╝

Base URL: http://localhost:8000
Testing burst rate-limiter implementation across multiple scenarios

======================================================================
TEST: Test 1: Baseline (RATE_LIMIT_MIN_DELAY_MS=0)
======================================================================
...
```

### Manual Test: Test 1 (Baseline - No Pacing)

**Setup**: Disable rate-limiter to reproduce the original burst rate failure

```bash
# Terminal 1: Start server with NO pacing
export RATE_LIMIT_MIN_DELAY_MS=0
npm start
```

**Run request**:

```bash
curl -X POST http://localhost:8000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An adorable children story about Benny the Brave Bunny",
    "metadata": {
      "pageCount": 3,
      "theme": "light"
    }
  }'
```

**Expected Result**:

- ✗ Chapter 3 fails with "model is overloaded"
- ✗ HTTP 200 response but with fallback stub content for Chapter 3
- ✗ Logs show: `[EBOOK] Chapter 3/3: AI generation failed, using fallback`

**Evidence of Success**:

```json
{
  "chapters": [
    { "title": "...", "content": "...real AI content..." },
    { "title": "...", "content": "...real AI content..." },
    { "title": "...", "content": "Content for [chapter title]" }  ← Fallback!
  ]
}
```

---

### Manual Test: Test 2 (With Pacing)

**Setup**: Enable rate-limiter (default 1000ms)

```bash
# Terminal 1: Start server with pacing
export RATE_LIMIT_MIN_DELAY_MS=1000
npm start
```

**Run request**: (same as Test 1)

```bash
curl -X POST http://localhost:8000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An adorable children story about Benny the Brave Bunny",
    "metadata": {
      "pageCount": 3,
      "theme": "light"
    }
  }'
```

**Expected Result**:

- ✓ All 3 chapters succeed
- ✓ HTTP 200 response with quality content
- ✓ Logs show pacing delays:
  ```
  [RATE-LIMIT] Call 3: enforcing 1000ms inter-request delay
  [RATE-LIMIT] Call 3: delay complete, proceeding
  [EBOOK] Chapter 3/3: AI response received in 19000ms ← SUCCESS
  ```
- ✓ Total time: ~45-48 seconds (vs ~38s baseline + 1s delays)

**Evidence of Success**:

```json
{
  "chapters": [
    { "title": "...", "content": "...real AI content..." },
    { "title": "...", "content": "...real AI content..." },
    { "title": "...", "content": "...real AI content..." }  ← No fallback!
  ]
}
```

---

### Manual Test: Test 3 (10-Page Book)

**Setup**: Rate-limiter enabled

```bash
export RATE_LIMIT_MIN_DELAY_MS=1000
npm start
```

**Run request**:

```bash
curl -X POST http://localhost:8000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An adorable children story about Benny the Brave Bunny",
    "metadata": {
      "pageCount": 10,
      "theme": "light"
    }
  }'
```

**Expected Result**:

- ✓ All 10 chapters succeed
- ✓ No fallback stubs anywhere
- ✓ Total time: ~100-115 seconds
- ✓ Quota used: 11/20 (structure + 10 chapters)

**Verification**:

```bash
# Count chapters in response
curl ... | jq '.chapters | length'
# Should output: 10

# Check for fallbacks
curl ... | jq '.chapters[] | select(.content.body | startswith("Content for"))'
# Should output: (empty - no matches)
```

---

### Manual Test: Test 4 (20-Page Book - At Quota Limit)

**Setup**: Rate-limiter enabled

```bash
export RATE_LIMIT_MIN_DELAY_MS=1000
npm start
```

**Run request**:

```bash
curl -X POST http://localhost:8000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An adorable children story about Benny the Brave Bunny",
    "metadata": {
      "pageCount": 20,
      "theme": "light"
    }
  }'
```

**Expected Result**:

- ✓ All 20 chapters succeed
- ✓ Uses exactly 20/20 quota (structure + 19 chapters; 1 unused)
- ✓ No fallback stubs
- ✓ Total time: ~190-210 seconds

**Quota Verification**:
Look for logs:

```
[QUOTA] Call recorded: 1/20 (5% used, 19 remaining)
...
[QUOTA] Call recorded: 20/20 (100% used, 0 remaining)
```

---

## Test 5: Delay Optimization (Manual)

Test with different delay values to find the minimum working delay:

```bash
for DELAY in 250 500 750 1000 1500 2000; do
  echo "Testing with ${DELAY}ms delay..."
  export RATE_LIMIT_MIN_DELAY_MS=$DELAY
  # Restart server and run request
  # Track success/failure
done
```

Expected results:

- 250ms: May fail occasionally (too aggressive)
- 500ms: May fail on larger books (risky)
- 1000ms: Consistently succeeds (safe baseline) ✓
- 2000ms: Always succeeds (over-conservative)

**Recommendation**: Keep 1000ms default, adjust if data shows success rate > 99%.

---

## Test 6: Quota Integration (Manual)

Test that rate-limiter and quota tracker work together:

**Scenario A: Quota Exhaustion**

```bash
# Make 5 sequential 3-page requests (5 × 4 calls = 20 calls total)
for i in {1..5}; do
  echo "Request $i..."
  curl -X POST http://localhost:8000/api/ebook/generate \
    -H "Content-Type: application/json" \
    -d '{"prompt": "...", "metadata": {"pageCount": 3, "theme": "light"}}'
  sleep 2  # Small delay between requests
done

# Request 6 should fail with quota exhausted
echo "Request 6 (should fail)..."
curl -X POST http://localhost:8000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "...", "metadata": {"pageCount": 3, "theme": "light"}}'
```

**Expected**:

- Requests 1-5: All succeed (20 calls total)
- Request 6: Fails with HTTP 429 "Quota exhausted"

**Scenario B: Quota Window Reset**

During a long 20-page request (takes ~3+ minutes), the quota window may reset (60-second sliding window). Verify this works:

```bash
export RATE_LIMIT_MIN_DELAY_MS=1000
# Start 20-page request
# Watch logs for quota window reset mid-request
# Should see quota refreshed and request continue to completion
```

---

## Logging Analysis

### Expected Log Patterns

**Rate-Limiter Logs**:

```
[RATE-LIMIT] Call 0: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 0: delay complete, proceeding
[RATE-LIMIT] Call 1: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 2: enforcing 0ms inter-request delay
[RATE-LIMIT] Call 3: enforcing 1000ms inter-request delay ← PACING ENFORCED
[RATE-LIMIT] Call 3: delay complete, proceeding
[RATE-LIMIT] Call 3: timestamp recorded
```

**Model Routing Logs**:

```
[QUOTA] Call 0: Using Gemini 2.5 Pro (structure generation)
[QUOTA] Call 1: Using Gemini 2.5 Flash (chapter generation)
[QUOTA] Call 2: Using Gemini 2.5 Flash (chapter generation)
[QUOTA] Call 3: Using Gemini 2.5 Flash (chapter generation)
[GEMINI] Call 0: Using model gemini-2.5-pro
[GEMINI] Call 1: Using model gemini-2.5-flash
```

**Quota Logs**:

```
[QUOTA] Call recorded: 1/20 (5% used, 19 remaining)
[QUOTA] Call recorded: 2/20 (10% used, 18 remaining)
...
[QUOTA] Call recorded: 20/20 (100% used, 0 remaining)
```

### Log Filtering

Extract specific information:

```bash
# Show all rate-limiter activity
grep "\[RATE-LIMIT\]" server.log

# Show pacing delays only
grep "\[RATE-LIMIT\].*enforcing" server.log

# Show model routing
grep "Using model" server.log

# Show quota tracking
grep "\[QUOTA\] Call recorded" server.log

# Show chapter completion times
grep "AI response received" server.log
```

---

## Success Criteria

### All Tests Must Pass:

✓ Test 1: Chapter 3 fails with baseline (0ms delay)  
✓ Test 2: All 3 chapters succeed with pacing (1000ms delay)  
✓ Test 3: All 10 chapters succeed (100-115s)  
✓ Test 4: All 20 chapters succeed, uses 20/20 quota (190-210s)  
✓ Test 5: 1000ms identified as minimum working delay  
✓ Test 6: Quota exhaustion and integration verified

### Key Metrics:

- **Chapter Success Rate**: 100% (zero fallback stubs in paced tests)
- **Model Routing**: Pro used for structure (Call 0), Flash for chapters (Call 1+)
- **Timing**: Paced tests take ~7-10 seconds longer (acceptable tradeoff)
- **Quota**: Properly tracked and exhausted at 20 calls
- **Logs**: All [RATE-LIMIT] messages present and correct

---

## Troubleshooting

### Problem: Test 1 doesn't fail (Chapter 3 succeeds even with 0ms delay)

**Possible Causes**:

- Gemini API not overloaded at request time
- Different API tier with higher burst capacity
- Rate-limit didn't actually get disabled

**Solution**:

- Verify RATE_LIMIT_MIN_DELAY_MS=0 is set
- Check logs for: `[RATE-LIMIT] Call 3: enforcing 0ms`
- Try multiple runs (burst failures are not 100% guaranteed, but frequent)

### Problem: Test 2 still fails (Chapter 3 fails even with 1000ms delay)

**Possible Causes**:

- Delay too short for Gemini infrastructure
- Quota actually exhausted (check quota logs)
- Gemini API experiencing broader issues

**Solutions**:

- Increase delay: Try 1500ms or 2000ms
- Check quota logs: `[QUOTA] Call recorded: ...`
- Verify Gemini API status

### Problem: Tests timeout or hang

**Causes**:

- Server not running
- Network issues
- Long generation times

**Solutions**:

- Verify server: `curl http://localhost:8000/health`
- Check firewall/ports
- Allow longer timeouts for 20-page book test

---

## Next Steps After Testing

1. If all tests pass: ✓ Implementation is successful
2. Create PR from feat/burst-rate-limiter to main
3. Request code review
4. Monitor in staging environment
5. Deploy to production when approved

---

**Test Script Location**: `scripts/test-rate-limiter.js`  
**Run Tests**: `node scripts/test-rate-limiter.js`
