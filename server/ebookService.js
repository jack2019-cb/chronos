/**
 * ebookService - ebook generation service
 *
 * Provides enhanced ebook generation with support for structured metadata
 * Implements the same handler contract as demoService for consistency
 *
 * Routes through Phase B pipeline:
 * prompt → sampleService.generate() → contentChunker → themeEngine →
 * pageLayout → tocGenerator → HTML generation
 */

function buildContent(prompt) {
  const title = `Ebook: ${String(prompt || "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")}`;
  const body = `Ebook generated content for prompt: ${prompt}`;
  return { title, body, layout: "ebook-structured" };
}

function makePages(content, n = 3) {
  return Array.from({ length: n }).map((_, i) => ({
    title: `${content.title} — Chapter ${i + 1}`,
    body: `${content.body}\n\nChapter ${i + 1} content...`,
    layout: content.layout,
  }));
}

async function generateFromPrompt(prompt) {
  const content = buildContent(prompt);
  const copies = makePages(content, 3);
  const metadata = { model: "ebook-v1", pages: copies.length };
  return { content, copies, metadata };
}

/**
 * Handle enhanced payload for ebook mode
 * Generates ebook content using NAT-CONT_0 (Narrative Continuity) strategy
 * 
 * @param {Object} payload - { prompt, metadata: { theme, pageCount, colorPalette, fontSizeScale } }
 * @param {Object} classification - Optional classification data from genieService
 * @returns {Promise<Object>} Handler result { pages, metadata, html, actions }
 */
async function handle(payload, classification) {
  const startTime = Date.now();
  const requestId =
    payload && payload.requestId ? payload.requestId : `req-${startTime}`;
  console.log(
    `[EBOOK] handle START requestId=${requestId} prompt=${String(
      payload.prompt || ""
    ).substring(0, 60)} start=${startTime}`
  );
  const { prompt } = payload;
  const {
    theme = "dark",
    pageCount = 8,
    colorPalette = "standard",
    fontSizeScale = 1.0,
  } = payload.metadata || {};

  // Basic input validation
  if (!prompt || !String(prompt).trim()) {
    const e = new Error(
      "ebookService: prompt is required and must be non-empty"
    );
    // @ts-ignore
    e.status = 400;
    throw e;
  }

  if (typeof pageCount !== "number" || pageCount < 3 || pageCount > 20) {
    const e = new Error("ebookService: pageCount must be between 3 and 20");
    // @ts-ignore
    e.status = 400;
    throw e;
  }

  // Create AI service (mock or real depending on env)
  let aiSvc;
  try {
    const { createAIService } = require("./aiService");
    aiSvc = createAIService();
  } catch (err) {
    // Fallback: use a simple synchronous mock built-in if aiService is unavailable
    aiSvc = {
      async generateContent(p) {
        return {
          content: {
            title: `Auto: ${String(p).slice(0, 30)}`,
            body: String(p),
          },
        };
      },
    };
  }

  // Direct NAT-CONT_0 orchestration (no conditionals)
  const result = await handleNARRATIVE_CONT_0(payload, aiSvc);

  // Append processing timing
  const procMs = Date.now() - startTime;
  result.metadata = {
    ...(result.metadata || {}),
    processingTimeMs: procMs,
  };

  console.log(
    `[EBOOK] handle COMPLETE (nat-cont_0) requestId=${requestId} processingTimeMs=${procMs}`
  );

  return {
    title: result.metadata?.title || result.pages?.[0]?.title || "eBook",
    pages: result.pages,
    html: result.html,
    metadata: {
      ...result.metadata,
      model: "nat-cont_0",
      source: "ebook",
      theme,
      colorPalette,
      fontSizeScale,
      classification,
    },
    actions: {
      persist_prompt: true,
      generate_pdf: true,
      can_export: true,
      can_preview: true,
      can_override: true,
    },
  };
}
}

/**
 * Generate HTML from themed chunks, layout, and TOC
 * @param {Array} chunks - Themed content chunks
 * @param {Object} layout - Generated page layout
 * @param {Object} toc - Table of contents
 * @param {Object} options - { theme, title, author, fontSizeScale }
 * @returns {string} HTML string
 */
function generateHTML(chunks, layout, toc, options = {}) {
  const {
    theme = "dark",
    title = "E-book",
    author = "Aether AI",
    fontSizeScale = 1,
  } = options;

  // Define theme colors
  const themeColors = {
    dark: {
      bg: "#1a1a1a",
      text: "#ffffff",
      accent: "#00d4ff",
      heading: "#ffffff",
    },
    light: {
      bg: "#ffffff",
      text: "#000000",
      accent: "#0066cc",
      heading: "#000000",
    },
    corporate: {
      bg: "#f5f5f5",
      text: "#2c3e50",
      accent: "#34495e",
      heading: "#2c3e50",
    },
    bold: {
      bg: "#000000",
      text: "#ffff00",
      accent: "#ff6b35",
      heading: "#ff6b35",
    },
  };

  const colors = themeColors[theme] || themeColors.dark;
  const fontSize = Math.round(16 * fontSizeScale);

  // Build HTML structure
  const pageStyle = `
    background-color: ${colors.bg};
    color: ${colors.text};
    font-size: ${fontSize}px;
    font-family: Georgia, serif;
    line-height: 1.6;
    padding: 40px;
    margin: 0;
  `;

  const contentHtml = (chunks || [])
    .map(
      (chunk, idx) => `
    <div style="margin-bottom: 20px; page-break-inside: avoid;">
      <h2 style="color: ${colors.heading}; border-bottom: 2px solid ${
        colors.accent
      }; padding-bottom: 10px;">
        ${chunk.title || `Section ${idx + 1}`}
      </h2>
      <p>${chunk.content || ""}</p>
    </div>
  `
    )
    .join("");

  const tocHtml = toc
    ? `
    <div style="page-break-after: always; margin-bottom: 40px;">
      <h1 style="color: ${colors.heading};">Table of Contents</h1>
      <ul>
        ${(toc.entries || [])
          .map((entry) => `<li><a href="#${entry.id}">${entry.title}</a></li>`)
          .join("")}
      </ul>
    </div>
  `
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      ${pageStyle}
    }
    a { color: ${colors.accent}; }
    h1, h2, h3 { color: ${colors.heading}; }
  </style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 40px;">
    <h1>${title}</h1>
    <p>by ${author}</p>
  </div>
  
  ${tocHtml}
  
  <div style="page-break-after: always;"></div>
  
  ${contentHtml}
  
  <footer style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid ${colors.accent};">
    <p>Generated with Aether AI</p>
  </footer>
</body>
</html>`;
}

// ============================================================================
// PHASE 1: NAT-CONT HELPER FUNCTIONS
// ============================================================================

/**
 * Parse a single chapter response from AI
 * Handles JSON extraction from text containing surrounding content
 * @param {string} text - Raw AI response text
 * @returns {Object|null} Parsed chapter object or null
 */
function tryParseChapterResponse(text) {
  if (!text || typeof text !== "string") return null;

  // Try full text parse first
  try {
    if (/^[\s]*[\{]/.test(text)) {
      return JSON.parse(text);
    }
  } catch (e) {
    // Fall through to extraction
  }

  // Extract JSON object from surrounding text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      return null;
    }
  }

  return null;
}

/**
 * Parse a batch response containing array of chapters
 * Handles JSON extraction from text containing surrounding content
 * @param {string} text - Raw AI response text
 * @returns {Array|null} Parsed chapters array or null
 */
function tryParseBatchResponse(text) {
  if (!text || typeof text !== "string") return null;

  // Try full text parse first
  try {
    if (/^[\s]*[\[]/.test(text)) {
      return JSON.parse(text);
    }
  } catch (e) {
    // Fall through to extraction
  }

  // Extract JSON array from surrounding text
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      return null;
    }
  }

  return null;
}

/**
 * Generate opening chapter (Chapter 1) using Pro model
 * Sets narrative voice and hooks for the entire ebook
 * @param {Object} aiService - AI service with generateContentWithRotation method
 * @param {string} prompt - User's ebook prompt
 * @param {Object} structureData - Structure with title, chapters, outline
 * @returns {Promise<Object>} Chapter object { chapter, title, content, summary, image }
 */
async function generateOpeningChapter(aiService, prompt, structureData) {
  const { title, outline } = structureData;
  const firstChapterOutline = outline[0];

  const openingPrompt = `You are writing the opening chapter (Chapter 1) of an eBook.

Title: "${title}"
Chapter 1: "${firstChapterOutline.title}"
Key topics: ${(firstChapterOutline.estimated_topics || []).join(", ")}
User prompt: "${prompt}"

Your task: Write Chapter 1 with a compelling hook and establish the narrative voice.
- Introduce the main themes
- Set the tone for the entire ebook
- Create narrative momentum

Response format must be valid JSON:
{
  "chapter": 1,
  "title": "Chapter 1 title",
  "content": "Full chapter content...",
  "summary": "One sentence summary of key points",
  "image": {
    "concept": "Visual concept for this chapter",
    "suggested_style": "contemporary",
    "tone": "opening"
  }
}`;

  const response = await aiService.generateContentWithRotation(
    openingPrompt,
    1 // callIndex 1, will be routed by semantic intent in genieService
  );

  const aiText =
    (response &&
      (response.content?.body ||
        response.content?.title ||
        response.rawText)) ||
    "";

  const parsed = tryParseChapterResponse(aiText);

  if (parsed) {
    return {
      chapter: 1,
      title: parsed.title || firstChapterOutline.title,
      content: parsed.content || "Content for Chapter 1",
      summary: parsed.summary || "Opening chapter summary",
      image: parsed.image || {
        concept: "Opening",
        suggested_style: "contemporary",
        tone: "opening",
      },
    };
  }

  // Fallback synthetic chapter
  return {
    chapter: 1,
    title: firstChapterOutline.title,
    content: `Content for ${firstChapterOutline.title}\n\nContext: ${prompt}`,
    summary: `Introduction to ${title}`,
    image: {
      concept: "Opening",
      suggested_style: "contemporary",
      tone: "opening",
    },
  };
}

/**
 * Generate closing chapter (final chapter) using Pro model
 * Resolves narrative threads and provides closure
 * @param {Object} aiService - AI service with generateContentWithRotation method
 * @param {string} prompt - User's ebook prompt
 * @param {Object} structureData - Structure with title, chapters, outline
 * @param {Array<Object>} allChapters - All previously generated chapters with summaries
 * @returns {Promise<Object>} Chapter object { chapter, title, content, summary, image }
 */
async function generateClosingChapter(
  aiService,
  prompt,
  structureData,
  allChapters
) {
  const { title, chapters, outline } = structureData;
  const finalChapterOutline = outline[outline.length - 1];

  // Build context from previous chapters
  const previousSummaries = allChapters
    .map((ch) => `Chapter ${ch.chapter}: ${ch.summary}`)
    .join("\n");

  const closingPrompt = `You are writing the final chapter of an eBook.

Title: "${title}"
Final Chapter: "${finalChapterOutline.title}"
Total chapters: ${chapters}
Key topics: ${(finalChapterOutline.estimated_topics || []).join(", ")}
User prompt: "${prompt}"

Previous chapters summary:
${previousSummaries}

Your task: Write the final chapter that:
- Resolves major narrative threads
- Provides closure and conclusion
- Reflects back on the journey
- Leaves reader satisfied

Response format must be valid JSON:
{
  "chapter": ${chapters},
  "title": "Final chapter title",
  "content": "Full chapter content...",
  "summary": "One sentence summary",
  "image": {
    "concept": "Visual concept",
    "suggested_style": "contemporary",
    "tone": "conclusive"
  }
}`;

  const response = await aiService.generateContentWithRotation(
    closingPrompt,
    1 // callIndex 1, will be routed by semantic intent in genieService
  );

  const aiText =
    (response &&
      (response.content?.body ||
        response.content?.title ||
        response.rawText)) ||
    "";

  const parsed = tryParseChapterResponse(aiText);

  if (parsed) {
    return {
      chapter: chapters,
      title: parsed.title || finalChapterOutline.title,
      content: parsed.content || "Closing chapter content",
      summary: parsed.summary || "Conclusion",
      image: parsed.image || {
        concept: "Conclusion",
        suggested_style: "contemporary",
        tone: "conclusive",
      },
    };
  }

  // Fallback synthetic chapter
  return {
    chapter: chapters,
    title: finalChapterOutline.title,
    content: `${finalChapterOutline.title}\n\nConclusion and closure.`,
    summary: `Conclusion to ${title}`,
    image: {
      concept: "Conclusion",
      suggested_style: "contemporary",
      tone: "conclusive",
    },
  };
}

/**
 * Generate a batch of chapters using Flash model
 * Each batch is 2-3 chapters with context from previous chapter
 * @param {Object} aiService - AI service with generateContentWithRotation method
 * @param {string} prompt - User's ebook prompt
 * @param {Array<Object>} batchOutlines - Chapter outlines for this batch
 * @param {string} previousChapterSummary - Summary of the previous chapter for context
 * @param {number} callIndex - Call index for quota routing (>=2 for Flash model)
 * @returns {Promise<Array>} Array of chapter objects
 */
async function generateChapterBatch(
  aiService,
  prompt,
  batchOutlines,
  previousChapterSummary,
  callIndex
) {
  const batchSize = batchOutlines.length;
  const chapterNumbers = batchOutlines.map((o) => o.chapter).join(", ");

  const batchPrompt = `You are writing multiple chapters for an eBook.

Chapters to generate: ${chapterNumbers}
User prompt: "${prompt}"

Context from previous chapter:
${previousChapterSummary}

Chapter outlines to follow:
${batchOutlines
  .map(
    (o) =>
      `- Chapter ${o.chapter}: "${o.title}" (topics: ${(
        o.estimated_topics || []
      ).join(", ")})`
  )
  .join("\n")}

Continue the narrative from where the previous chapter left off. Generate all ${batchSize} chapters in sequence, maintaining narrative continuity.

Response format must be valid JSON array:
[
  {
    "chapter": number,
    "title": "Chapter title",
    "content": "Full chapter content...",
    "summary": "One sentence summary",
    "image": {
      "concept": "Visual concept",
      "suggested_style": "contemporary",
      "tone": "narrative"
    }
  },
  ...
]`;

  const response = await aiService.generateContentWithRotation(
    batchPrompt,
    callIndex // >= 2 = Flash model
  );

  const aiText =
    (response &&
      (response.content?.body ||
        response.content?.title ||
        response.rawText)) ||
    "";

  const parsed = tryParseBatchResponse(aiText);

  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed.map((chapter, idx) => ({
      chapter:
        chapter.chapter !== undefined
          ? chapter.chapter
          : batchOutlines[idx].chapter,
      title: chapter.title || batchOutlines[idx].title,
      content:
        chapter.content || `Content for Chapter ${batchOutlines[idx].chapter}`,
      summary: chapter.summary || "Chapter summary",
      image: chapter.image || {
        concept: `Concept for Chapter ${batchOutlines[idx].chapter}`,
        suggested_style: "contemporary",
        tone: "narrative",
      },
    }));
  }

  // Fallback: generate synthetic chapters
  return batchOutlines.map((outline) => ({
    chapter: outline.chapter,
    title: outline.title,
    content: `Content for ${outline.title}\n\nContext: ${prompt}`,
    summary: `Summary for Chapter ${outline.chapter}`,
    image: {
      concept: `Concept for Chapter ${outline.chapter}`,
      suggested_style: "contemporary",
      tone: "narrative",
    },
  }));
}

/**
 * Main NAT-CONT_0 handler: orchestrate ebook generation with narrative continuity
 * Strategy: Pro model handles structure + chapter 1 + final chapter
 *          Flash model handles 2-3 chapter batches in the middle
 * @param {Object} payload - { prompt, metadata: { pageCount, ... } }
 * @param {Object} aiService - Optional AI service (for testing, defaults to real service)
 * @returns {Promise<Object>} Handler result { pages, metadata, html }
 */
async function handleNARRATIVE_CONT_0(payload, aiService) {
  const { prompt } = payload;
  const { pageCount = 8 } = payload.metadata || {};

  // Input validation
  if (!prompt || !String(prompt).trim()) {
    throw new Error("ebookService: prompt is required and must be non-empty");
  }

  if (typeof pageCount !== "number" || pageCount < 3 || pageCount > 20) {
    throw new Error("ebookService: pageCount must be between 3 and 20");
  }

  const startTime = Date.now();
  let callCount = 0;

  // Create AI service (or use provided one for testing)
  let aiSvc = aiService;
  if (!aiSvc) {
    try {
      const { createAIService } = require("./aiService");
      aiSvc = createAIService();
    } catch (err) {
      aiSvc = {
        async generateContentWithRotation(p) {
          return {
            content: {
              body: JSON.stringify({
                title: "Auto Generated",
                chapters: pageCount,
                outline: Array.from({ length: pageCount }, (_, i) => ({
                  chapter: i + 1,
                  title: `Chapter ${i + 1}`,
                  estimated_topics: ["Topic"],
                })),
              }),
            },
          };
        },
      };
    }
  }

  console.log("[NAT-CONT] Starting Phase 1 (Narrative Continuity)");
  console.log("[NAT-CONT] pageCount:", pageCount);

  // Step 1: Generate structure (Pro model, callIndex=0)
  console.log("[NAT-CONT] Step 1: Generating structure");
  callCount++;

  const structurePrompt = `Create a detailed structure for a ${pageCount}-page eBook.

Prompt: "${prompt}"

Return valid JSON:
{
  "title": "eBook title",
  "chapters": ${pageCount},
  "outline": [
    { "chapter": 1, "title": "Chapter 1", "estimated_topics": ["topic1"] },
    ...
  ]
}`;

  const structureResp = await aiSvc.generateContentWithRotation(
    structurePrompt,
    0 // Pro model
  );

  const aiText =
    (structureResp &&
      (structureResp.content?.body ||
        structureResp.content?.title ||
        structureResp.rawText)) ||
    "";

  let structure = null;
  try {
    structure = JSON.parse(aiText);
  } catch {
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        structure = JSON.parse(jsonMatch[0]);
      } catch {
        // Use fallback below
      }
    }
  }

  if (!structure || !Array.isArray(structure.outline)) {
    structure = {
      title: `Ebook: ${String(prompt).split(/\s+/).slice(0, 6).join(" ")}`,
      chapters: pageCount,
      outline: Array.from({ length: pageCount }, (_, i) => ({
        chapter: i + 1,
        title: `Chapter ${i + 1}`,
        estimated_topics: ["Topic"],
      })),
    };
  }

  // Step 2: Generate opening chapter (Pro model, callIndex=1)
  console.log("[NAT-CONT] Step 2: Generating opening chapter");
  callCount++;

  const openingChapter = await generateOpeningChapter(aiSvc, prompt, structure);

  const allChapters = [openingChapter];

  // Step 3: Generate middle chapters in batches (Flash model, callIndex >= 2)
  console.log("[NAT-CONT] Step 3: Generating middle chapter batches");

  const batchSize = 2;
  const startIdx = 1; // Start after Chapter 1
  const endIdx = structure.outline.length - 1; // Stop before final chapter

  for (let i = startIdx; i < endIdx; i += batchSize) {
    const batchEndIdx = Math.min(i + batchSize, endIdx);
    const batchOutlines = structure.outline.slice(i, batchEndIdx);

    console.log(`[NAT-CONT] Batch: chapters ${i + 1}-${batchEndIdx}`);
    callCount++;

    const prevChapter = allChapters[allChapters.length - 1];
    const prevSummary = prevChapter.summary || "";

    const batchChapters = await generateChapterBatch(
      aiSvc,
      prompt,
      batchOutlines,
      prevSummary,
      callCount - 1 // Use call index for quota rotation (>= 2)
    );

    allChapters.push(...batchChapters);
  }

  // Step 4: Generate closing chapter (Pro model, callIndex=1 for final)
  console.log("[NAT-CONT] Step 4: Generating closing chapter");
  callCount++;

  const closingChapter = await generateClosingChapter(
    aiSvc,
    prompt,
    structure,
    allChapters
  );

  allChapters.push(closingChapter);

  // Verify we have exactly pageCount chapters
  const pages = allChapters.slice(0, pageCount);

  // Step 5: Generate HTML (simplified for NAT-CONT)
  const html = pages
    .map(
      (page) => `
    <div style="page-break-after: always; padding: 40px;">
      <h2>${page.title}</h2>
      <p>${page.content}</p>
    </div>
  `
    )
    .join("");

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  return {
    pages,
    metadata: {
      model: "nat-cont_0",
      duration: `${duration.toFixed(2)}s`,
      totalCalls: callCount,
      totalChapters: pages.length,
    },
    html,
  };
}

module.exports = {
  generateFromPrompt,
  buildContent,
  makePages,
  handle,
  generateHTML,
  // NAT-CONT Phase 1 helpers
  generateChapterBatch,
  generateOpeningChapter,
  generateClosingChapter,
  tryParseChapterResponse,
  tryParseBatchResponse,
  handleNARRATIVE_CONT_0,
};
