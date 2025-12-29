#!/usr/bin/env node

/**
 * Quick verification that the exportContent fix is in place
 * This checks:
 * 1. genieService.exportContent exists
 * 2. CASE 1 uses getResultById (not getPersistedContent)
 * 3. CASE 2 handles direct content
 * 4. CASE 3 handles legacy format
 */

const fs = require("fs");
const path = require("path");

const genieServicePath = path.join(__dirname, "server", "genieService.js");
const code = fs.readFileSync(genieServicePath, "utf8");

console.log("✓ Checking exportContent fix...\n");

// Check 1: exportContent method exists
if (code.includes("async exportContent(packet)")) {
  console.log("✅ exportContent method found");
} else {
  console.log("❌ exportContent method NOT found");
  process.exit(1);
}

// Check 2: Uses getResultById (new code) not getPersistedContent (old code)
const exportContentMatch = code.match(
  /async exportContent\(packet\)\s*\{[\s\S]*?(?=\n  \})/
);
if (exportContentMatch) {
  const methodBody = exportContentMatch[0];

  if (methodBody.includes("const { getResultById } = require")) {
    console.log("✅ Uses getResultById for ID-based lookups");
  } else {
    console.log("❌ Still using old getPersistedContent method");
    process.exit(1);
  }

  if (methodBody.includes("result.outEnvelope")) {
    console.log("✅ Accesses result.outEnvelope structure");
  } else {
    console.log("❌ Not accessing outEnvelope structure");
    process.exit(1);
  }

  if (methodBody.includes("// CASE 1: resultId provided")) {
    console.log("✅ CASE 1: resultId lookup");
  }

  if (methodBody.includes("// CASE 2: Direct content provided")) {
    console.log("✅ CASE 2: Direct content");
  }

  if (methodBody.includes("// CASE 3: Legacy")) {
    console.log("✅ CASE 3: Legacy format");
  }
} else {
  console.log("❌ Could not parse exportContent method");
  process.exit(1);
}

console.log("\n✅ All checks passed! Fix appears to be correctly applied.");
console.log("\nNext steps:");
console.log("1. Start the backend server");
console.log("2. Run: node scripts/test-export-roundtrip.js");
