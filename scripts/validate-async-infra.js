#!/usr/bin/env node

/**
 * validate-async-infra.js
 *
 * Validates that all ASYNC-INFRA components are in place
 * Checks file existence, exports, and basic structure
 *
 * Usage: node scripts/validate-async-infra.js
 */

const fs = require("fs");
const path = require("path");

const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

function log(msg, color = "reset") {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function checkFile(filePath, description) {
  const fullPath = path.join("/workspaces/strawberry", filePath);
  const exists = fs.existsSync(fullPath);
  const icon = exists ? "✅" : "❌";
  log(`${icon} ${description}`, exists ? "green" : "red");
  return exists;
}

function checkFileContent(filePath, searchString, description) {
  const fullPath = path.join("/workspaces/strawberry", filePath);
  if (!fs.existsSync(fullPath)) {
    log(`❌ ${description} (file not found)`, "red");
    return false;
  }

  const content = fs.readFileSync(fullPath, "utf8");
  const found = content.includes(searchString);
  const icon = found ? "✅" : "❌";
  log(`${icon} ${description}`, found ? "green" : "red");
  return found;
}

console.log("\n" + "=".repeat(70));
log("ASYNC-INFRA VALIDATION", "blue");
console.log("=".repeat(70) + "\n");

// ========== File Structure ==========
log("FILE STRUCTURE\n", "blue");

let allFilesExist = true;
allFilesExist &= checkFile(
  "server/helpers/timingResolver.js",
  "timingResolver module"
);
allFilesExist &= checkFile(
  "server/helpers/fifoScheduler.js",
  "fifoScheduler module"
);
allFilesExist &= checkFile(
  "server/helpers/statusManager.js",
  "statusManager module"
);
allFilesExist &= checkFile(
  "server/helpers/index.js",
  "helpers index (exports)"
);
allFilesExist &= checkFile("server/orchestrator.js", "orchestrator module");
allFilesExist &= checkFile(
  "server/utilities/smartPoller.js",
  "smartPoller utility"
);

console.log();

// ========== PART-A Endpoint ==========
log("PART-A ENDPOINT\n", "blue");

let partAValid = true;
partAValid &= checkFileContent(
  "server/index.js",
  'app.post("/api/ebook/generate"',
  "POST /api/ebook/generate endpoint exists"
);
partAValid &= checkFileContent(
  "server/index.js",
  "res.status(202)",
  "Endpoint returns 202 Accepted"
);
partAValid &= checkFileContent(
  "server/index.js",
  "resultId",
  "Endpoint generates resultId"
);
partAValid &= checkFileContent(
  "server/index.js",
  "smartPoller",
  "Endpoint uses smartPoller"
);
partAValid &= checkFileContent(
  "server/index.js",
  ".then((result) =>",
  "Endpoint hands off async"
);

console.log();

// ========== Status Endpoint ==========
log("STATUS ENDPOINT\n", "blue");

let statusValid = true;
statusValid &= checkFileContent(
  "server/index.js",
  'app.get("/api/status/:resultId"',
  "GET /api/status/:resultId endpoint exists"
);
statusValid &= checkFileContent(
  "server/index.js",
  "smartPoller.getStatus",
  "Status endpoint uses smartPoller"
);
statusValid &= checkFileContent(
  "server/index.js",
  "404",
  "Status endpoint returns 404 for unknown resultId"
);

console.log();

// ========== Helpers Framework ==========
log("HELPERS FRAMEWORK\n", "blue");

let helpersValid = true;

// timingResolver
helpersValid &= checkFileContent(
  "server/helpers/timingResolver.js",
  "function compute",
  "timingResolver exports compute()"
);
helpersValid &= checkFileContent(
  "server/helpers/timingResolver.js",
  "totalEta",
  "timingResolver computes totalEta"
);
helpersValid &= checkFileContent(
  "server/helpers/timingResolver.js",
  "schedule",
  "timingResolver computes schedule"
);

// fifoScheduler
helpersValid &= checkFileContent(
  "server/helpers/fifoScheduler.js",
  "function build",
  "fifoScheduler exports build()"
);
helpersValid &= checkFileContent(
  "server/helpers/fifoScheduler.js",
  "calls",
  "fifoScheduler builds calls array"
);

// statusManager
helpersValid &= checkFileContent(
  "server/helpers/statusManager.js",
  "function init",
  "statusManager exports init()"
);
helpersValid &= checkFileContent(
  "server/helpers/statusManager.js",
  "updateProgress",
  "statusManager exports updateProgress()"
);
helpersValid &= checkFileContent(
  "server/helpers/statusManager.js",
  "getStatus",
  "statusManager exports getStatus()"
);

// helpers index
helpersValid &= checkFileContent(
  "server/helpers/index.js",
  "timingResolver",
  "helpers/index exports timingResolver"
);
helpersValid &= checkFileContent(
  "server/helpers/index.js",
  "fifoScheduler",
  "helpers/index exports fifoScheduler"
);
helpersValid &= checkFileContent(
  "server/helpers/index.js",
  "statusManager",
  "helpers/index exports statusManager"
);

console.log();

// ========== Orchestrator ==========
log("ORCHESTRATOR\n", "blue");

let orchestratorValid = true;
orchestratorValid &= checkFileContent(
  "server/orchestrator.js",
  "class Orchestrator",
  "Orchestrator is a class"
);
orchestratorValid &= checkFileContent(
  "server/orchestrator.js",
  "async generate",
  "Orchestrator has generate() method"
);
orchestratorValid &= checkFileContent(
  "server/orchestrator.js",
  "manifest",
  "Orchestrator captures manifest"
);
orchestratorValid &= checkFileContent(
  "server/orchestrator.js",
  "FIFO",
  "Orchestrator enforces FIFO"
);
orchestratorValid &= checkFileContent(
  "server/orchestrator.js",
  "tierToModel",
  "Orchestrator maps tiers to models"
);

console.log();

// ========== SmartPoller ==========
log("SMARTPOLLER UTILITY\n", "blue");

let smartPollerValid = true;
smartPollerValid &= checkFileContent(
  "server/utilities/smartPoller.js",
  "class SmartPoller",
  "SmartPoller is a class"
);
smartPollerValid &= checkFileContent(
  "server/utilities/smartPoller.js",
  "assignTask",
  "SmartPoller has assignTask()"
);
smartPollerValid &= checkFileContent(
  "server/utilities/smartPoller.js",
  "updateProgress",
  "SmartPoller has updateProgress()"
);
smartPollerValid &= checkFileContent(
  "server/utilities/smartPoller.js",
  "getStatus",
  "SmartPoller has getStatus()"
);
smartPollerValid &= checkFileContent(
  "server/utilities/smartPoller.js",
  "markComplete",
  "SmartPoller has markComplete()"
);
smartPollerValid &= checkFileContent(
  "server/utilities/smartPoller.js",
  "markError",
  "SmartPoller has markError()"
);
smartPollerValid &= checkFileContent(
  "server/utilities/smartPoller.js",
  "new SmartPoller()",
  "SmartPoller exports singleton instance"
);

console.log();

// ========== Dependencies ==========
log("DEPENDENCIES\n", "blue");

let depsValid = true;
try {
  const packageJson = JSON.parse(
    fs.readFileSync("/workspaces/strawberry/server/package.json", "utf8")
  );
  depsValid &= !!packageJson.dependencies.uuid;
  log(
    `${depsValid ? "✅" : "❌"} uuid package installed`,
    depsValid ? "green" : "red"
  );
} catch (e) {
  log("❌ Could not read package.json", "red");
  depsValid = false;
}

console.log();

// ========== Test Files ==========
log("TEST FILES\n", "blue");

let testsExist = true;
testsExist &= checkFile("scripts/test-async-part-a.js", "test-async-part-a.js");
testsExist &= checkFile(
  "scripts/test-async-infra-comprehensive.js",
  "test-async-infra-comprehensive.js"
);
testsExist &= checkFile(
  "scripts/test-async-infra-unit.js",
  "test-async-infra-unit.js"
);

console.log();

// ========== Summary ==========
console.log("=".repeat(70));

const allValid =
  allFilesExist &&
  partAValid &&
  statusValid &&
  helpersValid &&
  orchestratorValid &&
  smartPollerValid &&
  depsValid &&
  testsExist;

if (allValid) {
  log(
    "✅ VALIDATION PASSED - All ASYNC-INFRA components are in place!",
    "green"
  );
} else {
  log(
    "❌ VALIDATION FAILED - Some components are missing or incomplete",
    "red"
  );
}

console.log("=".repeat(70) + "\n");

if (allValid) {
  log("Next steps:", "blue");
  console.log("  1. Start the server: npm start (in server directory)");
  console.log("  2. Run comprehensive tests:");
  console.log("     node scripts/test-async-infra-comprehensive.js");
  console.log("  3. Run unit tests:");
  console.log("     node scripts/test-async-infra-unit.js");
  console.log("  4. Monitor logs in another terminal window");
  console.log("  5. Verify all tests pass");
  console.log("  6. Proceed to SERVICE-AUTON phase\n");
}

process.exit(allValid ? 0 : 1);
