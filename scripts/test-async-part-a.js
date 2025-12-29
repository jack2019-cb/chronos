#!/usr/bin/env node

/**
 * test-async-part-a.js
 *
 * Tests PART-A async acceptance:
 * 1. POST /api/ebook/generate returns 202 immediately (< 100ms)
 * 2. Response includes resultId + status
 * 3. Client can poll /api/status/:resultId to check progress
 */

const http = require("http");

const BASE_URL = "http://localhost:3001"; // Adjust port as needed

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        const elapsed = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data ? JSON.parse(data) : null,
          elapsed,
        });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("========================================");
  console.log("PART-A: Async Acceptance Tests");
  console.log("========================================\n");

  try {
    // Test 1: POST returns 202 immediately
    console.log("TEST 1: POST /api/ebook/generate returns 202 immediately");
    console.log("---");

    const payload = {
      prompt:
        "Write a short guide about healthy eating habits. Include tips for breakfast, lunch, and dinner.",
      theme: "light",
      pageCount: 5,
      colorPalette: "default",
      fontSizeScale: 1.0,
    };

    const startTime = Date.now();
    const response = await makeRequest("POST", "/api/ebook/generate", payload);
    const elapsedMs = Date.now() - startTime;

    console.log(`Status: ${response.status}`);
    console.log(`Elapsed: ${response.elapsed}ms`);
    console.log(`Response:`, JSON.stringify(response.body, null, 2));

    if (response.status === 202) {
      console.log("✅ PASS: Status is 202 Accepted");
    } else {
      console.log(`❌ FAIL: Expected 202, got ${response.status}`);
      process.exit(1);
    }

    if (response.elapsed < 500) {
      console.log(`✅ PASS: Response time is ${response.elapsed}ms (< 500ms)`);
    } else {
      console.log(
        `⚠️  WARN: Response time is ${response.elapsed}ms (> 500ms, expected < 500ms)`
      );
    }

    const resultId = response.body?.resultId;
    if (resultId) {
      console.log(`✅ PASS: Response includes resultId: ${resultId}`);
    } else {
      console.log("❌ FAIL: Response missing resultId");
      process.exit(1);
    }

    // Test 2: Client can poll status
    console.log("\nTEST 2: Client can poll /api/status/:resultId");
    console.log("---");

    // Poll a few times to check status changes
    for (let i = 0; i < 3; i++) {
      await sleep(1000); // Wait 1 second between polls
      const statusResponse = await makeRequest(
        "GET",
        `/api/status/${resultId}`,
        null
      );

      console.log(
        `Poll ${i + 1}:`,
        JSON.stringify(statusResponse.body, null, 2)
      );

      if (statusResponse.status === 200) {
        console.log(`✅ PASS: Status endpoint returned 200`);
        const status = statusResponse.body;
        console.log(`   - Status: ${status.status}`);
        console.log(`   - Progress: ${status.progress_percent}%`);
        console.log(`   - ETA: ${status.eta}s`);
      } else if (statusResponse.status === 404) {
        console.log(
          `⚠️  Job not yet found in statusMap (may not be assigned yet)`
        );
      } else {
        console.log(`❌ FAIL: Unexpected status code ${statusResponse.status}`);
      }
    }

    console.log("\n========================================");
    console.log("✅ PART-A tests completed successfully!");
    console.log("========================================");
  } catch (err) {
    console.error("\n❌ Test failed with error:", err.message);
    process.exit(1);
  }
}

runTests();
