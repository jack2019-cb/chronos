/**
 * PERF-VALIDATE Configuration
 * Test baselines, acceptance criteria, and performance thresholds
 *
 * Branch: PERF-VALIDATE_02
 * Date: December 29, 2025
 */

const PERF_CONFIG = {
  /**
   * Performance Thresholds (in milliseconds)
   */
  performance: {
    // Ebook generation: 3-page should complete in < 30 seconds
    ebook_3page_max_ms: 30000,
    ebook_3page_description: "3-page ebook completion time",

    // Ebook generation: 10-page should complete in < 50 seconds
    ebook_10page_max_ms: 50000,
    ebook_10page_description: "10-page ebook completion time",

    // HTTP response time (PART-A: async acceptance)
    http_async_response_max_ms: 150,
    http_async_response_description: "PART-A async acceptance response time",

    // Status polling should be fast
    status_poll_max_ms: 100,
    status_poll_description: "Status endpoint response time",

    // Progress update should be < 10ms
    progress_update_max_ms: 10,
    progress_update_description: "Progress tracking update time",
  },

  /**
   * Rate-Limit Compliance (in milliseconds)
   */
  rateLimits: {
    // Gemini Pro model: 2 requests per minute = 1 request per 30 seconds
    // But we use conservative spacing: 250ms between expert (Pro) calls
    expertSpacing_min_ms: 240, // Allow 240ms minimum (10% tolerance)
    expertSpacing_expected_ms: 250,
    expertSpacing_description: "Pro model (expert tier) spacing",

    // Gemini Flash model: 15 requests per minute = 1 request per 4 seconds
    // But we use conservative spacing: 100ms between standard (Flash) calls
    standardSpacing_min_ms: 90, // Allow 90ms minimum (10% tolerance)
    standardSpacing_expected_ms: 100,
    standardSpacing_description: "Flash model (standard tier) spacing",

    // No 429 errors expected in normal operation
    max_429_errors_allowed: 0,
    rate_limit_violation_description: "Rate-limit (429) error count",
  },

  /**
   * Manifest Protocol Validation
   */
  manifest: {
    // Manifest MUST be sent on first call
    first_call_requires_manifest: true,
    first_call_manifest_description:
      "Manifest required on first orchestrator call",

    // Manifest structure validation
    required_fields: ["totalRequests", "sequence"],
    manifest_fields_description: "Manifest required fields",

    // Sequence validation
    sequence_must_match_total: true,
    sequence_match_description: "Sequence length must equal totalRequests",

    // Tier validation
    valid_tiers: ["expert", "standard"],
    tier_validation_description: "Only 'expert' and 'standard' tiers allowed",
  },

  /**
   * ETA Accuracy Validation
   */
  eta: {
    // ETA should be computed on first call
    eta_computed_on_first_call: true,
    eta_first_call_description: "ETA must be computed when manifest received",

    // ETA accuracy: within 20% of actual time
    max_deviation_percent: 20,
    eta_accuracy_description:
      "ETA should be within 20% of actual completion time",

    // ETA should be available via status endpoint
    status_includes_eta: true,
    status_eta_description: "Status endpoint must include current ETA",

    // Progress should be trackable
    progress_granularity_calls: 1, // Update after each API call
    progress_granularity_description: "Progress updates after each API call",
  },

  /**
   * Timeout Prevention Validation
   */
  timeout: {
    // Infrastructure timeout (typical: 60 seconds)
    infrastructure_timeout_ms: 60000,
    infrastructure_timeout_description:
      "Infrastructure kills connection at ~60s",

    // Buffer time: must complete before infrastructure timeout
    // For 50-page ebook, should complete well before 60s
    completion_margin_ms: 10000, // 10s safety margin
    timeout_prevention_description: "Must complete with 10s safety margin",
  },

  /**
   * Test Sample Data
   */
  samples: {
    // 3-page ebook: should take ~18-23 seconds
    ebook_3page: {
      mode: "ebook",
      prompt:
        "Write a 3-page ebook about sustainable solar energy systems, including installation, maintenance, and cost analysis",
      theme: "dark",
      pageCount: 3,
      expectedCalls: 3, // 1 (structure) + 1 (opening) + 1 (chapters/closing)
      expectedTierSequence: ["expert", "expert", "standard"],
    },

    // 10-page ebook: should take ~40-45 seconds
    ebook_10page: {
      mode: "ebook",
      prompt:
        "Write a comprehensive 10-page ebook about machine learning fundamentals, including neural networks, training algorithms, and real-world applications",
      theme: "light",
      pageCount: 10,
      expectedCalls: 6, // 1 (structure) + 1 (opening) + 4 (chapters) + (closing included)
      expectedTierSequence: [
        "expert",
        "expert",
        "standard",
        "standard",
        "standard",
        "standard",
      ],
    },

    // Concurrent stress test: 5 simultaneous requests
    concurrent_count: 5,
    concurrent_pageCount: 3,
  },

  /**
   * Helper Functions
   */
  getDescription(category, key) {
    if (PERF_CONFIG[category] && PERF_CONFIG[category][key]) {
      const entry = PERF_CONFIG[category][key];
      return entry.description || entry;
    }
    return "Unknown configuration";
  },

  /**
   * Get all performance thresholds for reporting
   */
  getAllThresholds() {
    const thresholds = {};
    Object.entries(PERF_CONFIG).forEach(([category, values]) => {
      if (typeof values === "object" && !Array.isArray(values)) {
        thresholds[category] = values;
      }
    });
    return thresholds;
  },
};

export default PERF_CONFIG;
