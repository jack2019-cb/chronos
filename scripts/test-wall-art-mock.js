#!/usr/bin/env node
/**
 * Quick test to verify wallArtService parseStyleAnalysis works with mock response
 */

const WallArtService = require("../server/services/wallArtService.js");

// Simulate the mock response
const mockResponse = {
  content: {
    title: "Analysis",
    body: JSON.stringify({
      concept: "Modern art",
      color_palette: ["#FF0000", "#00FF00", "#0000FF"],
      mood: "energetic",
    }),
    layout: "ai-generated",
  },
  metadata: { model: "mock", status: 200 },
};

console.log("Testing wallArtService.parseStyleAnalysis with mock response...");
console.log("Mock response:", JSON.stringify(mockResponse, null, 2));

const result = WallArtService.parseStyleAnalysis(mockResponse);
console.log("Parse result:", result);

if (result && result.concept && Array.isArray(result.color_palette)) {
  console.log("✅ PASS: parseStyleAnalysis works correctly!");
} else {
  console.log("❌ FAIL: parseStyleAnalysis returned:", result);
}
