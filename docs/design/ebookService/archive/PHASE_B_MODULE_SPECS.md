# Phase B: Module Specifications & Contracts

**Date**: November 21, 2025  
**Status**: 🎯 **DETAILED MODULE CONTRACTS**  
**Branch**: `aetherV0/anew-default-ebook`  
**Purpose**: Exact interface, I/O, error handling, and test cases for each Phase B module
**Audience**: Engineers

---

## **MODULE A: ContentChunker**

**File**: `server/utils/contentChunker.js`  
**Responsibility**: Analyze prompt text, extract topics via NLP, estimate content density, calculate chapter distribution

### **Interface**

```javascript
class ContentChunker {
  // Analyze prompt and return chunked structure
  async analyze(prompt, options = {}) {
    // Input validation
    // NLP processing
    // Return ChunkedContent
  }

  // Internal helper: Extract topics via compromise.js
  _extractTopics(text) {
    // Uses compromise.js for NLP
    // Returns: { topics: string[], keywords: string[] }
  }

  // Estimate word density level
  _classifyDensity(wordCount, estimatedTopics) {
    // light: <500 words
    // medium: 500-2000 words
    // dense: >2000 words
    // Returns: 'light' | 'medium' | 'dense'
  }

  // Calculate chapter distribution
  _distributeChapters(topics, targetPageCount, density) {
    // Based on page count and density, decide chapter count
    // Distribute content across chapters
    // Returns: Chapter[]
  }
}
```

### **Contract (I/O)**

#### **Input**

```javascript
const input = {
  prompt:
    "A summer evening poem collection with themes of nostalgia and nature",
  options: {
    targetPageCount: 12, // Optional; defaults to 8
    maxChapters: 5, // Optional; defaults to 8
    minChaptersForPages: 2, // Optional; defaults to 1
  },
};
```

#### **Output (Success)**

```javascript
const output = {
  chapters: [
    {
      id: "ch1",
      title: "Summer's Golden Hour",
      topic: "nature, evening",
      content: null, // Not yet generated; will be filled by contentGenerator
      estimatedPages: 3,
      level: 1,
    },
    {
      id: "ch1-1",
      title: "Twilight Reflections",
      topic: "nostalgia, memory",
      content: null,
      estimatedPages: 2,
      level: 2,
    },
    // ... more chapters
  ],
  structure: [
    { chapterName: "Ch1", pageStart: 1, pageEnd: 3 },
    { chapterName: "Ch1-1", pageStart: 4, pageEnd: 5 },
    // ...
  ],
  totalPages: 12,
  density: "medium",
  metadata: {
    wordCount: 1200,
    estimatedTopics: ["nature", "evening", "nostalgia", "poetry"],
    complexity: 0.65,
  },
};
```

#### **Output (Error)**

```javascript
// Input validation errors
throw new Error("ContentChunker: prompt must be a non-empty string");
throw new Error("ContentChunker: targetPageCount must be 3-20");
throw new Error("ContentChunker: NLP analysis failed (compromise.js error)");
```

### **Test Cases (15+)**

| Test ID | Scenario                     | Expected Behavior                 | Notes                     |
| ------- | ---------------------------- | --------------------------------- | ------------------------- |
| CC-001  | Short prompt (100 words)     | density='light', 1-2 chapters     | Boundary case             |
| CC-002  | Medium prompt (1000 words)   | density='medium', 3-5 chapters    | Typical use               |
| CC-003  | Long prompt (3000 words)     | density='dense', 5-8 chapters     | Edge case                 |
| CC-004  | Empty prompt                 | Throw validation error            | Error case                |
| CC-005  | targetPageCount=3            | Minimal chapters, 1 page each     | Min boundary              |
| CC-006  | targetPageCount=20           | Max chapters, 2-3 pages each      | Max boundary              |
| CC-007  | NLP topics (nature, poetry)  | Topics correctly extracted        | Compromise.js integration |
| CC-008  | Duplicate topics             | Deduplicated in output            | Deduplication logic       |
| CC-009  | Hierarchical chapters        | level=1 and level=2 present       | Nesting validation        |
| CC-010  | Page distribution            | totalPages ≈ targetPageCount (±1) | Math accuracy             |
| CC-011  | Structure mapping            | pageStart/pageEnd sequential      | No overlaps or gaps       |
| CC-012  | Topic diversity              | Each chapter has unique topic     | No repetition             |
| CC-013  | Metadata calculation         | wordCount + complexity accurate   | Metadata validation       |
| CC-014  | Very short targetPageCount=3 | Single chapter + subsections      | Edge case                 |
| CC-015  | maxChapters option           | Respects chapter limit            | Option handling           |

### **Error Handling**

```javascript
try {
  const result = await chunker.analyze(prompt, { targetPageCount: 12 });
} catch (err) {
  if (err.message.includes("prompt must be")) {
    // Handle validation error
  } else if (err.message.includes("NLP analysis failed")) {
    // Handle compromise.js failure
  } else {
    // Re-throw unknown error
    throw err;
  }
}
```

### **Dependencies**

```javascript
import compromise from "compromise";
import { wordCount, densityClassify } from "../utils/helpers.js";
```

---

## **MODULE B: ThemeEngine**

**File**: `server/utils/themeEngine.js`  
**Responsibility**: Define 4 theme variants (dark/light/corporate/bold), manage colors/fonts/spacing, generate CSS variables

### **Interface**

```javascript
class ThemeEngine {
  // Get theme config by name
  getTheme(themeName) {
    // Validates theme exists
    // Returns ThemeConfig
  }

  // List all available themes
  listThemes() {
    // Returns: ['dark', 'light', 'corporate', 'bold']
  }

  // Generate full CSS string with variables
  generateCSS(themeName) {
    // :root { --color-bg: ...; --color-text: ...; }
    // Returns CSS string
  }

  // Validate theme accessibility (WCAG AA)
  validateAccessibility(themeName) {
    // Check color contrast ratios
    // Returns: { valid: boolean, issues: string[] }
  }

  // Custom theme builder (internal)
  _buildTheme(name, overrides = {}) {
    // Merge base theme with overrides
    // Validate all properties present
    // Return ThemeConfig
  }
}
```

### **Themes Definition**

#### **Dark Theme**

```javascript
{
  name: 'dark',
  colors: {
    background: '#1a1a1a',
    text: '#e0e0e0',
    accent: '#00d4ff',
    headings: '#ffffff',
    subtleText: '#a0a0a0'
  },
  fonts: {
    body: "'Georgia', serif",
    headings: "'Roboto', sans-serif",
    display: "'Playfair Display', serif"
  },
  spacing: {
    pageMargin: '1.5in',
    lineHeight: '1.8',
    paragraphGap: '1.2em'
  }
}
```

#### **Light Theme**

```javascript
{
  name: 'light',
  colors: {
    background: '#ffffff',
    text: '#333333',
    accent: '#0066cc',
    headings: '#000000',
    subtleText: '#666666'
  },
  fonts: {
    body: "'Calibri', sans-serif",
    headings: "'Arial', sans-serif",
    display: "'Georgia', serif"
  },
  spacing: {
    pageMargin: '1.25in',
    lineHeight: '1.6',
    paragraphGap: '1em'
  }
}
```

#### **Corporate Theme**

```javascript
{
  name: 'corporate',
  colors: {
    background: '#f5f5f5',
    text: '#1f1f1f',
    accent: '#003d82',
    headings: '#003d82',
    subtleText: '#555555'
  },
  fonts: {
    body: "'Segoe UI', sans-serif",
    headings: "'Segoe UI', sans-serif",
    display: "'Segoe UI', sans-serif"
  },
  spacing: {
    pageMargin: '1in',
    lineHeight: '1.5',
    paragraphGap: '0.8em'
  }
}
```

#### **Bold Theme**

```javascript
{
  name: 'bold',
  colors: {
    background: '#ffffff',
    text: '#1a1a1a',
    accent: '#ff6600',
    headings: '#ff3300',
    subtleText: '#333333'
  },
  fonts: {
    body: "'Impact', sans-serif",
    headings: "'Impact', sans-serif",
    display: "'Bebas Neue', sans-serif"
  },
  spacing: {
    pageMargin: '1.5in',
    lineHeight: '1.9',
    paragraphGap: '1.5em'
  }
}
```

### **CSS Generation**

```css
/* Example output for dark theme */
:root {
  --color-bg: #1a1a1a;
  --color-text: #e0e0e0;
  --color-accent: #00d4ff;
  --color-headings: #ffffff;
  --color-subtle: #a0a0a0;
  --font-body: "Georgia", serif;
  --font-headings: "Roboto", sans-serif;
  --font-display: "Playfair Display", serif;
  --spacing-margin: 1.5in;
  --spacing-line-height: 1.8;
  --spacing-para-gap: 1.2em;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
  line-height: var(--spacing-line-height);
}

h1,
h2,
h3 {
  color: var(--color-headings);
  font-family: var(--font-headings);
}
```

### **Accessibility Validation**

```javascript
validateAccessibility('dark')
// Returns:
{
  valid: true,
  issues: [],
  contrastRatios: {
    text: 8.2,      // text vs background
    accent: 5.5,    // accent vs background
    headings: 21.0  // headings vs background
  }
  // All ratios > 4.5:1 (WCAG AA standard)
}
```

### **Test Cases (10+)**

| Test ID | Scenario                  | Expected Behavior         | Notes              |
| ------- | ------------------------- | ------------------------- | ------------------ |
| TE-001  | getTheme('dark')          | Returns dark theme config | Happy path         |
| TE-002  | getTheme('invalid')       | Throw error               | Validation         |
| TE-003  | listThemes()              | Returns 4 themes          | Enumeration        |
| TE-004  | generateCSS('light')      | Valid CSS string          | CSS format         |
| TE-005  | Accessibility (dark)      | All ratios >4.5:1         | WCAG AA            |
| TE-006  | Accessibility (light)     | All ratios >4.5:1         | WCAG AA            |
| TE-007  | Accessibility (corporate) | All ratios >4.5:1         | WCAG AA            |
| TE-008  | Accessibility (bold)      | All ratios >4.5:1         | WCAG AA            |
| TE-009  | CSS vars unique           | No conflicts              | Variable names     |
| TE-010  | Theme completeness        | All required keys present | Completeness check |

---

## **MODULE C: PageLayout**

**File**: `server/utils/pageLayout.js`  
**Responsibility**: Calculate layout per page count, decide image placement (1-3 per page), scale margins/spacing

### **Interface**

```javascript
class PageLayout {
  // Generate layout plan for given page count
  generateLayout(pageCount, contentDensity, classification) {
    // Validate pageCount (3-20)
    // Calculate scaling factors
    // Distribute images
    // Returns PageLayoutPlan
  }

  // Calculate image placement for single page
  _calculateImagePlacement(page, density) {
    // Returns: { count: 0|1|2|3, type: 'hero'|'side-by-side'|'dual'|'overlay'|'none' }
  }

  // Scale margins and spacing based on page count
  _calculateScaling(pageCount, density) {
    // More pages → tighter spacing
    // Returns: { imageScale, textScale, marginScale }
  }
}
```

### **Contract (I/O)**

#### **Input**

```javascript
const input = {
  pageCount: 12,
  contentDensity: "medium", // 'light' | 'medium' | 'dense'
  classification: {
    style: "minimalist",
    audience: "adults",
    tone: "reflective",
  },
};
```

#### **Output (Success)**

```javascript
const output = {
  layouts: [
    {
      pageNumber: 1,
      type: "cover",
      imageCount: 1,
      imageType: "hero",
      dimensions: { imageWidth: "100%", imageHeight: "80%" },
    },
    {
      pageNumber: 2,
      type: "toc",
      imageCount: 0,
      imageType: "none",
      dimensions: { imageWidth: "0", imageHeight: "0" },
    },
    {
      pageNumber: 3,
      type: "chapter",
      imageCount: 1,
      imageType: "side-by-side",
      dimensions: { imageWidth: "45%", imageHeight: "400px" },
    },
    {
      pageNumber: 4,
      type: "content",
      imageCount: 2,
      imageType: "dual",
      dimensions: { imageWidth: "48%", imageHeight: "300px" },
    },
    // ... pages 5-11 similar
    {
      pageNumber: 12,
      type: "conclusion",
      imageCount: 1,
      imageType: "hero",
      dimensions: { imageWidth: "100%", imageHeight: "60%" },
    },
  ],
  scaling: {
    imageScale: 0.9, // 10% reduction for tight layouts
    textScale: 1.0, // No text scaling
    marginScale: 0.85, // 15% margin reduction
  },
};
```

### **Image Placement Logic**

```
Page Count ≤ 5 (sparse):
  - Cover: hero (100%)
  - TOC: none
  - Per chapter: 1 image (hero or side-by-side)
  - Conclusion: hero

Page Count 6-10 (standard):
  - Cover: hero
  - TOC: none
  - Per chapter: 1-2 images (mixed)
  - Conclusion: hero

Page Count 11-15 (dense):
  - Cover: hero
  - TOC: none
  - Per chapter: 1-2 images (mixed)
  - Conclusion: solo or dual

Page Count 16-20 (very dense):
  - Cover: hero
  - TOC: small (1 page)
  - Per chapter: 1 image (side-by-side to save space)
  - Conclusion: solo
  - Text scaling: 0.95
  - Margin scaling: 0.75
```

### **Test Cases (12+)**

| Test ID | Scenario                | Expected Behavior            | Notes              |
| ------- | ----------------------- | ---------------------------- | ------------------ |
| PL-001  | pageCount=3             | Sparse layout (1 img/page)   | Minimum            |
| PL-002  | pageCount=8             | Standard layout              | Typical            |
| PL-003  | pageCount=15            | Dense layout (1-2 imgs)      | Above typical      |
| PL-004  | pageCount=20            | Very dense layout (tight)    | Maximum            |
| PL-005  | density='light'         | More image space             | Density impact     |
| PL-006  | density='dense'         | Reduced image space          | Density impact     |
| PL-007  | imageScale output       | 0.75-1.0 range               | Scaling bounds     |
| PL-008  | marginScale output      | 0.70-1.0 range               | Scaling bounds     |
| PL-009  | Page types distribution | Cover/TOC/Chapter/Conclusion | Type correctness   |
| PL-010  | Image placement variety | Mix of placement types       | Variety validation |
| PL-011  | Invalid pageCount=2     | Throw validation error       | Boundary error     |
| PL-012  | Invalid pageCount=21    | Throw validation error       | Boundary error     |

---

## **MODULE D: TOCGenerator**

**File**: `server/utils/tocGenerator.js`  
**Responsibility**: Build hierarchical TOC, track page numbers, generate PDF anchors

### **Interface**

```javascript
class TOCGenerator {
  // Generate TOC from chapters and page mapping
  generate(chapters, pageMap) {
    // Build hierarchy (level 1 → level 2)
    // Assign page numbers
    // Generate anchors
    // Returns TOC
  }

  // Create PDF anchor from title
  _generateAnchor(title, chapterId) {
    // Converts "Summer's Golden Hour" → "ch1-summers-golden-hour"
    // Returns string
  }

  // Calculate page numbers from pageMap
  _trackPageNumbers(chapters, pageMap) {
    // Returns: { chapter1: 1, chapter2: 4, ... }
  }
}
```

### **Contract (I/O)**

#### **Input**

```javascript
const input = {
  chapters: [
    { id: "ch1", title: "Chapter 1", level: 1 },
    { id: "ch1-1", title: "Section 1.1", level: 2 },
    { id: "ch1-2", title: "Section 1.2", level: 2 },
    { id: "ch2", title: "Chapter 2", level: 1 },
    // ...
  ],
  pageMap: new Map([
    ["ch1", 1],
    ["ch1-1", 3],
    ["ch1-2", 5],
    ["ch2", 7],
    // ...
  ]),
};
```

#### **Output (Success)**

```javascript
const output = {
  entries: [
    {
      level: 1,
      title: "Chapter 1: Summer's Beginning",
      pageNumber: 1,
      anchor: "ch1-summers-beginning",
      children: [
        {
          level: 2,
          title: "The First Light",
          pageNumber: 3,
          anchor: "ch1-1-the-first-light",
          children: [],
        },
        {
          level: 2,
          title: "Warm Breezes",
          pageNumber: 5,
          anchor: "ch1-2-warm-breezes",
          children: [],
        },
      ],
    },
    {
      level: 1,
      title: "Chapter 2: Mid-Summer Reflections",
      pageNumber: 7,
      anchor: "ch2-mid-summer-reflections",
      children: [],
    },
    // ...
  ],
  anchors: new Map([
    ["ch1", "ch1-summers-beginning"],
    ["ch1-1", "ch1-1-the-first-light"],
    ["ch1-2", "ch1-2-warm-breezes"],
    ["ch2", "ch2-mid-summer-reflections"],
    // ...
  ]),
};
```

### **Test Cases (8+)**

| Test ID | Scenario                           | Expected Behavior              | Notes              |
| ------- | ---------------------------------- | ------------------------------ | ------------------ |
| TG-001  | Flat chapters (all level 1)        | Single-level TOC               | No nesting         |
| TG-002  | Hierarchical chapters (levels 1+2) | Nested TOC with children       | Standard hierarchy |
| TG-003  | Page number assignment             | Correct sequential ordering    | Page tracking      |
| TG-004  | Anchor generation                  | Valid PDF anchors (kebab-case) | Anchor format      |
| TG-005  | Special characters in titles       | Sanitized anchors              | Character handling |
| TG-006  | Missing pageMap entries            | Throw error                    | Validation         |
| TG-007  | Empty chapters array               | Return minimal TOC             | Edge case          |
| TG-008  | Deep nesting (3+ levels)           | Depth capped at 2              | Nesting limit      |

---

## **MODULE E: OverrideService**

**File**: `server/utils/overrideService.js`  
**Responsibility**: Apply style/theme overrides without regenerating content (fast path)

### **Interface**

```javascript
class OverrideService {
  // Apply override to existing result (fast path)
  async apply(resultId, overrides) {
    // Retrieve existing result from DB
    // Apply overrides (theme, colors, etc.)
    // Re-render HTML + PDF
    // Store updated result
    // Returns Result
  }

  // Validate override feasibility
  _canOverride(overrides) {
    // Returns: { valid: boolean, reason?: string }
  }

  // Build updated HTML with override applied
  _buildOverrideHTML(originalHTML, overrides) {
    // Inject new CSS variables
    // Returns modified HTML
  }
}
```

### **Contract (I/O)**

#### **Input**

```javascript
const input = {
  resultId: "result-uuid-123",
  overrides: {
    theme: "bold", // Change from 'dark' to 'bold'
    colorPalette: "vibrant", // Optional: specific color palette
    // NOT allowed: density, pageCount, chapters (content regeneration)
  },
};
```

#### **Output (Success)**

```javascript
const output = {
  resultId: "result-uuid-123",
  status: "completed",
  pdf: Buffer, // Re-rendered with new theme
  html: string, // Updated HTML with new CSS
  metadata: {
    theme: "bold",
    appliedAt: "2025-11-21T10:30:00Z",
    regenerated: false, // Key: content NOT regenerated
    cached: true,
  },
  classification: {
    theme: ["bold", "energetic"],
    // ... other classification unchanged
  },
};
```

#### **Output (Error)**

```javascript
// Invalid overrides (require content regeneration)
throw new Error(
  "OverrideService: Cannot override pageCount (requires regeneration)"
);
throw new Error(
  "OverrideService: Cannot override density (requires regeneration)"
);

// Result not found
throw new Error("OverrideService: Result UUID not found in database");
```

### **Allowed vs. Disallowed Overrides**

#### **Allowed** (style only, no regen)

- `theme` (dark → light, etc.)
- `colorPalette` (vibrant → muted, etc.)
- `fontSize` scaling (±10%)

#### **NOT Allowed** (would require content regen)

- `pageCount` (3 → 8)
- `contentDensity` (light → dense)
- `chapters` (requires new chunking)
- `medium` (would route to different service)

### **Test Cases (10+)**

| Test ID | Scenario                          | Expected Behavior                    | Notes           |
| ------- | --------------------------------- | ------------------------------------ | --------------- |
| OS-001  | Valid theme override (dark→light) | PDF re-rendered, content unchanged   | Happy path      |
| OS-002  | Valid colorPalette override       | CSS updated, HTML regenerated        | Happy path      |
| OS-003  | Invalid override (pageCount)      | Throw "requires regeneration"        | Validation      |
| OS-004  | Invalid override (density)        | Throw "requires regeneration"        | Validation      |
| OS-005  | Result UUID not found             | Throw "not found" error              | Error case      |
| OS-006  | No overrides provided             | Return original result               | No-op           |
| OS-007  | Multiple overrides                | All applied correctly                | Batch apply     |
| OS-008  | PDF re-render timing              | <2 seconds                           | Performance     |
| OS-009  | HTML CSS injection                | CSS variables properly injected      | DOM validation  |
| OS-010  | Database persistence              | Updated result stored with timestamp | DB verification |

---

## **11. Cross-Module Integration Tests (15+)**

| Test ID | Scenario                            | Flow                                        | Validation                        |
| ------- | ----------------------------------- | ------------------------------------------- | --------------------------------- |
| INT-001 | E2E: prompt → PDF (3 pages, dark)   | Chunker → Layout → Theme → TOC → Render     | PDF valid, 3 pages                |
| INT-002 | E2E: prompt → PDF (20 pages, light) | Chunker → Layout → Theme → TOC → Render     | PDF valid, 20 pages, light colors |
| INT-003 | Override after generation           | Generate (dark) → Override (light)          | PDF changes, content unchanged    |
| INT-004 | SVG library hit (cached image)      | Chunker → Layout → ImageService (cache hit) | Cost $0 for image                 |
| INT-005 | SVG library miss (generate)         | Chunker → Layout → ImageService (miss)      | Gemini called, image stored       |
| INT-006 | TOC links in PDF                    | Generate → TOC → Render → PDF               | PDF bookmarks clickable           |
| INT-007 | Density + pageCount correlation     | Light density + 20 pages → More spacing     | Scaling validates                 |
| INT-008 | Theme accessibility in all variants | All 4 themes → validateAccessibility        | All WCAG AA compliant             |
| INT-009 | Performance <10s (typical prompt)   | 1000-word prompt, 8 pages → E2E             | Duration <10 seconds              |
| INT-010 | Zero regression (Phase A tests)     | Run all Phase A tests                       | All pass (679/688)                |
| INT-011 | Concurrent generation (5 requests)  | 5 simultaneous prompts → PDF                | All complete, no conflicts        |
| INT-012 | Large prompt (10k+ words)           | Chunker handles dense content               | Correct chapter distribution      |
| INT-013 | Chapter hierarchy (3 levels)        | Chunker → TOC → Render                      | Hierarchy correctly nested        |
| INT-014 | Image placement variety             | Multiple pageCount values                   | Varied placements visible         |
| INT-015 | Error recovery (Gemini failure)     | ImageService → Gemini error → SVG fallback  | Graceful degradation              |

---

## **12. Error Handling Strategy**

```javascript
// Pattern for all modules
try {
  const result = await module.process(input);
  return result;
} catch (err) {
  if (err.message.includes("validation")) {
    // 400 Bad Request
    throw new ValidationError(err.message);
  } else if (err.message.includes("not found")) {
    // 404 Not Found
    throw new NotFoundError(err.message);
  } else if (err.message.includes("timeout")) {
    // 504 Gateway Timeout (Gemini API timeout)
    throw new TimeoutError(err.message);
  } else {
    // 500 Internal Server Error
    throw new InternalError(err.message);
  }
}
```

---

## **Cross-References**

- **Architecture Overview**: See `PHASE_B_ARCHITECTURE.md`
- **Implementation Timeline**: See `PHASE_B_IMPLEMENTATION_ROADMAP.md`
- **Phase B Full Spec**: See parent `AETHERPRESS_CURRENT_STATUS_AND_ROADMAP.md`

---

**Document Version**: 1.0  
**Last Updated**: November 21, 2025  
**Status**: 🎯 **READY FOR DEVELOPMENT**
