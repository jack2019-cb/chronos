// Minimal ExportService skeleton
// Responsible for reading canonical content and producing export artifacts
const path = require("path");
const fs = require("fs");

class ExportService {
  constructor(opts = {}) {
    // allow injection for tests
    this.genieService = opts.genieService || require("../genieService");
    this.sampleService = opts.sampleService || require("../sampleService");
    this.tmpDir = opts.tmpDir || path.join(__dirname, "../tmp-exports");
    if (!fs.existsSync(this.tmpDir)) {
      try {
        fs.mkdirSync(this.tmpDir, { recursive: true });
      } catch (e) {}
    }
  }

  async generateExport({ promptId, editId, options } = {}) {
    if (!promptId && !editId) {
      const e = new Error("promptId or editId required");
      // @ts-ignore
      e.status = 400;
      throw e;
    }

    // Resolve canonical content
    let content;
    if (editId) {
      if (!this.sampleService || !this.sampleService.getEditedContent) {
        throw new Error("sampleService.getEditedContent not available");
      }
      content = await this.sampleService.getEditedContent(editId);
    } else {
      if (!this.genieService || !this.genieService.getPersistedContent) {
        throw new Error("genieService.getPersistedContent not available");
      }
      content = await this.genieService.getPersistedContent(promptId);
    }

    if (!content) {
      const e = new Error("persisted content not found");
      // @ts-ignore
      e.status = 404;
      throw e;
    }

    // Minimal export: serialize canonical content to a file for now and
    // return a stub exportId. The real implementation should render HTML
    // and invoke Puppeteer to produce a PDF.
    const exportId = `export-${Date.now()}-${Math.floor(
      Math.random() * 10000
    )}`;
    const dest = path.join(this.tmpDir, `${exportId}.json`);
    try {
      fs.writeFileSync(
        dest,
        JSON.stringify({ exportId, content }, null, 2),
        "utf8"
      );
    } catch (e) {
      // ignore write errors but surface them
      // eslint-disable-next-line no-console
      console.warn(
        "ExportService: failed to write export artifact",
        e && e.message
      );
    }

    return {
      exportId,
      status: "created",
      artifactPath: dest,
      promptId: content.promptId || null,
      normalizedHash: content.normalizedHash || null,
    };
  }

  // Placeholder for status retrieval
  async getExportStatus(exportId) {
    const file = path.join(this.tmpDir, `${exportId}.json`);
    if (!fs.existsSync(file)) return { state: "unknown" };
    try {
      const obj = JSON.parse(fs.readFileSync(file, "utf8"));
      return { state: "completed", exportId, artifactPath: file, meta: obj };
    } catch (e) {
      return { state: "failed", error: e && e.message };
    }
  }
}

module.exports = ExportService;
