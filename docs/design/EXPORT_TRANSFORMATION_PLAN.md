# Export System Transformation Plan (2025-10-27)

This document follows BE2genie_logic.md and EXPORT-UI_FLOW, and describes the end-to-end flow for exporting generated content to PDF via the UI and backend services -- current, versus what should be.

## Current Implementation Analysis

### Client-side Issues

1. **Export Button Component (`client/src/components/ExportButton.svelte`)**
   ```javascript
   // Current:
   contentStore.subscribe(value => {
     content = value;
   });
   
   // Needs:
   - Validation of promptId before enabling
   - Integration with persistence status
   - Future: Support for edited content workflow
   ```

2. **API Client (`client/src/lib/api.js`)**
   ```javascript
   // Current:
   export async function exportToPdf(content) {
     // Direct content POST
   }
   
   // Needs:
   - Require promptId for all exports
   - Handle edited content persistence
   - Support for background export jobs
   ```

### Server-side Issues

1. **Export Endpoints (`server/index.js`)**
   ```javascript
   // Current:
   app.post("/export", async (req, res) => {
     const { title, body } = req.body;
     // Direct PDF generation
   }
   
   // Needs:
   - Integration with GenieService flow
   - Persistence verification
   - Feature flag compliance
   ```

2. **Service Layer Integration**
   ```javascript
   // Missing:
   - GenieService export handler
   - SampleService edit persistence
   - Background job support
   ```

## Required Transformations

### Phase 1: Core Integration

1. **Client Updates**
   ```javascript
   // ExportButton.svelte
   let canExport = $contentStore?.promptId && !$contentStore?.isEdited;
   
   // api.js
   export async function exportToPdf({ promptId, options = {} }) {
     if (!promptId) throw new Error('promptId required');
     const response = await fetch('/export', {
       method: 'POST',
       body: JSON.stringify({ promptId, options })
     });
   }
   ```

2. **Server Updates**
   ```javascript
   // server/index.js
   app.post("/export", async (req, res) => {
     const { promptId } = req.body;
     if (!promptId) return res.status(400).json({
       error: 'promptId required'
     });
     
     // Load from canonical store
     const content = await genieService.getPersistedContent(promptId);
     // Generate PDF...
   });
   ```

### Phase 2: Edit Flow Support

1. **Content Store Enhancement**
   ```javascript
   // contentStore.js
   export interface Content {
     promptId?: string;
     resultId?: string;
     isEdited?: boolean;
     editId?: string;
     title: string;
     body: string;
   }
   ```

2. **SampleService Integration**
   ```javascript
   // sampleService.js
   async function persistEditedContent(content) {
     const editId = await db.saveEdit(content);
     return {
       ...content,
       editId,
       isEdited: true
     };
   }
   ```

3. **Export Flow Control**
   ```javascript
   // server/index.js
   app.post("/export", async (req, res) => {
     const { promptId, editId } = req.body;
     
     if (editId) {
       // Load edited content
       const editedContent = await sampleService.getEditedContent(editId);
       // Generate PDF...
     } else {
       // Load original content
       const content = await genieService.getPersistedContent(promptId);
       // Generate PDF...
     }
   });
   ```

## Implementation Checklist

### Phase 1
- [ ] Update ExportButton to require promptId
- [ ] Modify API client to enforce promptId
- [ ] Add GenieService integration in server
- [ ] Add persistence verification
- [ ] Implement feature flag checks

### Phase 2
- [ ] Add edit content tracking
- [ ] Implement SampleService persistence
- [ ] Update export flow for edited content
- [ ] Add background job support
- [ ] Update tests for both flows

## Testing Strategy

1. **Unmodified Content Flow**
   ```javascript
   describe('Export - Original Content', () => {
     it('requires valid promptId', async () => {
       // Test promptId validation
     });
     
     it('uses persisted content', async () => {
       // Test GenieService integration
     });
   });
   ```

2. **Edited Content Flow**
   ```javascript
   describe('Export - Edited Content', () => {
     it('persists edits before export', async () => {
       // Test edit persistence
     });
     
     it('uses correct service based on content state', async () => {
       // Test service routing
     });
   });
   ```

## Migration Notes

1. **Data Migration**
   - No schema changes required
   - Add editId column for tracking edits
   - Update existing exports to include promptId

2. **Feature Flag Strategy**
   ```javascript
   const FEATURES = {
     EDIT_PERSISTENCE: 'EDIT_PERSISTENCE_ENABLED',
     EXPORT_BACKGROUND: 'EXPORT_BACKGROUND_ENABLED'
   };
   ```

3. **Rollout Phases**
   1. Deploy structural changes
   2. Enable promptId requirement
   3. Enable edit persistence
   4. Enable background jobs

## Monitoring Considerations

1. **Metrics to Track**
   - Export attempts (with/without promptId)
   - Edit persistence success rate
   - Service routing accuracy
   - Background job completion rate

2. **Alerts**
   ```javascript
   // Example alert conditions
   if (editPersistenceFailureRate > 0.1%) {
     alert('Edit persistence failing');
   }
   ```

---

Last Updated: October 27, 2025