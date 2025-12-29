/**
 * rateLimiter - Inter-request pacing module for API calls
 *
 * Enforces minimum delays between consecutive API calls to Gemini
 * to prevent burst rate overloads that can occur even when volume
 * quota is available.
 *
 * Independent from quotaTracker.js - maintains separate state
 * and can be tested in isolation.
 *
 * Problem it solves:
 * - Burst rate failures: When Chapter 2 completes, Chapter 3 is requested
 *   immediately, overwhelming Gemini's model instantiation capacity
 * - Silent fallbacks: Burst failures trigger fallback content generation,
 *   masking the failure from users
 * - Incomplete products: 3-page ebook with only 2 AI chapters + 1 stub chapter
 *
 * Solution:
 * - Enforces configurable inter-request delay (default: 1000ms)
 * - Uses non-blocking async/await (doesn't block server)
 * - Works independently from volume quota tracking
 */

const rateLimiter = (() => {
  // Private state: Last recorded API call timestamp (milliseconds since epoch)
  let lastCallTime = null;

  // Configuration: Minimum milliseconds between consecutive API calls
  // Default: 1000ms (1 second) - allows Gemini backend to recover model instances
  // Tunable via environment variable RATE_LIMIT_MIN_DELAY_MS
  const MIN_DELAY_BETWEEN_CALLS_MS =
    parseInt(process.env.RATE_LIMIT_MIN_DELAY_MS, 10) || 1000;

  /**
   * Calculate milliseconds until next API call is permitted
   *
   * @private
   * @returns {number} Milliseconds to wait (0 if ready now)
   */
  function calculateWaitTime() {
    // First call ever: no previous timestamp, no wait needed
    if (!lastCallTime) {
      return 0;
    }

    const now = Date.now();
    const elapsedSinceLastCall = now - lastCallTime;
    const waitStillNeeded = MIN_DELAY_BETWEEN_CALLS_MS - elapsedSinceLastCall;

    // Never return negative values - if elapsed > minimum, we're ready now
    return Math.max(0, waitStillNeeded);
  }

  /**
   * Wait until sufficient time has elapsed since the last API call
   *
   * This is called by geminiClient.callGemini() before making each
   * API request to Gemini. It enforces inter-request pacing without
   * blocking the server (uses async/await, not busy-wait).
   *
   * @param {number} callIndex - Call sequence number (0, 1, 2, ...)
   *                            Used for logging to identify which call this is
   * @returns {Promise<void>} Resolves when it's safe to proceed
   */
  async function waitForReadiness(callIndex = 0) {
    const waitMs = calculateWaitTime();

    if (waitMs > 0) {
      // Log the enforced delay
      console.log(
        `[RATE-LIMIT] Call ${callIndex}: ` +
          `enforcing ${waitMs}ms inter-request delay`
      );

      // Sleep without blocking the server
      // Other requests can proceed during this sleep via event loop
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      // Log when delay is complete
      console.log(`[RATE-LIMIT] Call ${callIndex}: delay complete, proceeding`);
    }
  }

  /**
   * Record the timestamp of a successful API call
   *
   * Called by geminiClient.callGemini() after a successful response
   * from Gemini API. Updates lastCallTime for use in future
   * calculateWaitTime() calculations.
   *
   * @returns {void}
   */
  function recordCall() {
    lastCallTime = Date.now();
  }

  /**
   * Get milliseconds until next call is permitted (read-only)
   *
   * Used for monitoring, testing, and observability.
   * Allows external code to check readiness without modifying state.
   *
   * @returns {number} Milliseconds to wait (0 if ready now)
   */
  function getTimeUntilReady() {
    return calculateWaitTime();
  }

  // Public API: Only these three methods are exported
  return {
    /**
     * Wait until ready to proceed with next API call
     * @param {number} callIndex - Call sequence number (for logging)
     * @returns {Promise<void>}
     */
    waitForReadiness,

    /**
     * Record successful API call timestamp
     * @returns {void}
     */
    recordCall,

    /**
     * Get time until next call is ready (read-only, for testing/monitoring)
     * @returns {number} Milliseconds to wait
     */
    getTimeUntilReady,
  };
})();

module.exports = rateLimiter;
