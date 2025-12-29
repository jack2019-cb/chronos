#!/usr/bin/env node
/**
 * Detailed Title Debug Test
 */

const http = require("http");

const TEST_PROMPT =
  "Benny the Brave Bunny: A children's story about a bunny who learns courage.";

const postData = JSON.stringify({
  prompt: TEST_PROMPT,
  theme: "light",
  pageCount: 10,
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

const req = http.request(options, (res) => {
  let data = "";

  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    const response = JSON.parse(data);

    console.log("\n=== TITLE DEBUG ===\n");
    console.log("Response title:", response.title);
    console.log("Response metadata.title:", response.metadata?.title);
    console.log("First chapter title:", response.chapters?.[0]?.title);

    console.log("\n=== Full Response Keys ===");
    console.log(Object.keys(response).join(", "));

    console.log("\n=== Full Response (first 1000 chars) ===");
    console.log(JSON.stringify(response, null, 2).substring(0, 1000));
  });
});

req.on("error", (e) => {
  console.error("Request error:", e.message);
});

req.write(postData);
req.end();
