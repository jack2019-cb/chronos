/**
 * ebookService - Refactored for SERVICE_MACHINE_PATTERN
 *
 * Generates structured ebooks using the Narrative Continuity (NAT-CONT) strategy.
 *
 * Implements SERVICE_MACHINE_PATTERN:
 * 1. Extends Service base class
 * 2. Uses orchestrator.generate() exclusively for AI calls
 * 3. Declares manifest on first call
 * 4. Independent from infrastructure (no direct AI service access)
 *
 * Orchestration Pattern:
 * Step 1: Generate structure (tier: expert, callIndex: 0)
 * Step 2: Generate opening chapter (tier: expert, callIndex: 1)
 * Step 3: Generate middle chapters in batches (tier: standard, callIndex: 2+)
 * Step 4: Generate closing chapter (tier: expert, final callIndex)
 * Step 5: Compose HTML with theme
 */

const Service = require("./serviceBase");

class EbookService extends Service {
  /**
   * Generate ebook from prompt using orchestrator
   *
   * @param {Object} payload - { prompt, theme, pageCount, fontSizeScale, ... }
   * @param {Object} resourceKit - { orchestrator, onProgress, logger, config }
   * @returns {Promise<Object>} { type, html, pages, metadata }
   */
  async handle(payload, resourceKit) {
    const { orchestrator, onProgress, logger, config } = resourceKit;
    const {
      prompt,
      theme = "dark",
      pageCount = 3,
      fontSizeScale = 1.0,
    } = payload;

    const startTime = Date.now();

    try {
      // Validate inputs
      if (!prompt || !String(prompt).trim()) {
        throw this.buildError(
          "INVALID_INPUT",
          "Prompt is required and must be a non-empty string",
          { missing: { prompt: true } }
        );
      }

      if (typeof pageCount !== "number" || pageCount < 3 || pageCount > 20) {
        throw this.buildError(
          "INVALID_INPUT",
          "Page count must be between 3 and 20",
          { missing: { pageCount: true } }
        );
      }

      if (!["dark", "light", "corporate", "bold"].includes(theme)) {
        throw this.buildError(
          "INVALID_INPUT",
          "Invalid theme. Must be one of: dark, light, corporate, bold",
          { missing: { theme: true } }
        );
      }

      logger.info(
        `[ebookService] Generating ${pageCount}-page ebook: "${prompt.substring(
          0,
          50
        )}..."`
      );

      // Calculate manifest: 1 (structure) + 1 (opening) + chapters + 1 (closing)
      const cost = 1 + 1 + Math.ceil((pageCount - 2) / 2) + 1;
      const sequence = this.buildSequence(pageCount);

      // FIRST CALL: Send manifest and generate structure
      logger.info(
        `[ebookService] Manifest: ${cost} calls, ${sequence.length} requests`
      );

      const structurePrompt = this.generateStructurePrompt(prompt, pageCount);
      const structureResp = await orchestrator.generate(structurePrompt, {
        tier: "expert",
        callIndex: 0,
        manifest: {
          totalRequests: cost,
          sequence,
        },
      });

      const structure = this.parseStructure(structureResp, prompt, pageCount);
      if (!structure) {
        throw this.buildError(
          "ASSEMBLY_FAILED",
          "Failed to generate ebook structure",
          { attempted: { structure: true } }
        );
      }

      logger.info(
        `[ebookService] Structure generated: "${structure.title}" (${structure.outline.length} chapters)`
      );

      // SECOND CALL: Generate opening chapter
      const openingPrompt = this.generateOpeningPrompt(prompt, structure);
      const openingResp = await orchestrator.generate(openingPrompt, {
        tier: "expert",
        callIndex: 1,
      });

      const openingChapter = this.parseChapter(
        openingResp,
        1,
        structure.outline[0]
      );
      if (!openingChapter) {
        throw this.buildError(
          "ASSEMBLY_FAILED",
          "Failed to generate opening chapter",
          { attempted: { openingChapter: true }, missing: { chapter_1: true } }
        );
      }

      const chapters = [openingChapter];
      logger.info(`[ebookService] Opening chapter: "${openingChapter.title}"`);

      // MIDDLE CALLS: Generate chapter batches
      const batchSize = 2;
      const startIdx = 1;
      const endIdx = structure.outline.length - 1;
      let callIndex = 2;

      for (let i = startIdx; i < endIdx; i += batchSize) {
        const batchEndIdx = Math.min(i + batchSize, endIdx);
        const batchOutlines = structure.outline.slice(i, batchEndIdx);
        const prevSummary = chapters[chapters.length - 1].summary || "";

        const batchPrompt = this.generateBatchPrompt(
          prompt,
          structure,
          batchOutlines,
          prevSummary
        );

        const batchResp = await orchestrator.generate(batchPrompt, {
          tier: "standard",
          callIndex,
        });

        const batchChapters = this.parseChapterBatch(batchResp, batchOutlines);
        if (!batchChapters || batchChapters.length === 0) {
          throw this.buildError(
            "ASSEMBLY_FAILED",
            `Failed to generate chapters ${i + 1}-${batchEndIdx}`,
            { attempted: { chapters: true }, missing: { chapters: [i] } }
          );
        }

        chapters.push(...batchChapters);
        logger.info(
          `[ebookService] Generated batch: chapters ${i + 1}-${batchEndIdx}`
        );

        callIndex++;
      }

      // FINAL CALL: Generate closing chapter
      const closingPrompt = this.generateClosingPrompt(
        prompt,
        structure,
        chapters
      );
      const closingResp = await orchestrator.generate(closingPrompt, {
        tier: "expert",
        callIndex,
      });

      const closingChapter = this.parseChapter(
        closingResp,
        structure.outline.length,
        structure.outline[structure.outline.length - 1]
      );
      if (!closingChapter) {
        throw this.buildError(
          "ASSEMBLY_FAILED",
          "Failed to generate closing chapter",
          {
            attempted: { closingChapter: true },
            missing: { [structure.outline.length]: true },
          }
        );
      }

      chapters.push(closingChapter);
      logger.info(`[ebookService] Closing chapter: "${closingChapter.title}"`);

      // Compose HTML from chapters
      const html = this.composeHTML(chapters, structure, theme, fontSizeScale);
      if (!html) {
        throw this.buildError(
          "COMPOSITION_FAILED",
          "Failed to compose HTML output",
          { attempted: { composition: true } }
        );
      }

      // Notify progress
      if (onProgress) {
        onProgress({
          callsCompleted: cost,
          nextEstimatedCompletion: Date.now(),
        });
      }

      const processingTimeMs = Date.now() - startTime;
      logger.info(
        `[ebookService] Complete: ${chapters.length} chapters, ${html.length} bytes, ${processingTimeMs}ms`
      );

      return {
        type: "ebook",
        pages: chapters,
        html,
        metadata: {
          cost,
          theme,
          pageCount,
          model: "gemini-2.5",
          chapters: chapters.length,
          htmlSize: html.length,
          processingTimeMs,
        },
      };
    } catch (err) {
      logger.error("[ebookService] Error:", err);
      throw err;
    }
  }

  /**
   * Build the sequence of API calls needed for this ebook
   * Declares tier (expert/standard) for each call
   */
  buildSequence(pageCount) {
    const cost = 1 + 1 + Math.ceil((pageCount - 2) / 2) + 1;
    const sequence = [];

    sequence.push({ callIndex: 0, tier: "expert" }); // Structure
    sequence.push({ callIndex: 1, tier: "expert" }); // Opening

    // Middle chapters in batches (standard tier)
    const batchSize = 2;
    const numMiddleCalls = Math.ceil((pageCount - 2) / batchSize);
    for (let i = 0; i < numMiddleCalls; i++) {
      sequence.push({ callIndex: 2 + i, tier: "standard" });
    }

    // Final closing chapter (expert tier)
    sequence.push({
      callIndex: 2 + numMiddleCalls,
      tier: "expert",
    });

    return sequence;
  }

  /**
   * Generate prompt for structure generation
   */
  generateStructurePrompt(prompt, pageCount) {
    return `Create a detailed structure for a ${pageCount}-page eBook.

User prompt: "${prompt}"

Return valid JSON with this structure:
{
  "title": "eBook title",
  "chapters": ${pageCount},
  "outline": [
    { "chapter": 1, "title": "Chapter 1 Title", "estimated_topics": ["topic1", "topic2"] },
    { "chapter": 2, "title": "Chapter 2 Title", "estimated_topics": ["topic3"] },
    ...
  ]
}

The outline should have exactly ${pageCount} chapters.`;
  }

  /**
   * Generate prompt for opening chapter
   */
  generateOpeningPrompt(prompt, structure) {
    const { title, outline } = structure;
    const firstChapter = outline[0];

    return `Write the opening chapter of an eBook.

eBook Title: "${title}"
User Prompt: "${prompt}"
Chapter 1: "${firstChapter.title}"
Key Topics: ${firstChapter.estimated_topics.join(", ")}

Create a compelling opening that:
- Introduces the main themes
- Establishes narrative voice
- Hooks the reader

Response must be valid JSON:
{
  "chapter": 1,
  "title": "Chapter 1 Title",
  "content": "Full chapter content here...",
  "summary": "One-sentence summary"
}`;
  }

  /**
   * Generate prompt for chapter batch
   */
  generateBatchPrompt(prompt, structure, batchOutlines, prevSummary) {
    const chapterNums = batchOutlines.map((o) => o.chapter).join(", ");
    const titles = batchOutlines.map((o) => `"${o.title}"`).join(", ");

    return `Continue writing an eBook.

eBook Title: "${structure.title}"
User Prompt: "${prompt}"
Chapters to write: ${chapterNums}
Chapter Titles: ${titles}
Previous chapter summary: "${prevSummary}"

Write these chapters continuing from the previous content. Each chapter should flow naturally.

Response must be valid JSON array:
[
  {
    "chapter": 2,
    "title": "Chapter 2 Title",
    "content": "Chapter content...",
    "summary": "One-sentence summary"
  },
  {
    "chapter": 3,
    "title": "Chapter 3 Title",
    "content": "Chapter content...",
    "summary": "One-sentence summary"
  }
]`;
  }

  /**
   * Generate prompt for closing chapter
   */
  generateClosingPrompt(prompt, structure, previousChapters) {
    const finalChapterOutline = structure.outline[structure.outline.length - 1];
    const prevSummary =
      previousChapters[previousChapters.length - 1].summary || "";

    return `Write the closing chapter of an eBook.

eBook Title: "${structure.title}"
User Prompt: "${prompt}"
Final Chapter: "${finalChapterOutline.title}"
Key Topics: ${finalChapterOutline.estimated_topics.join(", ")}
Previous chapter summary: "${prevSummary}"

Create a conclusion that:
- Resolves narrative threads
- Provides closure
- Reinforces key themes

Response must be valid JSON:
{
  "chapter": ${structure.outline.length},
  "title": "Conclusion",
  "content": "Full closing chapter content...",
  "summary": "One-sentence summary"
}`;
  }

  /**
   * Parse structure response from AI
   */
  parseStructure(response, fallbackPrompt, pageCount) {
    try {
      const text = typeof response === "string" ? response : String(response);
      const parsed =
        typeof response === "object" ? response : this.extractJSON(text);

      if (
        parsed &&
        parsed.outline &&
        Array.isArray(parsed.outline) &&
        parsed.outline.length > 0
      ) {
        return parsed;
      }
    } catch (e) {
      // Fall through to synthetic
    }

    // Fallback synthetic structure
    return {
      title: `eBook: ${String(fallbackPrompt)
        .split(/\s+/)
        .slice(0, 6)
        .join(" ")}`,
      chapters: pageCount,
      outline: Array.from({ length: pageCount }, (_, i) => ({
        chapter: i + 1,
        title: `Chapter ${i + 1}`,
        estimated_topics: ["topic"],
      })),
    };
  }

  /**
   * Parse single chapter response
   */
  parseChapter(response, chapterNum, fallbackOutline) {
    try {
      const text = typeof response === "string" ? response : String(response);
      const parsed =
        typeof response === "object" ? response : this.extractJSON(text);

      if (parsed && parsed.content) {
        return {
          chapter: parsed.chapter || chapterNum,
          title: parsed.title || fallbackOutline.title,
          content: parsed.content,
          summary: parsed.summary || "Chapter summary",
        };
      }
    } catch (e) {
      // Fall through to synthetic
    }

    // Fallback synthetic chapter
    return {
      chapter: chapterNum,
      title: fallbackOutline.title,
      content: `Content for ${fallbackOutline.title}`,
      summary: "Chapter summary",
    };
  }

  /**
   * Parse batch of chapters response
   */
  parseChapterBatch(response, batchOutlines) {
    try {
      const text = typeof response === "string" ? response : String(response);
      const parsed =
        typeof response === "object" ? response : this.extractJSON(text);

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((ch) => ({
          chapter: ch.chapter,
          title: ch.title,
          content: ch.content || "",
          summary: ch.summary || "",
        }));
      }
    } catch (e) {
      // Fall through to synthetic
    }

    // Fallback synthetic chapters
    return batchOutlines.map((outline) => ({
      chapter: outline.chapter,
      title: outline.title,
      content: `Content for ${outline.title}`,
      summary: "Chapter summary",
    }));
  }

  /**
   * Extract JSON from text (handling surrounding content)
   */
  extractJSON(text) {
    // Try to extract JSON object
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch (e) {}
    }

    // Try to extract JSON array
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (e) {}
    }

    return null;
  }

  /**
   * Compose final HTML from chapters with theme
   */
  composeHTML(chapters, structure, theme, fontSizeScale) {
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

    const contentHtml = chapters
      .map(
        (ch) => `
      <section style="page-break-inside: avoid; margin: 30px 0; padding: 20px; border-left: 4px solid ${
        colors.accent
      };">
        <h2 style="color: ${colors.heading}; margin-top: 0;">Chapter ${
          ch.chapter
        }: ${ch.title}</h2>
        <p style="color: ${
          colors.text
        }; font-size: ${fontSize}px; line-height: 1.6;">${ch.content}</p>
        <p style="color: ${colors.accent}; font-style: italic; font-size: ${
          fontSize - 2
        }px;">${ch.summary}</p>
      </section>
    `
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${structure.title}</title>
  <style>
    body {
      background-color: ${colors.bg};
      color: ${colors.text};
      font-family: Georgia, serif;
      margin: 0;
      padding: 20px;
      font-size: ${fontSize}px;
    }
    h1, h2, h3 {
      color: ${colors.heading};
    }
    a {
      color: ${colors.accent};
    }
    code {
      background-color: ${colors.accent}20;
      padding: 2px 6px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <header style="text-align: center; margin-bottom: 40px; padding: 40px 0; border-bottom: 2px solid ${
    colors.accent
  };">
    <h1 style="margin: 0 0 10px 0;">${structure.title}</h1>
    <p style="color: ${
      colors.accent
    }; margin: 0;">Generated by Aether AI | ${new Date().toLocaleDateString()}</p>
  </header>

  <main>
    ${contentHtml}
  </main>

  <footer style="text-align: center; margin-top: 60px; padding-top: 20px; border-top: 1px solid ${
    colors.accent
  }; color: ${colors.accent};">
    <p>End of eBook</p>
  </footer>
</body>
</html>`;
  }
}

module.exports = new EbookService();
