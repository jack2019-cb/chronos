/**
 * CalendarService
 *
 * NEW service using Phase 1 Infrastructure
 *
 * Follows identical pattern to ReferenceEbookService and WallArtService.
 * No differences in orchestrator usage between services.
 */

const logger = require("../utils/logger");

class CalendarService {
  async handle(payload, context) {
    const { resultId, prompt, year, theme } = payload;
    const { orchestrator, onProgress } = context;

    logger.info(
      `[CalendarService] Starting: resultId=${resultId}, year=${year}`
    );

    try {
      // Step 1: Declare manifest
      const manifest = {
        totalRequests: 3,
        sequence: [
          { callIndex: 0, tier: "expert" }, // Calendar content
          { callIndex: 1, tier: "standard" }, // Event suggestions
          { callIndex: 2, tier: "standard" }, // Layout description
        ],
      };

      logger.info(
        `[CalendarService] Manifest: ${manifest.totalRequests} calls`
      );

      // Step 2: First call WITH manifest
      const content = await orchestrator.generate(
        `Create calendar content for ${year}: ${prompt}. Theme: ${theme}. Include important dates and holidays.`,
        {
          tier: "expert",
          callIndex: 0,
          manifest,
        }
      );

      const eta = orchestrator.eta;
      const totalCalls = orchestrator.manifest.totalRequests;

      onProgress({
        resultId,
        callsCompleted: 1,
        currentCall: 1,
        totalCalls,
        eta,
      });

      // Step 3: Second call (NO manifest)
      const events = await orchestrator.generate(
        `Suggest important events for this calendar: ${content}`,
        {
          tier: "standard",
          callIndex: 1,
        }
      );

      onProgress({
        resultId,
        callsCompleted: 2,
        currentCall: 2,
        totalCalls,
        eta,
      });

      // Step 4: Third call (NO manifest)
      const layout = await orchestrator.generate(
        `Describe the layout for this calendar: Content: ${content}, Events: ${events}`,
        {
          tier: "standard",
          callIndex: 2,
        }
      );

      onProgress({
        resultId,
        callsCompleted: 3,
        currentCall: 3,
        totalCalls,
        eta,
      });

      // Step 5: Compose result
      const calendar = {
        id: resultId,
        year,
        theme,
        content,
        events,
        layout,
        generatedAt: Date.now(),
        metadata: {
          totalRequests: totalCalls,
          etaSeconds: eta,
        },
      };

      logger.info(`[CalendarService] Complete`);
      return calendar;
    } catch (err) {
      logger.error(`[CalendarService] Failed: ${err.message}`, err);
      throw err;
    }
  }
}

module.exports = CalendarService;
