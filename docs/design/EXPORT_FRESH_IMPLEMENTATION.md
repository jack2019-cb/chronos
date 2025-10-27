# Export System Fresh Implementation Plan

## Overview

This document outlines the plan for implementing the export system from scratch, ensuring proper alignment with the BE2genie architecture and maintaining a clean separation of concerns.

## Implementation Phases

### Phase 1: Core Infrastructure

1. **New Service Layer**

   ```typescript
   // server/services/ExportService.ts
   interface ExportService {
     generateExport(params: {
       promptId: string;
       editId?: string;
       options?: ExportOptions;
     }): Promise<ExportResult>;

     validateContent(content: Content): Promise<ValidationResult>;

     getExportStatus(exportId: string): Promise<ExportStatus>;
   }

   // Implementation with GenieService integration
   class ExportServiceImpl implements ExportService {
     constructor(
       private genieService: GenieService,
       private sampleService: SampleService
     ) {}

     async generateExport({ promptId, editId, options }) {
       // Verify persistence
       const content = editId
         ? await this.sampleService.getEditedContent(editId)
         : await this.genieService.getPersistedContent(promptId);

       // Generate export
       return this.createExport(content, options);
     }
   }
   ```

2. **New API Layer**

   ```typescript
   // server/api/exportRoutes.ts
   export function registerExportRoutes(app: Express) {
     // Main export endpoint
     app.post("/api/v1/exports", async (req, res) => {
       const { promptId, editId, options } = req.body;
       const result = await exportService.generateExport({
         promptId,
         editId,
         options,
       });
       res.json(result);
     });

     // Status endpoint
     app.get("/api/v1/exports/:exportId", async (req, res) => {
       const status = await exportService.getExportStatus(req.params.exportId);
       res.json(status);
     });
   }
   ```

3. **Feature Flag Integration**
   ```typescript
   // server/config/features.ts
   export const Features = {
     EXPORT: {
       ENABLED: "EXPORT_ENABLED",
       BACKGROUND_JOBS: "EXPORT_BACKGROUND_JOBS_ENABLED",
       EDIT_SUPPORT: "EXPORT_EDIT_SUPPORT_ENABLED",
     },
   };
   ```

### Phase 2: Frontend Components

1. **Export Button Component**

   ```svelte
   <!-- client/src/components/ExportButton_new.svelte -->
   <script lang="ts">
     import { contentStore } from '../stores';
     import { exportService } from '../services';

     $: canExport = $contentStore?.promptId &&
                    !$contentStore.isPending;

     async function handleExport() {
       try {
         const exportId = await exportService.requestExport({
           promptId: $contentStore.promptId,
           editId: $contentStore.editId
         });

         await exportService.waitForCompletion(exportId);
       } catch (error) {
         // Handle error
       }
     }
   </script>

   <button
     disabled={!canExport}
     on:click={handleExport}
   >
     Export to PDF
   </button>
   ```

2. **Export Service Client**
   ```typescript
   // client/src/services/exportService.ts
   export class ExportService {
     async requestExport(params: {
       promptId: string;
       editId?: string;
       options?: ExportOptions;
     }): Promise<string> {
       const response = await fetch("/api/v1/exports", {
         method: "POST",
         body: JSON.stringify(params),
       });

       const { exportId } = await response.json();
       return exportId;
     }

     async waitForCompletion(exportId: string): Promise<void> {
       // Poll status endpoint until complete
       while (true) {
         const status = await this.getStatus(exportId);
         if (status.state === "completed") {
           await this.downloadExport(exportId);
           break;
         }
         if (status.state === "failed") {
           throw new Error(status.error);
         }
         await new Promise((resolve) => setTimeout(resolve, 1000));
       }
     }

     private async downloadExport(exportId: string): Promise<void> {
       const response = await fetch(`/api/v1/exports/${exportId}/download`);
       const blob = await response.blob();
       // Trigger download
       const url = URL.createObjectURL(blob);
       const a = document.createElement("a");
       a.href = url;
       a.download = `AetherPress-Export-${Date.now()}.pdf`;
       document.body.appendChild(a);
       a.click();
       URL.revokeObjectURL(url);
       a.remove();
     }
   }
   ```

### Phase 3: Testing Infrastructure

1. **Service Tests**

   ```typescript
   // server/services/__tests__/ExportService.test.ts
   describe("ExportService", () => {
     let exportService: ExportService;
     let mockGenieService: jest.Mocked<GenieService>;
     let mockSampleService: jest.Mocked<SampleService>;

     beforeEach(() => {
       mockGenieService = {
         getPersistedContent: jest.fn(),
       };
       mockSampleService = {
         getEditedContent: jest.fn(),
       };
       exportService = new ExportService(mockGenieService, mockSampleService);
     });

     it("requires promptId", async () => {
       await expect(exportService.generateExport({})).rejects.toThrow(
         "promptId required"
       );
     });

     it("uses GenieService for unedited content", async () => {
       await exportService.generateExport({
         promptId: "123",
       });
       expect(mockGenieService.getPersistedContent).toHaveBeenCalledWith("123");
     });

     it("uses SampleService for edited content", async () => {
       await exportService.generateExport({
         promptId: "123",
         editId: "456",
       });
       expect(mockSampleService.getEditedContent).toHaveBeenCalledWith("456");
     });
   });
   ```

2. **Integration Tests**

   ```typescript
   // server/api/__tests__/export.integration.test.ts
   describe("Export API", () => {
     it("handles full export flow", async () => {
       // Create test content
       const promptId = await createTestPrompt();

       // Request export
       const { exportId } = await request(app)
         .post("/api/v1/exports")
         .send({ promptId })
         .expect(200);

       // Poll until complete
       while (true) {
         const { state } = await request(app)
           .get(`/api/v1/exports/${exportId}`)
           .expect(200)
           .then((r) => r.body);

         if (state === "completed") break;
         if (state === "failed") throw new Error("Export failed");
         await new Promise((resolve) => setTimeout(resolve, 1000));
       }

       // Verify PDF
       const response = await request(app)
         .get(`/api/v1/exports/${exportId}/download`)
         .expect(200)
         .expect("Content-Type", "application/pdf");

       expect(response.body.length).toBeGreaterThan(0);
     });
   });
   ```

3. **E2E Tests**
   ```typescript
   // e2e/export.test.ts
   describe("Export Flow", () => {
     it("exports PDF from prompt", async () => {
       // Generate content
       await page.type(".prompt-input", "Test prompt");
       await page.click(".generate-button");
       await page.waitForSelector(".result-content");

       // Trigger export
       await page.click(".export-button");

       // Wait for download
       const download = await page.waitForEvent("download");
       const path = await download.path();
       expect(path).toBeTruthy();

       // Verify PDF content
       const pdf = await readPDF(path);
       expect(pdf.text).toContain("Test prompt");
     });
   });
   ```

## Deployment Strategy

### 1. Initial Setup

```bash
# Create new feature branch
git checkout -b feature/export-system-new

# Set up new directory structure
mkdir -p server/services/export
mkdir -p client/src/services/export
```

### 2. Phased Rollout

1. **Phase 1: Infrastructure (Day 1-2)**

   - Deploy new API endpoints
   - Keep old endpoints functional
   - Feature flag all new code
   - Add monitoring

2. **Phase 2: Frontend (Day 3-4)**

   - Deploy new components
   - Add feature flag checks
   - Test in staging

3. **Phase 3: Cutover (Day 5)**
   - Switch to new endpoints
   - Remove feature flags
   - Monitor metrics

### 3. Rollback Plan

```typescript
// server/config/rollback.ts
export const ROLLBACK_CONFIG = {
  // If true, fall back to old export endpoints
  USE_LEGACY_EXPORT: false,

  // Timeout for new export system (ms)
  EXPORT_TIMEOUT: 30000,

  // Auto-rollback if error rate exceeds threshold
  ERROR_THRESHOLD: 0.1,
};
```

## Monitoring

1. **Metrics to Track**

   ```typescript
   interface ExportMetrics {
     requestCount: number;
     successRate: number;
     averageDuration: number;
     errorRate: number;
     rollbackCount: number;
   }
   ```

2. **Alerts**
   ```typescript
   // monitoring/alerts.ts
   export const ALERT_CONDITIONS = {
     ERROR_RATE_HIGH: {
       condition: (m: ExportMetrics) => m.errorRate > 0.1,
       message: "Export error rate exceeds 10%",
     },
     DURATION_HIGH: {
       condition: (m: ExportMetrics) => m.averageDuration > 30000,
       message: "Export duration exceeds 30s",
     },
   };
   ```

## Success Criteria

1. **Functional Requirements**

   - [ ] Exports require valid promptId
   - [ ] All content comes from persistence layer
   - [ ] Feature flags control rollout
   - [ ] Edit support ready for future use

2. **Performance Requirements**

   - [ ] Export completion < 30s
   - [ ] Error rate < 1%
   - [ ] Zero data loss

3. **Monitoring Requirements**
   - [ ] All metrics captured
   - [ ] Alerts configured
   - [ ] Dashboards created

---

Last Updated: October 27, 2025
