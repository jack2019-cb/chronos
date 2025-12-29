/**
 * quotaTracker - Pure quota accounting module
 *
 * Tracks API calls within a 60-second window.
 * Single responsibility: count calls and expose status.
 * No pause/resume logic, no flow control.
 *
 * Used by:
 * - genieService.process() to check availability before dispatching
 * - geminiClient.callGemini() to record successful API calls
 */

const quotaTracker = (() => {
  let callCount = 0;
  let reservedCount = 0;
  let reservations = {}; // reservationId -> count
  let nextReservationId = 1;
  let windowStart = Date.now();

  // Gemini free tier: 20 calls per minute
  const LIMIT = 20;
  const WINDOW_MS = 60 * 1000; // 60 seconds

  /**
   * Record a successful API call
   * Called by geminiClient after each successful Gemini API request
   */
  function recordCall() {
    // Auto-rotate window if expired
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      rotateWindow();
    }

    // If there are reserved slots, consume one of them instead of leaving
    // the reservation dangling. This keeps reservedCount and callCount in sync.
    if (reservedCount > 0) {
      // Consume from a tracked reservation (pick the earliest id)
      const ids = Object.keys(reservations);
      if (ids.length > 0) {
        const id = ids[0];
        reservations[id] = Math.max(0, reservations[id] - 1);
        if (reservations[id] === 0) delete reservations[id];
      }
      reservedCount = Math.max(0, reservedCount - 1);
    }

    callCount++;

    // Debug logging
    const status = getStatus();
    console.log(
      `[QUOTA] Call recorded: ${status.callCount}/${status.limit} ` +
        `(${Math.round(status.percentUsed)}% used, ` +
        `${status.availableQuota} remaining)`
    );
  }

  /**
   * Reserve quota for an upcoming job.
   * Returns an object { success: boolean, reserved?: number, reason?: string }
   * If there is sufficient available quota, increments reservedCount and
   * returns success. Otherwise returns failure with reason.
   */
  function reserve(count = 1) {
    const status = getStatus();
    const available = Math.max(
      0,
      status.limit - status.callCount - reservedCount
    );
    if (count <= 0) return { success: false, reason: "INVALID_COUNT" };
    if (count > available)
      return { success: false, reason: "INSUFFICIENT_QUOTA" };
    const id = String(nextReservationId++);
    reservations[id] = (reservations[id] || 0) + count;
    reservedCount += count;
    return { success: true, reserved: count, reservationId: id };
  }

  /**
   * Release a previously reserved quota. If count is omitted, releases all.
   */
  function release(count = null) {
    if (count === null) {
      reservations = {};
      reservedCount = 0;
      return { success: true, released: null };
    }
    if (count <= 0) return { success: false, reason: "INVALID_COUNT" };
    // Reduce reservedCount by count, and decrement from reservations map
    reservedCount = Math.max(0, reservedCount - count);
    let remaining = count;
    for (const id of Object.keys(reservations)) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, reservations[id]);
      reservations[id] -= take;
      remaining -= take;
      if (reservations[id] <= 0) delete reservations[id];
    }
    return { success: true, released: count };
  }

  function releaseReservation(reservationId) {
    if (!reservationId) return { success: false, reason: "NO_RESERVATION_ID" };
    const id = String(reservationId);
    if (!reservations[id]) return { success: true, released: 0 };
    const c = reservations[id];
    delete reservations[id];
    reservedCount = Math.max(0, reservedCount - c);
    return { success: true, released: c };
  }

  /**
   * Get current quota status
   * Called by genieService.process() before dispatching to domain service
   *
   * @returns {Object} { callCount, limit, availableQuota, percentUsed, windowResetAt, windowExpiredMs }
   */
  function getStatus() {
    const now = Date.now();
    const elapsed = now - windowStart;
    const windowExpired = elapsed >= WINDOW_MS;

    // Auto-rotate if window expired
    if (windowExpired) {
      rotateWindow();
      return getStatus(); // Recursively get status for new window
    }

    return {
      callCount,
      reservedCount,
      reservations: { ...reservations },
      limit: LIMIT,
      availableQuota: Math.max(0, LIMIT - callCount - reservedCount),
      percentUsed: (callCount / LIMIT) * 100,
      windowResetAt: windowStart + WINDOW_MS,
      windowExpiredMs: WINDOW_MS - elapsed, // Milliseconds until window resets
      windowStarted: windowStart,
      isExpired: false,
    };
  }

  /**
   * Rotate window: reset call count and start time
   * Called automatically when 60s window expires
   */
  function rotateWindow() {
    console.log(`[QUOTA] Window rotated: reset counter from ${callCount} to 0`);
    callCount = 0;
    // Clear reservations on window rotation to avoid leaking reserved state
    reservedCount = 0;
    reservations = {};
    windowStart = Date.now();
  }

  /**
   * Force a manual window rotation (useful for testing)
   * DO NOT call in production code
   */
  function _forceRotateForTesting() {
    rotateWindow();
  }

  // Expose public API
  return {
    recordCall,
    getStatus,
    rotateWindow,
    _forceRotateForTesting, // For tests only
    reserve,
    release,
    releaseReservation,
  };
})();

module.exports = quotaTracker;
