/**
 * serviceIntegration.js - Integration layer between genieService and refactored services
 *
 * Bridges ASYNC-INFRA orchestrator with SERVICE_MACHINE_PATTERN services.
 * Provides the resourceKit that services expect.
 *
 * Responsibilities:
 * 1. Create fresh orchestrator for each request
 * 2. Provide logger, config, and onProgress callback
 * 3. Route to appropriate service
 * 4. Handle service responses and errors
 */

const Orchestrator = require("./orchestrator");
const timingResolver = require("./helpers/timingResolver");
const fifoScheduler = require("./helpers/fifoScheduler");
const statusManager = require("./helpers/statusManager");

/**
 * Create a resourceKit for a service request
 *
 * @param {string} resultId - Unique job identifier
 * @param {Object} logger - Logging interface
 * @param {Object} config - Application configuration
 * @returns {Object} resourceKit with orchestrator, callbacks, logger, config
 */
function createResourceKit(resultId, logger, config) {
  const helpers = {
    timingResolver,
    fifoScheduler,
    statusManager,
  };

  const orchestrator = new Orchestrator(resultId, helpers);

  return {
    orchestrator,
    onProgress: (activity) => {
      // Enrich smartPoller with real activity (if available)
      const smartPoller = global.smartPoller;
      if (smartPoller && smartPoller.updateProgress) {
        smartPoller.updateProgress(resultId, activity);
      }
    },
    logger,
    config,
  };
}

/**
 * Execute a service with proper orchestrator and resource setup
 *
 * @param {Object} service - Service instance with handle() method
 * @param {Object} payload - Request payload
 * @param {string} resultId - Unique job identifier
 * @param {Object} logger - Logging interface
 * @param {Object} config - Application configuration
 * @returns {Promise<Object>} Service result
 */
async function executeService(service, payload, resultId, logger, config) {
  const resourceKit = createResourceKit(resultId, logger, config);

  // Execute service with orchestrator interface
  const result = await service.handle(payload, resourceKit);

  return result;
}

/**
 * Route to appropriate service and execute
 *
 * @param {string} mode - Generation mode (ebook, wall-art, demo, etc)
 * @param {Object} payload - Request payload
 * @param {string} resultId - Unique job identifier
 * @param {Object} logger - Logging interface
 * @param {Object} config - Application configuration
 * @returns {Promise<Object>} Service result
 */
async function routeAndExecute(mode, payload, resultId, logger, config) {
  let service;

  switch (mode) {
    case "ebook": {
      service = require("./services/ebookService");
      break;
    }
    case "wall-art": {
      service = require("./services/wallArtService");
      break;
    }
    case "demo":
    default: {
      service = require("./demoService");
      break;
    }
  }

  return executeService(service, payload, resultId, logger, config);
}

module.exports = {
  createResourceKit,
  executeService,
  routeAndExecute,
};
