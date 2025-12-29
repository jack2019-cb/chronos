const fs = require("fs");
const path = require("path");

// Small wrapper to call Google's Generative Language endpoints for TEXT or IMAGE modalities.
// Selects URL/key based on modality and returns parsed response. Does not throw on API errors —
// returns an object with ok/status/json/rawText and imageData (base64) when present.
async function callGemini({
  prompt,
  modality = "TEXT",
  generationConfig = {},
  imageB64 = null, // optional base64 image when using IMAGERY
  callIndex = 0, // Call sequence number for rate-limiting (0, 1, 2, ...)
  model = null, // Model name (e.g., "gemini-2.5-pro", "gemini-2.5-flash")
}) {
  // choose env vars by modality
  const isText = modality === "TEXT";
  const isImage = modality === "IMAGE";
  const isImagery = modality === "IMAGERY"; // image understanding / reverse-check

  // Determine which API endpoint to use
  // Priority: model parameter > modality-specific env vars > fallback to generic GEMINI_API_URL
  let apiUrl;
  let rawKey;

  if (model === "gemini-2.5-pro") {
    // Use Pro model endpoints (primary/structure)
    apiUrl =
      process.env.GEMINI_API_URL_PRO ||
      process.env.GEMINI_API_URL_TEXT ||
      process.env.GEMINI_API_URL;
    rawKey =
      process.env.GEMINI_API_KEY_PRO ||
      process.env.GEMINI_API_KEY_TEXT ||
      process.env.GEMINI_API_KEY;
  } else if (model === "gemini-2.5-flash") {
    // Use Flash model endpoints (secondary/chapters)
    apiUrl =
      process.env.GEMINI_API_URL_FLASH ||
      process.env.GEMINI_API_URL_TEXT ||
      process.env.GEMINI_API_URL;
    rawKey =
      process.env.GEMINI_API_KEY_FLASH ||
      process.env.GEMINI_API_KEY_TEXT ||
      process.env.GEMINI_API_KEY;
  } else {
    // Fallback: select by modality (original logic)
    apiUrl =
      (isText
        ? process.env.GEMINI_API_URL_TEXT
        : isImage
        ? process.env.GEMINI_API_URL_IMAGE
        : isImagery
        ? process.env.GEMINI_API_URL_IMAGERY
        : null) || process.env.GEMINI_API_URL;
    rawKey =
      (isText
        ? process.env.GEMINI_API_KEY_TEXT
        : isImage
        ? process.env.GEMINI_API_KEY_IMAGE
        : isImagery
        ? process.env.GEMINI_API_KEY_IMAGE
        : null) || process.env.GEMINI_API_KEY;
  }

  if (process.env.DEBUG_GEMINI_API === "1") {
    console.error("[DEBUG_GEMINI_API] Model:", model || "not specified");
    console.error("[DEBUG_GEMINI_API] Modality:", modality);
    console.error(
      "[DEBUG_GEMINI_API] API URL:",
      apiUrl ? apiUrl.substring(0, 50) + "..." : "MISSING"
    );
    console.error(
      "[DEBUG_GEMINI_API] API Key:",
      rawKey ? "SET (length=" + rawKey.length + ")" : "MISSING"
    );
  }

  if (!apiUrl || !rawKey) {
    return {
      ok: false,
      status: 0,
      error: "Missing GEMINI API URL or KEY for modality " + modality,
    };
  }

  // fetch implementation
  let fetchImpl = globalThis.fetch;
  if (!fetchImpl) {
    try {
      ({ fetch: fetchImpl } = require("undici"));
    } catch (e) {
      return {
        ok: false,
        status: 0,
        error: "No fetch available (require Node 18+ or add undici)",
      };
    }
  }

  const headers = { "Content-Type": "application/json" };
  if (/^AIza[0-9A-Za-z-_]+$/.test(rawKey)) headers["X-goog-api-key"] = rawKey;
  else if (/^ya29\./.test(rawKey))
    headers["Authorization"] = `Bearer ${rawKey}`;
  else headers["X-goog-api-key"] = rawKey;

  // Build request body using Gemini 2.5 multimodal payload format
  // Supports both text-only and text+image payloads
  // Reference: https://ai.google.dev/gemini-api/docs/vision
  const textPart =
    typeof prompt !== "undefined" && prompt !== null
      ? { text: String(prompt) }
      : null;
  const parts = [];
  if (textPart) parts.push(textPart);

  if (imageB64) {
    // Gemini 2.5 uses inline_data structure for embedded images
    // This allows mixing text and images freely within parts array
    parts.push({
      inline_data: {
        mime_type: "image/png",
        data: String(imageB64).replace(/\s+/g, ""),
      },
    });
  }

  // Gemini 2.5 requires role field in contents
  // role: "user" for prompts, "model" for model responses
  const body = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    ...(Object.keys(generationConfig || {}).length ? { generationConfig } : {}),
  };

  try {
    // ✅ NEW: PRE-CALL RATE-LIMIT CHECK: Enforce inter-request pacing
    // This prevents burst rate overloads by enforcing minimum delays
    // between consecutive API calls to Gemini's infrastructure.
    const rateLimiter = require("./utils/rateLimiter");
    await rateLimiter.waitForReadiness(callIndex);

    // Log which model is being used
    if (model) {
      console.log(`[GEMINI] Call ${callIndex}: Using model ${model}`);
    }

    // ✅ EXISTING: PRE-CALL QUOTA CHECK: Verify quota available before making API request
    // This prevents calls from being sent to Gemini when quota is exhausted
    const quotaTracker = require("./utils/quotaTracker");
    const quotaStatus = quotaTracker.getStatus();

    if (quotaStatus.availableQuota < 1) {
      console.log(
        `[QUOTA] Pre-call check BLOCKED: exhausted quota (${quotaStatus.callCount}/${quotaStatus.limit})`
      );
      return {
        ok: false,
        status: 429, // Too Many Requests
        error: `Quota exhausted: reached limit of ${
          quotaStatus.limit
        } calls per ${Math.round(
          quotaStatus.windowExpiredMs / 1000
        )} seconds. Please retry after quota window resets.`,
        quotaExhausted: true,
        availableQuota: quotaStatus.availableQuota,
      };
    }

    const callStart = Date.now();
    console.log(
      `[GEMINI] callStart model=${
        model || "auto"
      } callIndex=${callIndex} at=${callStart}`
    );

    const resp = await fetchImpl(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const raw = await resp.text();
    const callElapsed = Date.now() - callStart;
    console.log(
      `[GEMINI] callComplete model=${
        model || "auto"
      } callIndex=${callIndex} elapsed=${callElapsed}ms status=${resp.status}`
    );
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      /* not JSON */
    }

    // Debug logging for troubleshooting API issues
    if (process.env.DEBUG_GEMINI_API === "1") {
      console.error("[DEBUG_GEMINI_API] Status:", resp.status);
      console.error("[DEBUG_GEMINI_API] Raw response:", raw.substring(0, 500));
      console.error(
        "[DEBUG_GEMINI_API] Parsed JSON:",
        JSON.stringify(json).substring(0, 500)
      );
    }

    // Check if the API response contains an error (even if HTTP 200)
    // Gemini API returns error structure: { error: { code, message, ... } }
    if (json?.error) {
      const errorMsg = json.error.message || JSON.stringify(json.error);
      return {
        ok: false,
        status: json.error.code || 400,
        error: errorMsg,
        json,
        rawText: raw,
      };
    }

    // Attempt to find text candidate
    const textContent =
      json?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    // Try to find image data in common fields
    function findImage(o) {
      if (!o) return null;
      if (typeof o === "string") {
        const m = o.match(
          /data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\n\r]+)/
        );
        if (m)
          return {
            mime: m[1] === "jpeg" ? "image/jpeg" : "image/png",
            b64: m[2].replace(/\s+/g, ""),
          };
        if (o.length > 1000 && /^[A-Za-z0-9+/=\n\r]+$/.test(o))
          return { mime: "image/png", b64: o.replace(/\s+/g, "") };
      }
      if (Array.isArray(o)) {
        for (const v of o) {
          const f = findImage(v);
          if (f) return f;
        }
      }
      if (typeof o === "object") {
        for (const k of Object.keys(o)) {
          const f = findImage(o[k]);
          if (f) return f;
        }
      }
      return null;
    }

    const imageFound = findImage(json) || null;

    // ✅ Track successful call for both rate-limiting and quota purposes (only on success)
    if (resp.ok) {
      try {
        // NEW: Record for rate-limiting
        rateLimiter.recordCall();
        console.log(`[RATE-LIMIT] Call ${callIndex}: timestamp recorded`);

        // EXISTING: Record for quota
        const quotaTracker = require("./utils/quotaTracker");
        quotaTracker.recordCall();
        console.log(
          `[GEMINI] API call successful, quota tracked: ${resp.status}`
        );
      } catch (err) {
        console.warn("[QUOTA] Failed to track API call:", err && err.message);
      }
    }

    return {
      ok: resp.ok,
      status: resp.status,
      json,
      rawText: raw,
      text: textContent,
      image: imageFound,
    };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

module.exports = { callGemini };
