````markdown
# BE2genie — Export Objective & Runtime Rules (concise)

## One-line objective

- Turn canonical GenieService output into a persisted, exportable PDF artifact now; support edited-content persistence-before-export as a future feature.

## Rationale (why this aligns BE2genie_logic)

- BE2genie_logic treats persisted, normalized content as the canonical source. Exports must therefore be derived from persisted content to preserve dedupe, auditability and immutability guarantees. Runtime behaviour today: unedited content is exported directly by `genieService`; edited content must be persisted via `sampleService` and then passed to the export path.

## Acceptance criteria (must-haves)

- Exports always use persisted, normalized content (no client-only ephemeral export).
- Export request requires `promptId` or `resultId` (edit support may accept `editId` later).
- If content is not persisted, return 409 (or provide async wait token in async API).
- Export artifacts include metadata tying them to persisted record (promptId/resultId/normalizedHash) and deterministic filename.
- Feature flags control rollout: `GENIE_PERSISTENCE_ENABLED` and `EXPORT_ENABLED` (and `EXPORT_EDIT_SUPPORT_ENABLED` for edited flows).

## Minimal runtime rules (to add to BE2genie_logic)

1. Canonical read: every export path MUST call `genieService.getPersistedContent(promptId)` for unedited flows.
2. Edited flow: when edits exist, `sampleService.persistEdit(editId)` MUST run first; only after successful persistence may genieService or an ExportService produce the PDF.
3. Race handling: if content is known but not yet persisted, return 409; async APIs may offer exportId/polling to wait for persistence.
4. Dedup/metadata: include `normalizedHash` in export metadata or filename to link export to persisted record.
5. Error semantics: 400 missing promptId, 409 not persisted, 422 edit support disabled or invalid edit, 500 export failure.

## API surface (mapping)

- Legacy synchronous: `POST /export` — blocking PDF stream (keep while migrating). Must enforce canonical reads.
- New async (preferred long-term): `POST /api/v1/exports` -> returns `{ exportId }`; `GET /api/v1/exports/:id` (status); `GET /api/v1/exports/:id/download` (pdf). Feature-flag gated.

## Pseudocode — synchronous `/export` handler (unedited fast-path)

```javascript
// POST /export
async function handleExport(req, res) {
  const { promptId, editId, options } = req.body || {};

  if (!promptId && !editId) {
    return res.status(400).json({ error: "promptId required" });
  }

  // If client provided editId, route to edit branch (see below)
  if (editId) {
    return handleEditExportBranch(req, res);
  }

  // Unedited flow — must come from persisted canonical store
  const content = await genieService.getPersistedContent(promptId);
  if (!content) {
    // Not persisted yet — caller should persist or wait
    return res.status(409).json({ error: "content not persisted" });
  }

  try {
    const pdf = await genieService.generatePdfFromContent(content, options);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AetherPress-Export-${content.normalizedHash}.pdf"`
    );
    return res.send(pdf);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "export_failed", detail: err.message });
  }
}
```

## Pseudocode — edit-handling branch (feature-flag gated)

```javascript
async function handleEditExportBranch(req, res) {
  const { promptId, editId, options } = req.body || {};

  if (!features.isEnabled("EXPORT_EDIT_SUPPORT_ENABLED")) {
    return res.status(422).json({ error: "edit support disabled" });
  }

  // Validate edit exists and is owned/valid
  const edit = await sampleService.getEdit(editId);
  if (!edit) return res.status(404).json({ error: "edit_not_found" });

  // Persist the edit to the canonical store (sampleService handles write & normalization)
  try {
    const persisted = await sampleService.persistEdit(editId);

    // After successful persist, delegate to genieService (or ExportService) to produce final PDF
    const content = await genieService.getPersistedContent(persisted.promptId);
    if (!content) return res.status(409).json({ error: "persistence_failed" });

    const pdf = await genieService.generatePdfFromContent(content, options);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AetherPress-Export-${content.normalizedHash}.pdf"`
    );
    return res.send(pdf);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "edit_persist_or_export_failed", detail: err.message });
  }
}
```

## Async export mapping (short)

- POST /api/v1/exports accepts { promptId, editId?, options? } and returns { exportId }.
- Worker: same routing logic as above (unedited vs edit branch) but runs in background; update status endpoint and expose download URL on success.

## Tests and rollout (minimal)

1. Unit tests: `/export` returns 400 if missing promptId; 409 when not persisted; happy path returns PDF when persisted; edit branch returns 422 when flag off and PDF when flag on and persist succeeds.
2. Integration: end-to-end prompt→persist→export for unedited and edited paths.
3. Rollout: enforce canonical reads first (low-risk), then add async endpoints behind `EXPORT_ENABLED`, then enable `EXPORT_EDIT_SUPPORT_ENABLED` after tests.

## Closing note

- This document gives a single, operational objective and the minimal rules to implement it while preserving BE2genie guarantees. Keep this doc short and copy its rules into `BE2genie_logic.md` or reference it from the export section.

Last updated: 2025-10-27
````
