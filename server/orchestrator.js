/**
 * orchestrator.js - PART-B Orchestrator
 *
 * The orchestrator is created fresh for each job and:
 * 1. Receives manifest on first call from service
 * 2. Computes timing schedule and ETA via helpers
 * 3. Enforces FIFO + spacing on all subsequent calls
 * 4. Selects tool and model (service doesn't know Pro/Flash)
 * 5. Updates progress via statusManager
 */

const helpers = require("./helpers");
const { createAIService } = require("./aiService");
const logger = require("./utils/logger");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Orchestrator {
  constructor(resultId, customHelpers = {}, customAiService = null) {
    this.resultId = resultId;

    // Use provided helpers or defaults
    this.helpers = {
      timingResolver: customHelpers.timingResolver || helpers.timingResolver,
      fifoScheduler: customHelpers.fifoScheduler || helpers.fifoScheduler,
      statusManager: customHelpers.statusManager || helpers.statusManager,
    };

    // Use provided aiService or create one
    this.aiService = customAiService || createAIService();

    // State for this job
    this.manifestReceived = false;
    this.manifest = null;
    this.eta = null;
    this.schedule = null;
    this.callsCompleted = 0;
    this.errors = [];
    this.jobStartTime = Date.now();
  }

  async generate(prompt, options = {}) {
    const { tier, callIndex, manifest } = options;

    // FIRST CALL: Capture manifest, compute timing
    if (manifest && !this.manifestReceived) {
      this.manifestReceived = true;
      this.manifest = manifest;

      // Helper: Compute timing from manifest
      const timing = this.helpers.timingResolver.compute(this.manifest, {
        modelSpacing: { expert: 250, standard: 100 },
        modelLatencies: { expert: 6000, standard: 5000 },
      });
      this.eta = timing.totalEta;

      // Instrumentation: log computed timing and schedule for debugging ETA accuracy
      try {
        logger.info(
          `[Orchestrator] timingResolver computed for ${this.resultId}: totalEta=${timing.totalEta}s, totalRequests=${timing.totalRequests}, scheduleLen=${timing.schedule.length}`
        );
        timing.schedule.forEach((s) => {
          logger.debug(
            `[Orchestrator] schedule - callIndex=${s.callIndex}, tier=${s.tier}, start=${s.startTime}, duration=${s.duration}, end=${s.endTime}`
          );
        });
      } catch (e) {
        // Non-fatal; continue
      }

      // Helper: Build FIFO schedule with spacing
      this.schedule = this.helpers.fifoScheduler.build(timing);

      // Helper: Initialize status
      this.helpers.statusManager.init(this.resultId, {
        eta: this.eta,
        totalCalls: this.manifest.totalRequests,
      });

      logger.info(
        `[Orchestrator] Manifest captured for ${this.resultId}: ${this.manifest.totalRequests} calls, ETA ${this.eta}s`
      );
    }

    // ALL CALLS: Enforce FIFO + spacing
    if (!this.schedule) {
      throw new Error(
        "Orchestrator.generate() called without manifest. First call must include manifest option."
      );
    }

    const callSlot = this.schedule.calls[callIndex];
    if (!callSlot) {
      throw new Error(
        `Call index ${callIndex} not found in schedule. Total calls: ${this.schedule.calls.length}`
      );
    }

    // Calculate wait time until reserved slot
    const elapsedMs = Date.now() - this.jobStartTime;
    const waitMs = Math.max(0, callSlot.reservedTime - elapsedMs);

    if (waitMs > 0) {
      logger.debug(
        `[Orchestrator] Call ${callIndex}: Waiting ${waitMs}ms for reserved slot (tier: ${tier})`
      );
      await sleep(waitMs);
    }

    // Select tool and model (orchestrator decides, service doesn't know)
    const model = this.tierToModel(tier);
    const toolName = "aiService"; // Future: could select different tools

    logger.info(
      `[Orchestrator] Call ${callIndex}: Executing with ${toolName} (${tier} → ${model})`
    );

    try {
      // Execute the call
      const result = await this.aiService.generateContent(prompt, callIndex, {
        tier,
        model,
      });

      // Update progress
      this.callsCompleted++;
      this.helpers.statusManager.updateProgress(this.resultId, {
        callsCompleted: this.callsCompleted,
        currentCall: callIndex + 1,
      });

      logger.debug(
        `[Orchestrator] Call ${callIndex} completed. Progress: ${this.callsCompleted}/${this.manifest.totalRequests}`
      );

      return result;
    } catch (err) {
      logger.error(`[Orchestrator] Call ${callIndex} failed: ${err.message}`);
      this.errors.push({
        callIndex,
        tier,
        error: err.message,
      });
      throw err;
    }
  }

  tierToModel(tier) {
    // Map service tier declarations to actual Gemini models
    return tier === "expert" ? "gemini-2.5-pro" : "gemini-2.5-flash";
  }

  getStatus() {
    return this.helpers.statusManager.getStatus(this.resultId);
  }

  getEta() {
    return this.eta;
  }
}

module.exports = Orchestrator;
