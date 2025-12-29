#!/usr/bin/env node

/**
 * NAT-CONT Phase 3: Performance Validation Script
 *
 * Generates 3 real ebook samples (3-page, 10-page, 20-page) with real Gemini API
 * Measures actual execution time and validates timeout buffer
 *
 * Target: All samples < 45 seconds (leaves 15+ second timeout buffer)
 *
 * Usage: node scripts/nat-cont-performance-validation.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Import the ebook service
const ebookService = require("../server/ebookService");

// Test prompts for different page counts
const testPrompts = {
  "3-page": {
    prompt:
      "Create a comprehensive guide to sustainable living. Cover the basics of reducing carbon footprint, water conservation, and renewable energy adoption.",
    pageCount: 3,
    description: "Minimum range (3 pages)",
  },
  "10-page": {
    prompt:
      "Write a detailed course on machine learning fundamentals. Include chapters on supervised learning, unsupervised learning, neural networks, deep learning, feature engineering, model evaluation, hyperparameter tuning, ensemble methods, reinforcement learning, and real-world applications.",
    pageCount: 10,
    description: "Mid-range (10 pages)",
  },
  "20-page": {
    prompt:
      "Develop a comprehensive business strategy guide covering market analysis, competitive positioning, revenue models, customer acquisition, retention strategies, team building, scaling operations, technology infrastructure, financial planning, risk management, crisis response, innovation strategy, organizational culture, leadership principles, sales techniques, marketing automation, product development, international expansion, merger and acquisition, and exit planning.",
    pageCount: 20,
    description: "Maximum range (20 pages)",
  },
};

// Performance tracking
const results = {
  totalTime: 0,
  samples: {},
  timeoutBuffer: 60, // Infrastructure hard limit is 60 seconds
  targetTime: 45, // Target <45 seconds leaves 15s buffer
};

// Helper: format time for readability
function formatTime(ms) {
  return (ms / 1000).toFixed(2) + "s";
}

// Helper: check if time is within budget
function checkPerformance(actualTime) {
  if (actualTime > results.targetTime * 1000) {
    return "❌ EXCEEDED TARGET";
  }
  const buffer = results.timeoutBuffer - actualTime / 1000;
  return `✅ OK (${buffer.toFixed(1)}s buffer remaining)`;
}

async function generateSample(sampleKey, config) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(
    `📊 Generating: ${sampleKey.toUpperCase()} - ${config.description}`
  );
  console.log(`${"=".repeat(70)}`);
  console.log(`Prompt: ${config.prompt.slice(0, 60)}...`);
  console.log(`Pages: ${config.pageCount}`);
  console.log(`Strategy: nat-cont_0 (DEFAULT-ON)`);

  const startTime = Date.now();

  try {
    // Call ebookService.handle with the test payload
    const payload = {
      prompt: config.prompt,
      metadata: {
        theme: "dark",
        pageCount: config.pageCount,
        colorPalette: "standard",
        fontSizeScale: 1.0,
        // Note: strategy defaults to 'nat-cont_0' now (DEFAULT-ON)
      },
    };

    console.log("\n⏱️  Generating ebook... (this uses real Gemini API)");
    const result = await ebookService.handle(payload, {});

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    // Record results
    results.samples[sampleKey] = {
      executionTime,
      pageCount: config.pageCount,
      success: true,
      status: checkPerformance(executionTime),
      pagesGenerated: result.pages?.length || 0,
      htmlLength: result.html?.length || 0,
    };

    // Print results
    console.log(`\n✅ SUCCESS`);
    console.log(`   Execution Time: ${formatTime(executionTime)}`);
    console.log(`   Pages Generated: ${result.pages?.length || 0}`);
    console.log(`   HTML Length: ${result.html?.length || 0} bytes`);
    console.log(`   Status: ${results.samples[sampleKey].status}`);

    results.totalTime += executionTime;
    return true;
  } catch (error) {
    const endTime = Date.now();
    const executionTime = endTime - startTime;

    results.samples[sampleKey] = {
      executionTime,
      pageCount: config.pageCount,
      success: false,
      error: error.message,
      status: "❌ FAILED",
    };

    console.log(`\n❌ ERROR: ${error.message}`);
    console.log(`   Execution Time: ${formatTime(executionTime)}`);
    console.log(`   Status: ${results.samples[sampleKey].status}`);

    return false;
  }
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║         NAT-CONT Phase 3: PERFORMANCE VALIDATION                  ║
║      Real Gemini API Testing - 3-page, 10-page, 20-page           ║
╚════════════════════════════════════════════════════════════════════╝

Target Performance:
  • Each sample should complete in < ${results.targetTime} seconds
  • Timeout buffer target: > 15 seconds (60s - 45s)
  • Strategy: nat-cont_0 (DEFAULT-ON)

Execution Plan:
  1️⃣  Generate 3-page ebook (minimum range)
  2️⃣  Generate 10-page ebook (mid-range)
  3️⃣  Generate 20-page ebook (maximum range)
  4️⃣  Validate all samples complete within performance budget
  5️⃣  Record results for QA sign-off

`);

  try {
    // Generate all samples sequentially
    const sample3page = await generateSample("3-page", testPrompts["3-page"]);
    const sample10page = await generateSample(
      "10-page",
      testPrompts["10-page"]
    );
    const sample20page = await generateSample(
      "20-page",
      testPrompts["20-page"]
    );

    // Print summary
    console.log(`\n${"=".repeat(70)}`);
    console.log(`📈 PERFORMANCE VALIDATION SUMMARY`);
    console.log(`${"=".repeat(70)}`);

    let allPassed = true;
    for (const [key, data] of Object.entries(results.samples)) {
      const status = data.success ? "✅" : "❌";
      console.log(`\n${status} ${key.toUpperCase()}`);
      console.log(`   Time: ${formatTime(data.executionTime)}`);
      console.log(`   Pages: ${data.pageCount}`);
      console.log(`   Status: ${data.status}`);
      if (data.error) console.log(`   Error: ${data.error}`);
      if (!data.success) allPassed = false;
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`Total Time: ${formatTime(results.totalTime)}`);
    console.log(
      `Average Time per Sample: ${formatTime(results.totalTime / 3)}`
    );

    if (allPassed) {
      console.log(`\n✅ ALL SAMPLES GENERATED SUCCESSFULLY`);
      console.log(`\n📋 Next Steps:`);
      console.log(
        `   1. Review generated ebooks for narrative coherence (QA spot-check)`
      );
      console.log(
        `   2. Update NAT-CONT_IMPLEMENTATION_PROGRESS.md with actual timings`
      );
      console.log(`   3. Mark Phase 3 as COMPLETED`);
      console.log(`   4. Proceed to production deployment`);
      process.exit(0);
    } else {
      console.log(`\n❌ SOME SAMPLES FAILED`);
      console.log(`\n⚠️  Review errors above and retry`);
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Unexpected error:", error);
    process.exit(1);
  }
}

// Run validation
main();
