# Export 400 Error Analysis: Light_3-page_02

**Date**: December 30, 2025  
**Branch**: `feat/B_Frontend_option2`

**Referenced Document**: `Light_3-page_02.md`  
**Status**: ✅ SUCCESSFUL (However, export failed with 400)

---

## Problem

During ebook generation testing (3-page light theme), the `/export` endpoint returned an HTTP 400 validation error immediately after successful ebook composition:

```
[EXPORT-EP] /export: Using canonical envelope path
POST /export 400 2.780 ms - 192
```

The ebook itself generated successfully (19,640 bytes of HTML produced, 4/20 quota tokens consumed), yet the subsequent export attempt failed validation.

---

## Root Cause

**Mismatch between response field name and endpoint validation expectation.**

The `/api/ebook/generate` endpoint returns the chapter content under the key `chapters`:

```javascript
// server/index.js - ebook response
const responseObj = {
  id: ebookId,
  resultId: result.resultId,
  chapters: envelope.pages,  // ← Returns as "chapters"
  html: envelope.html,
  metadata: { ... },
  actions: { ... },
};
```

The frontend (App.svelte) correctly transforms this into the canonical envelope structure:

```javascript
const exportPayload = {
  pages: ebookResult.chapters || [], // ← Transforms to "pages"
  html: ebookResult.html || null,
  metadata: ebookResult.metadata || {},
  actions: ebookResult.actions || {},
};
```

However, the `/export` endpoint validation explicitly requires a `pages` array:

```javascript
// server/index.js - export validation
if (!envelope || !Array.isArray(envelope.pages)) {
  return sendValidationError(
    res,
    "Export requires either: (1) prompt parameter with unified pipeline, or (2) canonical envelope with pages array"
  );
}
```

The validation failure triggers `sendValidationError()`, which returns HTTP 400 with error response body (192 bytes).

---

## Why It Happens

The 400 error occurs when one of these conditions is true:

1. **`ebookResult.chapters` is falsy** — If the ebook response body fails to serialize properly or the `chapters` field is missing/null, then `pages: ebookResult.chapters || []` produces an empty array or undefined, failing the `Array.isArray()` check.

2. **Timing/State Issue** — The export button is clicked before `ebookResult` is fully populated in frontend state, even though the HTTP response was complete on the server. The store or component state may not have updated yet.

3. **Response Parsing Failure** — The frontend successfully receives the 200 response from `/api/ebook/generate`, but JSON parsing or store assignment introduces a data loss scenario, leaving `chapters` undefined in the component context.

4. **Array Validation Strictness** — The check `!Array.isArray(envelope.pages)` fails if:
   - `pages` is an empty array `[]` AND the endpoint logic doesn't allow empty arrays
   - `pages` is a non-array value (object, string, null, undefined)

Given the server logs show successful HTML generation, the most likely scenario is **#2 or #3**: the chapters data is not reaching the export function properly despite the ebook generation completing successfully on the server.

---

## Impact

**Functional Impact:**

- Users cannot export successfully-generated ebooks to PDF
- The ebook content exists (19,640 bytes HTML) but is inaccessible via download
- Quota is consumed (4 tokens used) with no deliverable output to the user

**Data Integrity Impact:**

- resultId is generated but no PDF artifact created
- If persistence was triggered via the `persist_prompt: true` action, the prompt is persisted without a corresponding PDF export
- Asymmetry between server-side completion and client-side delivery

**UX Impact:**

- Silent failure after successful generation (server logs show success, frontend shows error)
- User sees ebook generated but cannot download it
- Error message is technical and doesn't indicate whether generation succeeded

**Developer Debugging Impact:**

- Server logs show success; frontend receives 400 error; root cause appears to be frontend data flow, not server
- Requires tracing through multiple layers (response serialization → network → JSON parsing → store → component state → export function)
