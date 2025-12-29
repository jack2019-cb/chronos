/**
 * statusManager.js
 * Per-request helper that manages job status tracking
 *
 * Provides interface for helpers and orchestrator to:
 * - Initialize status on manifest receipt
 * - Update progress as calls complete
 * - Retrieve current status for polling
 */

// Shared status map (moved to this module for clarity)
const statusMap = new Map();

function init(resultId, { eta, totalCalls }) {
  const status = {
    resultId,
    status: "in-progress",
    eta,
    totalCalls,
    callsCompleted: 0,
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    errors: [],
  };

  statusMap.set(resultId, status);
  return status;
}

function updateProgress(
  resultId,
  { callsCompleted, currentCall, errors = [] }
) {
  const status = statusMap.get(resultId);
  if (!status) return;

  status.callsCompleted = callsCompleted;
  status.currentCall = currentCall;
  status.errors = errors;
  status.lastUpdatedAt = Date.now();

  statusMap.set(resultId, status);
}

function getStatus(resultId) {
  const status = statusMap.get(resultId);
  if (!status) return null;

  // Compute progress percentage
  const progress_percent =
    status.totalCalls > 0
      ? Math.round((status.callsCompleted / status.totalCalls) * 100)
      : 0;

  return {
    ...status,
    progress_percent,
  };
}

function deleteStatus(resultId) {
  statusMap.delete(resultId);
}

module.exports = {
  init,
  updateProgress,
  getStatus,
  deleteStatus,
  statusMap, // Export for direct access if needed
};
