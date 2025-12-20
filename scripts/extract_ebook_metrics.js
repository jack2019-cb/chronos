#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(
  __dirname,
  "..",
  "docs",
  "design",
  "ebookService",
  "DATA"
);

function readFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch (e) {
    console.error("Error reading DATA directory:", e.message);
    process.exit(2);
  }
}

function firstMatch(re, text) {
  const m = re.exec(text);
  return m ? m[1] : "";
}

function toBytesFromKB(kbStr) {
  if (!kbStr) return "";
  const v = parseFloat(kbStr);
  if (Number.isNaN(v)) return "";
  return Math.round(v * 1024);
}

function parseFile(filepath) {
  const content = fs.readFileSync(filepath, "utf8");

  const pageCount = firstMatch(
    /COMPOSE\] Starting compose with\s*(\d+) pages/i,
    content
  );
  const theme = firstMatch(/COMPOSE\].*theme:\s*([^\s]+)/i, content);
  const colorPalette = firstMatch(/colorPalette:\s*([^\s]+)/i, content);
  const density = firstMatch(/density:\s*([^\s]+)/i, content);

  const htmlLenA = firstMatch(
    /HTML generation complete, length:\s*(\d+)/i,
    content
  );
  const htmlLenB = firstMatch(
    /Success! Generated HTML length:\s*(\d+)/i,
    content
  );
  const html_length = htmlLenA || htmlLenB || "";

  const html_present = firstMatch(
    /\[ENDPOINT\] - html present:\s*(true|false)/i,
    content
  );
  const chapters_count = firstMatch(
    /\[ENDPOINT\] - chapters count:\s*(\d+)/i,
    content
  );
  const title = firstMatch(/\[ENDPOINT\] - title:\s*(.+)/i, content)
    .replace(/\n/g, " ")
    .trim();

  const serialized_bytes = firstMatch(
    /Serialized response:\s*(\d+)\s*bytes/i,
    content
  );
  const process_ms = firstMatch(
    /genieService\.process\(\) completed in\s*(\d+)ms/i,
    content
  );

  const puppeteer_kb = firstMatch(
    /puppeteerBridge\] Setting content:\s*([0-9.]+)KB/i,
    content
  );
  const puppeteer_content_bytes = puppeteer_kb
    ? toBytesFromKB(puppeteer_kb)
    : "";

  const full_html_rendered_bytes = firstMatch(
    /renderStrategies\] ✓ Full HTML rendered:\s*(\d+)\s*bytes/i,
    content
  );
  const pdf_kb = firstMatch(/PDF generated:\s*([0-9.]+)KB/i, content);
  const pdf_bytes =
    full_html_rendered_bytes || (pdf_kb ? toBytesFromKB(pdf_kb) : "");

  const date = firstMatch(/\*\*Date\*\*:\s*(.+)/i, content)
    .replace(/@/g, "")
    .trim();
  const branch = firstMatch(/\*\*Branch\*\*:\s*`?([^`\n]+)`?/i, content);

  return {
    filename: path.relative(process.cwd(), filepath),
    pageCount: pageCount || "",
    theme: theme || "",
    colorPalette: colorPalette || "",
    density: density || "",
    html_length: html_length || "",
    html_present: html_present || "",
    chapters_count: chapters_count || "",
    title: title || "",
    serialized_bytes: serialized_bytes || "",
    process_ms: process_ms || "",
    puppeteer_content_bytes: puppeteer_content_bytes || "",
    pdf_bytes: pdf_bytes || "",
    date: date || "",
    branch: branch || "",
  };
}

function toCsvRow(obj, headers) {
  return headers
    .map((h) => {
      const v = obj[h] == null ? "" : String(obj[h]);
      // escape quotes
      return v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    })
    .join(",");
}

function main() {
  const files = readFiles(DATA_DIR);
  const headers = [
    "filename",
    "pageCount",
    "theme",
    "colorPalette",
    "density",
    "html_length",
    "html_present",
    "chapters_count",
    "title",
    "serialized_bytes",
    "process_ms",
    "puppeteer_content_bytes",
    "pdf_bytes",
    "date",
    "branch",
  ];

  const rows = [];
  for (const f of files) {
    const fp = path.join(DATA_DIR, f);
    try {
      const parsed = parseFile(fp);
      rows.push(parsed);
    } catch (e) {
      console.error("Failed to parse", f, e.message);
    }
  }

  // output CSV
  const out = [headers.join(",")];
  for (const r of rows) out.push(toCsvRow(r, headers));

  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf("--out");
  if (outIndex >= 0 && argv[outIndex + 1]) {
    const outPath = argv[outIndex + 1];
    fs.writeFileSync(outPath, out.join("\n"), "utf8");
    console.log("Wrote CSV to", outPath);
  } else {
    console.log(out.join("\n"));
  }
}

if (require.main === module) main();
