/**
 * WallArtService
 *
 * NEW service using Phase 1 Infrastructure
 *
 * Follows identical pattern to ReferenceEbookService.
 * Declares manifest, calls orchestrator, returns result.
 * No assumptions about Phase 1 behavior.
 */

const logger = require("../utils/logger");

class WallArtService {
  async handle(payload, context) {
    const { resultId, prompt, style, dimensions } = payload;
    const { orchestrator, onProgress } = context;

    logger.info(
      `[WallArtService] Starting: resultId=${resultId}, style=${style}`
    );

    try {
      // Step 1: Declare manifest (what we need from orchestrator)
      const manifest = {
        totalRequests: 2,
        sequence: [
          { callIndex: 0, tier: "expert" }, // Understand style
          { callIndex: 1, tier: "standard" }, // Generate description
        ],
      };

      logger.info(`[WallArtService] Manifest: ${manifest.totalRequests} calls`);

      // Step 2: First call WITH manifest
      const styleAnalysis = await orchestrator.generate(
        `Analyze this wall art style request: "${prompt}". Style: ${style}. Dimensions: ${dimensions}. Provide style analysis and recommendations.`,
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
      const description = await orchestrator.generate(
        `Based on this analysis, create a detailed wall art description: ${styleAnalysis}`,
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

      // Step 4: Compose result
      const wallArt = {
        id: resultId,
        style,
        dimensions,
        prompt,
        styleAnalysis,
        description,
        generatedAt: Date.now(),
        metadata: {
          totalRequests: totalCalls,
          etaSeconds: eta,
        },
      };

      logger.info(`[WallArtService] Complete`);
      return wallArt;
    } catch (err) {
      logger.error(`[WallArtService] Failed: ${err.message}`, err);
      throw err;
    }
  }
}

module.exports = WallArtService;
