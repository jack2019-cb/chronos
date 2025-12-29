#!/usr/bin/env node

/**
 * test-async-infra-comprehensive.js
 *
 * Comprehensive test suite for ASYNC-INFRA phase
 *
 * Tests:
 * 1. PART-A: Async acceptance (returns 202 immediately)
 * 2. Status polling endpoint (GET /api/status/:resultId)
 * 3. Helpers framework (timingResolver, fifoScheduler, statusManager)
 * 4. Orchestrator (manifest capture, FIFO spacing, ETA computation)
 * 5. SmartPoller (job tracking, progress updates)
 * 6. Error handling (quota, generation failures)
 * 7. End-to-end integration (full request cycle)
 */

const assert = require("assert");
const http = require("http");
const path = require("path");

// ========== Utilities ==========

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRequest(method, path, body = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, "http://localhost:3000");
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
      timeout,
    };

    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        const elapsed = Date.now() - startTime;
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
            elapsed,
            data,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: null,
            data,
            elapsed,
            parseError: e.message,
          });
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function colorize(text, color) {
  const colors = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    reset: "\x1b[0m",
  };
  return `${colors[color] || ""}${text}${colors.reset}`;
}

function logTest(name, passed, details = "") {
  const icon = passed ? "✅" : "❌";
  const msg = `${icon} ${name}`;
  console.log(passed ? colorize(msg, "green") : colorize(msg, "red"));
  if (details) {
    console.log(`   ${details}`);
  }
}

function logSection(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(colorize(title, "blue"));
  console.log("=".repeat(60));
}

// ========== Test Suites ==========

async function testPartAAsyncAcceptance() {
  logSection("TEST 1: PART-A - Async Acceptance");

  const payload = {
    prompt:
      "Write a comprehensive guide about renewable energy sources and their environmental impact.",
    theme: "light",
    pageCount: 5,
    colorPalette: "default",
    fontSizeScale: 1.0,
  };

  try {
    // Measure response time
    const startTime = Date.now();
    const response = await makeRequest("POST", "/api/ebook/generate", payload);
    const elapsedMs = Date.now() - startTime;

    // Test 1.1: Status code is 202
    logTest(
      "1.1: Returns HTTP 202 (Accepted)",
      response.status === 202,
      `Got ${response.status}`
    );

    // Test 1.2: Response includes resultId
    const resultId = response.body?.resultId;
    logTest(
      "1.2: Response includes resultId",
      !!resultId,
      resultId || "No resultId"
    );

    // Test 1.3: Response includes status
    logTest(
      "1.3: Response includes status",
      response.body?.status === "queued",
      `Status: ${response.body?.status}`
    );

    // Test 1.4: Response time < 500ms
    logTest("1.4: Response time < 500ms", elapsedMs < 500, `${elapsedMs}ms`);

    // Test 1.5: Response includes message with polling instructions
    logTest(
      "1.5: Response includes polling instructions",
      response.body?.message?.includes("/api/status"),
      response.body?.message || "No message"
    );

    return resultId;
  } catch (err) {
    logTest("1: PART-A Async Acceptance", false, err.message);
    throw err;
  }
}

async function testStatusPolling(resultId) {
  logSection("TEST 2: Status Polling Endpoint");

  try {
    // Test 2.1: Status endpoint is accessible
    const response = await makeRequest("GET", `/api/status/${resultId}`);
    logTest(
      "2.1: Status endpoint returns 200",
      response.status === 200,
      `Got ${response.status}`
    );

    // Test 2.2: Status response includes required fields
    const status = response.body;
    const hasResultId = status?.resultId === resultId;
    const hasStatus = ["queued", "in-progress", "complete", "error"].includes(
      status?.status
    );
    const hasMessage = !!status?.message;

    logTest("2.2: Response includes resultId", hasResultId);
    logTest(
      "2.3: Response includes status field",
      hasStatus,
      `Status: ${status?.status}`
    );
    logTest("2.4: Response includes message", hasMessage, status?.message);

    // Test 2.3: Poll multiple times to check updates
    console.log("\n   Polling for progress updates...");
    const pollResults = [];
    for (let i = 0; i < 3; i++) {
      await sleep(500);
      const pollRes = await makeRequest("GET", `/api/status/${resultId}`);
      if (pollRes.status === 200) {
        pollResults.push(pollRes.body);
      }
    }

    logTest(
      "2.5: Can poll multiple times",
      pollResults.length >= 2,
      `${pollResults.length} successful polls`
    );

    // Test 2.4: Non-existent resultId returns 404
    const notFoundRes = await makeRequest(
      "GET",
      "/api/status/nonexistent-id-12345"
    );
    logTest(
      "2.6: Non-existent resultId returns 404",
      notFoundRes.status === 404,
      `Got ${notFoundRes.status}`
    );
  } catch (err) {
    logTest("2: Status Polling", false, err.message);
    throw err;
  }
}

async function testHelpersFramework() {
  logSection("TEST 3: Helpers Framework");

  try {
    // We'll test the helpers indirectly through the orchestrator
    // in the next test, but we can verify they exist

    // Test 3.1: Helpers can be loaded
    let helpersLoaded = false;
    try {
      const helpers = require("../server/helpers");
      helpersLoaded =
        !!helpers.timingResolver &&
        !!helpers.fifoScheduler &&
        !!helpers.statusManager;
    } catch (e) {
      helpersLoaded = false;
    }
    logTest("3.1: Helpers module loads successfully", helpersLoaded);

    // Test 3.2: StatusManager can initialize a status
    let statusManagerWorks = false;
    try {
      const statusManager = require("../server/helpers/statusManager");
      statusManager.init("test-id", { eta: 10, totalCalls: 4 });
      const status = statusManager.getStatus("test-id");
      statusManagerWorks =
        status?.resultId === "test-id" &&
        status?.status === "in-progress" &&
        status?.totalCalls === 4;
      statusManager.deleteStatus("test-id");
    } catch (e) {
      console.log("   Error testing statusManager:", e.message);
    }
    logTest(
      "3.2: StatusManager initializes and retrieves status",
      statusManagerWorks
    );

    // Test 3.3: TimingResolver computes schedule
    let timingResolverWorks = false;
    try {
      const timingResolver = require("../server/helpers/timingResolver");
      const manifest = {
        totalRequests: 4,
        sequence: [
          { tier: "expert", callIndex: 0 },
          { tier: "expert", callIndex: 1 },
          { tier: "standard", callIndex: 2 },
          { tier: "expert", callIndex: 3 },
        ],
      };

      const result = timingResolver.compute(manifest, {});
      timingResolverWorks =
        result?.totalEta > 0 &&
        result?.schedule?.length === 4 &&
        result?.schedule[0]?.reservedTime === 0;
    } catch (e) {
      console.log("   Error testing timingResolver:", e.message);
    }
    logTest(
      "3.3: TimingResolver computes schedule correctly",
      timingResolverWorks,
      timingResolverWorks ? "Schedule computed" : "Failed"
    );

    // Test 3.4: FIFOScheduler builds schedule
    let fifoSchedulerWorks = false;
    try {
      const fifoScheduler = require("../server/helpers/fifoScheduler");
      const timingResolver = require("../server/helpers/timingResolver");
      const manifest = {
        totalRequests: 2,
        sequence: [
          { tier: "expert", callIndex: 0 },
          { tier: "standard", callIndex: 1 },
        ],
      };

      const timing = timingResolver.compute(manifest, {});
      const schedule = fifoScheduler.build(timing);
      fifoSchedulerWorks =
        schedule?.calls?.length === 2 && schedule?.totalEta > 0;
    } catch (e) {
      console.log("   Error testing fifoScheduler:", e.message);
    }
    logTest(
      "3.4: FIFOScheduler builds schedule",
      fifoSchedulerWorks,
      fifoSchedulerWorks ? "Schedule built" : "Failed"
    );
  } catch (err) {
    logTest("3: Helpers Framework", false, err.message);
  }
}

async function testOrchestrator() {
  logSection("TEST 4: Orchestrator");

  try {
    // Test 4.1: Orchestrator can be instantiated
    let orchestratorLoaded = false;
    try {
      const Orchestrator = require("../server/orchestrator");
      const orch = new Orchestrator("test-job-id");
      orchestratorLoaded =
        orch.resultId === "test-job-id" && orch.manifestReceived === false;
    } catch (e) {
      console.log("   Error loading orchestrator:", e.message);
    }
    logTest("4.1: Orchestrator instantiates correctly", orchestratorLoaded);

    // Test 4.2: Orchestrator captures manifest on first call
    let manifestCaptures = false;
    try {
      const Orchestrator = require("../server/orchestrator");
      const orch = new Orchestrator("test-manifest-id");

      // Mock aiService
      const originalAiService = require("../server/aiService");

      const manifest = {
        totalRequests: 2,
        sequence: [
          { tier: "expert", callIndex: 0 },
          { tier: "standard", callIndex: 1 },
        ],
      };

      // This would test manifest capture
      manifestCaptures = !orch.manifestReceived && orch.manifest === null;
    } catch (e) {
      console.log("   Error testing manifest capture:", e.message);
    }
    logTest("4.2: Orchestrator ready to capture manifest", manifestCaptures);

    // Test 4.3: Orchestrator has helpers
    let orchestratorHasHelpers = false;
    try {
      const Orchestrator = require("../server/orchestrator");
      const orch = new Orchestrator("test-helpers-id");
      orchestratorHasHelpers =
        orch.helpers?.timingResolver &&
        orch.helpers?.fifoScheduler &&
        orch.helpers?.statusManager;
    } catch (e) {
      console.log("   Error testing orchestrator helpers:", e.message);
    }
    logTest("4.3: Orchestrator has all helpers", orchestratorHasHelpers);
  } catch (err) {
    logTest("4: Orchestrator", false, err.message);
  }
}

async function testSmartPoller() {
  logSection("TEST 5: SmartPoller Utility");

  try {
    // Test 5.1: SmartPoller can be loaded
    let smartPollerLoaded = false;
    try {
      const smartPoller = require("../server/utilities/smartPoller");
      smartPollerLoaded = !!smartPoller;
    } catch (e) {
      console.log("   Error loading smartPoller:", e.message);
    }
    logTest("5.1: SmartPoller loads successfully", smartPollerLoaded);

    // Test 5.2: SmartPoller can assign and retrieve tasks
    let taskAssignment = false;
    try {
      const smartPoller = require("../server/utilities/smartPoller");
      smartPoller.assignTask("sp-test-1", { eta: 20, totalCalls: 4 });
      const status = smartPoller.getStatus("sp-test-1");
      taskAssignment =
        status?.resultId === "sp-test-1" &&
        status?.status === "in-progress" &&
        status?.calls_total === 4;
      // Cleanup
      smartPoller.tasks.delete("sp-test-1");
    } catch (e) {
      console.log("   Error testing task assignment:", e.message);
    }
    logTest("5.2: SmartPoller assigns and retrieves tasks", taskAssignment);

    // Test 5.3: SmartPoller can update progress
    let progressUpdate = false;
    try {
      const smartPoller = require("../server/utilities/smartPoller");
      smartPoller.assignTask("sp-test-2", { eta: 20, totalCalls: 4 });
      smartPoller.updateProgress("sp-test-2", {
        callsCompleted: 2,
        nextEstimatedCompletion: Date.now() + 10000,
      });
      const status = smartPoller.getStatus("sp-test-2");
      progressUpdate =
        status?.calls_completed === 2 && status?.progress_percent === 50;
      smartPoller.tasks.delete("sp-test-2");
    } catch (e) {
      console.log("   Error testing progress update:", e.message);
    }
    logTest("5.3: SmartPoller updates progress correctly", progressUpdate);

    // Test 5.4: SmartPoller can mark complete
    let markComplete = false;
    try {
      const smartPoller = require("../server/utilities/smartPoller");
      smartPoller.assignTask("sp-test-3", { eta: 20, totalCalls: 4 });
      smartPoller.markComplete("sp-test-3", { result: "test-data" });
      const status = smartPoller.getStatus("sp-test-3");
      markComplete = status?.status === "complete";
      smartPoller.tasks.delete("sp-test-3");
    } catch (e) {
      console.log("   Error testing mark complete:", e.message);
    }
    logTest("5.4: SmartPoller marks tasks complete", markComplete);

    // Test 5.5: SmartPoller returns null for unknown task
    let notFound = false;
    try {
      const smartPoller = require("../server/utilities/smartPoller");
      const status = smartPoller.getStatus("nonexistent-task-xyz");
      notFound = status === null;
    } catch (e) {
      console.log("   Error testing unknown task:", e.message);
    }
    logTest("5.5: SmartPoller returns null for unknown tasks", notFound);
  } catch (err) {
    logTest("5: SmartPoller", false, err.message);
  }
}

async function testErrorHandling() {
  logSection("TEST 6: Error Handling");

  try {
    // Test 6.1: Invalid prompt returns 400
    const invalidRes = await makeRequest("POST", "/api/ebook/generate", {
      prompt: "", // Empty prompt
      theme: "dark",
      pageCount: 5,
    });
    logTest(
      "6.1: Invalid prompt returns 400",
      invalidRes.status === 400,
      `Got ${invalidRes.status}`
    );

    // Test 6.2: Invalid theme returns 400
    const invalidThemeRes = await makeRequest("POST", "/api/ebook/generate", {
      prompt: "Test prompt",
      theme: "invalid-theme",
      pageCount: 5,
    });
    logTest(
      "6.2: Invalid theme returns 400",
      invalidThemeRes.status === 400,
      `Got ${invalidThemeRes.status}`
    );

    // Test 6.3: Page count out of range returns 400
    const invalidPageRes = await makeRequest("POST", "/api/ebook/generate", {
      prompt: "Test prompt",
      theme: "dark",
      pageCount: 99, // Out of range
    });
    logTest(
      "6.3: Invalid page count returns 400",
      invalidPageRes.status === 400,
      `Got ${invalidPageRes.status}`
    );

    // Test 6.4: Font scale out of range returns 400
    const invalidFontRes = await makeRequest("POST", "/api/ebook/generate", {
      prompt: "Test prompt",
      theme: "dark",
      pageCount: 5,
      fontSizeScale: 2.5, // Out of range
    });
    logTest(
      "6.4: Invalid font scale returns 400",
      invalidFontRes.status === 400,
      `Got ${invalidFontRes.status}`
    );
  } catch (err) {
    logTest("6: Error Handling", false, err.message);
  }
}

async function testEndToEndFlow() {
  logSection("TEST 7: End-to-End Integration");

  try {
    // This test shows the full flow from request to polling

    // Step 1: Submit request
    console.log("\n   Step 1: Submitting request...");
    const payload = {
      prompt: "Create a brief guide about sustainable agriculture practices.",
      theme: "dark",
      pageCount: 3,
    };

    const submitRes = await makeRequest("POST", "/api/ebook/generate", payload);
    const resultId = submitRes.body?.resultId;

    logTest(
      "7.1: Request submitted, got resultId",
      submitRes.status === 202 && !!resultId,
      resultId || "No resultId"
    );

    if (!resultId) {
      throw new Error("No resultId returned");
    }

    // Step 2: Poll status initially
    console.log("   Step 2: Polling initial status...");
    await sleep(100);
    const initialStatus = await makeRequest("GET", `/api/status/${resultId}`);

    logTest(
      "7.2: Initial status retrieved",
      initialStatus.status === 200,
      `Status: ${initialStatus.body?.status}`
    );

    // Step 3: Monitor progress
    console.log("   Step 3: Monitoring progress (up to 10 polls)...");
    let finalStatus = null;
    let pollCount = 0;
    const maxPolls = 20;
    const pollInterval = 500;

    for (let i = 0; i < maxPolls; i++) {
      await sleep(pollInterval);
      pollCount++;

      const statusRes = await makeRequest("GET", `/api/status/${resultId}`);
      if (statusRes.status === 200) {
        finalStatus = statusRes.body;

        // Log progress
        const progress = finalStatus?.progress_percent || 0;
        const status = finalStatus?.status;
        console.log(
          `      Poll ${i + 1}: ${status} (${progress}%) - ${
            finalStatus?.message || "No message"
          }`
        );

        if (status === "complete" || status === "error") {
          break;
        }
      }
    }

    logTest(
      "7.3: Job transitioned to terminal state",
      finalStatus?.status === "complete" || finalStatus?.status === "error",
      `Final status: ${finalStatus?.status}`
    );

    logTest(
      "7.4: Completed within reasonable time",
      pollCount * pollInterval < 15000,
      `Took ${pollCount} polls (${pollCount * pollInterval}ms)`
    );
  } catch (err) {
    logTest("7: End-to-End Integration", false, err.message);
  }
}

async function testResponseTime() {
  logSection("TEST 8: Performance (Response Time)");

  try {
    const timings = [];

    // Measure 5 requests
    for (let i = 0; i < 5; i++) {
      const payload = {
        prompt: `Performance test ${i}: Generate a guide about topic ${i}`,
        theme: "light",
        pageCount: 3,
      };

      const start = Date.now();
      const res = await makeRequest("POST", "/api/ebook/generate", payload);
      const elapsed = Date.now() - start;

      if (res.status === 202) {
        timings.push(elapsed);
      }
    }

    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    const maxTime = Math.max(...timings);

    logTest(
      "8.1: Average response time < 200ms",
      avgTime < 200,
      `${avgTime.toFixed(2)}ms`
    );

    logTest("8.2: Max response time < 500ms", maxTime < 500, `${maxTime}ms`);

    logTest(
      "8.3: All requests < 1 second",
      timings.every((t) => t < 1000),
      `All ${timings.length} requests under 1s`
    );

    console.log(
      `   Response times: ${timings.map((t) => t + "ms").join(", ")}`
    );
  } catch (err) {
    logTest("8: Performance", false, err.message);
  }
}

// ========== Main Test Runner ==========

async function runAllTests() {
  console.log(
    colorize(
      "\n╔════════════════════════════════════════════════════════════╗",
      "blue"
    )
  );
  console.log(
    colorize(
      "║     ASYNC-INFRA: COMPREHENSIVE TEST SUITE                  ║",
      "blue"
    )
  );
  console.log(
    colorize(
      "║     Testing PART-A, Helpers, Orchestrator, SmartPoller    ║",
      "blue"
    )
  );
  console.log(
    colorize(
      "╚════════════════════════════════════════════════════════════╝",
      "blue"
    )
  );

  try {
    // Run test suites in sequence
    const resultId = await testPartAAsyncAcceptance();
    await testStatusPolling(resultId);
    await testHelpersFramework();
    await testOrchestrator();
    await testSmartPoller();
    await testErrorHandling();
    await testEndToEndFlow();
    await testResponseTime();

    // Final summary
    logSection("SUMMARY");
    console.log(colorize("\n✅ All test suites completed!\n", "green"));
    console.log("Next steps:");
    console.log("  1. Review test results above");
    console.log("  2. Check server logs for any errors");
    console.log("  3. Verify ASYNC-INFRA phase is working correctly");
    console.log("  4. Proceed to SERVICE-AUTON phase if all tests pass\n");
  } catch (err) {
    console.error(colorize(`\n❌ Test suite failed: ${err.message}\n`, "red"));
    process.exit(1);
  }
}

// Check if server is accessible
async function waitForServer(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await makeRequest("GET", "/api/themes", null, 2000);
      console.log(colorize(`✅ Server is accessible (port 3000)\n`, "green"));
      return true;
    } catch (err) {
      if (i < maxAttempts - 1) {
        console.log(
          colorize(
            `⏳ Waiting for server... (attempt ${i + 1}/${maxAttempts})`,
            "yellow"
          )
        );
        await sleep(1000);
      }
    }
  }

  console.error(colorize("❌ Server not accessible on port 3000\n", "red"));
  console.log("Make sure the server is running:");
  console.log("  npm start (in server directory)\n");
  process.exit(1);
}

// Entry point
(async () => {
  await waitForServer();
  await runAllTests();
})();
