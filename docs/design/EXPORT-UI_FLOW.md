# Export UI & Integration Flow (2025-10-27)

This document follows BE2genie_logic.md and describes the end-to-end flow for exporting generated content to PDF via the UI and backend services.

## Overview

This document describes the PDF export feature implementation with specific focus on alignment with the canonical generation pipeline defined in `BE2genie_logic.md`. The export system must integrate seamlessly with the existing persistence and deduplication mechanisms.

## Architectural Integration

```ascii
┌─────────────────┐
│     Client      │
│   Export UI     │
└────────┬────────┘
         │
         ▼
┌────────────────────────────┐       ┌───────────────────────┐
│    Export API Gateway      │       │   Content Pipeline    │
│    (/export endpoint)      │─────▶│  (GenieService Flow)  │
└────────────────┬───────────┘       └───────────────────────┘
                 │
                 ▼
┌────────────────────────────┐       ┌───────────────────────┐
│    Export Processing       │       │    Persistence        │
│  (PDF Generation Flow)     │◀────▶│   (Normalized DB)     │
└────────────────────────────┘       └───────────────────────┘
```

## Service Responsibility & Flow Control

The current implementation correctly assumes content immutability post-generation, as the preview editing capability has not yet been built. This leads to a clean separation of responsibilities:

1. **Unmodified Content Flow** (Current Implementation)

   - GenieService maintains full control
   - Direct path from promptId to export
   - Preserves data integrity guarantees

2. **Future Edited Content Flow** (When Preview Editing is Added)
   - SampleService will handle edited content
   - Must persist changes before export
   - Hands control back to GenieService only after persistence
   - Maintains audit trail of modifications

```ascii
Current Flow (Unmodified Content):
┌──────────┐      ┌───────────────┐     ┌─────────┐
│  Prompt  │────▶│ GenieService  │────▶│ Export  │
└──────────┘      └───────────────┘     └─────────┘

Future Flow (With Editing):
┌──────────┐      ┌───────────────┐     ┌──────────────┐      ┌───────────────┐     ┌─────────┐
│  Prompt  │────▶│ GenieService  │────▶│ Edit Content │────▶│ SampleService │────▶│ Export  │
└──────────┘      └───────────────┘     └──────────────┘      └───────────────┘     └─────────┘
                                                                  │
                                                                  ▼
                                                            [Persist Changes]
```

## Core Requirements

1. **Content Integrity**

   - All exports MUST use persisted, normalized content
   - Export requests require valid `promptId`/`resultId`
   - No bypass of canonical generation pipeline

2. **Feature Flag Compliance**

   - Honor `GENIE_PERSISTENCE_ENABLED` flag
   - Maintain consistency with BE2genie logic
   - Support test/development fallbacks

3. **Data Flow Guarantees**
   ```ascii
   ┌──────────┐     ┌──────────┐    ┌──────────┐     ┌──────────┐
   │  Prompt  │───▶│ Generate │───▶│ Persist  │───▶│  Export  │
   └──────────┘     └──────────┘    └──────────┘     └──────────┘
   ```

## Implementation Path

### 1. Frontend Components

```svelte
<script>
  import { contentStore } from './stores';
  import ExportButton from './components/ExportButton.svelte';

  // Ensure content has promptId before enabling export
  $: canExport = $contentStore?.promptId &&
                 $contentStore?.normalizedHash;
</script>

<ExportButton
  disabled={!canExport}
  on:click={handleExport}
/>
```

### 2. Export Flow Integration

```ascii
User Action
    │
    ▼
┌────────────────┐
│ Export Button  │
│   Component    │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│  Content Store │ ──┐
│   Validation   │   │
└───────┬────────┘   │
        │            │
        ▼            │
┌────────────────┐   │
│ Export Request │   │ Requires
│  with promptId │   │ promptId
└───────┬────────┘   │
        │            │
        ▼            ▼
┌────────────────────────────┐
│    GenieService Export     │
│  (Normalized Generation)   │
└───────────┬───────────────┘
            │
            ▼
┌────────────────────────────┐
│      PDF Generation        │
└────────────────────────────┘
```

## API Contract

### Export Request

```typescript
interface ExportRequest {
  promptId: string; // Required
  resultId?: string; // Optional
  format: "pdf"; // Required
  options?: {
    paper: "A4"; // Default
    orientation: "portrait"; // Default
  };
}
```

### Export Response

```typescript
interface ExportResponse {
  contentType: "application/pdf";
  filename: string; // Format: AetherPress-Export-${timestamp}.pdf
  data: Blob;
}
```

## Implementation Changes Required

1. **Client-side Updates**

   - Modify `ExportButton.svelte`:

     ```javascript
     export let disabled = true;
     export let promptId = null;

     $: disabled = !promptId;
     ```

   - Update `api.js`:
     ```javascript
     export async function exportToPdf({ promptId, options = {} }) {
       if (!promptId) throw new Error("promptId required");
       // ... export implementation
     }
     ```

2. **Server-side Updates**
   - Modify export handler:
     ```javascript
     app.post("/export", async (req, res) => {
       const { promptId } = req.body;
       if (!promptId) {
         return res.status(400).json({
           error: "promptId required",
         });
       }

       // Load from canonical store
       const content = await genieService.getPersistedContent(promptId);

       // Generate PDF
       const pdf = await generatePdf(content);

       res.type("application/pdf").send(pdf);
     });
     ```

## Testing Strategy

1. **Unit Tests**

   ```javascript
   describe("Export Flow", () => {
     it("requires promptId", async () => {
       const resp = await request(app).post("/export").send({});
       expect(resp.status).toBe(400);
     });

     it("uses persisted content", async () => {
       // Test content matches DB
     });
   });
   ```

2. **Integration Tests**

   - Verify persistence before export
   - Validate PDF generation
   - Check feature flag compliance

3. **E2E Tests**
   - Complete flow from prompt to download
   - Persistence verification
   - Content integrity checks

## Verification Checklist

- [ ] Export button disabled until content persisted
- [ ] All exports use promptId/resultId
- [ ] Feature flags honored
- [ ] Persistence verification added
- [ ] Integration tests passing
- [ ] E2E tests passing

## Monitoring

1. **Metrics**

   - Export attempts
   - Success/failure rates
   - Persistence verification
   - PDF generation time

2. **Logging**
   - Export requests
   - Persistence status
   - Error conditions
   - Performance data

## Rollout Plan

1. **Phase 1: Infrastructure**

   - Update export endpoints
   - Implement persistence checks
   - Add monitoring

2. **Phase 2: Client Updates**

   - Modify ExportButton
   - Update API client
   - Add persistence waiting

3. **Phase 3: Testing**

   - Run full test suite
   - Verify in staging
   - Monitor metrics

4. **Phase 4: Production**
   - Feature flag enabled
   - Monitor closely
   - Ready rollback plan

## Error Handling

```ascii
┌────────────────┐
│ Export Request │
└───────┬────────┘
        │
        ▼
┌────────────────┐     ┌────────────────┐
│   Validate     │────▶│    Return      │
│   promptId     │ No  │ 400 Bad Request│
└───────┬────────┘     └────────────────┘
        │ Yes
        ▼
┌────────────────┐     ┌────────────────┐
│    Check       │────▶│    Return      │
│  Persistence   │ No  │ 409 Conflict   │
└───────┬────────┘     └────────────────┘
        │ Yes
        ▼
┌────────────────┐     ┌────────────────┐
│  Generate PDF  │────▶│    Return      │
│                │ No  │ 500 Error      │
└───────┬────────┘     └────────────────┘
        │ Yes
        ▼
┌────────────────┐
│  Return PDF    │
│    Success     │
└────────────────┘
```

## Security Considerations

1. **Input Validation**

   - Strict promptId format checking
   - Size limits on requests
   - Content type verification

2. **Access Control**
   - Validate user permissions
   - Rate limiting
   - Resource quotas

## Dependencies

1. **Required Services**

   - GenieService
   - Persistence layer
   - PDF generation service

2. **Optional Services**
   - Monitoring
   - Logging
   - Analytics

---

Last Updated: October 27, 2025
