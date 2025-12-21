// Test parsing mock response format
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

// Simulate parseStyleAnalysis logic
function parseStyleAnalysis(response) {
  try {
    const text = typeof response === "string" ? response : String(response);
    const parsed = typeof response === "object" ? response : extractJSON(text);

    if (parsed && parsed.concept && Array.isArray(parsed.color_palette)) {
      return parsed;
    }
  } catch (e) {
    console.error("Error in parseStyleAnalysis:", e);
  }

  return null;
}

function extractJSON(text) {
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (e) {}
  }

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch (e) {}
  }

  return null;
}

console.log("Testing parseStyleAnalysis with mock response...");
const result = parseStyleAnalysis(mockResponse);
console.log("Result:", result);
console.log("Has concept?", result && result.concept);
console.log(
  "Has color_palette array?",
  result && Array.isArray(result.color_palette)
);

if (result && result.concept && Array.isArray(result.color_palette)) {
  console.log("✅ PASS");
} else {
  console.log("❌ FAIL");
}
