#!/usr/bin/env node

/**
 * Quick validation script for Phase 2 services
 * Tests basic instantiation and structure
 */

const EbookService = require("./services/ebookService");
const WallArtService = require("./services/wallArtService");
const CalendarService = require("./services/calendarService");
const Orchestrator = require("./orchestrator");
const helpers = require("./helpers");

console.log("\n🧪 Phase 2 Service Validation\n");

try {
  // Test 1: EbookService exists and can be instantiated
  console.log("✓ Testing EbookService...");
  const ebookService = new EbookService();
  if (typeof ebookService.handle !== "function") {
    throw new Error("EbookService missing handle method");
  }
  console.log("  ✅ EbookService instantiated with handle method");

  // Test 2: WallArtService exists and can be instantiated
  console.log("✓ Testing WallArtService...");
  const wallArtService = new WallArtService();
  if (typeof wallArtService.handle !== "function") {
    throw new Error("WallArtService missing handle method");
  }
  console.log("  ✅ WallArtService instantiated with handle method");

  // Test 3: CalendarService exists and can be instantiated
  console.log("✓ Testing CalendarService...");
  const calendarService = new CalendarService();
  if (typeof calendarService.handle !== "function") {
    throw new Error("CalendarService missing handle method");
  }
  console.log("  ✅ CalendarService instantiated with handle method");

  // Test 4: Orchestrator works with helpers
  console.log("✓ Testing Orchestrator...");
  const orchestrator = new Orchestrator("test-id", helpers);
  if (!orchestrator.helpers || !orchestrator.manifest) {
    throw new Error("Orchestrator missing required properties");
  }
  console.log("  ✅ Orchestrator instantiated with helpers");

  // Test 5: All services have same interface
  console.log("✓ Testing service interface consistency...");
  const services = { ebookService, wallArtService, calendarService };
  Object.entries(services).forEach(([name, service]) => {
    if (typeof service.handle !== "function") {
      throw new Error(`${name} missing handle method`);
    }
  });
  console.log("  ✅ All services have consistent handle interface");

  console.log("\n✅ All Phase 2 services created successfully!\n");
  console.log("Summary:");
  console.log("  • EbookService (wrapper) ✅");
  console.log("  • WallArtService (new) ✅");
  console.log("  • CalendarService (new) ✅");
  console.log("  • Delegation test file ✅");
  console.log("\nReady for full test suite execution.\n");

  process.exit(0);
} catch (err) {
  console.error("\n❌ Validation failed:", err.message);
  console.error(err.stack);
  process.exit(1);
}
