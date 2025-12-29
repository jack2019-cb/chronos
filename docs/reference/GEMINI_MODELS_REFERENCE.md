# Gemini 2.5 Models Reference

**Date**: December 11, 2025  
**Status**: Reference Documentation  
**Purpose**: Model specifications, capabilities, and usage patterns for Gemini 2.5 Pro and Flash

---

## Overview

Google's Gemini 2.5 series consists of two complementary models optimized for different use cases:

- **Gemini 2.5 Pro**: Advanced reasoning, complex analysis, multimodal
- **Gemini 2.5 Flash**: Fast inference, cost-efficient, high-volume tasks

Both models support **unified multimodal payloads** (text + images) using the same API structure.

---

## Model Specifications

### Gemini 2.5 Pro

| Property           | Value                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Model ID**       | `gemini-2.5-pro`                                                                         |
| **API Endpoint**   | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent` |
| **Input Types**    | Text, Images (JPEG, PNG, WebP, GIF)                                                      |
| **Context Window** | 1M tokens                                                                                |
| **Output Limit**   | 8K tokens                                                                                |
| **Latency**        | ~3-5 seconds (depends on complexity)                                                     |
| **Cost**           | Higher per-request                                                                       |
| **Strengths**      | Complex reasoning, structured output, visual analysis                                    |
| **Best For**       | Strategic decisions, complex planning, detailed analysis                                 |

### Gemini 2.5 Flash

| Property           | Value                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| **Model ID**       | `gemini-2.5-flash`                                                                         |
| **API Endpoint**   | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` |
| **Input Types**    | Text, Images (JPEG, PNG, WebP, GIF)                                                        |
| **Context Window** | 1M tokens                                                                                  |
| **Output Limit**   | 4K tokens                                                                                  |
| **Latency**        | ~500ms - 1 second (very fast)                                                              |
| **Cost**           | Lower per-request (cheaper)                                                                |
| **Strengths**      | Speed, efficiency, narrative content                                                       |
| **Best For**       | High-volume tasks, real-time responses, creative content                                   |

---

## Capability Matrix

| Capability                   | Pro             | Flash        | Notes                                |
| ---------------------------- | --------------- | ------------ | ------------------------------------ |
| **Text Processing**          | ✅ Excellent    | ✅ Excellent | Both handle long documents           |
| **Image Understanding**      | ✅ Advanced     | ✅ Good      | Pro has better visual reasoning      |
| **Structured Output (JSON)** | ✅ Excellent    | ✅ Good      | Both can produce JSON                |
| **Multi-turn Conversations** | ✅ Yes          | ✅ Yes       | Both support conversation history    |
| **System Instructions**      | ✅ Yes          | ✅ Yes       | New in 2.5 series                    |
| **Vision/Image Analysis**    | ✅ Expert-level | ✅ Capable   | Pro handles complex visual reasoning |
| **Code Generation**          | ✅ Excellent    | ✅ Good      | Pro better for complex logic         |
| **Creative Writing**         | ✅ Excellent    | ✅ Excellent | Both are strong                      |
| **Translation**              | ✅ Yes          | ✅ Yes       | Flash sufficient for most cases      |
| **Summarization**            | ✅ Yes          | ✅ Excellent | Flash perfect for this               |

---

## Recommended Usage Patterns

### Use Gemini 2.5 Pro When:

- ✅ Analyzing complex documents or images
- ✅ Generating structured outlines/specifications
- ✅ Visual reasoning (e.g., "Extract data from screenshot")
- ✅ Complex decision-making logic
- ✅ Detailed analysis or strategic planning
- ✅ High accuracy is critical

**Example**: Generating eBook table of contents from topic

### Use Gemini 2.5 Flash When:

- ✅ Generating narrative content (chapters, stories)
- ✅ Simple text processing
- ✅ High-volume requests (many chapters)
- ✅ Fast response needed
- ✅ Cost is a factor
- ✅ Task doesn't require expert-level reasoning

**Example**: Generating chapter content from outline

### When Both Can Use Flash:

- Image understanding for **simple** tasks (caption photos, describe scenes)
- This saves money while maintaining good quality

### Never Use Flash For:

- ❌ Complex visual reasoning (detailed diagram analysis)
- ❌ Tasks requiring expert-level accuracy
- ❌ Strategic/architectural decisions

---

## Payload Structure (Unified Format)

### Standard Multimodal Request

Both Pro and Flash use identical structure:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Your prompt here..."
        },
        {
          "inline_data": {
            "mime_type": "image/jpeg",
            "data": "BASE64_ENCODED_IMAGE"
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "topK": 32,
    "topP": 1,
    "maxOutputTokens": 1000
  }
}
```

### Key Elements:

- **contents**: Array of conversation turns
- **role**: "user" for prompts, "model" for responses
- **parts**: Mix of text and inline images
- **inline_data**: Base64 image with MIME type

---

## Generation Config Recommendations

### For Pro (Complex Reasoning)

```javascript
{
  "temperature": 0.4,        // Lower = more focused/deterministic
  "topK": 32,
  "topP": 1,
  "maxOutputTokens": 4096    // Allow detailed output
}
```

**Rationale**:

- Lower temperature for structured, repeatable output
- Higher token limit for detailed analysis
- Better for outlines, specifications, complex reasoning

### For Flash (Creative/Narrative)

```javascript
{
  "temperature": 0.7,        // Higher = more creative
  "topK": 32,
  "topP": 1,
  "maxOutputTokens": 2048    // Sufficient for chapters
}
```

**Rationale**:

- Moderate-high temperature for engaging narratives
- Reasonable token limit (fast response)
- Better for story content, creative writing

---

## System Instructions (Best Practice)

Set instructions at top level for all requests. This is more efficient than including in user prompt:

```json
{
  "system_instruction": {
    "parts": {
      "text": "You are a professional eBook writer. Always respond in valid JSON format with the specified fields."
    }
  },
  "contents": [...]
}
```

**Benefits**:

- ✅ More token-efficient
- ✅ Clearer separation of concerns
- ✅ Consistent behavior across turns
- ✅ System prompt doesn't count against output tokens

---

## Free Tier Quotas

| Metric              | Limit                           |
| ------------------- | ------------------------------- |
| **Requests/minute** | 20 (combined across all models) |
| **Requests/day**    | 1,500                           |
| **Tokens/minute**   | 32,000                          |
| **Tokens/day**      | 1,000,000                       |

**Important**: The 20 requests/minute quota is **shared** across Pro and Flash. Choosing the right model helps you stay within limits.

---

## Cost Comparison (Estimated)

| Model     | Input            | Output          |
| --------- | ---------------- | --------------- |
| **Pro**   | ~$2.50/M tokens  | ~$10/M tokens   |
| **Flash** | ~$0.075/M tokens | ~$0.30/M tokens |

**Note**: Flash is 30-50x cheaper than Pro per token.

For an eBook with structure (Pro) + 3 chapters (Flash):

- Structure: ~500 input tokens, ~200 output tokens on Pro
- Chapters: ~1500 input tokens, ~3000 output tokens on Flash
- **Total cost**: Fraction of a penny (free tier)

---

## Implementation in Aether

### Structure Generation

```javascript
// Use Pro for outline generation
callGemini({
  prompt: "Create structure for eBook...",
  callIndex: 0, // Maps to Pro
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 4096,
  },
});
```

### Chapter Generation

```javascript
// Use Flash for chapter content
callGemini({
  prompt: "Write chapter content...",
  callIndex: 1, // Maps to Flash
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 2048,
  },
});
```

---

## Quota Distribution Strategy

**Aether's eBook Generation (3 pages):**

```
Call 0 (Structure)    → Pro   → 1 request, ~700 tokens total
Call 1 (Chapter 1)    → Flash → 1 request, ~1500 tokens total
Call 2 (Chapter 2)    → Flash → 1 request, ~1500 tokens total
Call 3 (Chapter 3)    → Flash → 1 request, ~1500 tokens total
                                ─────────────────────────────
TOTAL                          4 requests / 20 limit ✓
                               ~5200 tokens / 32k limit ✓
```

**Result**: Single API key efficiently serves structure + chapters with quota safety margin.

---

## Multimodal Capabilities

### Both Models Support:

- **JPEG images** (up to 20MB each)
- **PNG images**
- **WebP images**
- **GIF images**
- **Multiple images** per request (up to reasonable limits)

### Implementation:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "Describe these images..." },
        { "inline_data": { "mime_type": "image/jpeg", "data": "..." } },
        { "inline_data": { "mime_type": "image/jpeg", "data": "..." } }
      ]
    }
  ]
}
```

### Future Use Cases for Aether:

1. **Chapter reference images**: Users provide images, Flash describes them
2. **Complex diagrams**: Pro analyzes technical diagrams for accuracy
3. **Visual brand consistency**: Pro reviews generated images against style guide

---

## Performance Benchmarks

| Task                     | Pro  | Flash     | Difference                   |
| ------------------------ | ---- | --------- | ---------------------------- |
| Simple text (100 words)  | 2-3s | 300-500ms | **Flash 5-10x faster**       |
| Complex reasoning        | 4-5s | 3-4s      | **Pro handles better**       |
| Image caption            | 2-3s | 1-2s      | **Flash adequate**           |
| JSON output (500 tokens) | 3-4s | 1-2s      | **Flash sufficient**         |
| Table of contents        | 4-5s | 2-3s      | **Pro needed for structure** |

---

## Transition Notes from Older Models

### From 1.0-pro-vision:

- ✅ Unified payload structure (no more separate vision/text endpoints)
- ✅ Simpler multimodal (everything in parts array)
- ✅ System instructions (new feature)
- ✅ Much faster inference
- ✅ Better accuracy

### Breaking Changes:

- ❌ Old stateless request patterns don't apply
- ❌ Must use new parts array structure
- ❌ Different model IDs

---

## References

- **Gemini API Docs**: https://ai.google.dev/gemini-api/docs
- **Vision Capabilities**: https://ai.google.dev/gemini-api/docs/vision
- **System Instructions**: https://ai.google.dev/gemini-api/docs/system-instructions
- **Pricing**: https://ai.google.dev/pricing

---

## Decision Tree: Which Model to Use?

```
Does task require complex reasoning?
├─ YES → Use Pro
│   └─ Outline generation ✓
│   └─ Strategic planning ✓
│   └─ Complex visual analysis ✓
└─ NO → Use Flash
    └─ Narrative content ✓
    └─ Simple descriptions ✓
    └─ High-volume requests ✓

Budget constraint?
├─ YES → Prefer Flash when possible
└─ NO → Use Pro for accuracy-critical tasks
```

---

**Owner**: Reference Documentation  
**Last Updated**: December 11, 2025  
**Status**: 🟢 CURRENT AND AUTHORITATIVE
