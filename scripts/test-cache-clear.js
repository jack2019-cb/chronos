#!/usr/bin/env node
/**
 * Test Step 2.2: Cache Clear Endpoint
 */

const http = require("http");

console.log("\n=== Test Step 2.2: Cache Clear Endpoint ===\n");

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/cache/clear",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
};

console.log("Calling POST /api/cache/clear...\n");

const req = http.request(options, (res) => {
  let data = "";

  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    try {
      const response = JSON.parse(data);

      console.log("=== RESPONSE RECEIVED ===\n");
      console.log(`Status Code: ${res.statusCode}`);
      console.log(`Success: ${response.success}`);
      console.log(`Message: ${response.message}`);
      console.log(`Cleared Results: ${response.cleared}`);
      console.log(`Cleared Export Jobs: ${response.jobsCleared}`);

      if (response.success) {
        console.log("\n✅ Cache Clear: SUCCESS");
        console.log(`   - Deleted ${response.cleared} results`);
        console.log(`   - Deleted ${response.jobsCleared} export jobs`);
      } else {
        console.log("\n❌ Cache Clear: FAILED");
        console.log(`   - Error: ${response.error}`);
      }
    } catch (e) {
      console.error("Error parsing response:", e.message);
    }
  });
});

req.on("error", (e) => {
  console.error("Request error:", e.message);
});

req.end();
