# Phase B: Intelligent eBook Service Architecture

**Date**: November 21, 2025  
**Status**: 🎯 **PHASE B ARCHITECTURE — READY FOR IMPLEMENTATION**  
**Branch**: `aetherV0/anew-default-ebook`  
**Scope**: Module structure, data flow, dependencies, high-level design
**Audience**: Architects

---

## **1. Overview**

Phase B transforms `demoService` → `ebookService` into a production-grade intelligent eBook engine. The transformation adds five core capabilities:

1. **Multi-theme support** (dark/light/corporate/bold)
2. **Intelligent content chunking** (NLP-based, 3-20 pages)
3. **Variable page counts** (user-configurable length)
4. **Context-aware image placement** (1-3 images per page)
5. **Hierarchical table of contents** (clickable PDF links)
6. **Style override** (fast-path, no regeneration)

**Timeline**: 3 weeks  
**Test Coverage Target**: >85% of ebookService code  
**Performance Target**: E2E <10 seconds (typical prompt)

---

## **2. Module Breakdown**

### **2.1 Core Modules**

Five independent modules, each with clear responsibility:

#### **Module A: ContentChunker**

- **Responsibility**: Analyze prompt, extract topics, estimate content density, calculate chapter distribution
- **Input**: `prompt: string, targetPageCount?: number`
- **Output**: `ChunkedContent { chapters, structure, totalPages, density }`
- **Dependencies**: compromise.js (NLP), helpers (wordCount, density classifier)
- **File**: `server/utils/contentChunker.js`

#### **Module B: ThemeEngine**

- **Responsibility**: Define theme variants, map colors/fonts/spacing, inject CSS variables
- **Input**: `theme: 'dark'|'light'|'corporate'|'bold'`
- **Output**: `ThemeConfig { colors, fonts, spacing, cssVariables }`
- **Dependencies**: None (pure config + utilities)
- **File**: `server/utils/themeEngine.js`

#### **Module C: PageLayout**

- **Responsibility**: Calculate layout per page count, decide image placement (1-3 per page), scale margins/spacing
- **Input**: `pageCount: number, contentDensity: string, classification: PromptClassification`
- **Output**: `PageLayoutPlan { layouts: PageLayout[], scaling, margins }`
- **Dependencies**: contentChunker (for density), helpers (calculation)
- **File**: `server/utils/pageLayout.js`

#### **Module D: TOCGenerator**

- **Responsibility**: Build hierarchical TOC, track page numbers, generate PDF anchors
- **Input**: `chapters: Chapter[], pageMap: Map<Chapter, number>`
- **Output**: `TOC { entries: TOCEntry[], anchors: Map<Chapter, string> }`
- **Dependencies**: helpers (page calculation)
- **File**: `server/utils/tocGenerator.js`

#### **Module E: OverrideService**

- **Responsibility**: Apply style/theme overrides without regenerating content (fast path)
- **Input**: `resultId: string, overrides: Partial<PromptClassification>`
- **Output**: `out_envelope (updated, cached, re-rendered)`
- **Dependencies**: themeEngine, pdfGenerator, database
- **File**: `server/utils/overrideService.js`

---

## **3. Data Flow Diagram**

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER INPUT                                  │
│                                                                 │
│  {                                                              │
│    prompt: "Summer poem collection",                            │
│    classification: { medium: "ebook", style: "minimalist", ... }│
│    pageCount: 12  (optional)                                    │
│  }                                                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│         PHASE B: INTELLIGENT EBOOK SERVICE                      │
│                                                                 │
│  ebookService.handle(prompt, classification, options)          │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌─────────┐   ┌──────────┐   ┌──────────────┐
    │ Chunker │   │  Theme   │   │ Page Layout  │
    │         │   │  Engine  │   │              │
    │ Extract │   │          │   │ Calculate    │
    │ Topics  │   │ Define   │   │ Scaling      │
    │ Density │   │ Colors   │   │ Image        │
    │ Chapters│   │ Fonts    │   │ Placement    │
    └────┬────┘   └────┬─────┘   └──────┬───────┘
         │             │                │
         │ chapters    │ themeConfig    │ layoutPlan
         │             │                │
         └─────────────┼────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │   Generate Content + Images │
         │  (via Gemini + SVG Library) │
         │                             │
         │  - Chapter text per topic   │
         │  - Images (1-3 per page)    │
         │  - Citations + metadata     │
         └──────────────┬──────────────┘
                        │
                        ▼
         ┌─────────────────────────────┐
         │   TOC Generator             │
         │                             │
         │  - Build hierarchy          │
         │  - Track page numbers       │
         │  - Generate PDF anchors     │
         └──────────────┬──────────────┘
                        │
                        ▼
         ┌─────────────────────────────┐
         │   Render to HTML/CSS        │
         │                             │
         │  - Apply theme              │
         │  - Layout pages             │
         │  - Insert images            │
         │  - Add TOC links            │
         └──────────────┬──────────────┘
                        │
                        ▼
         ┌─────────────────────────────┐
         │   PDF Renderer (Puppeteer)  │
         │                             │
         │  - HTML → PDF               │
         │  - Preserve TOC links       │
         │  - Set metadata             │
         └──────────────┬──────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                       OUTPUT                                    │
│                                                                 │
│  {                                                              │
│    resultId: "uuid-xxx",                                        │
│    pdf: Buffer,                                                 │
│    metadata: { pages, theme, density, ... },                    │
│    classification: { ... enriched ... }                         │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## **4. Module Dependencies**

### **Dependency Graph**

```
contentChunker
  ├─ compromise.js (NLP)
  └─ helpers (wordCount, densityClassify)

themeEngine
  └─ (none - pure config)

pageLayout
  ├─ contentChunker (for density classification)
  └─ helpers (scaling, margin calculations)

tocGenerator
  ├─ helpers (page number tracking)
  └─ constants (TOC depth limits)

overrideService
  ├─ themeEngine (apply theme)
  ├─ pdfGenerator (Puppeteer re-render)
  ├─ database (store result)
  └─ cache (optional - speed optimization)
```

### **Import Structure**

```javascript
// In ebookService.handle()
import ContentChunker from "./utils/contentChunker.js";
import ThemeEngine from "./utils/themeEngine.js";
import PageLayout from "./utils/pageLayout.js";
import TOCGenerator from "./utils/tocGenerator.js";
import { renderHTML } from "./utils/htmlRenderer.js"; // Shared
import { generatePDF } from "./pdfGenerator.js"; // Existing

// In overrideService
import ThemeEngine from "./utils/themeEngine.js";
import { generatePDF } from "./pdfGenerator.js";
import db from "./db.js";
```

---

## **5. Data Structures**

### **Core Interfaces**

```typescript
// contentChunker output
interface ChunkedContent {
  chapters: Chapter[];
  structure: ChapterStructure[];
  totalPages: number;
  density: "light" | "medium" | "dense";
}

interface Chapter {
  id: string;
  title: string;
  topic: string;
  content: string;
  estimatedPages: number;
  level: 1 | 2; // Top-level chapter or subsection
}

// themeEngine output
interface ThemeConfig {
  name: "dark" | "light" | "corporate" | "bold";
  colors: {
    background: string;
    text: string;
    accent: string;
    headings: string;
  };
  fonts: {
    body: string;
    headings: string;
    display: string;
  };
  spacing: {
    pageMargin: string;
    lineHeight: string;
    paragraphGap: string;
  };
  cssVariables: string; // Full CSS string for injection
}

// pageLayout output
interface PageLayoutPlan {
  layouts: PageLayout[]; // One per page
  scaling: {
    imageScale: number; // 1.0 = normal, 0.8 = smaller
    textScale: number;
    marginScale: number;
  };
}

interface PageLayout {
  pageNumber: number;
  type: "cover" | "toc" | "chapter" | "content" | "conclusion";
  imageCount: 0 | 1 | 2 | 3;
  imageType: "hero" | "side-by-side" | "dual" | "overlay" | "none";
  dimensions: {
    imageWidth: string;
    imageHeight: string;
  };
}

// tocGenerator output
interface TOC {
  entries: TOCEntry[];
  anchors: Map<string, string>; // chapterId → pdfAnchor
}

interface TOCEntry {
  level: 1 | 2 | 3;
  title: string;
  pageNumber: number;
  children?: TOCEntry[];
}
```

---

## **6. Integration Points**

### **With Existing Phase A-B Components**

```
┌────────────────────────────────────┐
│   genieService (Router)            │
│                                    │
│  - Receives medium = 'ebook'       │
│  - Calls ebookService.handle()     │
│  - Routes to correct service       │
└────────────────┬───────────────────┘
                 │
                 ▼
┌────────────────────────────────────┐
│   ebookService (Phase B)            │
│                                    │
│  - Orchestrates 5 modules          │
│  - Manages content generation      │
│  - Returns out_envelope            │
└────────────────┬───────────────────┘
                 │
        ┌────────┼────────┐
        │        │        │
        ▼        ▼        ▼
   Gemini    SVG Lib   DB
  (content) (images) (results)
```

### **SVG Library Integration**

```javascript
// In pageLayout + imageGeneration phase
const imageService = {
  async getImage(topic, style) {
    // STEP 1: Query SVG Library (PostgreSQL JSONB)
    const cached = await svgLibrary.search(topic, style);
    if (cached) return cached; // Cost: $0

    // STEP 2: Fallback to Gemini
    const generated = await geminiClient.generateImage(...);

    // STEP 3: Store in library
    await svgLibrary.store(generated, metadata);

    return generated;
  }
};
```

---

## **7. Key Decisions**

| Decision                 | Rationale                                                  |
| ------------------------ | ---------------------------------------------------------- |
| NLP via compromise.js    | JS-native, fast, lightweight (vs. Python NLP)              |
| 5 independent modules    | Easy to test, reuse, evolve independently                  |
| Fast-path override       | Style changes without full regeneration saves cost/time    |
| SVG library first        | Dramatically reduces image generation cost (60%+ hit rate) |
| Hierarchical TOC         | Professional PDF with proper bookmarks + navigation        |
| CSS variables for themes | Easy to inject/override, no re-render needed               |

---

## **8. File Structure**

```
server/
  utils/
    contentChunker.js
    themeEngine.js
    pageLayout.js
    tocGenerator.js
    overrideService.js
    htmlRenderer.js (shared utility)

  __tests__/
    contentChunker.test.js
    themeEngine.test.js
    pageLayout.test.js
    tocGenerator.test.js
    overrideService.test.js
    ebookService.integration.test.js

  ebookService.js (orchestrator - modified from demoService)

shared/
  types/ (if TypeScript definitions needed)
    ebook.types.ts
```

---

## **9. Testing Strategy Overview**

| Module          | Test Count | Focus                                           |
| --------------- | ---------- | ----------------------------------------------- |
| contentChunker  | 15+        | Topic extraction, density, chapter distribution |
| themeEngine     | 10+        | All 4 themes, color/font/spacing, accessibility |
| pageLayout      | 12+        | Page count scaling (3/8/15/20), image placement |
| tocGenerator    | 8+         | Hierarchy, page numbers, anchor generation      |
| overrideService | 10+        | Override logic, fast path, cache behavior       |
| Integration     | 15+        | E2E flows, performance, regressions             |
| **Total**       | **70+**    | **>85% code coverage**                          |

(See `PHASE_B_MODULE_SPECS.md` for detailed test cases per module)

---

## **10. Performance Targets**

| Metric              | Target | Notes                        |
| ------------------- | ------ | ---------------------------- |
| E2E (prompt → PDF)  | <10s   | Typical prompt (~1000 words) |
| Content chunking    | <1s    | NLP analysis                 |
| SVG library query   | <100ms | PostgreSQL JSONB index       |
| PDF rendering       | <3s    | Puppeteer HTML→PDF           |
| Override service    | <2s    | Fast path (no regeneration)  |
| Concurrent requests | 5-10   | Simultaneous generations     |

---

## **11. Acceptance Criteria (Architecture Level)**

- [ ] All 5 modules have clear, testable interfaces
- [ ] Module dependency graph acyclic (no circular deps)
- [ ] Data flow from input → output is linear
- [ ] Integration with Phase A-B components verified (no regressions)
- [ ] SVG library integration wired (search + fallback working)
- [ ] Performance targets achievable with design (estimate <10s E2E)

---

## **Cross-References**

- **Module Details & Contracts**: See `PHASE_B_MODULE_SPECS.md`
- **Implementation Order & Timeline**: See `PHASE_B_IMPLEMENTATION_ROADMAP.md`
- **Full Phase B Spec**: See parent `AETHERPRESS_CURRENT_STATUS_AND_ROADMAP.md`

---

**Document Version**: 1.0  
**Last Updated**: November 21, 2025  
**Status**: 🎯 **READY FOR DEVELOPMENT**
