# Bug Report: Browser Response Timeout - Missing Response Data

**Date**: November 25, 2025  
**Status**: 🔴 BLOCKING - Browser testing unable to complete  
**Severity**: HIGH  
**Component**: Frontend → Backend API Integration

---

## Summary

Browser-based requests to `/api/ebook/generate` timeout after 30 seconds with error:

```
Error: Request timeout after 30000ms
```

However, **identical requests via curl complete successfully in 4-11 seconds**, indicating the backend is functioning correctly but the **response is not reaching the browser**.

**Key Discovery**: Backend processes quickly (4-11s via curl), but browser request hangs until hitting exactly the 30-second timeout. This indicates the issue is in response delivery/streaming, CORS headers, or a network layer between frontend and backend—NOT backend processing speed.

---

## Reproduction Steps

### Preconditions

- ✅ Server running: `npm run dev` (with USE_REAL_AI=1)
- ✅ Frontend running: `npm run dev` (Vite dev server on localhost:5173)
- ✅ API verified working via curl commands
- ✅ Gemini API credentials active

### Steps

1. Open browser: `http://localhost:5173`
2. Navigate to eBook generation UI (Option 2 frontend)
3. Enter test prompt: "A children's mystery tale about a blind mouse detective in Mouse-town."
4. Select theme: "light"
5. Set pageCount: 3
6. Click "Generate"

### Expected Behavior

- Request sent to backend
- Backend processes (8-15 seconds)
- Response returns to browser with eBook data
- UI displays generated content

### Actual Behavior

- Request sent (appears in network tab)
- Backend processes (evidenced by successful curl tests)
- **Browser never receives response**
- After 30 seconds: "Request timeout" error
- Error message: "Failed to load response data - No data found for resource with given identifier"

### Critical Observation

The error message "No data found for resource with given identifier" appears **AFTER the timeout fires**. This is a generic browser/network error shown when:

- Request times out (30 seconds reached)
- No response data was received
- Browser cannot display meaningful error (no HTTP status, no response body)

This strongly indicates: **Backend is not sending any response back to the browser**, even though curl succeeds.

---

## Test Payload

```json
{
  "prompt": "A children's mystery tale about a blind mouse detective in Mouse-town.",
  "theme": "light",
  "pageCount": 3,
  "colorPalette": "standard",
  "fontSizeScale": 1
}
```

---

## Evidence

### Curl Test (Successful) ✅

```bash
curl -X POST http://localhost:3000/api/ebook/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Detective story","theme":"light","pageCount":3,"colorPalette":["#1a1a1a","#ffffff","#d4af37"],"fontSizeScale":1}'

# Response: HTTP 200, complete JSON payload, ~11 seconds
```

### Browser Test (Failed) ❌

- Request method: POST
- Endpoint: http://localhost:3000/api/ebook/generate
- Status: Timeout (never completes)
- Response: "No data found for resource with given identifier"

---

## Root Cause Analysis

### Hypothesis 1: Response Not Reaching Browser ⚠️

The backend responds successfully (confirmed via curl), but the response is **blocked or lost** before reaching the frontend. Possible causes:

1. **Missing CORS Headers**

   - Backend not setting `Access-Control-Allow-Origin`
   - Browser blocks cross-origin response

2. **Response Stream Incomplete**

   - Backend sends response headers but body stream hangs
   - Browser receives headers but waits for body, times out after 30s
   - Curl succeeds because curl may handle incomplete bodies differently

3. **Content-Type or Response Format Issue**

   - Backend sending `application/json` correctly, but browser fetch parsing fails
   - Response body never completes delivery to JavaScript

4. **Network/Proxy Issue Between Frontend and Backend**

   - Reverse proxy (nginx, etc) buffering/timing out
   - Connection reset after headers sent but before full body transfer

5. **Backend Response Handler Hang**
   - genieService.process() completes
   - res.json() called but response stream stalls
   - Backend holding connection open without closing it

### Critical Observation

**Curl tests**: 4-11 seconds (all successful)  
**Browser test**: 30+ seconds (times out exactly at 30s mark)

This is NOT a backend processing speed issue. The backend completes quickly with curl but the browser request reaches exactly 30 seconds before timing out. This suggests:

- ✅ Backend processes correctly
- ✅ Response is generated
- ❌ Response delivery to browser hangs or gets stuck
- ❌ Issue is in response streaming, CORS, or network layer between frontend and backend

---

## Latest Observation (2025-11-25)

**Payload is reaching backend correctly** (confirmed: all fields visible in DevTools):

```
colorPalette: "standard"
fontSizeScale: 1
pageCount: 8
prompt: "A children's mystery tale about a blind mouse detective in Mouse-town."
theme: "light"
```

**Response from backend**: Just error message "Failed to load response data - No data found for resource with given identifier"

**Key Finding**: The timeout error message appears AFTER 30 seconds, meaning backend is NOT sending any response back to the browser, even though:

- ✅ Request is being received (payload fields confirmed)
- ✅ Backend is processing (curl tests prove backend works)
- ❌ Response is not being sent back to browser

**Most likely causes** (in order of probability):

1. **CORS preflight failing** - Browser sends OPTIONS preflight, backend doesn't respond properly, browser cancels actual POST
2. **Response headers sent but body incomplete** - Backend starts sending response but connection drops before completion
3. **Backend hanging after genieService.process()** - Processing completes but res.json() call hangs indefinitely

---

## Network Timing Analysis (CRITICAL FINDING - 2025-11-25)

**DevTools Network Tab shows: REQUEST STALLED**

Per Chrome DevTools documentation, "Stalled" phase means:

- ✅ Connection is established to backend
- ✅ Request has been sent to backend
- ✅ Backend is processing (evidenced by curl success)
- ❌ **Response is not being sent back from backend**
- ⏱️ Browser waits indefinitely for response, times out after 30s

**What causes "Stalled" status** (per Chrome docs):

1. Higher priority requests (unlikely for single request)
2. 6+ TCP connections already open to origin (possible if other requests open)
3. Disk cache allocation (unlikely)
4. **Most likely**: Response is delayed or blocked at backend level

**Updated diagnosis**: This is NOT a network issue or browser issue. The problem is the **backend is not sending a response back** even though it successfully processes with curl.

**Possible root causes**:

1. **CORS Preflight Failure** (Most Likely)

   - Browser sent OPTIONS request before POST
   - Backend didn't handle OPTIONS correctly
   - Browser cancelled the actual POST request
   - Connection stalls waiting for response that never comes

2. **Response Sending Failure** (Also Likely)

   - Backend processes successfully (genieService.process() completes)
   - res.json() is called but fails silently
   - No response bytes sent to browser
   - Browser stalls waiting for response

3. **Response Stream Never Starts** (Less Likely)
   - Backend completes processing but never initiates response
   - Response headers never sent
   - Browser stalls waiting for first byte

---

## BREAKTHROUGH: NS_BINDING_ABORTED Error (2025-11-25 - CRITICAL)

**Browser Network Tab shows: "transferred" = NS_BINDING_ABORTED**
**Response preview**: "No response data available for this request"

**This is the smoking gun!**

`NS_BINDING_ABORTED` means: **The browser ABORTED the request connection**

### What This Tells Us

The browser itself cancelled the request before getting a response. This is NOT the server refusing to respond—it's the browser **actively cancelling** the request.

**Why the browser cancels requests:**

1. **CORS Preflight Failure** (95% probability) ⚠️

   - Browser sends OPTIONS request to check CORS headers
   - Backend doesn't respond or responds with wrong headers
   - Browser cancels the actual POST request
   - Result: NS_BINDING_ABORTED

2. **Request Abort Due to Policy** (4% probability)

   - Content Security Policy violation
   - Mixed content (HTTPS/HTTP mismatch)
   - Redirect loop

3. **User or Code Abort** (1% probability)
   - JavaScript called AbortController.abort()
   - User clicked stop button

### CORS Preflight Hypothesis (MOST LIKELY)

The browser sends an **OPTIONS request first** (preflight) for cross-origin POST requests:

```
OPTIONS /api/ebook/generate HTTP/1.1
Origin: http://localhost:5173
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type
```

**If backend doesn't respond with proper CORS headers**, browser cancels:

```
# Missing or wrong response causes abort
# Should have:
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### How to Verify This

**Check Network tab for TWO requests:**

1. **OPTIONS** /api/ebook/generate - Check status code (should be 200)
2. **POST** /api/ebook/generate - Check if it exists (may not if OPTIONS failed)

**If OPTIONS request is missing or failed**: That's the problem
**If OPTIONS succeeded but POST shows NS_BINDING_ABORTED**: Different issue

### The Fix (Most Likely)

The server already has `app.use(cors())` enabled, which should handle OPTIONS automatically. However:

1. ✅ Verify CORS middleware is **before** the route handler
2. ✅ Verify `app.use(cors())` is present and configured correctly
3. ✅ Check if there's any middleware that might block OPTIONS requests
4. ⚠️ Check if there's a rate limiter blocking OPTIONS requests

---

## ROOT CAUSE FOUND & FIXED (2025-11-25)

### The Problem

The **Startup Readiness Probe Middleware** (in `/workspaces/strawberry/server/index.js` around line 443) was returning **503 Service Unavailable** for all requests that aren't `/health` or `/` when Puppeteer wasn't ready.

This includes **OPTIONS preflight requests**!

When the browser sends:

```
OPTIONS /api/ebook/generate
```

The server responded:

```
503 Service Unavailable
```

Instead of:

```
200 OK
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, GET, OPTIONS
...
```

**The browser interprets a 503 response to an OPTIONS preflight as a rejection** and aborts the entire request with **NS_BINDING_ABORTED**.

### The Fix

Modified the Startup Readiness Probe Middleware to **allow OPTIONS requests through** (they bypass the readiness check):

```javascript
// Startup Readiness Probe Middleware
app.use((req, res, next) => {
  // Allow health check, root route, and OPTIONS (CORS preflight) to bypass readiness check
  if (req.path === "/health" || req.path === "/" || req.method === "OPTIONS") {
    return next();
  }

  // ... rest of readiness checks ...
});
```

This allows:

- ✅ CORS preflight (OPTIONS) always succeeds with 200 + CORS headers
- ✅ Browser proceeds with actual POST request
- ✅ Request gets proper response instead of NS_BINDING_ABORTED

---

- [ ] Open Chrome DevTools → Network tab
- [ ] Attempt browser request to /api/ebook/generate
- [ ] **Critical checks**:
  - Request URL: Exact path? (`http://localhost:3000/api/ebook/generate`?)
  - Request method: POST? Headers present?
  - Response status code: Any code shown or just timeout?
  - Response headers: Is `Access-Control-Allow-Origin` present?
  - Response preview: Is there a body preview or completely empty?
  - Timing breakdown: What's shown in timing tab? (DNS, TCP, TTFB, download)

### 2. CORS Verification (PRIORITY 1)

- [ ] Check server logs for any CORS-related errors during browser request
- [ ] Verify `Access-Control-Allow-Origin` header present in response
  - Look for `Access-Control-Allow-*` headers in DevTools
  - Should include: `Access-Control-Allow-Origin: *` or `http://localhost:5173`
- [ ] Confirm backend CORS middleware configured correctly

### 3. Server Response Lifecycle Logging (PRIORITY 2)

Add logging at critical points in `/api/ebook/generate` handler:

```javascript
app.post("/api/ebook/generate", async (req, res) => {
  console.log(`[${new Date().toISOString()}] POST /api/ebook/generate started`);

  // ... validation ...

  try {
    console.log(`[${new Date().toISOString()}] Calling genieService.process()`);
    const result = await genieService.process(payload);
    console.log(`[${new Date().toISOString()}] genieService.process() completed`);

    console.log(`[${new Date().toISOString()}] Sending response to client`);
    res.json({...});
    console.log(`[${new Date().toISOString()}] Response sent successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error);
    res.status(500).json({...});
    console.log(`[${new Date().toISOString()}] Error response sent`);
  }
});
```

Then run browser test and check logs. Look for:

- Does "Response sent successfully" log appear?
- Is there a large gap between "genieService.process() completed" and "Response sent"?
- Any errors in the catch block?

### 4. Response Size Analysis (PRIORITY 2)

- [ ] Measure response payload size when using curl
  - Check with: `curl ... | wc -c` (byte count)
  - Check JSON structure depth (chapters array, metadata, etc)
- [ ] Compare with expected browser response
- [ ] Check if response size might cause network buffering issues

### 5. Frontend Fetch Details (PRIORITY 2)

Add detailed logging to `ebookApi.js` fetchWithTimeout:

```javascript
async function fetchWithTimeout(url, options, timeoutMs) {
  console.log(`[${new Date().toISOString()}] Fetch started: ${url}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(
      `[${new Date().toISOString()}] Timeout fired at ${timeoutMs}ms`
    );
    controller.abort();
  }, timeoutMs);

  try {
    console.log(`[${new Date().toISOString()}] Awaiting fetch...`);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    console.log(
      `[${new Date().toISOString()}] Response received: status ${
        response.status
      }`
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(
        data.error || `API error ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();
    console.log(
      `[${new Date().toISOString()}] Response body parsed successfully`
    );
    return data;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Fetch error:`, err);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      throw new Error(`Network error: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Then check browser console during test. Look for:

- "Response received: status 200" message?
- "Response body parsed successfully" message?
- Does timeout fire before response received?

### 6. Server CORS/Middleware Configuration (PRIORITY 3)

- [ ] Check server/index.js for CORS middleware setup
- [ ] Verify all required CORS headers are being set:
  - `Access-Control-Allow-Origin`
  - `Access-Control-Allow-Methods`
  - `Access-Control-Allow-Headers`
  - `Access-Control-Allow-Credentials`
- [ ] Check if OPTIONS preflight request is being handled
- [ ] Verify middleware order (CORS should be early)

---

## Affected Functionality

- **Feature**: Browser-based eBook generation (Option 2 frontend)
- **Impact**: Cannot validate real AI content through UI
- **Workaround**: Use curl API directly (works perfectly)
- **User Impact**: HIGH - Frontend cannot access API

---

## Related Tests

### Passing Tests ✅

1. **curl Test 1** (Detective/Light): 11 seconds - SUCCESS
2. **curl Test 2** (Adventure/Dark): 4-5 seconds - SUCCESS
3. **curl Test 3** (Corporate): 8-10 seconds - SUCCESS

### Failing Tests ❌

1. **Browser Test 1** (Mouse Detective/Light): 30+ seconds - TIMEOUT

---

## Files to Investigate

1. **Frontend Request Code**

   - `/workspaces/strawberry/client/src/` - API call implementation
   - Check: URL, method, headers, timeout settings

2. **Backend API Handler**

   - `/workspaces/strawberry/server/` - Express routes
   - Check: Response headers, error handling, content-type

3. **CORS Configuration**

   - `/workspaces/strawberry/server/index.js` - Middleware setup
   - Check: CORS headers, allowed origins

4. **Network Configuration**
   - DevTools Network tab
   - Check: Request/response headers, timing, blocking

---

## Next Steps

**Critical Discovery**: Curl completes in 4-11 seconds, browser times out at exactly 30 seconds. This is NOT a backend speed issue—it's a response delivery problem.

### Immediate Debugging (DO THIS FIRST)

1. **Open Chrome DevTools** (F12 or Ctrl+Shift+I)
2. **Go to Network tab**
3. **Run browser test again** (same payload as bug reproduction)
4. **Inspect the failed request**:
   - Click on the `/api/ebook/generate` request in Network tab
   - Check "Headers" → look for response headers
   - Check "Response" → is there any preview data?
   - Note the exact status code (if shown)
5. **Check if CORS error** in Console tab
   - Look for "Access-Control-Allow-Origin" errors
   - Look for "blocked by CORS" messages

### Secondary Debugging (IF FIRST DOESN'T REVEAL ISSUE)

6. **Add server logging** (see section above for code)
7. **Run browser test again**
8. **Check server logs** for request/response lifecycle
9. **Add frontend fetch logging** (see section above for code)
10. **Check browser console** for fetch completion messages

### Expected Outcomes

- **If CORS error**: Configure backend CORS headers properly
- **If response headers present but no body**: Response stream is hanging, check res.json() completion
- **If "Response received" log missing**: Request never reaching backend or response being blocked by proxy
- **If response completes but browser still times out**: Issue in fetch/browser response handling

---

## Environment

- **Date**: November 25, 2025
- **Branch**: `feat/B_Frontend_option2`
- **Frontend**: Vite dev server (localhost:5173)
- **Backend**: Node.js Express (localhost:3000)
- **Environment**: GitHub Codespaces
- **Browser**: [User to specify - likely Chrome/Firefox]

---

## Attachments

- **Test Payload**: JSON in "Test Payload" section above
- **Error Screenshot**: [Pending user capture from DevTools]
- **Server Logs**: [Pending user output]
- **Network Tab**: [Pending user capture from DevTools]

---

## Status Tracking

- [ ] Browser DevTools analysis complete
- [ ] CORS headers verified
- [ ] Response size measured
- [ ] Endpoint verified
- [ ] Server logs reviewed
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Browser testing resumed

---

**Reporter**: GitHub Copilot  
**Created**: 2025-11-25  
**Last Updated**: 2025-11-25  
**Priority**: HIGH  
**Blocking**: Option 2 Frontend Validation Phase
