/**
 * timingResolver.js
 * Per-request helper that computes timing schedule from manifest
 *
 * Converts a manifest of calls into a precise schedule with:
 * - Call sequence order (FIFO)
 * - Rate-limit aware spacing (Pro 250ms, Flash 100ms)
 * - Total ETA computation
 */

function compute(manifest, config = {}) {
  const { modelSpacing = {}, modelLatencies = {} } = config;

  // Default spacing and latency values
  const spacingPro = modelSpacing.expert || 250; // 250ms for Pro
  const spacingFlash = modelSpacing.standard || 100; // 100ms for Flash
  const latencyPro = modelLatencies.expert || 6000; // 6s for Pro
  const latencyFlash = modelLatencies.standard || 5000; // 5s for Flash

  let totalTime = 0;
  const schedule = [];

  // Build schedule with proper spacing between calls
  manifest.sequence.forEach((call, idx) => {
    const isExpert = call.tier === "expert";
    const latency = isExpert ? latencyPro : latencyFlash;
    const spacing = isExpert ? spacingPro : spacingFlash;

    // First call starts immediately, others account for spacing
    const startTime = idx === 0 ? 0 : schedule[idx - 1].endTime + spacing;
    const endTime = startTime + latency;

    schedule.push({
      callIndex: call.callIndex,
      tier: call.tier,
      startTime,
      duration: latency,
      endTime,
      reservedTime: startTime, // When to actually execute (in ms from job start)
    });

    totalTime = Math.max(totalTime, endTime);
  });

  return {
    totalEta: Math.ceil(totalTime / 1000), // in seconds
    totalEtaMs: totalTime, // in milliseconds
    totalRequests:
      manifest && Array.isArray(manifest.sequence)
        ? manifest.sequence.length
        : schedule.length,
    schedule,
  };
}

module.exports = { compute };
