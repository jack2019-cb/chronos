# Batch Optimization Reconfiguration [REFERENCE ONLY - ARCHIVED]

⚠️ **STATUS**: This document is **ARCHIVED AND FOR REFERENCE ONLY**.

**Reason for Archive**: This document was created before the core optimization problem was fully clarified. It assumes arbitrary book sizes (up to 100+ pages) and proposes parallelization strategies that don't align with the actual constraints (3-20 page range, 10 req/min API rate limit).

**Current Working Document**: See `BATCH-OPT_RECONFIG.md` for the active reconfiguration strategy based on the corrected problem statement.

**Reference Use**: This document is kept for historical context and to understand the progression of design thinking. **Do not implement recommendations from this document.**

---

**Original Metadata** (for archive reference):

**Date**: December 2, 2025  
**Status**: 🟡 ARCHIVED / Superseded by BATCH-OPT_RECONFIG.md  
**Scope**: Problem analysis + solution scenarios at architectural level (outdated scope)  
**Audience**: Architects, Technical Leadership  
**Branch**: `feat/B_Frontend_option2`

---

## 🟢 DECISION: Scenario D - Hybrid Strategy (APPROVED)

**Effective Date**: December 2, 2025  
**Decision Authority**: Technical Leadership  
**Implementation Status**: Ready for Phase 1 (Sprint begins immediately)

```
┌─────────────────────────────────────────────────────────────┐
│ APPROVED APPROACH: HYBRID BATCH STRATEGY (SCENARIO D)       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Phase 1 (Weeks 1-2): Option 2 for 6-15 page range          │
│   └─ Sequential 3-chapter batches (fixed pattern)           │
│   └─ 40-45% API reduction in primary use case              │
│   └─ Full error recovery + observability                    │
│   └─ Honest documentation of supported range               │
│                                                             │
│ Phase 2 (Weeks 3-4): Dynamic sizing for 15-50 pages        │
│   └─ Batch size = sqrt(N) algorithm                         │
│   └─ 35-50% API reduction across extended range            │
│   └─ Minimal architectural changes, single code path       │
│   └─ Incremental improvement without breaking Phase 1      │
│                                                             │
│ Phase 3 (Weeks 5-8): Parallel execution for any size       │
│   └─ Full parallelization of batch generation              │
│   └─ 80-94% API reduction + latency for large books        │
│   └─ True scalability across arbitrary book sizes          │
│   └─ Queue-based rate limit management                     │
│                                                             │
│ Rationale:                                                  │
│ • Pragmatic: Phase 1 delivers immediate value              │
│ • Scalable: Phase 3 handles any book size                  │
│ • Staged: Each phase independently valuable & testable     │
│ • Quality: Unified context maintained throughout           │
│ • Risk: Staged rollout allows validation & rollback        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Go/No-Go Criteria**:

- ✅ Phase 1 must deliver 40%+ API reduction for 8-page books
- ✅ Phase 2 must not regress Phase 1 performance
- ✅ Phase 3 must achieve 80%+ improvement for 100+ page books

**Next Steps**: Implementation roadmap in "Recommendation & Roadmap" section (below)

---

## Problem Statement

### The Fundamental Issue

The current Option 2 design assumes **fixed book size (8 pages)** while claiming to work for **arbitrary sizes**. This creates a scalability crisis:

```
┌─────────────────────────────────────────────────────────────┐
│ CURRENT ARCHITECTURE (OPTION 2)                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Structure (1 call)                                         │
│    ↓                                                         │
│  Ch1 (individual)                                           │
│    ↓                                                         │
│  [Batch 1: Ch2-4 (1 call)]                                  │
│    ↓                                                         │
│  [Batch 2: Ch5-7 (1 call)]                                  │
│    ↓                                                         │
│  Ch8 (individual)                                           │
│                                                             │
│  API Calls = N/3 + O(1)                                     │
│                                                             │
│  As N → ∞: Improvement ratio → 33% (barely better)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Performance Degradation Across Sizes

| N (chapters) | Sequential | Option 2 | Improvement | Benefit               |
| ------------ | ---------- | -------- | ----------- | --------------------- |
| 3            | 4          | 2        | 50%         | ✅ Good               |
| 8            | 9          | 5        | 44%         | ✅ Good               |
| 12           | 13         | 6        | 46%         | ✅ Okay               |
| 20           | 21         | 9        | 43%         | ⚠️ Modest             |
| 50           | 51         | 18       | 35%         | ❌ Degrading          |
| 100          | 101        | 34       | 34%         | ❌ Minimal            |
| 500          | 501        | 168      | 33%         | ❌ Asymptotic failure |

**Pattern**: As chapters increase, improvement ratio asymptotically approaches **33%** (theoretical minimum for this architecture).

### Root Causes

#### 1. **Hardcoded Batch Size (3 chapters)**

- No algorithmic basis for "3"
- Conflates narrative cohesion (good in story) with API optimization (different concern)
- Fails to adapt to different ebook sizes or API constraints

#### 2. **Sequential Batch Execution**

```
Structure → Ch1 → Batch1 → Batch2 → Batch3 → ... → Ch_last
   ↓                ↓        ↓        ↓         ↓
Sequential dependency chain prevents parallelization
```

- Batches depend on previous context, forcing sequential execution
- Could process batches in parallel with unified context
- But architecture doesn't support this

#### 3. **Fixed Boundary Pattern (Ch1 + Ch_last individual)**

- Assumes exactly 2 boundary chapters
- For 3-page book: 2 out of 3 are boundaries (67% waste!)
- For 8-page book: 2 out of 8 are boundaries (25% waste - acceptable)
- For 100-page book: 2 out of 100 are boundaries (2% waste - negligible)
- Inconsistent efficiency across sizes

#### 4. **No Scalable Algorithm**

- No function to calculate optimal batch size: `batch_size = f(N, quota_limit, latency_budget)`
- No adaptive mechanism to adjust strategy based on constraints
- Design is static, not dynamic

---

## Current Architecture Limitations

### Constraint 1: Rate Limiting (10 req/min)

```
10 requests per minute = 1 request every 6 seconds minimum

Current Sequential Approach:
├─ Structure (Pro) - 1 call
├─ Ch1 → Ch2 → Ch3 → ... → Ch_N (Flash) - N calls
└─ Total latency ≈ (N + 1) × 6s = 6N + 6 seconds

Batch Approach (Option 2):
├─ Structure (Pro) - 1 call
├─ Ch1 - 1 call
├─ [Batches] - ceil((N-2)/3) calls
├─ Ch_last - 1 call
└─ Total latency ≈ (3 + ceil((N-2)/3)) × 6s = 6 × (N/3 + 3) seconds
```

**Problem**: Both approaches are **latency-bound by rate limit**, not by Gemini API speed.

- The 78% latency improvement claim assumes **parallel execution**
- But architecture is **sequential**
- Sequential batches don't improve latency much if rate-limited

### Constraint 2: Narrative Continuity

```
Current Approach:
├─ Limited context: "previous chapter summary only"
├─ Each chapter generated independently
└─ Risk: Weak narrative connections, pacing misalignment

Batch Approach (Option 2):
├─ Unified context: "Ch1-4 summary + full arc description"
├─ Batch sees 3-chapter narrative arc
├─ Can flag weak connections, ensure pacing
└─ Benefit: Better quality (not just speed)
```

**This is the ONLY real win of Option 2** (separate from API call optimization).

---

## Solution Scenarios

### Scenario A: Accept the Limitation (Pragmatic)

**Approach**: Redesignate Option 2 as "Optimized for Standard Ebooks"

```
┌─────────────────────────────────────────────────────────────┐
│ OPTION 2 - REVISED SCOPE                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ✅ Supported range: 6-15 pages (most common case)           │
│ ✅ Performance: 40-45% API reduction in supported range     │
│ ✅ Benefit: Unified batch context (narrative quality)       │
│ ✅ Resilience: 3-level error recovery                       │
│ ✅ Observability: Full metrics/tracing                      │
│                                                             │
│ ⚠️ Out of scope: <6 pages or >15 pages                      │
│    For these sizes: Fall back to sequential approach        │
│    or implement alternative strategy                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:

```javascript
// In ebookService.js
if (pageCount < 6 || pageCount > 15) {
  return generateSequential(ebook); // Legacy approach
} else {
  return generateWithBatching(ebook); // Option 2
}
```

**Pros**:

- ✅ Minimal code changes
- ✅ 40-45% improvement where it matters most
- ✅ Honest scope definition
- ✅ Faster deployment

**Cons**:

- ❌ Doesn't solve scalability problem
- ❌ Different behavior for different book sizes (confusing)
- ❌ Still 33% improvement for large books (minimal)
- ❌ Users expecting "any size" optimization get disappointed

**Recommendation**: ⚠️ **Short-term tactical fix, not strategic solution**

---

### Scenario B: Dynamic Batch Sizing (Incremental Fix)

**Approach**: Calculate batch size algorithmically based on chapter count

```
┌─────────────────────────────────────────────────────────────┐
│ DYNAMIC BATCH SIZING ALGORITHM                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Input:  N (total chapters)                                 │
│         Q (API quota per minute = 10)                       │
│         L (acceptable latency budget in seconds)            │
│                                                             │
│ Optimal batch size:                                        │
│   batch_size = max(2, floor(sqrt(N)))                       │
│                                                             │
│   Alternative (quota-driven):                               │
│   batch_size = floor(Q / number_of_batches_needed)         │
│                                                             │
│ Examples:                                                  │
│   N=3:   batch_size = max(2, 1) = 2                        │
│   N=8:   batch_size = max(2, 2) = 2... but use 3 (better)  │
│   N=12:  batch_size = max(2, 3) = 3                        │
│   N=20:  batch_size = max(2, 4) = 4                        │
│   N=100: batch_size = max(2, 10) = 10                      │
│                                                             │
│ Result: Adaptive batching that improves with N             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:

```javascript
function calculateOptimalBatchSize(totalChapters) {
  const minBatchSize = 2;
  const maxBatchSize = Math.min(10, totalChapters - 2); // Reserve Ch1 + Ch_last

  // Use square root heuristic: larger books get larger batches
  const adaptiveBatch = Math.floor(Math.sqrt(totalChapters));

  return Math.max(minBatchSize, Math.min(adaptiveBatch, maxBatchSize));
}

// Usage
const batchSize = calculateOptimalBatchSize(pageCount);
for (let i = 1; i < pageCount - 1; i += batchSize) {
  const batch = chapters.slice(i, Math.min(i + batchSize, pageCount - 1));
  await generateBatch(batch);
}
```

**Performance Impact**:

| N   | Fixed 3 | Dynamic | Improvement     |
| --- | ------- | ------- | --------------- |
| 3   | 2       | 2       | -               |
| 8   | 5       | 5       | -               |
| 12  | 6       | 5       | 1 fewer call    |
| 20  | 9       | 6       | 3 fewer calls   |
| 50  | 18      | 10      | 8 fewer calls   |
| 100 | 34      | 14      | 20 fewer calls  |
| 500 | 168     | 54      | 114 fewer calls |

**Pros**:

- ✅ Better performance for large books
- ✅ Minimal architecture changes
- ✅ Maintains unified batch context benefit
- ✅ Single code path (no conditional logic)
- ✅ Still respects narrative cohesion (batches stay reasonable)

**Cons**:

- ⚠️ Still sequential execution (latency not improved)
- ⚠️ Batch-to-batch dependency limits parallelization
- ⚠️ Heuristic may not be optimal for all cases
- ❌ Improvement ratio still asymptotes to ~33%

**Recommendation**: ✅ **Good incremental improvement, medium effort**

---

### Scenario C: Parallel Batch Execution (Architectural Fix)

**Approach**: Execute batches in parallel with shared unified context

```
┌─────────────────────────────────────────────────────────────┐
│ PARALLEL BATCH ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Sequential dependency removed via unified context sharing  │
│                                                             │
│ Step 1: Generate structure (1 call)                         │
│   ├─ Output: full ebook outline, theme, narrative arc       │
│   └─ Time: t0 = 1s (minimal)                                │
│                                                             │
│ Step 2: Generate Ch1 individually (1 call)                  │
│   ├─ Output: establishes narrative voice                    │
│   └─ Time: t1 = 6s (rate limited)                           │
│                                                             │
│ Step 3: Generate all remaining chapters in parallel batches │
│   ├─ Batch1 (Ch2-k):   context = {structure + Ch1}          │
│   ├─ Batch2 (Ch(k+1)-m): context = {structure + Ch1}        │
│   ├─ Batch3 (Ch(m+1)-n): context = {structure + Ch1}        │
│   ├─ Batch_last (ChN):   context = {structure + Ch1}        │
│   │                                                         │
│   │  All execute in parallel (hit rate limit simultaneously)│
│   │  Parallel = ceil(remaining / batch_size) × 6s           │
│   └─ Time: t2 = ceil((N-1) / batch_size) × 6s               │
│                                                             │
│ Total latency: 1 + 6 + t2 seconds (vs. sequential N×6)      │
│                                                             │
│ Example (100 chapters, batch_size=20):                      │
│   ├─ Sequential: 1 + (100×6) = 601 seconds                  │
│   ├─ Option 2: 1 + (34×6) = 205 seconds                     │
│   └─ Parallel:  1 + 6 + (5×6) = 37 seconds  ← 94% reduction!│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Critical Design Change**: Shift from **sequential dependency** to **shared context model**

```
Current (Sequential):
  Ch1 generated → Context extracted → Batch1 generated → Context extracted → Batch2 generated
  └─ Each batch waits for previous to complete

Parallel (Proposed):
  Ch1 generated → [unified context created] ← Used by ALL batches simultaneously
                   ├─ Batch1 starts
                   ├─ Batch2 starts (at same time)
                   ├─ Batch3 starts (at same time)
                   └─ Batch_last starts (at same time)
```

**Implementation Architecture**:

```javascript
async function generateEbookParallel(ebook) {
  const sessionId = generateUUID();
  METRICS.startSession(sessionId, ebook);

  // Step 1: Structure
  const structure = await generateStructure(ebook);
  METRICS.recordStructure(sessionId, structure);

  // Step 2: Chapter 1 (establishes voice)
  const ch1 = await generateChapter(1, { structure });
  METRICS.recordChapter(sessionId, ch1);

  // Step 3: Build unified context for all remaining chapters
  // This is the KEY CHANGE: all batches see this same context
  const unifiedContext = {
    structure,
    ch1Summary: extractSummary(ch1),
    narrativeVoice: extractVoice(ch1),
    tone: extractTone(ch1),
    ebook: { title: ebook.title, theme: ebook.theme },
  };

  // Step 4: Generate all remaining batches IN PARALLEL
  // This requires concurrent API calls (may need quota increase or queue management)
  const remainingChapters = chapters.slice(1);
  const batches = createBatches(
    remainingChapters,
    calculateOptimalBatchSize(totalChapters)
  );

  const batchPromises = batches.map((batch, idx) =>
    generateBatch(batch, { ...unifiedContext, batchIndex: idx })
  );

  const generatedBatches = await Promise.all(batchPromises);

  return {
    chapters: [ch1, ...generatedBatches.flat()],
    metrics: METRICS.finalizeSession(sessionId),
  };
}
```

**Rate Limit Handling**:

- **Problem**: 10 req/min means can't truly parallelize unlimited batches
- **Solution 1**: Implement queue/throttle that respects 10 req/min across all parallel tasks
- **Solution 2**: Request quota increase for batch endpoints (negotiate with Gemini team)
- **Solution 3**: Hybrid: parallelize within rate limit, queue remainder

**Pros**:

- ✅ **94% latency reduction** for large books (37s vs. 601s sequential)
- ✅ Maintains narrative quality (unified context)
- ✅ Scales perfectly: T(N) = O(N/batch_size) instead of O(N)
- ✅ Better utilization of API quota
- ✅ Works for arbitrary book sizes

**Cons**:

- ❌ Major architectural change (significant refactoring)
- ❌ Requires concurrent API call management/queuing
- ❌ Potential rate limit conflicts (need careful throttling)
- ❌ More complex observability (tracking parallel operations)
- ❌ May need quota increase negotiation with Gemini
- ❌ Longer implementation timeline (2-3 weeks)

**Recommendation**: ✅ **Best long-term solution, but requires substantial effort**

---

### Scenario D: Hybrid Strategy (Pragmatic + Scalable)

**Approach**: Use Option 2 for common sizes, parallel for large books

```
┌─────────────────────────────────────────────────────────────┐
│ HYBRID BATCH STRATEGY                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ IF pageCount ≤ 15:                                          │
│   ├─ Use Option 2 (sequential, 3-chapter batches)           │
│   ├─ Performance: 40-45% API reduction                      │
│   └─ Simplicity: Proven, tested, minimal changes            │
│                                                             │
│ ELSE IF pageCount ≤ 50:                                     │
│   ├─ Use Option 2 with dynamic batch sizing                 │
│   ├─ Performance: 35-50% API reduction                      │
│   └─ Batch size = sqrt(N), incremental improvement          │
│                                                             │
│ ELSE (pageCount > 50):                                      │
│   ├─ Use Parallel Batch Execution                           │
│   ├─ Performance: 80-94% API reduction                      │
│   └─ Batch size = dynamic, full parallelization             │
│                                                             │
│ Result: Best approach for each size class                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:

```javascript
async function generateEbook(ebook) {
  const N = ebook.pageCount;

  if (N <= 15) {
    // Option 2: Sequential, fixed 3-chapter batches
    return generateWithFixedBatches(ebook, 3);
  } else if (N <= 50) {
    // Dynamic batching: batch_size = sqrt(N)
    const batchSize = Math.ceil(Math.sqrt(N));
    return generateWithDynamicBatches(ebook, batchSize);
  } else {
    // Parallel execution for large books
    return generateWithParallelBatches(ebook);
  }
}
```

**Performance Matrix**:

| N   | Strategy | Calls | Latency Estimate | Improvement |
| --- | -------- | ----- | ---------------- | ----------- |
| 8   | Fixed-3  | 5     | 30s sequential   | ✅ 44%      |
| 15  | Fixed-3  | 7     | 42s sequential   | ✅ 40%      |
| 20  | Dynamic  | 8     | 48s dynamic      | ✅ 40%      |
| 50  | Dynamic  | 13    | 78s dynamic      | ✅ 38%      |
| 100 | Parallel | 8     | 37s parallel     | ✅ 94%      |
| 200 | Parallel | 11    | 43s parallel     | ✅ 96%      |

**Pros**:

- ✅ Best solution for each size class
- ✅ Pragmatic mix of simple + powerful
- ✅ Staged rollout possible (Fixed → Dynamic → Parallel)
- ✅ Maintains quality benefits across all sizes
- ✅ Can implement incrementally (Phase 1: Fixed, Phase 2: Dynamic, Phase 3: Parallel)

**Cons**:

- ⚠️ Multiple code paths (higher maintenance)
- ⚠️ Testing complexity (3 different strategies)
- ⚠️ Still requires parallel execution implementation eventually
- ⚠️ Requires clear documentation of which strategy applies when

**Recommendation**: ✅ **Best compromise: pragmatism + scalability, staged implementation**

---

## Comparison Matrix

| Scenario                  | Scope           | Effort | Performance | Quality      | Maintenance |
| ------------------------- | --------------- | ------ | ----------- | ------------ | ----------- |
| **A: Accept Limitation**  | 6-15 pages only | Low    | 40-45%      | ✅ Good      | Low         |
| **B: Dynamic Sizing**     | Any size        | Medium | 35-50%      | ✅ Good      | Medium      |
| **C: Parallel Execution** | Any size        | High   | 80-94%      | ✅ Excellent | High        |
| **D: Hybrid**             | Any size        | High   | 35-94%      | ✅ Excellent | High        |

---

## Recommendation & Roadmap

### Immediate Action (This Sprint)

**Decision**: Implement **Scenario D (Hybrid)** with **Phase 1 (Option 2 for 6-15 pages)**

1. **Scope Option 2 to documented range** (6-15 pages)
2. **Update all claims** in architecture doc (remove "any size" language)
3. **Implement basic solution** (Sequential 3-chapter batches with fixed pattern)
4. **Add metrics** to measure actual performance
5. **Communicate limitation** to product team

**Timeline**: 2-3 weeks (Phases 1-2 from original plan)

### Phase 2 (Next Sprint)

1. **Add dynamic batch sizing** (Scenario B)
2. **Extend support** to 15-50 page range
3. **Measure performance** across sizes
4. **Prepare for Phase 3**

**Timeline**: 1-2 weeks

### Phase 3 (Future Sprint)

1. **Implement parallel batch execution** (Scenario C)
2. **Full scalability** for any book size
3. **Reach 80-94% improvement** for large books

**Timeline**: 3-4 weeks

---

## Risk Mitigation

### Risk: Rate Limit Exceeded (429 errors)

**Current**: Exponential backoff + fallback chapters  
**Parallel**: Need queue management to respect 10 req/min globally  
**Mitigation**: Implement sliding-window rate limiter across all parallel batches

### Risk: Parallel Complexity

**Current**: Sequential flow (simple to debug)  
**Parallel**: Concurrent operations (harder to trace)  
**Mitigation**: Enhanced observability with per-batch tracing in GenerationMetrics

### Risk: API Quota Insufficient

**Current**: Uses ~34 calls for 100-page book  
**Parallel**: Uses ~8 calls for 100-page book (better!)  
**Mitigation**: If quota bottleneck exists, parallel actually helps

---

## Architectural Decisions

### Decision 1: Accept Scalability Trade-off (Immediate)

**Decision**: Option 2 is optimized for 6-15 page ebooks, not arbitrary sizes  
**Rationale**: Better to be honest about scope than claim false universality  
**Action**: Update documentation, set page limits, communicate to stakeholders

### Decision 2: Plan Multi-Phase Rollout

**Decision**: Implement Scenario A (fixed) → B (dynamic) → D (parallel)  
**Rationale**: Reduces risk, allows validation at each stage, easier rollback  
**Action**: Roadmap 3 sprints, clear go/no-go criteria at each phase

### Decision 3: Maintain Quality-First Approach

**Decision**: Unified batch context benefit preserved across all scenarios  
**Rationale**: Narrative quality improvement is unique win regardless of scaling  
**Action**: All scenarios include full ebook context in batch prompts

---

## Success Criteria

### Phase 1 (Option 2 for 6-15 pages)

- ✅ 40-45% API reduction in targeted range
- ✅ <50% performance regression from claims
- ✅ 3-level error recovery working
- ✅ Metrics tracking operational
- ✅ Honest documentation of limits

### Phase 2 (Dynamic sizing for 15-50 pages)

- ✅ Extend support with <15% overhead
- ✅ 35-50% API reduction across extended range
- ✅ Single code path (no conditionals)
- ✅ Backward compatible with Phase 1

### Phase 3 (Parallel for any size)

- ✅ 80-94% API reduction for large books
- ✅ <100ms queue management overhead
- ✅ Full scalability proof
- ✅ 94% latency improvement demonstrated

---

## Conclusion

**DECISION MADE**: We are pursuing **Scenario D - Hybrid Strategy** for batch optimization.

### Why Scenario D?

1. **Immediate Value**: Phase 1 delivers 40-45% improvement for primary use case (6-15 pages) within 2 weeks
2. **Pragmatic Risk**: Each phase independently valuable; can stop after Phase 1 if needed
3. **True Scalability**: Phase 3 achieves 80-94% improvement for any book size
4. **Quality Preservation**: Unified batch context maintained throughout all phases
5. **Staged Validation**: Clear go/no-go criteria between phases; easy rollback if issues arise

### Implementation Path

**Phase 1** (This sprint): Option 2 fixed pattern for 6-15 pages

- Sequential 3-chapter batches
- Full error recovery + observability
- 40-45% quota reduction in supported range
- Honest documentation of limits

**Phase 2** (Next sprint): Dynamic sizing for 15-50 pages

- Batch size = sqrt(N) algorithm
- Single code path (no conditionals)
- 35-50% quota reduction across extended range
- Backward compatible with Phase 1

**Phase 3** (Following sprint): Parallel execution for any size

- Full parallelization with rate limit queue
- 80-94% quota reduction for large books
- 80-94% latency reduction
- True scalability across arbitrary sizes

### Success Metrics

- ✅ Phase 1: 40%+ API reduction (8-page baseline)
- ✅ Phase 2: No regression from Phase 1, 35%+ for 50-page books
- ✅ Phase 3: 80%+ API reduction for 100-page books

This hybrid approach balances **pragmatism** (immediate value), **scalability** (true improvement across sizes), and **risk management** (staged validation).
