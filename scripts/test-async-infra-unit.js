/**
 * test-async-infra-unit.test.js
 *
 * Unit tests for ASYNC-INFRA components
 * Can be run with: npm test (if jest is configured)
 * Or manually with node
 *
 * Tests individual components in isolation:
 * - timingResolver
 * - fifoScheduler
 * - statusManager
 * - orchestrator (with mocks)
 * - smartPoller
 */

const assert = require("assert");

// Test utilities
function describe(name, fn) {
  console.log(`\n${"=".repeat(60)}\n${name}\n${"=".repeat(60)}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${err.message}`);
    throw err;
  }
}

// ========== Tests ==========

describe("timingResolver", () => {
  const timingResolver = require("../server/helpers/timingResolver");

  it("should compute correct ETA for 4-call expert manifest", () => {
    const manifest = {
      totalRequests: 4,
      sequence: [
        { tier: "expert", callIndex: 0 },
        { tier: "expert", callIndex: 1 },
        { tier: "expert", callIndex: 2 },
        { tier: "expert", callIndex: 3 },
      ],
    };

    const result = timingResolver.compute(manifest, {});

    assert.ok(result.totalEta > 0, "Should compute positive ETA");
    assert.equal(result.schedule.length, 4, "Should have 4 schedule entries");
    assert.equal(
      result.schedule[0].reservedTime,
      0,
      "First call should start immediately"
    );
  });

  it("should maintain spacing between calls", () => {
    const manifest = {
      totalRequests: 3,
      sequence: [
        { tier: "expert", callIndex: 0 },
        { tier: "expert", callIndex: 1 },
        { tier: "expert", callIndex: 2 },
      ],
    };

    const result = timingResolver.compute(manifest, {});
    const schedule = result.schedule;

    // Expert calls should have at least 250ms spacing
    const spacing0 = schedule[1].reservedTime - schedule[0].reservedTime;
    const spacing1 = schedule[2].reservedTime - schedule[1].reservedTime;

    assert.ok(
      spacing0 >= 250,
      `First spacing should be >= 250ms, got ${spacing0}ms`
    );
    assert.ok(
      spacing1 >= 250,
      `Second spacing should be >= 250ms, got ${spacing1}ms`
    );
  });

  it("should handle mixed tier manifest", () => {
    const manifest = {
      totalRequests: 4,
      sequence: [
        { tier: "expert", callIndex: 0 },
        { tier: "standard", callIndex: 1 },
        { tier: "standard", callIndex: 2 },
        { tier: "expert", callIndex: 3 },
      ],
    };

    const result = timingResolver.compute(manifest, {});

    assert.ok(result.schedule.length === 4, "Should have 4 entries");
    assert.ok(result.totalEta > 0, "Should compute ETA");

    // Standard calls should have different (usually lower) spacing
    const expertSpacing = 250;
    const standardSpacing = 100;

    // Verify tiers are in schedule
    assert.equal(result.schedule[0].tier, "expert");
    assert.equal(result.schedule[1].tier, "standard");
  });

  it("should return schedule with all required fields", () => {
    const manifest = {
      totalRequests: 2,
      sequence: [
        { tier: "expert", callIndex: 0 },
        { tier: "standard", callIndex: 1 },
      ],
    };

    const result = timingResolver.compute(manifest, {});

    assert.ok(result.totalEta !== undefined, "Should have totalEta");
    assert.ok(result.totalEtaMs !== undefined, "Should have totalEtaMs");
    assert.ok(Array.isArray(result.schedule), "schedule should be array");

    result.schedule.forEach((slot, idx) => {
      assert.equal(slot.callIndex, idx, `Call index should match`);
      assert.ok(slot.tier, "Should have tier");
      assert.ok(typeof slot.startTime === "number", "Should have startTime");
      assert.ok(typeof slot.duration === "number", "Should have duration");
      assert.ok(typeof slot.endTime === "number", "Should have endTime");
      assert.ok(
        typeof slot.reservedTime === "number",
        "Should have reservedTime"
      );
    });
  });
});

describe("fifoScheduler", () => {
  const fifoScheduler = require("../server/helpers/fifoScheduler");
  const timingResolver = require("../server/helpers/timingResolver");

  it("should build schedule from timing", () => {
    const manifest = {
      totalRequests: 2,
      sequence: [
        { tier: "expert", callIndex: 0 },
        { tier: "standard", callIndex: 1 },
      ],
    };

    const timing = timingResolver.compute(manifest, {});
    const schedule = fifoScheduler.build(timing);

    assert.ok(schedule.calls.length === 2, "Should have 2 calls");
    assert.ok(schedule.totalEta > 0, "Should have totalEta");
  });

  it("should include required call fields", () => {
    const manifest = {
      totalRequests: 1,
      sequence: [{ tier: "expert", callIndex: 0 }],
    };

    const timing = timingResolver.compute(manifest, {});
    const schedule = fifoScheduler.build(timing);

    schedule.calls.forEach((call) => {
      assert.ok(typeof call.callIndex === "number", "Should have callIndex");
      assert.ok(
        typeof call.reservedTime === "number",
        "Should have reservedTime"
      );
      assert.ok(call.tier, "Should have tier");
      assert.ok(typeof call.duration === "number", "Should have duration");
    });
  });
});

describe("statusManager", () => {
  const statusManager = require("../server/helpers/statusManager");

  it("should initialize status", () => {
    const resultId = `test-init-${Date.now()}`;
    statusManager.init(resultId, { eta: 20, totalCalls: 4 });

    const status = statusManager.getStatus(resultId);
    assert.equal(status.resultId, resultId);
    assert.equal(status.status, "in-progress");
    assert.equal(status.eta, 20);
    assert.equal(status.totalCalls, 4);
    assert.equal(status.callsCompleted, 0);

    statusManager.deleteStatus(resultId);
  });

  it("should update progress", () => {
    const resultId = `test-progress-${Date.now()}`;
    statusManager.init(resultId, { eta: 20, totalCalls: 4 });

    statusManager.updateProgress(resultId, {
      callsCompleted: 2,
      currentCall: 2,
      errors: [],
    });

    const status = statusManager.getStatus(resultId);
    assert.equal(status.callsCompleted, 2);
    assert.equal(status.currentCall, 2);

    statusManager.deleteStatus(resultId);
  });

  it("should compute progress percentage", () => {
    const resultId = `test-percent-${Date.now()}`;
    statusManager.init(resultId, { eta: 20, totalCalls: 4 });

    statusManager.updateProgress(resultId, {
      callsCompleted: 1,
      currentCall: 1,
    });

    const status = statusManager.getStatus(resultId);
    // 1 of 4 = 25%
    assert.equal(status.progress_percent, 25);

    statusManager.deleteStatus(resultId);
  });

  it("should return null for unknown status", () => {
    const status = statusManager.getStatus(`nonexistent-${Date.now()}`);
    assert.equal(status, null);
  });

  it("should handle multiple concurrent statuses", () => {
    const id1 = `test-concurrent-1-${Date.now()}`;
    const id2 = `test-concurrent-2-${Date.now()}`;

    statusManager.init(id1, { eta: 20, totalCalls: 4 });
    statusManager.init(id2, { eta: 15, totalCalls: 3 });

    const status1 = statusManager.getStatus(id1);
    const status2 = statusManager.getStatus(id2);

    assert.equal(status1.totalCalls, 4);
    assert.equal(status2.totalCalls, 3);

    statusManager.deleteStatus(id1);
    statusManager.deleteStatus(id2);
  });
});

describe("orchestrator", () => {
  const Orchestrator = require("../server/orchestrator");
  const statusManager = require("../server/helpers/statusManager");

  it("should instantiate with resultId", () => {
    const resultId = `test-orch-${Date.now()}`;
    const orch = new Orchestrator(resultId);

    assert.equal(orch.resultId, resultId);
    assert.equal(orch.manifestReceived, false);
    assert.equal(orch.manifest, null);
    assert.equal(orch.eta, null);
  });

  it("should have all helper instances", () => {
    const orch = new Orchestrator(`test-helpers-${Date.now()}`);

    assert.ok(orch.helpers.timingResolver, "Should have timingResolver");
    assert.ok(orch.helpers.fifoScheduler, "Should have fifoScheduler");
    assert.ok(orch.helpers.statusManager, "Should have statusManager");
  });

  it("should track call completion", () => {
    const orch = new Orchestrator(`test-calls-${Date.now()}`);
    assert.equal(orch.callsCompleted, 0);
  });

  it("should allow custom helpers", () => {
    const customHelpers = {
      timingResolver: { compute: () => ({ totalEta: 10, schedule: [] }) },
      fifoScheduler: { build: () => ({ calls: [] }) },
      statusManager: { init: () => {}, updateProgress: () => {} },
    };

    const orch = new Orchestrator(`test-custom-${Date.now()}`, customHelpers);
    assert.equal(orch.helpers.timingResolver, customHelpers.timingResolver);
  });
});

describe("smartPoller", () => {
  const smartPoller = require("../server/utilities/smartPoller");

  it("should assign task", () => {
    const resultId = `test-sp-${Date.now()}`;
    smartPoller.assignTask(resultId, { eta: 25, totalCalls: 5 });

    const status = smartPoller.getStatus(resultId);
    assert.ok(status, "Task should be assigned");
    assert.equal(status.calls_total, 5);

    smartPoller.tasks.delete(resultId);
  });

  it("should update progress", () => {
    const resultId = `test-sp-progress-${Date.now()}`;
    smartPoller.assignTask(resultId, { eta: 25, totalCalls: 5 });

    smartPoller.updateProgress(resultId, {
      callsCompleted: 2,
      nextEstimatedCompletion: Date.now() + 15000,
    });

    const status = smartPoller.getStatus(resultId);
    assert.equal(status.calls_completed, 2);
    assert.equal(status.progress_percent, 40); // 2 of 5 = 40%

    smartPoller.tasks.delete(resultId);
  });

  it("should mark task complete", () => {
    const resultId = `test-sp-complete-${Date.now()}`;
    smartPoller.assignTask(resultId, { eta: 25, totalCalls: 5 });

    smartPoller.markComplete(resultId, { result: "data" });

    const status = smartPoller.getStatus(resultId);
    assert.equal(status.status, "complete");

    smartPoller.tasks.delete(resultId);
  });

  it("should mark task error", () => {
    const resultId = `test-sp-error-${Date.now()}`;
    smartPoller.assignTask(resultId, { eta: 25, totalCalls: 5 });

    smartPoller.markError(resultId, { message: "Test error" });

    const status = smartPoller.getStatus(resultId);
    assert.equal(status.status, "error");

    smartPoller.tasks.delete(resultId);
  });

  it("should return null for unknown task", () => {
    const status = smartPoller.getStatus(`nonexistent-sp-${Date.now()}`);
    assert.equal(status, null);
  });

  it("should return active tasks", () => {
    const id1 = `test-active-1-${Date.now()}`;
    const id2 = `test-active-2-${Date.now()}`;

    smartPoller.assignTask(id1, { eta: 10, totalCalls: 2 });
    smartPoller.assignTask(id2, { eta: 10, totalCalls: 2 });

    const active = smartPoller.getActiveTasks();
    assert.ok(Array.isArray(active), "Should return array");
    assert.ok(active.length >= 2, "Should include assigned tasks");

    smartPoller.tasks.delete(id1);
    smartPoller.tasks.delete(id2);
  });
});

// ========== Summary ==========

console.log("\n" + "=".repeat(60));
console.log("✅ All unit tests passed!");
console.log("=".repeat(60) + "\n");
