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
    { callsCompleted, nextEstimatedCompletion, errors = [] }
  ) {
    const task = this.tasks.get(resultId);
    if (!task) {
      logger.info(`[SmartPoller] Update for unknown task: ${resultId}`);
      return;
    }

    task.callsCompleted = callsCompleted;
    task.nextEstimatedCompletion = nextEstimatedCompletion;
    task.errors = errors;
    task.lastUpdatedAt = Date.now();

    const progressPercent = Math.round(
      (callsCompleted / task.totalCalls) * 100
    );
    logger.debug(
      `[SmartPoller] Progress update: ${resultId} - ${progressPercent}%`
    );
  }

  getStatus(resultId) {
    const task = this.tasks.get(resultId);
    if (!task) {
      return null;
    }

    const elapsedMs = Date.now() - task.startedAt;
    const remainingMs = Math.max(
      0,
      (task.nextEstimatedCompletion || Date.now()) - Date.now()
    );
    const progressPercent = Math.round(
      (task.callsCompleted / task.totalCalls) * 100
    );

    return {
      resultId: task.resultId,
      status: task.status,
      eta: task.eta,
      elapsed_seconds: Math.ceil(elapsedMs / 1000),
      calls_completed: task.callsCompleted,
      calls_total: task.totalCalls,
      progress_percent: progressPercent,
      estimated_remaining_seconds: Math.ceil(remainingMs / 1000),
      message: `Processing call ${task.callsCompleted + 1} of ${
        task.totalCalls
      }`,
      errors: task.errors.length > 0 ? task.errors : null,
      lastUpdatedAt: new Date(task.lastUpdatedAt).toISOString(),
    };
  }

  markComplete(resultId, result) {
    const task = this.tasks.get(resultId);
    if (!task) {
      logger.info(`[SmartPoller] Mark complete for unknown task: ${resultId}`);
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
      logger.info(`[SmartPoller] Mark error for unknown task: ${resultId}`);
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
