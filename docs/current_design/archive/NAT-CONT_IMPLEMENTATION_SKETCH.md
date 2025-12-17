# NAT-CONT Implementation Sketch

**Phase**: 1a (Optimization - Pre-TIMEOUT resolution)  
**Name**: NAT-CONT_0 (Narrative Continuity Zero - Batch Sequential)  
**Alternative**: NAT-CONT_1 (Narrative Continuity One - Batch Parallel)  
**Date**: December 14, 2025 @ 3:15PM
**Purpose**: Maintain narrative coherence while reducing sequential API calls and processing time

---

## Table of Contents

1. [Strategic Model Assignment](#strategic-model-assignment)
2. [Execution Timeline: NAT-CONT_0](#execution-timeline-nat-cont_0-sequential-batching)
3. [Pseudocode: NAT-CONT_0 Implementation](#pseudocode-nat-cont_0-implementation)
4. [Alternative Execution: NAT-CONT_1](#alternative-execution-nat-cont_1-batch-parallel)
5. [Integration Points with Existing Code](#integration-points-with-existing-code)
6. [Quota Tracking Compatibility](#quota-tracking-compatibility)
7. [Testing Strategy](#testing-strategy)
   - [Unit Tests](#unit-tests)
   - [Integration Tests](#integration-tests)
8. [Success Metrics](#success-metrics)
9. [Decision Tree](#decision-tree)
10. [Implementation Checklist](#implementation-checklist-for-nat-cont_0)
11. [References](#references)

---

## Strategic Model Assignment

```
Pro Model (Narrative Architect)
├─ Structure: "Design the complete narrative arc"
├─ Chapter 1: "Establish voice, world, opening hook"
└─ Final Chapter: "Conclude narrative arc from opening"

Flash Model (Content Batches)
├─ Batch 1: Chapters 2-3 (context: Ch1 summary)
├─ Batch 2: Chapters 4-5 (context: Ch2-3 summary)
└─ Batch N: Remaining chapters (context: previous summary)
```

**Why this assignment:**

- Pro "owns" narrative skeleton (structure → opening → closing)
- Pro ensures thematic/plot coherence across entire arc
- Flash handles volume efficiently (middle chapters are content execution, not design)
- Context remains linear: Ch1 → (Ch2+Ch3) → (Ch4+Ch5) → ... → Final

---

## Execution Timeline: NAT-CONT_0 (Sequential Batching)

```
T=0s    Call 0 (Pro): generateStructure()
        ├─ Input: prompt, pageCount
        ├─ Output: structure { title, chapters: N, outline: [...] }
        ├─ Duration: 10-15s
        └─ Callindex: 0 (Pro)

T=15s   Call 1 (Pro): generateChapter(1)
        ├─ Input: prompt, structure, chapterIndex=1
        ├─ Output: { chapter: 1, title, content, summary, image }
        ├─ Duration: 4-6s
        ├─ Callindex: 1 (Pro, not Flash!)
        └─ Context: None (opening)

T=21s   Call 2 (Flash): generateBatch([2, 3])
        ├─ Input: prompt, structure, chapters=[2,3], prevSummary=Ch1.summary
        ├─ Prompt: "Generate chapters 2 and 3 as cohesive continuation.
        │           Chapter 1 established: [Ch1.summary]"
        ├─ Output: [{ chapter: 2, ... }, { chapter: 3, ... }]
        ├─ Duration: 4-6s
        ├─ Callindex: 2 (Flash)
        └─ Context: Ch1 summary (single context boundary)

T=27s   Call 3 (Flash): generateBatch([4, 5])
        ├─ Input: prompt, structure, chapters=[4,5], prevSummary=Ch3.summary
        ├─ Prompt: "Continue from chapter 3 which concluded: [Ch3.summary]"
        ├─ Output: [{ chapter: 4, ... }, { chapter: 5, ... }]
        ├─ Duration: 4-6s
        ├─ Callindex: 3 (Flash)
        └─ Context: Ch3 summary (linear progression)

T=33s   Call 4 (Flash): generateBatch([6, 7]) [if N chapters > 5]
        ├─ Input: prompt, structure, chapters=[6,7], prevSummary=Ch5.summary
        ├─ Duration: 4-6s
        ├─ Callindex: 4 (Flash)
        └─ Context: Ch5 summary

T=39s   Call 5 (Pro): generateFinalChapter(N)
        ├─ Input: prompt, structure, chapterIndex=N, allPrevSummaries
        ├─ Prompt: "Conclude the narrative arc. Story so far: [consolidated summary].
        │           Bring all threads from opening to this climax."
        ├─ Output: { chapter: N, title, content, summary, image }
        ├─ Duration: 4-6s
        ├─ Callindex: 5 (Pro)
        └─ Context: All previous summaries (Pro sees full arc)

T=45s   COMPLETE
        ├─ Total time: 45s (down from 50s+)
        ├─ Timeout buffer: 15s (up from 5-10s)
        └─ Calls: 5-6 (down from 8-10)
```

---

## Pseudocode: NAT-CONT_0 Implementation

```javascript
async function handleNARRATIVE_CONT_0(payload, classification) {
  const { prompt } = payload;
  const { pageCount = 8 } = payload.metadata || {};

  const aiSvc = createAIService();
  const chapters = [];

  // ============================================================================
  // STEP 0: Structure (Pro) - Sets up narrative arc
  // ============================================================================
  const structure = await aiSvc.generateContentWithRotation(
    `Create a detailed structure for a ${pageCount}-page eBook.
     ${prompt}
     Return JSON: { title, chapters: N, outline: [{ chapter, title, topics }] }`,
    0 // callIndex: 0 = Pro
  );

  console.log(`[NAT-CONT_0] Structure: ${structure.outline.length} chapters`);

  // ============================================================================
  // STEP 1: Chapter 1 (Pro) - Narrative anchor and voice
  // ============================================================================
  const ch1Outline = structure.outline[0];
  const chapter1 = await aiSvc.generateContentWithRotation(
    `You are establishing the narrative for this eBook.
     Write CHAPTER 1: "${ch1Outline.title}"
     
     This is the opening. Establish:
     - Narrative voice and perspective
     - World/setting foundations
     - Main character introduction
     - Opening hook/conflict
     
     Topics: ${ch1Outline.topics.join(", ")}
     
     Return JSON: { 
       chapter: 1, 
       title: string, 
       content: string, 
       summary: string (2-3 sentences),
       image: { concept, suggested_style, tone }
     }`,
    1 // callIndex: 1 = Pro (not Flash!)
  );

  chapters.push(chapter1);
  console.log(`[NAT-CONT_0] Chapter 1 complete. Summary: ${chapter1.summary}`);

  // ============================================================================
  // STEP 2+: Middle Batches (Flash) - Content execution with context
  // ============================================================================
  const batchSize = 2; // Generate 2 chapters per Flash call
  let callIndex = 2;

  for (let i = 1; i < structure.outline.length - 1; i += batchSize) {
    const batchChapters = structure.outline.slice(i, i + batchSize);
    const prevChapter = chapters[chapters.length - 1];
    const prevSummary = prevChapter.summary;

    const chapterNumbers = batchChapters.map((ch) => ch.chapter).join(", ");
    const chapterTitles = batchChapters
      .map((ch) => `"${ch.title}"`)
      .join(" and ");

    const batchPrompt = `You are writing a batch of chapters for an eBook narrative.
    
      Previous chapter concluded:
      "${prevSummary}"
      
      Write the following chapters as a natural continuation:
      ${batchChapters
        .map((ch, idx) => {
          const n = ch.chapter;
          return `CHAPTER ${n}: "${ch.title}"
                Topics: ${ch.topics.join(", ")}
                Instructions: This is chapter ${idx + 1} of ${
            batchChapters.length
          } in this batch.`;
        })
        .join("\n\n")}
      
      Ensure chapters flow naturally from the previous summary and from each other.
      Return JSON array: [
        { chapter: N, title, content, summary, image },
        ...
      ]`;

    const batchResponse = await aiSvc.generateContentWithRotation(
      batchPrompt,
      callIndex++ // Flash (callIndex 2+)
    );

    // Parse batch response (handle both array and individual responses)
    const parsedBatch = Array.isArray(batchResponse)
      ? batchResponse
      : [batchResponse];

    chapters.push(...parsedBatch);

    const lastSummary = parsedBatch[parsedBatch.length - 1].summary;
    console.log(
      `[NAT-CONT_0] Chapters ${chapterNumbers} complete. Summary: ${lastSummary}`
    );
  }

  // ============================================================================
  // STEP N: Final Chapter (Pro) - Narrative closure
  // ============================================================================
  const finalOutline = structure.outline[structure.outline.length - 1];
  const allSummaries = chapters
    .map((ch) => `Ch${ch.chapter}: ${ch.summary}`)
    .join("\n");

  const finalPrompt = `You are concluding the narrative arc for an eBook.
  
    Story progression so far:
    ${allSummaries}
    
    Write the FINAL CHAPTER: "${finalOutline.title}"
    
    Your role:
    - Resolve all narrative threads introduced and developed above
    - Bring thematic elements from Chapter 1 to completion
    - Provide satisfying closure while echoing the opening tone/voice
    - Complete the narrative arc
    
    Topics: ${finalOutline.topics.join(", ")}
    
    Return JSON: {
      chapter: ${structure.outline.length},
      title: string,
      content: string,
      summary: string,
      image: { concept, suggested_style, tone }
    }`;

  const finalChapter = await aiSvc.generateContentWithRotation(
    finalPrompt,
    callIndex++ // Pro (final model call)
  );

  chapters.push(finalChapter);
  console.log(
    `[NAT-CONT_0] Final chapter complete. Summary: ${finalChapter.summary}`
  );

  // ============================================================================
  // STEP FINAL: Compose HTML
  // ============================================================================
  const html = composeHTML(structure, chapters);

  return {
    pages: chapters,
    metadata: {
      model: "nat-cont_0",
      calls: callIndex,
      chapters: chapters.length,
      structure,
    },
    html,
    actions: [],
  };
}
```

---

## Alternative Execution: NAT-CONT_1 (Batch Parallel)

**Same structure, but Flash batches run in parallel after Chapter 1 completes:**

```javascript
async function handleNARRATIVE_CONT_1(payload, classification) {
  // ... Structure and Chapter 1 same as above ...

  const chapters = [chapter1];
  const prevSummary = chapter1.summary;

  // Calculate batch structure
  const middleChapters = structure.outline.slice(1, -1); // Exclude final
  const batchSize = 2;
  const batches = [];

  for (let i = 0; i < middleChapters.length; i += batchSize) {
    batches.push(middleChapters.slice(i, i + batchSize));
  }

  // Generate all Flash batches in parallel with context assumptions
  const batchPromises = batches.map((batchChapters, batchIdx) => {
    const callIndex = 2 + batchIdx;

    // ASSUMPTION: Previous batches completed
    // (This works because Flash will accept "assume previous chapters were...")
    const contextNote =
      batchIdx === 0
        ? `Previous chapter 1 concluded: "${prevSummary}"`
        : `Assume previous batches established the narrative foundation.`;

    const prompt = `Write chapters ${batchChapters
      .map((ch) => ch.chapter)
      .join(", ")}:
      ${contextNote}
      
      [batch content prompt]`;

    return aiSvc.generateContentWithRotation(prompt, callIndex);
  });

  const batchResults = await Promise.all(batchPromises);
  chapters.push(...batchResults.flat());

  // Then generate final chapter with full context
  const finalChapter = await aiSvc.generateContentWithRotation(
    finalPrompt,
    batches.length + 2 // callIndex after all batches
  );

  chapters.push(finalChapter);

  // ... compose and return ...
}
```

**Timeline (NAT-CONT_1):**

```
T=0s    Call 0 (Pro): Structure
T=15s   Call 1 (Pro): Chapter 1

T=21s   Calls 2,3,4... (Flash): ALL batches in parallel
        ├─ Batch 1: Ch2-3 (4-6s)
        ├─ Batch 2: Ch4-5 (4-6s, parallel)
        └─ Batch 3: Ch6-7 (4-6s, parallel)

T=27s   Call 5 (Pro): Final Chapter
T=33s   COMPLETE

Total: 33s (down from 50s+)
Timeout buffer: 27s (HEALTHY)
```

---

## Integration Points with Existing Code

### 1. Modify `ebookService.handle()` signature

```javascript
// Current
async function handle(payload, classification) { ... }

// Add optional strategy parameter
async function handle(payload, classification, options = {}) {
  const strategy = options.strategy || 'nat-cont_0';  // Default to batching

  if (strategy === 'nat-cont_0') {
    return handleNARRATIVE_CONT_0(payload, classification);
  } else if (strategy === 'nat-cont_1') {
    return handleNARRATIVE_CONT_1(payload, classification);
  } else {
    return handleLEGACY(payload, classification);  // Original sequential
  }
}
```

### 2. Model Routing in `aiService.js`

**Current callIndex logic:**

```javascript
async generateContentWithRotation(prompt, callIndex = 0) {
  const model = callIndex === 0 ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
  // ...
}
```

**NO CHANGE NEEDED** — callIndex mapping still works:

- `callIndex: 0` → Pro (structure)
- `callIndex: 1` → Pro (chapter 1) ← CHANGE: Now Pro, not Flash
- `callIndex: 2+` → Flash (batches)
- `callIndex: final` → Pro (final chapter)

Actually, we need a **smarter routing**:

```javascript
async generateContentWithRotation(prompt, callIndex = 0, options = {}) {
  // NAT-CONT aware routing
  const { model: explicitModel } = options;

  if (explicitModel) {
    const model = explicitModel;  // Use explicit model if provided
  } else {
    // Legacy callIndex routing
    const model = callIndex === 0 ? 'pro' : 'flash';
  }

  // Rest of implementation
}
```

**Call signature for NAT-CONT:**

```javascript
// Pro calls: explicit model
await aiSvc.generateContentWithRotation(prompt, callIndex, { model: "pro" });

// Flash batch calls: explicit model
await aiSvc.generateContentWithRotation(prompt, callIndex, { model: "flash" });
```

### 3. Quota Tracking Compatibility

**No changes needed:**

- Pro quota: Structure (Call 0) + Chapter 1 (Call 1) + Final (Call N) = 3 calls
- Flash quota: Batches (Calls 2+) = 3-4 calls
- Total quota usage: Same or less than current

**Potential improvement:**

```
Current: 1 Pro + 8 Flash = 9 calls
NAT-CONT_0: 3 Pro + 3 Flash = 6 calls
NAT-CONT_1: 3 Pro + 3 Flash = 6 calls (parallel)

Quota improvement: 33% reduction in total calls
Pro utilization: Better (3 vs 1)
Flash utilization: More efficient (batched, fewer overall)
```

---

## Testing Strategy

### Unit Tests

```javascript
describe("NAT-CONT_0 Implementation", () => {
  test("Structure call uses callIndex 0 (Pro)", async () => {
    const result = await handleNARRATIVE_CONT_0(payload);
    // Verify structure was generated
    expect(result.metadata.chapters).toBeGreaterThan(1);
  });

  test("Chapter 1 uses callIndex 1 (Pro)", async () => {
    // Mock aiSvc to track callIndex
    const callIndices = [];
    aiSvc.generateContentWithRotation = jest.fn((prompt, idx) => {
      callIndices.push(idx);
      return mockChapterResponse;
    });

    await handleNARRATIVE_CONT_0(payload);

    expect(callIndices[0]).toBe(0); // Structure
    expect(callIndices[1]).toBe(1); // Chapter 1 (Pro)
    expect(callIndices[2]).toBe(2); // Batch 1 (Flash)
  });

  test("Middle batches contain context from previous chapter", async () => {
    const result = await handleNARRATIVE_CONT_0(payload);

    // Verify chapter sequences are coherent
    expect(result.pages[1].summary).toBeDefined(); // Ch1 has summary
    expect(result.pages[2]).toBeDefined(); // Ch2 follows
    expect(result.pages[3]).toBeDefined(); // Ch3 follows
  });

  test("Final chapter has access to all previous summaries", async () => {
    // Verify final chapter prompt included full story context
    // (Check logged prompts or mock aiSvc calls)
  });
});
```

### Integration Tests

```javascript
describe("NAT-CONT_0 Timing", () => {
  test("Processing time is < 45s", async () => {
    const start = Date.now();
    await handleNARRATIVE_CONT_0(realPayload);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(45000);
  });

  test("Total API calls reduced from 10 to 5-6", async () => {
    let callCount = 0;
    aiSvc.generateContentWithRotation = jest.fn((prompt, idx) => {
      callCount++;
      return mockResponse;
    });

    await handleNARRATIVE_CONT_0(realPayload);

    expect(callCount).toBeLessThanOrEqual(6);
  });

  test("Narrative coherence maintained across batches", async () => {
    const result = await handleNARRATIVE_CONT_0(realPayload);

    // Manual review: Read through chapters
    // Verify: Each batch flows from previous summary
    // Verify: Final chapter echoes Chapter 1 themes
  });
});
```

---

## Success Metrics

| Metric                    | Current | NAT-CONT_0 | NAT-CONT_1 | Threshold      |
| ------------------------- | ------- | ---------- | ---------- | -------------- |
| **Total processing time** | 49-50s  | 32-45s     | 25-33s     | <45s           |
| **Timeout buffer**        | 5-10s   | 15-28s     | 27-35s     | >15s           |
| **API calls**             | 8-10    | 5-6        | 5-6        | <6             |
| **Pro quota usage**       | 1       | 3          | 3          | ≤2 RPM         |
| **Flash quota usage**     | 8-9     | 3-4        | 3-4        | ≤15 RPM        |
| **Narrative coherence**   | Good    | Good+      | Good+      | No regressions |
| **Time to MVP**           | N/A     | 1-2 days   | 2-3 days   | <1 week        |

---

## Decision Tree

```
START: Can we solve the timeout with NAT-CONT_0?

├─ YES (NAT-CONT_0 processing time < 45s + buffer > 15s)
│  └─ STOP: Ship NAT-CONT_0
│     ├─ Monitor real-world performance
│     ├─ Measure actual timeout frequency
│     └─ If still issues → Evaluate NAT-CONT_1 (parallel)

└─ NO (NAT-CONT_0 still tight on timeout)
   └─ PROCEED to NAT-CONT_1 (parallel batches)
      ├─ Further reduce from 32-45s → 25-33s
      ├─ Get safe buffer > 15s
      └─ If still needed → Begin Phase 2 (ASYNC-POLL)
```

---

## Implementation Checklist for NAT-CONT_0

- [ ] Create `handleNARRATIVE_CONT_0()` function in ebookService.js
- [ ] Update `handle()` to dispatch based on strategy parameter
- [ ] Modify chapter generation prompts to accept batch structure
- [ ] Add context passing: `prevSummary` through batch prompts
- [ ] Update callIndex routing: Chapter 1 uses Pro (callIndex 1), not Flash
- [ ] Add logging: Show batch boundaries and context passing
- [ ] Create unit tests for callIndex routing
- [ ] Create integration tests for timing
- [ ] Test narrative coherence (manual review)
- [ ] Benchmark actual processing time
- [ ] Compare quota usage before/after
- [ ] Document prompting strategy for batching
- [ ] Create PR with clear explanation of changes
- [ ] Plan rollout: Test → Shadow traffic → Full deployment

---

## References

- [ARCHITECTURAL_PATTERN_IMPACT_ANALYSIS.md](ARCHITECTURAL_PATTERN_IMPACT_ANALYSIS.md#pattern-1-sequential-chapter-generation-assumptions)
- [TIMEOUT_RESOLUTION_STRATEGY.md](TIMEOUT_RESOLUTION_STRATEGY.md#option-5-reduce-backend-processing-time-optimization-only)
- [TIMEOUT_RESOLUTION_ARCHITECTURE.md](TIMEOUT_RESOLUTION_ARCHITECTURE.md#phase-1-opt-infra-optimization--infrastructure-investigation)
- Current implementation: [ebookService.js](../../server/ebookService.js)
