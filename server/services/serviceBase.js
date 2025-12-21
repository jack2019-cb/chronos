/**
 * SERVICE_MACHINE_PATTERN: Base class for all autonomous services
 *
 * All services extend this class and implement the handle() interface.
 * This standardizes service behavior and enables reusability across
 * different generation modes (ebook, wall-art, etc).
 *
 * Key Principles:
 * 1. Services use orchestrator.generate() ONLY for AI calls
 * 2. Manifest sent on FIRST call (declares total cost upfront)
 * 3. Tier selection (expert/standard) up to service, tool selection up to orchestrator
 * 4. Independent testability via mocked orchestrator
 * 5. Consistent error handling with metadata about what failed
 */

class Service {
  /**
   * Handle a generation request
   *
   * @param {Object} payload - Request payload
   *   @param {string} payload.prompt - User prompt/input
   *   @param {string} payload.mode - Generation mode (ebook, wall-art, etc)
   *   @param {Object} payload.metadata - Additional metadata
   *
   * @param {Object} resourceKit - Infrastructure provided by genieService
   *   @param {Orchestrator} resourceKit.orchestrator - Fresh orchestrator for this job
   *   @param {Function} resourceKit.onProgress - Callback for progress updates
   *   @param {Logger} resourceKit.logger - Logging interface
   *   @param {Object} resourceKit.config - Application configuration
   *
   * @returns {Promise<Object>} Result object
   *   @returns {string} result.type - Service type (ebook, wall-art, etc)
   *   @returns {string} result.html - Generated HTML output
   *   @returns {Array} result.pages - Page components
   *   @returns {Object} result.metadata - Generation metadata
   *
   * @throws {Object} Error with structure:
   *   @throws {string} error.error - Error code (e.g., ASSEMBLY_FAILED)
   *   @throws {string} error.message - Human-readable error message
   *   @throws {Object} error.missing - What data is missing/failed
   *   @throws {Object} error.attempted - What was attempted before failure
   *
   * Service responsibilities:
   * 1. Calculate manifest (total API calls needed)
   * 2. Send manifest on first orchestrator.generate() call
   * 3. Declare tiers (expert/standard) for each call
   * 4. Handle response validation and assembly
   * 5. Provide helpful error details on failure
   */
  async handle(payload, resourceKit) {
    throw new Error(
      "Service subclass must implement handle(payload, resourceKit)"
    );
  }

  /**
   * Helper: Validate tier value
   * @param {string} tier - Tier to validate (expert, standard)
   * @returns {boolean} True if valid
   */
  validateTier(tier) {
    return ["expert", "standard"].includes(tier);
  }

  /**
   * Helper: Validate manifest structure
   * @param {Object} manifest - Manifest to validate
   * @returns {boolean} True if valid
   */
  validateManifest(manifest) {
    if (!manifest) return false;
    if (typeof manifest.totalRequests !== "number") return false;
    if (!Array.isArray(manifest.sequence)) return false;
    if (manifest.sequence.length === 0) return false;

    // Verify each sequence entry
    return manifest.sequence.every((entry) => {
      return (
        typeof entry.callIndex === "number" && this.validateTier(entry.tier)
      );
    });
  }

  /**
   * Helper: Build error response with metadata
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} context - Additional context
   * @returns {Object} Structured error
   */
  buildError(code, message, context = {}) {
    return {
      error: code,
      message,
      missing: context.missing || {},
      attempted: context.attempted || {},
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = Service;
