/**
 * Reference EbookService
 *
 * GOLDEN STANDARD for using ASYNC-INFRA orchestrator.
 * If this service works, Phase 1 patterns are correct.
 *
 * Pattern:
 * 1. Receive orchestrator as dependency
 * 2. Declare manifest (what we need)
 * 3. Call orchestrator for each operation
 * 4. Return composed result
 */

const logger = require("../utils/logger");

class ReferenceEbookService {
  async handle(payload, context) {
    const { resultId, prompt, theme, pageCount } = payload;
    const { orchestrator, onProgress } = context;

    logger.info(
      `[RefService] Starting ebook generation: resultId=${resultId}, pages=${pageCount}`
    );

    try {
      // Step 1: Declare manifest (what we need from orchestrator)
      const manifest = {
        totalRequests: 1 + pageCount, // Title call + content calls
        sequence: [
          { callIndex: 0, tier: "expert" }, // Title generation
          ...Array.from({ length: pageCount }, (_, i) => ({
            callIndex: i + 1,
            tier: i % 2 === 0 ? "expert" : "standard",
          })),
        ],
      };

      logger.info(
        `[RefService] Manifest declared: ${manifest.totalRequests} calls`
      );

      // Step 2: First call WITH manifest (orchestrator computes ETA)
      const title = await orchestrator.generate(
        `Create a compelling title for this ebook. Topic: ${prompt.substring(
          0,
          100
        )}. Theme: ${theme}`,
        {
          tier: "expert",
          callIndex: 0,
          manifest, // ONLY on first call
        }
      );

      // Step 3: Extract ETA computed by orchestrator
      const eta = orchestrator.eta;
      const totalCalls = orchestrator.manifest.totalRequests;

      logger.info(
        `[RefService] Title generated. ETA=${eta}s, Total Calls=${totalCalls}`
      );

      // Step 4: Notify progress
      onProgress({
        resultId,
        callsCompleted: 1,
        currentCall: 1,
        totalCalls,
        eta,
      });

      // Step 5: Generate content chapters
      const chapters = [];
      for (let i = 0; i < pageCount; i++) {
        const chapterPrompt = `Chapter ${
          i + 1
        }: Continue the ebook on "${prompt}". 
          This is a ${theme}-themed ebook. Focus on practical, actionable content.`;

        const content = await orchestrator.generate(chapterPrompt, {
          tier: i % 2 === 0 ? "expert" : "standard",
          callIndex: i + 1,
          // NOTE: NO manifest here (only on first call)
        });

        chapters.push({
          number: i + 1,
          title: `Chapter ${i + 1}`,
          content,
        });

        logger.debug(`[RefService] Chapter ${i + 1} generated`);

        // Step 6: Update progress after each call
        onProgress({
          resultId,
          callsCompleted: i + 2,
          currentCall: i + 2,
          totalCalls,
          eta,
        });
      }

      // Step 7: Compose final result
      const ebook = {
        id: resultId,
        title,
        theme,
        chapters,
        generatedAt: Date.now(),
        metadata: {
          pageCount,
          totalRequests: totalCalls,
          etaSeconds: eta,
        },
      };

      logger.info(`[RefService] Ebook complete: ${chapters.length} chapters`);
      return ebook;
    } catch (err) {
      logger.error(`[RefService] Generation failed: ${err.message}`, err);
      throw err;
    }
  }
}

module.exports = ReferenceEbookService;
