# SERVICE IMPLEMENTATIONS INSPECTION: BRAINSTORM ANALYSIS

**Date**: Dec 29, 2025 @ 1:50PM
**Branch**: `SERVICE-AUTON-reset-http2`

**Phase**: Service-Auton Reset (Spec Review, no code changes)

---

## SECTION 1: MANIFEST-FIRST PROTOCOL COMPLIANCE

### ✅ All Services Follow Manifest-First Pattern

| Service                   | Manifest Declared | Sent on First Call | Sequence Length | Tiers Used           |
| ------------------------- | ----------------- | ------------------ | --------------- | -------------------- |
| **ReferenceEbookService** | ✅ Yes            | ✅ Yes             | `1 + pageCount` | `expert`, `standard` |
| **EbookService**          | ✅ (delegated)    | ✅ (via ref)       | `1 + pageCount` | `expert`, `standard` |
| **WallArtService**        | ✅ Yes            | ✅ Yes             | `2`             | `expert`, `standard` |
| **CalendarService**       | ✅ Yes            | ✅ Yes             | `3`             | `expert`, `standard` |

**Assessment**: **STRONG** — All services correctly declare manifest with `totalRequests` and `sequence[]` on the first orchestrator call. The pattern is consistent across all implementations.

---

## SECTION 2: onProgress CALLBACK INVOCATION

### ✅ All Services Call onProgress

| Service                   | Calls onProgress | When                              | Arguments Passed                                             |
| ------------------------- | ---------------- | --------------------------------- | ------------------------------------------------------------ |
| **ReferenceEbookService** | ✅ Yes           | After 1st call, then in each loop | `{ resultId, callsCompleted, currentCall, totalCalls, eta }` |
| **EbookService**          | ✅ (delegated)   | Via reference service             | Same                                                         |
| **WallArtService**        | ✅ Yes           | After each of 2 calls             | `{ resultId, callsCompleted, currentCall, totalCalls, eta }` |
| **CalendarService**       | ✅ Yes           | After each of 3 calls             | `{ resultId, callsCompleted, currentCall, totalCalls, eta }` |

**Assessment**: **EXCELLENT** — All services properly invoke the passed `onProgress` callback with the required fields. This ensures that:

1. `smartPoller.updateProgress()` receives `callsCompleted` and `totalCalls`.
2. Status endpoint can compute `progress_percent`.
3. ETA is propagated from orchestrator to smartPoller.

**Critical Detail**: Services extract `eta` and `totalCalls` from the orchestrator **after the first call**:

```javascript
const eta = orchestrator.eta;
const totalCalls = orchestrator.manifest.totalRequests;
```

This means the **orchestrator must expose `.eta` and `.manifest` properties** after the first call completes.

---

## SECTION 3: ORCHESTRATOR ETA EXPOSURE

### Question for Implementation

Looking at the code, services assume `orchestrator.eta` and `orchestrator.manifest` are available after the first `generate()` call. These must be:

1. **Computed** by `timingResolver` based on the manifest.
2. **Stored** on the orchestrator instance (`this.eta`, `this.manifest`).
3. **Passed to smartPoller** via the central `progressCallback` in `genieService.process()`.

**Design Flow (Expected)**:

```
Service calls:
  orchestrator.generate(prompt, { manifest, callIndex: 0, tier: "expert" })
    ↓
Orchestrator receives manifest, calls timingResolver.compute()
    ↓
orchestrator.eta = timingResolver.totalEta (in seconds)
orchestrator.manifest = payload.manifest
orchestrator.schedule = timingResolver.schedule
    ↓
Service reads:
  eta = orchestrator.eta
  totalCalls = orchestrator.manifest.totalRequests
    ↓
Service calls:
  onProgress({ callsCompleted: 1, totalCalls, eta, ... })
    ↓
genieService's progressCallback forwards to smartPoller.updateProgress()
    ↓
smartPoller stores eta and totalCalls for status endpoint
```

**Current Status**: This design is **structurally sound** based on the service code. Whether it **functionally works** depends on orchestrator implementation (which we haven't inspected yet, and you said it's not directly under `/server/services/`).

---

## SECTION 4: RESULT & ERROR CONTRACTS

### ✅ All Services Return Consistent Result Shape

**ReferenceEbookService**:

```javascript
return {
  id: resultId,
  title,
  chapters,
  generatedAt,
  metadata: { pageCount, totalRequests, etaSeconds },
};
```

**WallArtService**:

```javascript
return {
  id: resultId,
  style,
  dimensions,
  prompt,
  styleAnalysis,
  description,
  generatedAt,
  metadata: { totalRequests, etaSeconds },
};
```

**CalendarService**:

```javascript
return {
  id: resultId,
  year,
  theme,
  content,
  events,
  layout,
  generatedAt,
  metadata: { totalRequests, etaSeconds },
};
```

**Pattern**: All include `id`, `generatedAt`, and `metadata.{totalRequests, etaSeconds}`. The business-specific fields vary (which is correct).

**Assessment**: **GOOD** — Result shapes are sensible and include tracking metadata. No issues here.

### ⚠️ Error Handling: Generic `throw err`

All services catch errors and re-throw generically:

```javascript
catch (err) {
  logger.error(`[Service] Failed: ${err.message}`, err);
  throw err;
}
```

**Gap**: The GUIDE specifies services should throw structured errors:

```javascript
throw {
  error: "ASSEMBLY_FAILED",
  message: "...",
  missing: { structure: true },
  attempted: [...]
}
```

**Current Status**: Services just re-throw the raw error. The GUIDE pattern is better because it:

1. Lets clients distinguish service errors from orchestrator/infrastructure errors.
2. Provides actionable info (what was missing, what was attempted).
3. Allows smarter retry logic.

**Impact**: Tests and error handling in `genieService` and the HTTP endpoint will see raw errors instead of structured ones. Not a blocker, but a refinement opportunity.

---

## SECTION 5: ETA PROPAGATION CHAIN

**Expected Chain** (per GUIDE + current code):

```
1. Service declares manifest on first call
2. Orchestrator receives manifest, calls timingResolver.compute()
3. timingResolver returns { totalEta: 23 (seconds), schedule, ... }
4. Orchestrator stores: this.eta = 23, this.manifest = manifest
5. Service reads: eta = orchestrator.eta, totalCalls = manifest.totalRequests
6. Service calls: onProgress({ callsCompleted: 1, totalCalls, eta, ... })
7. genieService's progressCallback calls: smartPoller.updateProgress(resultId, { callsCompleted, totalCalls, eta, ... })
8. smartPoller.getStatus() returns: { eta: 23, calls_total: N, calls_completed: 0, progress_percent: 0, ... }
9. Client polls /api/status/:resultId and sees eta immediately
```

**Validation Points**:

- ✅ Services declare manifest (confirmed in code)
- ✅ Services call onProgress with eta (confirmed in code)
- ❓ Orchestrator exposes .eta and .manifest after first call (not inspected yet)
- ❓ genieService's progressCallback passes all fields to smartPoller (not inspected yet)
- ✅ smartPoller.getStatus() returns eta, calls_total, progress_percent (confirmed in GUIDE code snippet earlier)

---

## SECTION 6: POTENTIAL ISSUES & RISKS

### Risk 1: Missing Orchestrator Properties

If the orchestrator doesn't set `this.eta` and `this.manifest` after the first call, all services will fail when they try to read these:

```javascript
const eta = orchestrator.eta; // undefined if not set!
const totalCalls = orchestrator.manifest.totalRequests; // undefined if not set!
```

**Mitigation**: Inspect orchestrator implementation and verify it exposes these properties.

---

### Risk 2: ETA Type Mismatch

Tests likely expect `eta` as a **number (seconds)**. If:

- `timingResolver` returns milliseconds instead of seconds, or
- `orchestrator` stores the wrong value, or
- `progressCallback` doesn't pass eta at all,

Then `smartPoller.getStatus()` will return `eta` as `undefined` or wrong type, breaking tests.

**Mitigation**: Verify `timingResolver.compute()` returns `totalEta` in seconds (not ms).

---

### Risk 3: Manifest Sequence Validation

Services assume `orchestrator` will accept and process the manifest correctly. If:

- Orchestrator doesn't validate `manifest.totalRequests === manifest.sequence.length`, or
- Orchestrator allows tiers outside `["expert", "standard"]`, or
- Schedule computation fails for certain manifest shapes,

Then silent failures or mismatched call counts could occur.

**Mitigation**: Add lightweight unit tests for each service that mock the orchestrator and assert manifest shape is valid.

---

### Risk 4: Rate-Limiting Enforcement

The GUIDE specifies rate-limit spacing (250ms between expert calls, 100ms between standard). Services rely on the **orchestrator** to enforce this, not doing it themselves. If orchestrator doesn't enforce spacing, rapid concurrent calls could trigger 429 errors.

**Mitigation**: Verify orchestrator implements FIFO scheduling with `fifoScheduler.build()` and enforces spacing.

---

## SECTION 7: PROGRESSIVE REFINEMENT ROADMAP

### Phase 1: Validation (No Code Changes)

- [ ] Inspect `server/orchestrator.js` to confirm it exposes `.eta` and `.manifest`.
- [ ] Inspect `server/genieService.js` to confirm `progressCallback` passes all fields.
- [ ] Inspect `server/helpers/timingResolver.js` to confirm it returns seconds (not ms).
- [ ] Run existing tests and identify which ones fail.

### Phase 2: Hardening (If Tests Fail)

- [ ] If orchestrator doesn't expose properties, add them.
- [ ] If progressCallback doesn't pass eta, fix it.
- [ ] If services don't receive onProgress, debug the invocation chain.
- [ ] Add structured error throwing to services (per GUIDE spec).

### Phase 3: Testing & Validation

- [ ] Add per-service unit tests mocking orchestrator, asserting:
  - Manifest shape is correct.
  - onProgress is called with correct fields.
  - Result shape matches expected contract.
- [ ] Add integration tests for each endpoint (POST /api/wall-art/generate, etc.) that poll status and assert ETA is present and numeric.
- [ ] Run performance tests and verify rate-limit spacing.

---

## SECTION 8: KEY OBSERVATIONS

### Strengths:

1. ✅ All services follow the manifest-first protocol consistently.
2. ✅ All services invoke onProgress with the required fields.
3. ✅ Result shapes are sensible and include metadata.
4. ✅ Error handling is logged (though not structured).
5. ✅ Services are autonomous and don't assume tool implementations.

### Weaknesses:

1. ⚠️ Error contracts are generic, not structured per GUIDE spec.
2. ⚠️ Orchestrator property exposure (`.eta`, `.manifest`) not yet verified.
3. ⚠️ No per-service unit tests validating the manifest/onProgress contract.
4. ⚠️ No integration tests confirming ETA flows to status endpoint.

### Next Action:

- Inspect `server/orchestrator.js` and `server/genieService.js` to confirm ETA propagation chain is complete.
- If any link is broken, fix it (but we're still in brainstorm mode, so just document the fix needed).
- Then run tests to see what fails and prioritize fixes.

---

**Document Status**: Brainstorm Analysis Complete  
**Session**: Ready for break with clear roadmap documented for next phase.
