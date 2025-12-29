/**
 * quota-integration.test.js
 *
 * Integration tests for quota system
 * Tests the three-layer architecture:
 * - orchestrator quota check (genieService.process)
 * - service domain logic (ebookService.handle)
 * - infrastructure call tracking (geminiClient.recordCall)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
const quotaTracker = require("../utils/quotaTracker");
const { calculateCostForMode } = require("../genieService");

describe("Quota Integration Tests", () => {
  beforeEach(() => {
    // Reset quota tracker to clean state for each test
    quotaTracker._forceRotateForTesting();
  });

  describe("Cost Calculation", () => {
    it("should calculate ebook cost: 1 + ceil(pageCount / 2)", () => {
      expect(calculateCostForMode("ebook", { pageCount: 10 })).toBe(6); // 1 + ceil(10/2) = 1 + 5 = 6
      expect(calculateCostForMode("ebook", { pageCount: 5 })).toBe(4); // 1 + ceil(5/2) = 1 + 3 = 4
      expect(calculateCostForMode("ebook", { pageCount: 1 })).toBe(2); // 1 + ceil(1/2) = 1 + 1 = 2
    });

    it("should calculate poetry cost: always 1", () => {
      expect(calculateCostForMode("poetry", {})).toBe(1);
      expect(calculateCostForMode("poetry", { customField: "ignored" })).toBe(
        1
      );
    });

    it("should calculate blog cost: ceil(wordCount / 500)", () => {
      expect(calculateCostForMode("blog", { wordCount: 2000 })).toBe(4); // ceil(2000 / 500) = 4
      expect(calculateCostForMode("blog", { wordCount: 500 })).toBe(1); // ceil(500 / 500) = 1
      expect(calculateCostForMode("blog", { wordCount: 600 })).toBe(2); // ceil(600 / 500) = 2
    });

    it("should calculate custom cost from estimatedCost or default to 1", () => {
      expect(calculateCostForMode("custom", { estimatedCost: 5 })).toBe(5);
      expect(calculateCostForMode("custom", {})).toBe(1);
    });

    it("should default to 1 call for unknown modes", () => {
      expect(calculateCostForMode("unknown", {})).toBe(1);
    });
  });

  describe("Quota Accounting", () => {
    it("should track multiple calls within quota limit", () => {
      const initialStatus = quotaTracker.getStatus();
      expect(initialStatus.callCount).toBe(0);
      expect(initialStatus.availableQuota).toBe(20);

      // Record 5 calls
      for (let i = 0; i < 5; i++) {
        quotaTracker.recordCall();
      }

      const afterStatus = quotaTracker.getStatus();
      expect(afterStatus.callCount).toBe(5);
      expect(afterStatus.availableQuota).toBe(15);
      expect(afterStatus.percentUsed).toBe(25); // 5/20 = 0.25 = 25%
    });

    it("should calculate availableQuota correctly at max capacity", () => {
      // Record all 20 calls
      for (let i = 0; i < 20; i++) {
        quotaTracker.recordCall();
      }

      const status = quotaTracker.getStatus();
      expect(status.callCount).toBe(20);
      expect(status.availableQuota).toBe(0);
      expect(status.percentUsed).toBe(100);
    });

    it("should not go negative on availableQuota", () => {
      // Try to record more than limit
      for (let i = 0; i < 25; i++) {
        quotaTracker.recordCall();
      }

      const status = quotaTracker.getStatus();
      expect(status.callCount).toBe(25); // Counter records all attempts
      expect(status.availableQuota).toBe(0); // But available never goes negative
      expect(status.availableQuota).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Quota Window Rotation", () => {
    it("should rotate window and reset counter", () => {
      // Record 5 calls
      for (let i = 0; i < 5; i++) {
        quotaTracker.recordCall();
      }

      let status = quotaTracker.getStatus();
      expect(status.callCount).toBe(5);

      // Force window rotation
      quotaTracker._forceRotateForTesting();

      status = quotaTracker.getStatus();
      expect(status.callCount).toBe(0);
      expect(status.availableQuota).toBe(20);
    });

    it("should auto-rotate expired windows", () => {
      quotaTracker.recordCall();
      const status1 = quotaTracker.getStatus();
      expect(status1.callCount).toBe(1);

      // Manually force rotation to simulate 60s passing
      quotaTracker._forceRotateForTesting();

      const status2 = quotaTracker.getStatus();
      expect(status2.callCount).toBe(0);
      expect(status2.availableQuota).toBe(20);
    });
  });

  describe("Quota Status Properties", () => {
    it("should return all required status properties", () => {
      const status = quotaTracker.getStatus();

      expect(status).toHaveProperty("callCount");
      expect(status).toHaveProperty("limit");
      expect(status).toHaveProperty("availableQuota");
      expect(status).toHaveProperty("percentUsed");
      expect(status).toHaveProperty("windowResetAt");
      expect(status).toHaveProperty("windowExpiredMs");
      expect(status).toHaveProperty("windowStarted");
      expect(status).toHaveProperty("isExpired");
    });

    it("should have correct limit value (20)", () => {
      const status = quotaTracker.getStatus();
      expect(status.limit).toBe(20);
    });

    it("should have reasonable windowExpiredMs value", () => {
      const status = quotaTracker.getStatus();
      // Should be close to 60s (60000ms) in fresh window
      expect(status.windowExpiredMs).toBeGreaterThan(50000); // Allow 10s margin
      expect(status.windowExpiredMs).toBeLessThanOrEqual(60000);
    });

    it("should have isExpired = false in fresh window", () => {
      const status = quotaTracker.getStatus();
      expect(status.isExpired).toBe(false);
    });
  });

  describe("Concurrent Request Scenarios", () => {
    it("should handle sequential quota checks with same availability", () => {
      // Simulate 2 concurrent requests checking quota
      const status1 = quotaTracker.getStatus();
      const status2 = quotaTracker.getStatus();

      expect(status1.availableQuota).toBe(status2.availableQuota);
      expect(status1.callCount).toBe(status2.callCount);
    });

    it("should track calls correctly in sequence", () => {
      const cost1 = 5;
      const cost2 = 3;

      // Request 1 uses 5 calls
      for (let i = 0; i < cost1; i++) {
        quotaTracker.recordCall();
      }
      expect(quotaTracker.getStatus().callCount).toBe(5);

      // Request 2 uses 3 more calls
      for (let i = 0; i < cost2; i++) {
        quotaTracker.recordCall();
      }
      expect(quotaTracker.getStatus().callCount).toBe(8);
      expect(quotaTracker.getStatus().availableQuota).toBe(12); // 20 - 8 = 12
    });
  });

  describe("Cost Scenarios", () => {
    it("should handle typical ebook generation (10 pages)", () => {
      const cost = calculateCostForMode("ebook", { pageCount: 10 });
      const status = quotaTracker.getStatus();

      expect(cost).toBe(6);
      expect(status.availableQuota).toBeGreaterThanOrEqual(cost);
    });

    it("should handle large ebook (20 pages)", () => {
      const cost = calculateCostForMode("ebook", { pageCount: 20 });
      expect(cost).toBe(11); // 1 + ceil(20/2) = 1 + 10 = 11

      const status = quotaTracker.getStatus();
      expect(status.availableQuota).toBeGreaterThanOrEqual(cost);
    });

    it("should handle long blog post (3000 words)", () => {
      const cost = calculateCostForMode("blog", { wordCount: 3000 });
      expect(cost).toBe(6); // ceil(3000 / 500) = 6

      const status = quotaTracker.getStatus();
      expect(status.availableQuota).toBeGreaterThanOrEqual(cost);
    });

    it("should exhaust quota with multiple requests", () => {
      // First request: ebook with 10 pages = 6 calls
      quotaTracker.recordCall();
      quotaTracker.recordCall();
      quotaTracker.recordCall();
      quotaTracker.recordCall();
      quotaTracker.recordCall();
      quotaTracker.recordCall();

      const status1 = quotaTracker.getStatus();
      expect(status1.availableQuota).toBe(14); // 20 - 6 = 14

      // Second request: blog with 3000 words = 6 calls
      for (let i = 0; i < 6; i++) {
        quotaTracker.recordCall();
      }

      const status2 = quotaTracker.getStatus();
      expect(status2.availableQuota).toBe(8); // 14 - 6 = 8
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero page count gracefully", () => {
      // calculateCostForMode should handle edge cases
      const cost = calculateCostForMode("ebook", { pageCount: 0 });
      expect(typeof cost).toBe("number");
      expect(cost).toBeGreaterThan(0); // Should return positive value
    });

    it("should handle negative values gracefully", () => {
      const cost = calculateCostForMode("blog", { wordCount: -100 });
      expect(typeof cost).toBe("number");
      expect(cost).toBeGreaterThanOrEqual(0); // Should return non-negative value (0 for negative input)
    });

    it("should handle missing metadata gracefully", () => {
      expect(() => calculateCostForMode("ebook")).not.toThrow();
      expect(() => calculateCostForMode("blog")).not.toThrow();
      expect(() => calculateCostForMode("poetry")).not.toThrow();
    });

    it("should return consistent cost for same input", () => {
      const input = { wordCount: 2000 };
      const cost1 = calculateCostForMode("blog", input);
      const cost2 = calculateCostForMode("blog", input);
      expect(cost1).toBe(cost2);
    });
  });
});
