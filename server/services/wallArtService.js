/**
 * wallArtService - Wall Art Generation Service
 *
 * Demonstrates SERVICE_MACHINE_PATTERN reusability.
 * Same orchestrator interface, different business logic.
 *
 * Generates conceptual wall art pieces with style analysis and composition.
 *
 * Orchestration:
 * Step 1: Analyze style and theme (tier: standard)
 * Step 2: Generate art concept and description (tier: expert)
 */

const Service = require("./serviceBase");

class WallArtService extends Service {
  /**
   * Generate wall art from prompt using orchestrator
   *
   * @param {Object} payload - { prompt, style, dimensions, ... }
   * @param {Object} resourceKit - { orchestrator, onProgress, logger, config }
   * @returns {Promise<Object>} { type, html, metadata }
   */
  async handle(payload, resourceKit) {
    const { orchestrator, onProgress, logger, config } = resourceKit;
    const {
      prompt,
      style = "contemporary",
      width = 1920,
      height = 1080,
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

      const validStyles = [
        "contemporary",
        "abstract",
        "realism",
        "surreal",
        "minimalist",
      ];
      if (!validStyles.includes(style)) {
        throw this.buildError(
          "INVALID_INPUT",
          `Invalid style. Must be one of: ${validStyles.join(", ")}`,
          { missing: { style: true } }
        );
      }

      logger.info(`[wallArtService] Generating ${style} wall art: "${prompt}"`);

      // Manifest: 2 calls (analysis + composition)
      const cost = 2;
      const sequence = [
        { callIndex: 0, tier: "standard" },
        { callIndex: 1, tier: "expert" },
      ];

      // FIRST CALL: Analyze style and theme
      const analysisPrompt = this.generateAnalysisPrompt(prompt, style);
      const analysisResp = await orchestrator.generate(analysisPrompt, {
        tier: "standard",
        callIndex: 0,
        manifest: {
          totalRequests: cost,
          sequence,
        },
      });

      const styleAnalysis = this.parseStyleAnalysis(analysisResp);
      if (!styleAnalysis) {
        throw this.buildError("ASSEMBLY_FAILED", "Failed to analyze style", {
          attempted: { analysis: true },
        });
      }

      logger.info(`[wallArtService] Style analysis: ${styleAnalysis.concept}`);

      // SECOND CALL: Generate art description and composition
      const compositionPrompt = this.generateCompositionPrompt(
        prompt,
        style,
        styleAnalysis
      );
      const compositionResp = await orchestrator.generate(compositionPrompt, {
        tier: "expert",
        callIndex: 1,
      });

      const artComposition = this.parseComposition(compositionResp);
      if (!artComposition) {
        throw this.buildError(
          "ASSEMBLY_FAILED",
          "Failed to generate art composition",
          { attempted: { composition: true } }
        );
      }

      logger.info(`[wallArtService] Composition: ${artComposition.title}`);

      // Compose HTML visualization
      const html = this.composeHTML(
        prompt,
        style,
        styleAnalysis,
        artComposition,
        width,
        height
      );

      // Notify progress
      if (onProgress) {
        onProgress({
          callsCompleted: cost,
          nextEstimatedCompletion: Date.now(),
        });
      }

      const processingTimeMs = Date.now() - startTime;
      logger.info(
        `[wallArtService] Complete: ${artComposition.title}, ${processingTimeMs}ms`
      );

      return {
        type: "wall-art",
        html,
        metadata: {
          cost,
          style,
          concept: styleAnalysis.concept,
          dimensions: { width, height },
          processingTimeMs,
        },
      };
    } catch (err) {
      logger.error("[wallArtService] Error:", err);
      throw err;
    }
  }

  /**
   * Generate style analysis prompt
   */
  generateAnalysisPrompt(prompt, style) {
    return `Analyze the artistic style and theme for this wall art concept.

Concept: "${prompt}"
Style: ${style}

Provide analysis as JSON:
{
  "concept": "Brief art concept description",
  "color_palette": ["color1", "color2", "color3"],
  "mood": "emotional tone",
  "composition_notes": "How elements should be arranged"
}`;
  }

  /**
   * Generate composition prompt
   */
  generateCompositionPrompt(prompt, style, styleAnalysis) {
    return `Design a wall art piece based on analysis.

Concept: "${prompt}"
Style: ${style}
Concept Description: ${styleAnalysis.concept}
Color Palette: ${styleAnalysis.color_palette.join(", ")}
Mood: ${styleAnalysis.mood}
Composition: ${styleAnalysis.composition_notes}

Create detailed art specifications as JSON:
{
  "title": "Art piece title",
  "description": "Detailed visual description",
  "primary_colors": ["color1", "color2"],
  "focal_point": "Description of focal point",
  "dimensions_recommendation": "Portrait/Landscape/Square",
  "placement_suggestion": "Where to hang (e.g., Living room, Bedroom)"
}`;
  }

  /**
   * Parse style analysis response
   */
  parseStyleAnalysis(response) {
    try {
      // Handle orchestrator response wrapper: extract body if present
      if (response && response.content && response.content.body) {
        response = response.content.body;
      }

      const text = typeof response === "string" ? response : String(response);
      const parsed =
        typeof response === "object" ? response : this.extractJSON(text);

      if (parsed && parsed.concept && Array.isArray(parsed.color_palette)) {
        return parsed;
      }
    } catch (e) {}

    return null;
  }

  /**
   * Parse composition response
   */
  parseComposition(response) {
    try {
      const text = typeof response === "string" ? response : String(response);
      const parsed =
        typeof response === "object" ? response : this.extractJSON(text);

      if (parsed && parsed.title && parsed.description) {
        return parsed;
      }
    } catch (e) {}

    return {
      title: "Wall Art Piece",
      description: "A unique artistic creation",
      primary_colors: ["#333333", "#666666"],
      focal_point: "Central composition",
      dimensions_recommendation: "Landscape",
      placement_suggestion: "Living Room",
    };
  }

  /**
   * Extract JSON from text
   */
  extractJSON(text) {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch (e) {}
    }

    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (e) {}
    }

    return null;
  }

  /**
   * Compose HTML visualization of art concept
   */
  composeHTML(prompt, style, styleAnalysis, composition, width, height) {
    const bgGradient = this.generateGradient(styleAnalysis.color_palette);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${composition.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 40px;
      max-width: 800px;
    }
    
    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
      background: linear-gradient(135deg, ${
        styleAnalysis.color_palette[0]
      } 0%, ${styleAnalysis.color_palette[1]} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .header p {
      color: #aaa;
      font-size: 1.1em;
      margin-bottom: 5px;
    }
    
    .canvas {
      width: ${Math.min(width, 1000)}px;
      height: ${Math.min(height, 600)}px;
      background: ${bgGradient};
      border-radius: 10px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 40px;
      position: relative;
      overflow: hidden;
    }
    
    .canvas::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: 
        radial-gradient(circle at 30% 50%, rgba(255,255,255,0.1) 0%, transparent 50%),
        radial-gradient(circle at 70% 50%, rgba(0,0,0,0.2) 0%, transparent 50%);
      pointer-events: none;
    }
    
    .canvas-content {
      position: relative;
      z-index: 2;
      text-align: center;
      padding: 40px;
    }
    
    .focal-point {
      font-size: 3em;
      font-weight: bold;
      color: ${styleAnalysis.color_palette[0]};
      margin-bottom: 20px;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    }
    
    .mood {
      font-size: 1.5em;
      color: #ddd;
      font-style: italic;
    }
    
    .details {
      max-width: 900px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 40px;
    }
    
    .detail-card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 20px;
      backdrop-filter: blur(10px);
    }
    
    .detail-card h3 {
      color: ${styleAnalysis.color_palette[0]};
      margin-bottom: 10px;
      font-size: 1.3em;
    }
    
    .detail-card p {
      color: #ccc;
      line-height: 1.6;
    }
    
    .color-palette {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }
    
    .color-swatch {
      width: 40px;
      height: 40px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .footer {
      text-align: center;
      color: #999;
      font-size: 0.9em;
    }
    
    @media (max-width: 768px) {
      .header h1 {
        font-size: 2em;
      }
      
      .canvas {
        width: 100%;
        max-width: 600px;
        height: 400px;
      }
      
      .details {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${composition.title}</h1>
    <p>Style: <strong>${style}</strong></p>
    <p>${composition.placement_suggestion}</p>
  </div>
  
  <div class="canvas">
    <div class="canvas-content">
      <div class="focal-point">✦</div>
      <div class="mood">${styleAnalysis.mood}</div>
    </div>
  </div>
  
  <div class="details">
    <div class="detail-card">
      <h3>Concept</h3>
      <p>${composition.description}</p>
    </div>
    
    <div class="detail-card">
      <h3>Color Palette</h3>
      <p>${composition.primary_colors.join(", ")}</p>
      <div class="color-palette">
        ${composition.primary_colors
          .map(
            (color) =>
              `<div class="color-swatch" style="background: ${color};"></div>`
          )
          .join("")}
      </div>
    </div>
    
    <div class="detail-card">
      <h3>Focal Point</h3>
      <p>${composition.focal_point}</p>
    </div>
    
    <div class="detail-card">
      <h3>Composition Notes</h3>
      <p>${styleAnalysis.composition_notes}</p>
    </div>
  </div>
  
  <div class="footer">
    <p>Wall Art Concept generated by Aether AI | ${new Date().toLocaleDateString()}</p>
  </div>
</body>
</html>`;
  }

  /**
   * Generate CSS gradient from color palette
   */
  generateGradient(colors) {
    if (!colors || colors.length < 2) {
      return "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)";
    }

    const angle = 135;
    const stops = colors
      .map(
        (color, i) => `${color} ${Math.round((i / (colors.length - 1)) * 100)}%`
      )
      .join(", ");

    return `linear-gradient(${angle}deg, ${stops})`;
  }
}

module.exports = new WallArtService();
