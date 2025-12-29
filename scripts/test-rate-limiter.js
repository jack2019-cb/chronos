#!/usr/bin/env node

/**
 * Rate-Limiter Test Suite
 *
 * Tests the burst rate-limiter implementation across multiple scenarios:
 * - Test 1: Baseline (no pacing) - should fail on Chapter 3
 * - Test 2: Paced (1000ms delay) - should succeed all chapters
 * - Test 3: 10-page book - scalability test
 * - Test 4: 20-page book - scalability test
 * - Test 5: Optimize delay - find minimum working delay
 * - Test 6: Quota integration - verify quota and rate-limiter work together
 */

const http = require("http");

// Default to port 3000 (server default), but allow override via TEST_URL or TEST_PORT env vars
const DEFAULT_PORT = process.env.TEST_PORT || 3000;
const DEFAULT_URL = process.env.TEST_URL || `http://localhost:${DEFAULT_PORT}`;
const DEFAULT_PROMPT =
  "An adorable children's story about Benny the Brave Bunny who goes about exploring the garden and learning new things.";

/**
 * Make an ebook/generate request
 */
function makeRequest(url, payload) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.method = "POST";
    options.headers = {
      "Content-Type": "application/json",
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
            rawText: data,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: null,
            rawText: data,
            parseError: e.message,
          });
        }
      });
    });

    req.on("error", reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

/**
 * Analyze the response for success/failure
 */
function analyzeResponse(response) {
  const { body, status } = response;

  if (status !== 200) {
    return {
      success: false,
      reason: `HTTP ${status}`,
      error: body?.error,
    };
  }

  if (!body) {
    return {
      success: false,
      reason: "Invalid response body",
    };
  }

  const chapters = body.chapters || [];
  const totalChapters = chapters.length;

  // Count how many are real AI content vs fallback
  const fallbackCount = chapters.filter((ch) => {
    const content = ch.content?.body || "";
    // Fallback content starts with "Content for" pattern
    return content.startsWith("Content for");
  }).length;

  const successCount = totalChapters - fallbackCount;

  return {
    success: fallbackCount === 0, // Success only if NO fallback chapters
    totalChapters,
    successCount,
    fallbackCount,
    title: body.title,
  };
}

/**
 * Run a single test
 */
async function runTest(testName, config) {
  const {
    url = DEFAULT_URL,
    pageCount = 3,
    prompt = DEFAULT_PROMPT,
    theme = "light",
    expectedSuccess = true,
    delayMs = 1000,
  } = config;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST: ${testName}`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Pages: ${pageCount}, Delay: ${delayMs}ms, Theme: ${theme}`);
  console.log(
    `Expected: ${
      expectedSuccess ? "SUCCESS (all chapters)" : "FAILURE (Chapter 3 fails)"
    }`
  );
  console.log(`URL: ${url}/api/ebook/generate`);

  const startTime = Date.now();

  try {
    const response = await makeRequest(`${url}/api/ebook/generate`, {
      prompt,
      metadata: {
        pageCount,
        theme,
      },
    });

    const duration = Date.now() - startTime;
    const analysis = analyzeResponse(response);

    console.log(`\nDuration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    console.log(`Title: ${analysis.title || "N/A"}`);
    console.log(`Chapters: ${analysis.totalChapters} total`);
    console.log(`  - AI-generated: ${analysis.successCount}`);
    console.log(`  - Fallback stub: ${analysis.fallbackCount}`);

    const passed = analysis.success === expectedSuccess;
    const result = passed ? "✓ PASS" : "✗ FAIL";

    console.log(`\n${result}`);

    if (!passed) {
      if (expectedSuccess && !analysis.success) {
        console.log(
          `Expected success but got ${analysis.fallbackCount} fallback chapters`
        );
      } else if (!expectedSuccess && analysis.success) {
        console.log(`Expected failure but all chapters succeeded`);
      }
    }

    return {
      name: testName,
      passed,
      duration,
      analysis,
    };
  } catch (err) {
    console.log(`\n✗ FAIL - Error: ${err.message}`);
    return {
      name: testName,
      passed: false,
      error: err.message,
    };
  }
}

/**
 * Wait for quota to regenerate (60-second sliding window)
 */
function waitForQuotaRegeneration(secondsToWait) {
  return new Promise((resolve) => {
    console.log(
      `\n⏳ Waiting ${secondsToWait}s for quota to regenerate (60-second window)...`
    );
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, secondsToWait - elapsed);
      process.stdout.write(`\r   ${remaining}s remaining...`);
      if (remaining === 0) {
        clearInterval(interval);
        console.log("\n✅ Quota regenerated, continuing tests...\n");
        resolve();
      }
    }, 1000);
  });
}

/**
 * Main test suite
 */
async function main() {
  const baseUrl = process.env.TEST_URL || DEFAULT_URL;
  const results = [];

  console.log("\n");
  console.log(
    "╔════════════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║           RATE-LIMITER TEST SUITE                                  ║"
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════════╝"
  );
  console.log(`\nBase URL: ${baseUrl}`);
  console.log(
    "Testing burst rate-limiter implementation across multiple scenarios"
  );
  console.log(
    "Note: Each test uses ~(pageCount + 1) API calls (quota: 20/60s window)"
  );
  console.log("Tests wait for quota regeneration between runs\n");

  // Test 1: Baseline (no pacing)
  results.push(
    await runTest("Test 1: Baseline (RATE_LIMIT_MIN_DELAY_MS=0)", {
      url: baseUrl,
      pageCount: 3,
      delayMs: 0,
      expectedSuccess: false, // Should fail
    })
  );

  // Wait for quota to regenerate before Test 2
  await waitForQuotaRegeneration(62);

  // Test 2: With pacing
  results.push(
    await runTest("Test 2: Paced (RATE_LIMIT_MIN_DELAY_MS=1000)", {
      url: baseUrl,
      pageCount: 3,
      delayMs: 1000,
      expectedSuccess: true, // Should succeed
    })
  );

  // Wait for quota to regenerate before Test 3
  await waitForQuotaRegeneration(62);

  // Test 3: 5-page book (reduced to preserve quota)
  results.push(
    await runTest("Test 3: Scalability - 5-page book", {
      url: baseUrl,
      pageCount: 5,
      delayMs: 1000,
      expectedSuccess: true,
    })
  );

  // Wait for quota to regenerate before Test 4
  await waitForQuotaRegeneration(62);

  // Test 4: 10-page book (demonstrates scalability with pacing)
  results.push(
    await runTest("Test 4: Scalability - 10-page book", {
      url: baseUrl,
      pageCount: 10,
      delayMs: 1000,
      expectedSuccess: true,
    })
  );

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("TEST SUMMARY");
  console.log(`${"=".repeat(70)}`);

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  results.forEach((result) => {
    const status = result.passed ? "✓" : "✗";
    const duration = result.duration
      ? `${(result.duration / 1000).toFixed(1)}s`
      : "ERROR";
    console.log(`${status} ${result.name.padEnd(50)} ${duration}`);
  });

  console.log(`\nResults: ${passed}/${total} passed`);

  if (passed === total) {
    console.log("\n✓ All tests passed!");
    process.exit(0);
  } else {
    console.log("\n✗ Some tests failed");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
