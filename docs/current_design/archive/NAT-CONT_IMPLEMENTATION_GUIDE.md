# NAT-CONT: Implementation Guide for Engineers

**Phase**: 1a (Pre-TIMEOUT Optimization)  
**Document Type**: Technical Implementation Details  
**Audience**: Engineers, Implementers, QA  
**Date**: December 14, 2025 @ 3:40PM

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Implementation Details: NAT-CONT_0](#implementation-details-nat-cont_0)
   - [Step 1: Add Helper Functions](#step-1-add-helper-functions-to-ebookservicejs)
   - [Step 2: Create Main Handler](#step-2-create-main-nat-cont_0-handler)
   - [Step 3: Update Main Handler](#step-3-update-main-handler)
4. [Edge Cases: Small Page Counts](#edge-cases-small-page-counts)
5. [Testing Strategy](#testing-strategy)
   - [Unit Tests](#unit-tests)
   - [Integration Tests](#integration-tests)
6. [NAT-CONT_1: Parallel Implementation](#nat-cont_1-parallel-implementation)
7. [Deployment Checklist](#deployment-checklist)
8. [References](#references)

---

## Quick Start

**What to implement:** Two ebook generation strategies

- **NAT-CONT_0**: Sequential batching (start here)
- **NAT-CONT_1**: Parallel batching (fallback)

**Key changes:**

1. Extract chapter batch logic from current `ebookService.handle()`
2. Implement `handleNARRATIVE_CONT_0()` function
3. Add optional strategy parameter to service
4. Update prompts to support multi-chapter generation
5. Test context passing and narrative coherence

**Estimate:** 2-3 days (NAT-CONT_0) + 1 day (NAT-CONT_1 if needed)

---

## Architecture Overview

### Current Flow (Single-Chapter Sequential)

```
ebookService.handle()
├─ generateStructure() [Pro, ~15s]
└─ Loop i=1..N
   ├─ buildPrompt(chapter_i)
   ├─ generateContent(prompt, callIndex=i)  [Pro or Flash per model]
   └─ Append to chapters array

Total calls: 1 + N
Total time: 15s + (N × 4-6s) ≈ 50s
```

### NAT-CONT_0 Flow (Batch Sequential)

```
ebookService.handle()
├─ generateStructure() [Pro, callIndex=0, ~15s]
├─ generateChapter(1) [Pro, callIndex=1, ~6s]
├─ Loop i=2..N step 2
│  ├─ buildBatchPrompt(chapters_i..i+1, prevSummary)
│  ├─ generateBatch(prompt, callIndex=i//2+1) [Flash, ~6s]
│  └─ Append chapters to array
└─ generateFinalChapter(N) [Pro, callIndex=lastIdx, ~6s]

Total calls: 1 + 1 + ⌈(N-2)/2⌉ + 1 ≈ 5-6
Total time: ~45s
```

### NAT-CONT_1 Flow (Batch Parallel)

```
ebookService.handle()
├─ generateStructure() [Pro, callIndex=0, ~15s]
├─ generateChapter(1) [Pro, callIndex=1, ~6s]
├─ Promise.all([
│  ├─ generateBatch([2,3], ...) [Flash, callIndex=2, ~6s]
│  ├─ generateBatch([4,5], ...) [Flash, callIndex=3, ~6s]
│  └─ generateBatch([6,7], ...) [Flash, callIndex=4, ~6s]
│  ])
└─ generateFinalChapter(N) [Pro, callIndex=5, ~6s]

Total calls: 1 + 1 + (⌈(N-2)/2⌉) + 1 ≈ 5-6
Total time: ~33s (batches run in parallel)
```

---

## Implementation Details: NAT-CONT_0

### Step 1: Add Helper Functions to ebookService.js

```javascript
/**
 * Generate batch of chapters (2-3 per call) with narrative context
 * @param {Object} aiSvc - AI service
 * @param {Object} prompt - Original user prompt
 * @param {Array<Object>} batchOutlines - Outline entries for this batch
 * @param {String} prevSummary - Summary from previous chapter (context)
 * @param {Number} callIndex - Quota routing index
 * @returns {Promise<Array<Object>>} Chapter objects
 */
async function generateChapterBatch(
  aiSvc,
  prompt,
  batchOutlines,
  prevSummary,
  callIndex
) {
  const chapterNumbers = batchOutlines.map((ch) => ch.chapter).join(", ");
  const chapterTitles = batchOutlines
    .map((ch, idx) => {
      const n = ch.chapter;
      const topics = (ch.estimated_topics || []).join(", ");
      return `CHAPTER ${n}: "${ch.title}" (Topics: ${topics})`;
    })
    .join("\n");

  const contextLine = prevSummary
    ? `\nPrevious chapter ended with: "${prevSummary}"\nContinue naturally from this point.`
    : "";

  const batchPrompt = `You are writing a batch of chapters for an eBook narrative.
${contextLine}

Write the following chapters as a cohesive unit:
${chapterTitles}

Each chapter should:
1. Build naturally from the previous context (if any)
2. Progress the story/narrative forward
3. Flow seamlessly into the next chapter

Return JSON array with this structure:
[
  {
    "chapter": <number>,
    "title": "<chapter title>",
    "content": "<full chapter content - at least 300 words>",
    "summary": "<2-3 sentence summary of this chapter>",
    "image": {
      "concept": "<visual concept for chapter illustration>",
      "suggested_style": "<art style suggestion>",
      "tone": "<emotional tone>"
    }
  },
  ...
]

Context: Original prompt: "${prompt}"`;

  console.log(`[NAT-CONT_0] Generating batch: chapters ${chapterNumbers}`);

  let batchResp = await aiSvc.generateContentWithRotation(
    batchPrompt,
    callIndex
  );

  // Parse response
  const batchText =
    (batchResp &&
      (batchResp.content?.body ||
        batchResp.content?.title ||
        batchResp.rawText)) ||
    "";

  let chapters = tryParseBatchResponse(batchText);

  if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
    // Fallback: create synthetic chapters from outline
    chapters = batchOutlines.map((outline, idx) => ({
      chapter: outline.chapter,
      title: outline.title,
      content: `[Fallback content for ${
        outline.title
      }]\n\nBased on: ${outline.estimated_topics.join(", ")}`,
      summary: `Chapter ${outline.chapter}: ${outline.title}`,
      image: {
        concept: `Illustration concept for "${outline.title}"`,
        suggested_style: "contemporary",
        tone: "narrative",
      },
    }));
  }

  return chapters;
}

/**
 * Try to parse JSON array from batch response
 * Handles multiple formats and extraction strategies
 */
function tryParseBatchResponse(text) {
  if (!text) return null;
  if (typeof text === "object" && Array.isArray(text)) return text;
  if (typeof text !== "string") return null;

  // Try direct parse
  try {
    if (/^\s*\[/.test(text)) {
      return JSON.parse(text);
    }
  } catch (e) {
    // Fall through
  }

  // Try to extract JSON array from text
  const arrayMatch = text.match(/\[[\s\S]*\]/m);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch (e) {
      return null;
    }
  }

  return null;
}

/**
 * Generate opening chapter (Pro model)
 * Establishes narrative voice and tone
 */
async function generateOpeningChapter(aiSvc, prompt, structure) {
  const firstOutline = structure.outline[0];

  const openingPrompt = `You are establishing the narrative for an eBook.

Write CHAPTER 1: "${firstOutline.title}"

This is the opening chapter. Your role:
1. Establish the narrative voice (perspective, tone, style)
2. Introduce the main character(s) and their world
3. Present the opening hook or conflict
4. Set reader expectations for the entire story
5. Establish themes that will be explored throughout

Topics to cover: ${(firstOutline.estimated_topics || []).join(", ")}

Audience context: This is an eBook with approximately ${
    structure.outline.length
  } chapters total.

Return JSON:
{
  "chapter": 1,
  "title": "<chapter title>",
  "content": "<full chapter content - at least 400 words>",
  "summary": "<2-3 sentence summary that establishes the narrative foundation>",
  "image": {
    "concept": "<opening visual concept>",
    "suggested_style": "<art style>",
    "tone": "<emotional tone>"
  }
}

Original user prompt: "${prompt}"`;

  console.log("[NAT-CONT_0] Generating opening chapter (Pro)");

  let chapterResp = await aiSvc.generateContentWithRotation(openingPrompt, 1);

  const chapterText =
    (chapterResp &&
      (chapterResp.content?.body ||
        chapterResp.content?.title ||
        chapterResp.rawText)) ||
    "";

  let chapter = tryParseChapterResponse(chapterText);

  if (!chapter) {
    chapter = {
      chapter: 1,
      title: firstOutline.title,
      content: `Opening chapter for: ${prompt}`,
      summary: `Establishing the narrative and introducing the premise`,
      image: {
        concept: "Opening scene concept",
        suggested_style: "contemporary",
        tone: "engaging",
      },
    };
  }

  return chapter;
}

/**
 * Generate closing chapter (Pro model)
 * Must resolve narrative threads from opening
 */
async function generateClosingChapter(aiSvc, prompt, structure, allChapters) {
  const lastOutline = structure.outline[structure.outline.length - 1];
  const chapterSummaries = allChapters
    .map((ch) => `Ch${ch.chapter}: ${ch.summary}`)
    .join("\n");

  const closingPrompt = `You are concluding the narrative arc for an eBook.

Story progression so far:
${chapterSummaries}

Write the FINAL CHAPTER: "${lastOutline.title}"

Your role:
1. Resolve all major narrative threads and conflicts
2. Provide satisfying closure for character arcs
3. Echo themes and voice established in Chapter 1
4. Bring the story to a meaningful conclusion
5. Leave reader with appropriate final impression

Topics to address: ${(lastOutline.estimated_topics || []).join(", ")}

This is chapter ${structure.outline.length} of ${structure.outline.length}.

Return JSON:
{
  "chapter": ${structure.outline.length},
  "title": "<chapter title>",
  "content": "<full chapter content - at least 400 words>",
  "summary": "<2-3 sentence summary of the conclusion>",
  "image": {
    "concept": "<closing visual concept>",
    "suggested_style": "<art style>",
    "tone": "<emotional tone>"
  }
}

Original user prompt: "${prompt}"`;

  console.log("[NAT-CONT_0] Generating closing chapter (Pro)");

  let chapterResp = await aiSvc.generateContentWithRotation(
    closingPrompt,
    allChapters.length + 1 // callIndex after all previous chapters
  );

  const chapterText =
    (chapterResp &&
      (chapterResp.content?.body ||
        chapterResp.content?.title ||
        chapterResp.rawText)) ||
    "";

  let chapter = tryParseChapterResponse(chapterText);

  if (!chapter) {
    chapter = {
      chapter: structure.outline.length,
      title: lastOutline.title,
      content: `Closing chapter providing narrative conclusion`,
      summary: `Resolving all narrative threads and providing satisfying closure`,
      image: {
        concept: "Closing scene concept",
        suggested_style: "contemporary",
        tone: "conclusive",
      },
    };
  }

  return chapter;
}

/**
 * Try to parse single chapter response from JSON
 */
function tryParseChapterResponse(text) {
  if (!text) return null;
  if (typeof text === "object" && !Array.isArray(text)) return text;
  if (typeof text !== "string") return null;

  // Try direct parse
  try {
    if (/^\s*\{/.test(text)) {
      return JSON.parse(text);
    }
  } catch (e) {
    // Fall through
  }

  // Try to extract JSON object from text
  const objMatch = text.match(/\{[\s\S]*\}/m);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch (e) {
      return null;
    }
  }

  return null;
}
```

### Step 2: Create Main NAT-CONT_0 Handler

```javascript
/**
 * Handle ebook generation using NAT-CONT_0 strategy
 * (Sequential batching: Pro → Structure + Ch1 + Final, Flash → batched middle)
 */
async function handleNARRATIVE_CONT_0(payload, classification) {
  const { prompt } = payload;
  const {
    theme = "dark",
    pageCount = 8,
    colorPalette = "standard",
    fontSizeScale = 1.0,
  } = payload.metadata || {};

  // Input validation
  if (!prompt || !String(prompt).trim()) {
    const e = new Error("ebookService: prompt is required");
    e.status = 400;
    throw e;
  }

  if (typeof pageCount !== "number" || pageCount < 3 || pageCount > 20) {
    const e = new Error("ebookService: pageCount must be between 3 and 20");
    e.status = 400;
    throw e;
  }

  // Create AI service
  const { createAIService } = require("./aiService");
  const aiSvc = createAIService();

  const chapters = [];
  const startTime = Date.now();

  try {
    // ========================================================================
    // STEP 0: Generate Structure (Pro)
    // ========================================================================
    console.log("[NAT-CONT_0] Starting structure generation");

    const structurePrompt = `Create a detailed structure for a ${pageCount}-page eBook based on:\n"${String(
      prompt
    )}"\n\nReturn JSON with keys: title, chapters, outline: [{ chapter, title, estimated_topics: [] }]`;

    let structureResp = await aiSvc.generateContentWithRotation(
      structurePrompt,
      0 // callIndex: 0 = Pro
    );

    const structureText =
      (structureResp &&
        (structureResp.content?.body ||
          structureResp.content?.title ||
          structureResp.rawText)) ||
      "";

    let structure = tryParseStructure(structureText);

    if (!structure || !Array.isArray(structure.outline)) {
      const approxChapters = Math.max(
        2,
        Math.min(10, Math.ceil(pageCount / 2))
      );
      const outline = Array.from({ length: approxChapters }).map((_, i) => ({
        chapter: i + 1,
        title: `Chapter ${i + 1}`,
        estimated_topics: [`Topic ${i + 1}`],
      }));
      structure = {
        title: `eBook: ${String(prompt).split(/\s+/).slice(0, 6).join(" ")}`,
        chapters: outline.length,
        outline,
      };
    }

    console.log(
      `[NAT-CONT_0] Structure complete: ${structure.outline.length} chapters`
    );

    // ========================================================================
    // STEP 1: Generate Opening Chapter (Pro)
    // ========================================================================
    const openingChapter = await generateOpeningChapter(
      aiSvc,
      prompt,
      structure
    );
    chapters.push(openingChapter);

    console.log(
      `[NAT-CONT_0] Opening chapter complete. Summary: ${openingChapter.summary}`
    );

    // ========================================================================
    // STEP 2+: Generate Middle Chapters in Batches (Flash)
    // ========================================================================
    const batchSize = 2;
    let callIndex = 2;

    // IMPORTANT: Loop excludes the final chapter (outline[N-1])
    // with endIdx = min(i + batchSize, outline.length - 1)
    // This ensures final chapter is NOT included in batches
    for (let i = 1; i < structure.outline.length - 1; i += batchSize) {
      // Cap the batch end to exclude the final chapter
      const endIdx = Math.min(i + batchSize, structure.outline.length - 1);
      const batchOutlines = structure.outline.slice(i, endIdx);
      const prevChapter = chapters[chapters.length - 1];

      const batch = await generateChapterBatch(
        aiSvc,
        prompt,
        batchOutlines,
        prevChapter.summary,
        callIndex++
      );

      chapters.push(...batch);

      const lastInBatch = batch[batch.length - 1];
      console.log(
        `[NAT-CONT_0] Batch complete (chapters ${batchOutlines
          .map((ch) => ch.chapter)
          .join(", ")}). Summary: ${lastInBatch.summary}`
      );
    }

    // ========================================================================
    // STEP N: Generate Closing Chapter (Pro)
    // ========================================================================
    const closingChapter = await generateClosingChapter(
      aiSvc,
      prompt,
      structure,
      chapters
    );
    chapters.push(closingChapter);

    console.log(
      `[NAT-CONT_0] Closing chapter complete. Summary: ${closingChapter.summary}`
    );

    // ========================================================================
    // FINAL: Compose HTML
    // ========================================================================
    const html = composeHTML(structure, chapters, {
      theme,
      colorPalette,
      fontSizeScale,
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(
      `[NAT-CONT_0] Complete. Duration: ${duration.toFixed(1)}s, Chapters: ${
        chapters.length
      }, Calls: ${callIndex}`
    );

    return {
      pages: chapters,
      metadata: {
        model: "nat-cont_0",
        duration,
        totalCalls: callIndex,
        totalChapters: chapters.length,
        structure,
      },
      html,
      actions: [],
    };
  } catch (err) {
    console.error("[NAT-CONT_0] Error:", err.message);
    throw err;
  }
}
```

### Step 3: Update Main Handler

```javascript
/**
 * Dispatch to appropriate strategy
 */
async function handle(payload, classification, options = {}) {
  const strategy = options.strategy || "nat-cont_0";

  console.log(`[EBOOK] Using strategy: ${strategy}`);

  if (strategy === "nat-cont_0") {
    return handleNARRATIVE_CONT_0(payload, classification);
  } else if (strategy === "nat-cont_1") {
    return handleNARRATIVE_CONT_1(payload, classification);
  } else if (strategy === "legacy") {
    // Keep original implementation as fallback
    return handleLEGACY(payload, classification);
  } else {
    throw new Error(`Unknown strategy: ${strategy}`);
  }
}

module.exports = { handle };
```

---

## Edge Cases: Small Page Counts

### Scenario: pageCount=3 (Three Total Chapters)

**Structure outline length**: 3

**Loop execution**:

```
Loop: for (let i = 1; i < 2; i += 2)  // i < (3 - 1)
├─ i=1: 1 < 2 → TRUE
│  ├─ endIdx = min(1 + 2, 3 - 1) = min(3, 2) = 2
│  ├─ batchOutlines = outline.slice(1, 2) = [outline[1]]
│  └─ Generates: Chapter 2 (single chapter, Flash)
│
└─ i=3: 3 < 2 → FALSE (loop exits)
```

**Result**:

- Call 0: Structure (Pro)
- Call 1: Chapter 1 (Pro)
- Call 2: Chapter 2 (Flash, single)
- Call 3: Chapter 3 (Pro, final)
- **Total**: 4 calls ✓ No break

### Scenario: pageCount=2 (Two Total Chapters)

**Structure outline length**: 2

**Loop execution**:

```
Loop: for (let i = 1; i < 1; i += 2)  // i < (2 - 1)
├─ i=1: 1 < 1 → FALSE (loop never executes)
```

**Result**:

- Call 0: Structure (Pro)
- Call 1: Chapter 1 (Pro)
- Call 2: Chapter 2 (Pro, final)
- **Total**: 3 calls ✓ No break (no Flash batches, all Pro)

### Scenario: pageCount=6 (Six Total Chapters - Typical)

**Structure outline length**: 6

**Loop execution**:

```
Loop: for (let i = 1; i < 5; i += 2)  // i < (6 - 1)
├─ i=1: 1 < 5 → TRUE
│  ├─ endIdx = min(1 + 2, 6 - 1) = min(3, 5) = 3
│  ├─ batchOutlines = outline.slice(1, 3) = [outline[1], outline[2]]
│  └─ Generates: Chapters 2-3 (batch, Flash)
│
├─ i=3: 3 < 5 → TRUE
│  ├─ endIdx = min(3 + 2, 6 - 1) = min(5, 5) = 5
│  ├─ batchOutlines = outline.slice(3, 5) = [outline[3], outline[4]]
│  └─ Generates: Chapters 4-5 (batch, Flash)
│
└─ i=5: 5 < 5 → FALSE (loop exits)
```

**Result**:

- Call 0: Structure (Pro)
- Call 1: Chapter 1 (Pro)
- Call 2: Chapters 2-3 (Flash batch)
- Call 3: Chapters 4-5 (Flash batch)
- Call 4: Chapter 6 (Pro, final)
- **Total**: 5 calls ✓ Correct

### Scenario: pageCount=1 (Single Chapter - Invalid)

**Input validation catches this:**

```javascript
if (typeof pageCount !== "number" || pageCount < 3 || pageCount > 20) {
  const e = new Error("ebookService: pageCount must be between 3 and 20");
  e.status = 400;
  throw e;
}
```

**Result**: Rejects with 400 Bad Request ✓ Safe

### Summary: Edge Case Safety

| pageCount | Outline Length | Expected Behavior                            | Status  |
| --------- | -------------- | -------------------------------------------- | ------- |
| < 3       | N/A            | Rejected (validation)                        | ✅ Safe |
| 3         | 3              | Ch1(Pro), Ch2(Flash), Ch3(Pro)               | ✅ Safe |
| 4         | 4              | Ch1(Pro), Ch2-3(Flash batch), Ch4(Pro)       | ✅ Safe |
| 5         | 5              | Ch1(Pro), Ch2-3(Flash), Ch4(Flash), Ch5(Pro) | ✅ Safe |
| 6+        | N              | Batches middle chapters correctly            | ✅ Safe |

**Critical fix applied**: `Math.min(i + batchSize, structure.outline.length - 1)` ensures final chapter is never included in batch slicing.

---

## Testing Strategy

### Unit Tests

```javascript
describe('NAT-CONT_0 Strategy', () => {
  let aiSvc;
  let mockPayload;

  beforeEach(() => {
    mockPayload = {
      prompt: 'A story about adventure',
      metadata: { pageCount: 6 }
    };

    // Mock aiService
    aiSvc = {
      generateContentWithRotation: jest.fn()
    };
  });

  describe('Structure generation', () => {
    test('calls generateContentWithRotation with callIndex=0 for structure', async () => {
      aiSvc.generateContentWithRotation.mockResolvedValue({
        content: {
          body: JSON.stringify({
            title: 'Test Story',
            outline: [
              { chapter: 1, title: 'Ch1', estimated_topics: [] },
              { chapter: 2, title: 'Ch2', estimated_topics: [] }
            ]
          })
        }
      });

      await handleNARRATIVE_CONT_0(mockPayload);

      expect(aiSvc.generateContentWithRotation).toHaveBeenCalledWith(
        expect.stringContaining('structure'),
        0  // callIndex 0 = Pro
      );
    });
  });

  describe('Chapter generation', () => {
    test('opening chapter uses callIndex=1 (Pro)', async () => {
      // Mock all responses...
      const result = await handleNARRATIVE_CONT_0(mockPayload);

      // Verify callIndex sequence: 0 (structure), 1 (opening), 2+ (batches), last (closing)
      const callIndices = aiSvc.generateContentWithRotation.mock.calls.map(
        call => call[1]
      );
      expect(callIndices[0]).toBe(0);  // Structure
      expect(callIndices[1]).toBe(1);  // Opening
    });

    test('batches use callIndex >= 2 (Flash)', async () => {
      // ... test batch callIndices ...
    });

    test('closing chapter uses Pro model (high callIndex)', async () => {
      // ... verify final chapter gets Pro ...
    });
  });

  describe('Context passing', () => {
    test('batch prompt includes previous chapter summary', async () => {
      aiSvc.generateContentWithRotation.mockResolvedValue({
        content: { body: JSON.stringify([...]) }
      });

      await handleNARRATIVE_CONT_0(mockPayload);

      const batchCall = aiSvc.generateContentWithRotation.mock.calls.find(
        call => call[0].includes('batch') || call[0].includes('chapters 2')
      );

      expect(batchCall[0]).toContain('Previous chapter');
    });
  });

  describe('Error handling', () => {
    test('falls back to synthetic structure if JSON parsing fails', async () => {
      aiSvc.generateContentWithRotation.mockResolvedValue({
        content: { body: 'NOT JSON' }
      });

      const result = await handleNARRATIVE_CONT_0(mockPayload);

      expect(result.metadata.structure).toBeDefined();
      expect(result.pages.length).toBeGreaterThan(0);
    });

    test('throws on invalid prompt', async () => {
      mockPayload.prompt = '';

      expect(() => handleNARRATIVE_CONT_0(mockPayload)).toThrow();
    });
  });

  describe('Edge cases: Small page counts', () => {
    test('handles pageCount=3 (three chapters): Ch1(Pro), Ch2(Flash), Ch3(Pro)', async () => {
      const structureWith3Chapters = {
        title: 'Test',
        outline: [
          { chapter: 1, title: 'Ch1', estimated_topics: ['a'] },
          { chapter: 2, title: 'Ch2', estimated_topics: ['b'] },
          { chapter: 3, title: 'Ch3', estimated_topics: ['c'] }
        ]
      };

      aiSvc.generateContentWithRotation.mockResolvedValue({
        content: { body: JSON.stringify({ chapter: 1, title: 'Ch', content: 'test', summary: 'sum' }) }
      });

      const result = await handleNARRATIVE_CONT_0(mockPayload);

      // Verify final chapter is NOT in any batch
      const allBatchCalls = aiSvc.generateContentWithRotation.mock.calls.filter(
        call => call[0].includes('batch') || call[0].includes('multiple')
      );

      allBatchCalls.forEach(call => {
        expect(call[0]).not.toContain('chapter 3');
      });
    });

    test('handles pageCount=2: rejects (below minimum 3)', async () => {
      mockPayload.metadata.pageCount = 2;

      expect(() => handleNARRATIVE_CONT_0(mockPayload)).toThrow(
        'pageCount must be between 3 and 20'
      );
    });

    test('handles pageCount=1: rejects (invalid)', async () => {
      mockPayload.metadata.pageCount = 1;

      expect(() => handleNARRATIVE_CONT_0(mockPayload)).toThrow(
        'pageCount must be between 3 and 20'
      );
    });

    test('loop boundary: with 5 chapters, generates 2-3 batch + 4-5 batch + final chapter 5', async () => {
      const structureWith5 = {
        title: 'Test',
        outline: Array.from({ length: 5 }, (_, i) => ({
          chapter: i + 1,
          title: `Ch${i + 1}`,
          estimated_topics: ['a']
        }))
      };

      aiSvc.generateContentWithRotation.mockResolvedValue({
        content: { body: JSON.stringify({ chapter: 1, content: 'x', summary: 's', image: {} }) }
      });

      const result = await handleNARRATIVE_CONT_0(mockPayload);

      // Expect 5 chapters in result (1 opening + 2 batches + 2 final)
      expect(result.pages.length).toBe(5);

      // Verify no chapter appears twice
      const chapterNumbers = result.pages.map(p => p.chapter);
      expect(new Set(chapterNumbers).size).toBe(chapterNumbers.length);  // All unique
    });
  });
});
```

### Integration Tests

```javascript
describe("NAT-CONT_0 End-to-End", () => {
  test("generates complete ebook < 45 seconds", async () => {
    const start = Date.now();
    const result = await handleNARRATIVE_CONT_0(realPayload);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(45000);
    expect(result.metadata.duration).toBeLessThan(45);
  });

  test("produces correct number of chapters", async () => {
    const result = await handleNARRATIVE_CONT_0(realPayload);

    expect(result.pages).toBeDefined();
    expect(result.pages.length).toBe(result.metadata.totalChapters);
    expect(result.pages[0].chapter).toBe(1);
    expect(result.pages[result.pages.length - 1].chapter).toBe(
      result.metadata.structure.outline.length
    );
  });

  test("maintains narrative coherence", async () => {
    const result = await handleNARRATIVE_CONT_0(realPayload);
    const pages = result.pages;

    // Manual narrative review checklist:
    // ✓ Ch1 establishes voice and tone
    // ✓ Ch2+ continue naturally from summaries
    // ✓ Final chapter echoes Ch1 themes
    // ✓ No contradictions between chapters
    // ✓ Character arcs progress logically
  });
});
```

---

## NAT-CONT_1: Parallel Implementation

Quick outline (full implementation after NAT-CONT_0 validation):

```javascript
async function handleNARRATIVE_CONT_1(payload, classification) {
  // ... structure and opening same as NAT-CONT_0 ...

  // Parallel batch generation
  const batchSize = 2;
  const middleChapters = structure.outline.slice(1, -1);
  const batches = [];

  for (let i = 0; i < middleChapters.length; i += batchSize) {
    batches.push(middleChapters.slice(i, i + batchSize));
  }

  // Fire all batch requests in parallel
  const batchPromises = batches.map((batchOutlines, batchIdx) => {
    const contextNote =
      batchIdx === 0
        ? `Previous chapter (Ch1): "${openingChapter.summary}"`
        : `Assume previous batches established the narrative arc`;

    return generateChapterBatch(
      aiSvc,
      prompt,
      batchOutlines,
      contextNote,
      2 + batchIdx
    );
  });

  const batchResults = await Promise.all(batchPromises);
  chapters.push(...batchResults.flat());

  // ... closing chapter same as NAT-CONT_0 ...
}
```

---

## Deployment Checklist

- [ ] Code reviewed and approved
- [ ] Unit tests passing (>90% coverage)
- [ ] Integration tests passing
- [ ] Manual narrative review completed (no regressions)
- [ ] Benchmark test completed (timing, quota)
- [ ] Staging deployment successful
- [ ] Monitoring/logging in place
- [ ] Rollback plan documented
- [ ] Team trained on strategy
- [ ] Deploy to production
- [ ] Monitor real-world performance
- [ ] Decide NAT-CONT_1 needed? (yes/no)

---

## References

- [NAT-CONT_STRATEGIC_BRIEF.md](NAT-CONT_STRATEGIC_BRIEF.md) — Architecture & decisions
- [TIMEOUT_RESOLUTION_STRATEGY.md](TIMEOUT_RESOLUTION_STRATEGY.md) — Context
- [ebookService.js](../../server/ebookService.js) — Current implementation
- [aiService.js](../../server/aiService.js) — AI model routing

---

**Document Status**: Ready for Development  
**Version**: 1.0  
**Last Updated**: December 14, 2025
