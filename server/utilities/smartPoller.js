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

  updateTask(resultId, updates) {
    let task = this.tasks.get(resultId);
    if (!task) {
      logger.info(
        `[SmartPoller] updateTask for unknown task: ${resultId} - creating placeholder`
      );
      // Create a placeholder task so downstream callers (statusManager/orchestrator)
      // can safely update fields even if assignTask wasn't called yet.
      this.tasks.set(resultId, {
        resultId,
        status: "in-progress",
        eta: typeof updates.eta === "number" ? updates.eta : null,
        totalCalls: updates.totalCalls || 0,
        callsCompleted: updates.callsCompleted || 0,
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        errors: updates.errors || [],
      });
      task = this.tasks.get(resultId);
    }

    Object.assign(task, updates);
    task.lastUpdatedAt = Date.now();
    logger.debug(`[SmartPoller] Task updated: ${resultId}`, updates);
  }

  updateProgress(
    resultId,
    { callsCompleted, nextEstimatedCompletion, errors = [] }
  ) {
    let task = this.tasks.get(resultId);
    if (!task) {
      logger.info(
        `[SmartPoller] Progress update for unknown task: ${resultId} - creating placeholder`
      );
      this.tasks.set(resultId, {
        resultId,
        status: "in-progress",
        eta: null,
        totalCalls: 0,
        callsCompleted: callsCompleted || 0,
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        errors: errors || [],
        nextEstimatedCompletion: nextEstimatedCompletion || null,
      });
      task = this.tasks.get(resultId);
    }

    task.callsCompleted = callsCompleted;
    task.nextEstimatedCompletion = nextEstimatedCompletion;
    task.errors = errors;
    task.lastUpdatedAt = Date.now();

    const total = task.totalCalls || 1;
    const progressPercent = Math.round((callsCompleted / total) * 100);
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
    const now = Date.now();
    // Coerce eta to numeric seconds when possible
    const etaNum =
      typeof task.eta === "number"
        ? task.eta
        : typeof task.eta === "string" && !isNaN(Number(task.eta))
        ? Number(task.eta)
        : null;

    const nextEst =
      typeof task.nextEstimatedCompletion === "number"
        ? task.nextEstimatedCompletion
        : null;

    const remainingMs = Math.max(
      0,
      (nextEst || (etaNum ? now + etaNum * 1000 : now)) - now
    );

    const progressPercent = Math.round(
      (task.callsCompleted / (task.totalCalls || 1)) * 100
    );

    const response = {
      resultId: task.resultId,
      status: task.status,
      eta: etaNum,
      elapsed_seconds: Math.ceil(elapsedMs / 1000),
      calls_completed: task.callsCompleted,
      calls_total: task.totalCalls || 0,
      progress_percent: progressPercent,
      estimated_remaining_seconds: Math.ceil(remainingMs / 1000),
      message: `Processing call ${task.callsCompleted + 1} of ${
        task.totalCalls || 0
      }`,
      errors: task.errors && task.errors.length > 0 ? task.errors : null,
      lastUpdatedAt: new Date(task.lastUpdatedAt).toISOString(),
    };

    // Include result if task is complete
    if (task.status === "complete" && task.result) {
      response.result = task.result;
    }

    // Include error if task failed
    if (task.status === "error" && task.error) {
      response.error = task.error;
    }

    return response;
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

  markComplete(resultId, result) {
    const task = this.tasks.get(resultId);
    if (!task) {
      logger.info(`[SmartPoller] Mark complete for unknown task: ${resultId}`);
      return;
    }

    task.status = "complete";
    task.result = result;
    task.completedAt = Date.now();
    task.lastUpdatedAt = Date.now();
    logger.info(`[SmartPoller] Task completed: ${resultId}`);
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
