#!/usr/bin/env node
/**
 * Test Step 1: End-to-End HTML Pipeline Testing
 * Tests the 3-layer logging infrastructure and HTML field flow
 */

const http = require("http");

const TEST_PROMPT =
  "Benny the Brave Bunny: A children's story about a bunny who learns courage by exploring the garden and helping friends.";

console.log("\n=== Test Step 1: HTML Pipeline ===\n");
console.log(`Prompt: ${TEST_PROMPT.substring(0, 60)}...\n`);

const postData = JSON.stringify({
  prompt: TEST_PROMPT,
  theme: "light",
  pageCount: 10,
  colorPalette: "default",
  fontSizeScale: 1.0,
});

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/ebook/generate",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(postData),
  },
};

console.log("Sending POST /api/ebook/generate...\n");

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
      console.log(`Response ID: ${response.id}`);
      console.log(`Response ResultID: ${response.resultId}`);

      // Step 1.2 & 1.3: Check html field
      console.log("\n=== HTML Field Check ===");
      console.log(`✓ HTML Present: ${!!response.html}`);
      console.log(
        `✓ HTML Length: ${response.html ? response.html.length : "NULL"} bytes`
      );
      if (response.html && response.html.length > 5000) {
        console.log(`✓ HTML Size Valid: YES (> 5000 bytes)`);
      } else {
        console.log(`✗ HTML Size Invalid: NO (expected > 5000 bytes)`);
      }

      // Step 3.1 & 3.2: Check title field
      console.log("\n=== Title Field Check ===");
      console.log(`✓ Title Present: ${!!response.title}`);
      console.log(`✓ Title Value: "${response.title || "NOT SET"}"`);
      if (response.title && response.title !== "Generated E-book") {
        console.log(`✓ Title Actual: YES (not placeholder)`);
      } else {
        console.log(`✗ Title Actual: NO (shows placeholder)`);
      }

      // Check chapters
      console.log("\n=== Chapters Check ===");
      console.log(`✓ Chapters Array: ${Array.isArray(response.chapters)}`);
      console.log(`✓ Chapter Count: ${response.chapters?.length || 0}`);

      // Check metadata
      console.log("\n=== Metadata Check ===");
      console.log(`✓ Theme: ${response.metadata?.theme || "NOT SET"}`);
      console.log(`✓ Page Count: ${response.metadata?.pageCount || "NOT SET"}`);

      // Final summary
      console.log("\n=== TEST SUMMARY ===");
      const htmlOk = response.html && response.html.length > 5000;
      const titleOk = response.title && response.title !== "Generated E-book";
      const chaptersOk =
        Array.isArray(response.chapters) && response.chapters.length > 0;

      console.log(
        `${htmlOk ? "✅" : "❌"} HTML Pipeline: ${htmlOk ? "PASS" : "FAIL"}`
      );
      console.log(
        `${titleOk ? "✅" : "❌"} Title Display: ${titleOk ? "PASS" : "FAIL"}`
      );
      console.log(
        `${chaptersOk ? "✅" : "❌"} Chapters: ${chaptersOk ? "PASS" : "FAIL"}`
      );

      if (htmlOk && titleOk && chaptersOk) {
        console.log("\n🎉 Step 1 & 3: ALL TESTS PASSED\n");
      } else {
        console.log("\n⚠️ Step 1 & 3: SOME TESTS FAILED\n");
      }

      // Show HTML preview (first 200 chars)
      if (response.html) {
        console.log("=== HTML Preview ===");
        console.log(response.html.substring(0, 300) + "...\n");
      }
    } catch (e) {
      console.error("Error parsing response:", e.message);
      console.error("Raw response:", data.substring(0, 500));
    }
  });
});

req.on("error", (e) => {
  console.error("Request error:", e.message);
  process.exit(1);
});

req.write(postData);
req.end();
