/**
 * utilities/smartPoller.js
 * App-wide utility for job status management
 *
 * Singleton utility that:
 * - Tracks all concurrent jobs
 * - Enriches status with real activity from orchestrator
 * - Provides status endpoint for client polling
 * - Manages cleanup of completed jobs
 */

const logger = require("../utils/logger");

class SmartPoller {
  constructor() {
    this.tasks = new Map(); // resultId → status
    this.cleanupIntervalMs = 3600000; // 1 hour cleanup interval
    this.maxAgeMs = 86400000; // 24 hours
    this.startCleanup();
  }

  assignTask(resultId, { eta, totalCalls }) {
    this.tasks.set(resultId, {
      resultId,
      status: "in-progress",
      eta,
      totalCalls,
      callsCompleted: 0,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      errors: [],
    });
    logger.debug(`[SmartPoller] Task assigned: ${resultId}, ETA: ${eta}s`);
  }

  updateProgress(
    resultId,
    {
      callsCompleted,
      currentCall,
      totalCalls,
      eta,
      nextEstimatedCompletion,
      errors = [],
    }
  ) {
    const task = this.tasks.get(resultId);
    if (!task) {
      logger.warn(`[SmartPoller] Update for unknown task: ${resultId}`);
      return;
    }

    // Update from orchestrator calls (Phase 2 services)
    if (callsCompleted !== undefined) {
      task.callsCompleted = callsCompleted;
    }
    if (currentCall !== undefined) {
      task.currentCall = currentCall;
    }
    if (totalCalls !== undefined) {
      task.totalCalls = totalCalls;
    }
    if (eta !== undefined) {
      task.eta = eta;
    }

    // Legacy update format (kept for backward compatibility)
    if (nextEstimatedCompletion !== undefined) {
      task.nextEstimatedCompletion = nextEstimatedCompletion;
    }

    task.errors = errors;
    task.lastUpdatedAt = Date.now();
    task.status = "in-progress"; // Ensure status is in-progress during updates

    if (task.totalCalls && task.callsCompleted !== undefined) {
      const progressPercent = Math.round(
        (task.callsCompleted / task.totalCalls) * 100
      );
      logger.debug(
        `[SmartPoller] Progress update: ${resultId} - ${progressPercent}% (${task.callsCompleted}/${task.totalCalls})`
      );
    }
  }

  getStatus(resultId) {
    const task = this.tasks.get(resultId);
    if (!task) {
      return null;
    }

    const elapsedMs = Date.now() - task.startedAt;
    const remainingMs = Math.max(0, task.eta ? task.eta * 1000 - elapsedMs : 0);

    const progressPercent =
      task.totalCalls && task.callsCompleted !== undefined
        ? Math.round((task.callsCompleted / task.totalCalls) * 100)
        : 0;

    const status = {
      resultId: task.resultId,
      status: task.status,
      elapsed_seconds: Math.ceil(elapsedMs / 1000),
      errors: task.errors && task.errors.length > 0 ? task.errors : null,
      lastUpdatedAt: new Date(task.lastUpdatedAt).toISOString(),
    };

    // Add orchestrator metadata if available
    if (task.eta !== null && task.eta !== undefined) {
      status.eta = task.eta;
    }
    if (task.totalCalls !== null && task.totalCalls !== undefined) {
      status.calls_total = task.totalCalls;
    }
    if (task.callsCompleted !== undefined) {
      status.calls_completed = task.callsCompleted;
    }
    if (task.currentCall !== undefined) {
      status.current_call = task.currentCall;
    }
    if (task.totalCalls && task.callsCompleted !== undefined) {
      status.progress_percent = progressPercent;
      status.message = `Processing call ${task.callsCompleted} of ${task.totalCalls}`;
    }
    if (remainingMs > 0) {
      status.estimated_remaining_seconds = Math.ceil(remainingMs / 1000);
    }

    // Add result on completion
    if (task.status === "complete" && task.result) {
      status.result = task.result;
    }

    // Add error details on failure
    if (task.status === "error" && task.error) {
      status.error = task.error;
    }

    return status;
  }

  markComplete(resultId, result) {
    const task = this.tasks.get(resultId);
    if (!task) {
      logger.warn(`[SmartPoller] Mark complete for unknown task: ${resultId}`);
      return;
    }

    task.status = "complete";
    task.result = result;
    task.completedAt = Date.now();
    logger.info(`[SmartPoller] Task completed: ${resultId}`);
  }

  markError(resultId, error) {
    const task = this.tasks.get(resultId);
    if (!task) {
      logger.warn(`[SmartPoller] Mark error for unknown task: ${resultId}`);
      return;
    }

    task.status = "error";
    task.error = error;
    task.failedAt = Date.now();
    logger.error(`[SmartPoller] Task failed: ${resultId}: ${error.message}`);
  }

  // Periodic cleanup of old completed tasks
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [resultId, task] of this.tasks.entries()) {
        const age = now - task.startedAt;
        if (
          (task.status === "complete" || task.status === "error") &&
          age > this.maxAgeMs
        ) {
          this.tasks.delete(resultId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug(`[SmartPoller] Cleaned up ${cleanedCount} old tasks`);
      }
    }, this.cleanupIntervalMs);
  }

  // Get all active tasks (for monitoring/debugging)
  getActiveTasks() {
    const active = [];
    for (const [resultId, task] of this.tasks.entries()) {
      if (task.status === "in-progress") {
        active.push(this.getStatus(resultId));
      }
    }
    return active;
  }
}

// Export singleton instance
module.exports = new SmartPoller();
