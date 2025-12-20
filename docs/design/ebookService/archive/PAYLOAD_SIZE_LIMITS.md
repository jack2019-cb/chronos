# Payload Size Limits Configuration

**Updated**: December 13, 2025  
**Branch**: `feat/ebook-revert`

---

## Current Configuration

### Server-Side Limits ✅

**File**: [server/index.js](../../../../server/index.js) (lines 368-372)

```javascript
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
```

**What This Means:**

- **JSON payloads**: Up to 50MB accepted in POST/PUT requests
- **URL-encoded payloads**: Up to 50MB accepted
- **Examples**:
  - Ebook with 30KB+ HTML ✅
  - Large image exports ✅
  - Batch requests ✅

### Client-Side Limits

**File**: [client/src/lib/ebookApi.js](../../../../client/src/lib/ebookApi.js)

```javascript
const CONFIG = {
  API_BASE_URL: "/api",
  TIMEOUTS: {
    GENERATE: 600000, // 600s (10min)
    OVERRIDE: 10000, // 10s
    THEMES: 5000, // 5s
  },
};
```

**No explicit size limit** on client-side fetch (browser handles this automatically).

---

## Payload Size Tracking

### Current Test Cases

| Scenario             | Payload Size | Status                                   |
| -------------------- | ------------ | ---------------------------------------- |
| 3-page ebook (\_02)  | 29,359 bytes | ✅ Success                               |
| 3-page ebook (\_04)  | 30,667 bytes | ✅ Success (backend), ❌ Network timeout |
| Max ebook (20 pages) | ~200-300KB   | ✅ Within limits                         |

### Recommended Thresholds

- **Ebook generation**: Up to 50MB (current limit)
- **Image export**: Up to 50MB (current limit)
- **Batch/bulk operations**: Up to 50MB (current limit)

---

## Why 50MB?

1. **Standard cloud platform limit**: Heroku, Vercel, AWS Lambda all default to 50MB
2. **Browser compatibility**: Modern browsers handle 50MB responses
3. **Network efficiency**: Large enough for multi-page ebooks + images
4. **Memory safety**: Prevents runaway memory consumption

---

## Notes

- The **client-side timeout (600s)** remains the constraint for ebook generation
- The **infrastructure timeout (~60s)** is preventing long responses from completing
- **Payload size is NOT the current bottleneck**—response time is

## Related Issues

- See [FETCH_FAILURE_INVESTIGATION.md](FETCH_FAILURE_INVESTIGATION.md) for network timeout analysis
- See [Light_3-page_04.md](Light_3-page_04.md) for infrastructure timeout confirmation
