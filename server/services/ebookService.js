/**
 * EbookService v2 (SERVICE-AUTON-reset)
 *
 * Uses Phase 1 Reference Service
 *
 * No assumptions, no reinvention.
 * Delegates entirely to reference service that was proven in Phase 1 tests.
 */

const ReferenceEbookService = require("./refService.ebookService");
const logger = require("../utils/logger");

class EbookService {
  constructor() {
    this.ref = new ReferenceEbookService();
    this.logger = logger;
  }

  /**
   * Handle ebook generation
   *
   * Simply delegates to Phase 1 reference service.
   * Cannot fail because not making any decisions.
   */
  async handle(payload, context) {
    this.logger.info(`[EbookService] Delegating to reference service`);
    return this.ref.handle(payload, context);
  }
}

module.exports = EbookService;
