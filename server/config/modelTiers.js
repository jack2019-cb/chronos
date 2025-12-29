/**
 * Model Tier Configuration
 *
 * Tiers abstract away specific model names, allowing:
 * - Easy model swaps (change env vars, not code)
 * - Multi-model strategies (expert vs standard)
 * - Future-proof design (models change, code doesn't)
 *
 * Usage:
 *   const tiers = require('./config/modelTiers');
 *   const expertModel = tiers.expert;  // from env or default
 */

const MODEL_TIERS = {
  // Expert tier: highest quality, full reasoning
  // Used for structural decisions, narrative quality, content polish
  expert: process.env.EXPERT_MODEL || "gemini-2.5-pro",

  // Standard tier: good quality, optimized for volume
  // Used for middle content generation, bulk processing
  standard: process.env.STANDARD_MODEL || "gemini-2.5-flash",

  // Fallback: if only one model available, use for both tiers
  // (genieService handles graceful degradation)
  fallback: process.env.FALLBACK_MODEL || "gemini-2.5-pro",
};

module.exports = MODEL_TIERS;
