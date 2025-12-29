/**
 * PERF-VALIDATE Test Utilities
 * Helper functions for performance, timing, and compliance testing
 *
 * Branch: PERF-VALIDATE_02
 * Date: December 29, 2025
 */

import PERF_CONFIG from "./config/perf-validate.config.js";

/**
 * Timing Utilities
 */
export const timingUtils = {
  /**
   * Measure elapsed time between two timestamps
   */
  elapsed(startMs, endMs) {
    return endMs - startMs;
  },

  /**
   * Check if elapsed time is within threshold
   */
  isWithinThreshold(elapsedMs, thresholdMs, tolerance = 0) {
    return elapsedMs <= thresholdMs + tolerance;
  },

  /**
   * Format milliseconds to readable string
   */
  format(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  },

  /**
   * Calculate percentage deviation from target
   */
  deviation(actual, target) {
    return (Math.abs(actual - target) / target) * 100;
  },
};

/**
 * Rate-Limit Compliance Utilities
 */
export const rateLimitUtils = {
  /**
   * Verify spacing between consecutive calls
   */
  verifySpacing(timestamps, minSpacingMs, tierSequence = null) {
    const results = [];

    for (let i = 1; i < timestamps.length; i++) {
      const spacing = timestamps[i] - timestamps[i - 1];
      const tier = tierSequence?.[i] || "unknown";
      const expectedSpacing = tier === "expert" ? 250 : 100;

      results.push({
        callIndex: i,
        tier,
        spacing,
        expected: expectedSpacing,
        passed: spacing >= minSpacingMs,
        deviation: timingUtils.deviation(spacing, expectedSpacing),
      });
    }

    return results;
  },

  /**
   * Check for rate-limit errors in response history
   */
  find429Errors(responses) {
    return responses.filter(
      (r) => r.status === 429 || r.error?.code === "RATE_LIMIT"
    );
  },

  /**
   * Validate rate-limit compliance summary
   */
  summarizeCompliance(results) {
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const avgSpacing = results.reduce((sum, r) => sum + r.spacing, 0) / total;
    const maxDeviation = Math.max(...results.map((r) => r.deviation));

    return {
      total,
      passed,
      failed: total - passed,
      passRate: `${((passed / total) * 100).toFixed(1)}%`,
      averageSpacing: Math.round(avgSpacing),
      maxDeviation: Math.round(maxDeviation * 10) / 10,
      compliant: passed === total,
    };
  },
};

/**
 * Manifest Validation Utilities
 */
export const manifestUtils = {
  /**
   * Validate manifest structure
   */
  validate(manifest) {
    const errors = [];
    const warnings = [];

    if (!manifest) {
      errors.push("Manifest is missing");
      return { valid: false, errors, warnings };
    }

    // Check required fields
    if (!manifest.totalRequests || typeof manifest.totalRequests !== "number") {
      errors.push("Missing or invalid totalRequests");
    }

    if (!Array.isArray(manifest.sequence)) {
      errors.push("Missing or invalid sequence array");
    }

    // Check sequence matches total
    if (
      manifest.sequence &&
      manifest.sequence.length !== manifest.totalRequests
    ) {
      errors.push(
        `Sequence length (${manifest.sequence.length}) does not match totalRequests (${manifest.totalRequests})`
      );
    }

    // Validate tiers
    if (manifest.sequence) {
      manifest.sequence.forEach((call, idx) => {
        if (!call.tier) {
          errors.push(`Call ${idx}: missing tier`);
        } else if (!PERF_CONFIG.manifest.valid_tiers.includes(call.tier)) {
          errors.push(
            `Call ${idx}: invalid tier '${call.tier}' (must be 'expert' or 'standard')`
          );
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      manifest,
    };
  },

  /**
   * Generate expected manifest for sample
   */
  generateExpected(sampleData) {
    const { expectedCalls, expectedTierSequence } = sampleData;
    return {
      totalRequests: expectedCalls,
      sequence: expectedTierSequence.map((tier, idx) => ({
        callIndex: idx,
        tier,
      })),
    };
  },

  /**
   * Compare actual vs expected manifest
   */
  compare(actual, expected) {
    const actualValid = this.validate(actual);
    const expectedValid = this.validate(expected);

    if (!actualValid.valid || !expectedValid.valid) {
      return {
        match: false,
        actualErrors: actualValid.errors,
        expectedErrors: expectedValid.errors,
      };
    }

    const totalMatch = actual.totalRequests === expected.totalRequests;
    const sequenceMatch =
      JSON.stringify(actual.sequence) === JSON.stringify(expected.sequence);

    return {
      match: totalMatch && sequenceMatch,
      totalMatch,
      sequenceMatch,
      actual,
      expected,
    };
  },
};

/**
 * ETA Accuracy Utilities
 */
export const etaUtils = {
  /**
   * Calculate ETA accuracy metrics
   */
  calculateAccuracy(etaMs, actualMs) {
    const deviation = Math.abs(actualMs - etaMs);
    const deviationPercent = (deviation / etaMs) * 100;
    const accurate = deviationPercent <= PERF_CONFIG.eta.max_deviation_percent;

    return {
      eta: etaMs,
      actual: actualMs,
      deviation,
      deviationPercent: Math.round(deviationPercent * 10) / 10,
      maxAllowed: PERF_CONFIG.eta.max_deviation_percent,
      accurate,
    };
  },

  /**
   * Simulate ETA computation from manifest
   */
  computeFromManifest(manifest) {
    // Expert (Pro): 6000ms latency + 250ms spacing
    // Standard (Flash): 5000ms latency + 100ms spacing
    const expertLatency = 6000;
    const expertSpacing = 250;
    const standardLatency = 5000;
    const standardSpacing = 100;

    let totalTime = 0;

    manifest.sequence.forEach((call, idx) => {
      const isExpert = call.tier === "expert";
      const latency = isExpert ? expertLatency : standardLatency;
      const spacing = isExpert ? expertSpacing : standardSpacing;

      totalTime += latency;
      if (idx < manifest.sequence.length - 1) {
        totalTime += spacing;
      }
    });

    return Math.ceil(totalTime / 1000); // Convert to seconds
  },

  /**
   * Validate ETA was provided at expected time
   */
  validateProvision(etaProvidedAt, completionTime) {
    // ETA should be available very early (within first 500ms usually)
    const timeTillProvision = etaProvidedAt;
    const validlyProvided = timeTillProvision < 1000; // Should be within first second

    return {
      providedWithin: timeTillProvision,
      validlyProvided,
      message: validlyProvided
        ? `ETA provided promptly (${timeTillProvision}ms)`
        : `ETA provided late (${timeTillProvision}ms)`,
    };
  },
};

/**
 * Status & Progress Utilities
 */
export const statusUtils = {
  /**
   * Poll status until completion or timeout
   */
  async pollUntilCompletion(
    statusGetter,
    maxWaitMs = 60000,
    pollIntervalMs = 500
  ) {
    const startTime = Date.now();
    const statuses = [];

    while (Date.now() - startTime < maxWaitMs) {
      const status = await statusGetter();
      statuses.push({
        timestamp: Date.now() - startTime,
        status,
      });

      if (status.status === "complete" || status.status === "error") {
        return {
          completed: status.status === "complete",
          failed: status.status === "error",
          totalTime: Date.now() - startTime,
          statuses,
          finalStatus: status,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return {
      completed: false,
      timedOut: true,
      totalTime: Date.now() - startTime,
      statuses,
    };
  },

  /**
   * Validate status response structure
   */
  validateStatusResponse(status) {
    const errors = [];
    const warnings = [];

    if (!status) {
      errors.push("Status is null/undefined");
      return { valid: false, errors, warnings };
    }

    // Check required fields
    if (!status.status) errors.push("Missing status field");
    if (
      !["queued", "in-progress", "complete", "error"].includes(status.status)
    ) {
      errors.push(`Invalid status value: ${status.status}`);
    }

    // Check optional but recommended fields
    if (status.status === "in-progress") {
      if (status.eta === undefined)
        warnings.push("ETA not provided for in-progress job");
      if (status.progress_percent === undefined)
        warnings.push("Progress percent not provided");
      if (status.calls_completed === undefined)
        warnings.push("Calls completed count not provided");
      if (status.calls_total === undefined)
        warnings.push("Total calls not provided");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      status,
    };
  },

  /**
   * Calculate progress from status
   */
  getProgress(status) {
    if (!status.calls_total) return 0;
    return (status.calls_completed / status.calls_total) * 100;
  },
};

/**
 * Test Report Generation
 */
export const reportUtils = {
  /**
   * Generate performance test report
   */
  generatePerformanceReport(results) {
    const { passed, failed, totalTime, expectedMax, sampleName } = results;

    return {
      test: sampleName,
      passed: passed ? "✅" : "❌",
      duration: timingUtils.format(totalTime),
      threshold: timingUtils.format(expectedMax),
      withinSLA: passed,
      deviation: passed
        ? `${timingUtils.format(expectedMax - totalTime)} buffer`
        : `${timingUtils.format(totalTime - expectedMax)} over`,
    };
  },

  /**
   * Generate compliance report
   */
  generateComplianceReport(results) {
    const { total, passed, failed, passRate, compliant } = results;

    return {
      tests: `${passed}/${total}`,
      passRate,
      status: compliant ? "✅ COMPLIANT" : "❌ VIOLATIONS",
      details:
        failed > 0
          ? `${failed} spacing violation${failed !== 1 ? "s" : ""}`
          : "All calls properly spaced",
    };
  },

  /**
   * Generate accuracy report
   */
  generateAccuracyReport(results) {
    const { eta, actual, accurate, deviationPercent } = results;

    return {
      eta: `${eta}s`,
      actual: `${(actual / 1000).toFixed(2)}s`,
      deviation: `${deviationPercent}%`,
      accurate: accurate ? "✅" : "❌",
      status: accurate
        ? "Within acceptable range"
        : `Exceeded ${PERF_CONFIG.eta.max_deviation_percent}% threshold`,
    };
  },
};

/**
 * Concurrent Request Utilities
 */
export const concurrencyUtils = {
  /**
   * Execute concurrent requests and track timing
   */
  async executeConcurrentRequests(requestFn, count) {
    const startTime = Date.now();
    const requests = Array.from({ length: count }, (_, i) =>
      requestFn(i).catch((err) => ({ error: err, index: i }))
    );

    const results = await Promise.all(requests);
    const totalTime = Date.now() - startTime;

    return {
      count,
      totalTime,
      results,
      avgTimePerRequest: totalTime / count,
    };
  },

  /**
   * Check all requests succeeded
   */
  allSucceeded(results) {
    return results.every((r) => !r.error && r.status !== "error");
  },

  /**
   * Summarize concurrent execution
   */
  summarize(execution) {
    const succeeded = execution.results.filter((r) => !r.error).length;
    const failed = execution.count - succeeded;

    return {
      totalRequests: execution.count,
      succeeded,
      failed,
      totalTime: execution.totalTime,
      avgPerRequest: execution.avgTimePerRequest,
      success: failed === 0,
    };
  },
};

/**
 * Error Handling Utilities
 */
export const errorUtils = {
  /**
   * Categorize errors
   */
  categorizeError(error) {
    if (error.code === "RATE_LIMIT" || error.status === 429) {
      return { category: "RATE_LIMIT", severity: "high" };
    }
    if (error.code === "TIMEOUT" || error.message?.includes("timeout")) {
      return { category: "TIMEOUT", severity: "critical" };
    }
    if (error.code === "ASSEMBLY_FAILED") {
      return { category: "SERVICE_ERROR", severity: "high" };
    }
    return { category: "OTHER", severity: "medium" };
  },

  /**
   * Extract key error details for reporting
   */
  extract(error) {
    return {
      code: error.code || "UNKNOWN",
      message: error.message || String(error),
      category: this.categorizeError(error).category,
      timestamp: error.timestamp || Date.now(),
    };
  },
};

export default {
  timingUtils,
  rateLimitUtils,
  manifestUtils,
  etaUtils,
  statusUtils,
  reportUtils,
  concurrencyUtils,
  errorUtils,
};
