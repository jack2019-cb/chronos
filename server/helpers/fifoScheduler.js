/**
 * fifoScheduler.js
 * Per-request helper that builds FIFO schedule from timing
 *
 * Converts timing data into a schedule structure that orchestrator uses
 * to enforce call ordering and spacing
 */

function build(timing) {
  return {
    calls: timing.schedule.map((slot) => ({
      callIndex: slot.callIndex,
      reservedTime: slot.reservedTime, // milliseconds from job start
      tier: slot.tier,
      duration: slot.duration,
    })),
    totalEta: timing.totalEta,
  };
}

module.exports = { build };
