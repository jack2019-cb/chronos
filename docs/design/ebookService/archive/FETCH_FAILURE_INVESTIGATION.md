# Fetch Failure Investigation

**Date**: December 13, 2025 @ 12:15AM
**Branch**: `feat/ebook-revert`

**Issue**: Frontend displayed a fetch error despite backend successfully processing the ebook generation request (50.4 seconds completed).

---

## Possible Fetch Error Messages

Based on the [client/src/lib/ebookApi.js](../../../../client/src/lib/ebookApi.js) error handling, the user likely saw one of these messages:

### 1. **Timeout Error** ⏱️

```
"Request timeout after 600000ms"
```

- Triggered by `AbortController.abort()` after 600 seconds (10 minutes)
- **Likelihood**: VERY LOW
  - Backend took only 50.4s, well within 10min timeout
  - Unless network delay added significant time
  - Unless AbortController fired prematurely

### 2. **Network Error** 🌐

```
"Network error: [error message]"
```

- Triggered by `TypeError` (caught at line 96)
- **Possible causes**:
  - Network interrupted between client and server
  - DNS resolution failure
  - Connection reset/closed by server or proxy
  - Browser security policy (CORS, CSP, etc.)
  - Connection timeout at network level (different from AbortController timeout)

### 3. **JSON Parse Error**

```
[parseErr from JSON.parse]
```

- Response received but malformed JSON
- **Possible causes**:
  - Response is HTML error page (5xx error) instead of JSON
  - Response contains partial/truncated payload
  - Invalid UTF-8 encoding
  - Network corruption during transmission

### 4. **API Error**

```
"API error [status]: [statusText]"
```

- Server returned non-200 status
- **Possible causes**:
  - 503 Service Unavailable (server crash/restart)
  - 504 Gateway Timeout (Puppeteer/export service failure)
  - 500 Internal Server Error (unhandled exception)
  - 413 Payload Too Large (29,359 bytes is within limits)

### 5. **Generic/Unhandled Error**

- Any thrown error from the fetch chain

---

## Client Error Handling Chain

```
generateEbook()
  ↓
fetchWithTimeout()
  ├─ AbortController timeout (600s) → "Request timeout after 600000ms"
  ├─ TypeError caught → "Network error: ..."
  ├─ DOMException (AbortError) → "Request timeout after 600000ms"
  ├─ JSON parse failure → throws SyntaxError
  └─ Non-200 response → "API error [status]: [statusText]"
      ↓
ebookStore.generate()
  └─ catch (err) → store error = err.message
      ↓
GenerateFlow.svelte
  └─ catch (err) → error = err.message
      ↓
Display in error-panel: {error}
```

---

## Debugging Strategy

### Next Reproduction Steps:

1. **Enable verbose logging in browser console BEFORE testing**:

   ```javascript
   localStorage.__ENABLE_VERBOSE_STORES__ = "1";
   ```

2. **Open DevTools with these tabs visible**:

   - **Console**: Capture all `[API]` logs
   - **Network**: Watch the POST to `/api/ebook/generate`
   - **Application**: Check localStorage after failure

3. **When failure occurs, capture**:

   - **Exact error message** displayed to user
   - **Network tab**:
     - Request sent? (yes/no)
     - Response received? (yes/no)
     - Response status code
     - Response size (Content-Length)
     - Time taken
   - **Console logs**:
     - `[API] Starting fetch to /api/ebook/generate` ✅
     - `[API] Response received - Status: ...` ✅ or ❌
     - `[API] Attempting to parse JSON response...` ✅ or ❌
     - Any `[API] Error:` or `[API] JSON parse error:` messages
     - Any `TypeError` messages
     - Full error stack if available

4. **Server-side correlation**:
   - Check if server logged response sent successfully
   - Confirm `[2025-12-13T17:12:46.938Z] Sending response to client` appeared in logs

---

## Critical Questions to Answer

1. **Did the network request complete?**

   - Check Network tab: Is there a response row for `/api/ebook/generate`?

2. **Was the response received by the browser?**

   - Check if `[API] Response received` log appears
   - Check if response status is 200

3. **Was the response parsed successfully?**

   - Check if `[API] JSON parsed successfully` log appears
   - Check if chapters/html were logged

4. **What is the exact error message?**
   - Copy the exact text from the error-panel in the UI
   - This will directly point to the failure source

---

## Hypothesis: Long Response Time + Network Instability

**Most Likely Scenario**:
The 50+ second response time combined with potential network instability could cause:

1. **Proxy/Load Balancer Timeout**: Even though client has 10min timeout, an intermediate proxy might have shorter timeout (e.g., 30-60s)
2. **Connection Kept-Alive Issue**: Long-running request might lose keep-alive connection
3. **Browser Connection Pool**: Browser might close connection after inactivity during server processing

**Evidence**:

- Backend successfully completed (50.4s)
- Frontend never showed content (fetch failed)
- Server logs show response sent (`Sending response to client`)
- **But client never received it**

This suggests the response was sent by server but didn't reach the client successfully.

---

## Recommended Monitoring Additions

Add these measurements to the client to diagnose future failures:

```javascript
// In ebookApi.js fetchWithTimeout()
const fetchStartTime = performance.now();
const response = await fetch(...);
const responseTime = performance.now() - fetchStartTime;
console.log(`[API] Response received after ${responseTime.toFixed(0)}ms`);
```

This will show if the issue is:

- **Server processing time**: High server time + normal network time
- **Network time**: Server fast but response takes long to arrive
- **Timeout triggered before response**: AbortController fired

---

## Action Items for Reproduction

✅ **Primary**: Capture the exact error message shown to user  
✅ **Secondary**: Check Network tab for request/response completion  
✅ **Tertiary**: Monitor console logs with verbose logging enabled  
✅ **Final**: Correlate with server logs to see if response was sent
