# extract_ebook_metrics.js

**Date**: December 20, 2025  @ 12:15PM
**Branch**: `feat/ebook-nat-cont`  

---

Purpose

- Extract HTML-formation and related metrics from the Markdown test logs under `docs/design/ebookService/DATA/` and emit a CSV.

Usage

- Run and print CSV to stdout:

```bash
node scripts/extract_ebook_metrics.js
```

- Write CSV to a file:

```bash
node scripts/extract_ebook_metrics.js --out scripts/ebook_metrics.csv
```

CSV columns

- `filename` — workspace-relative path to the source MD file
- `pageCount` — compose page count (from compose start log)
- `theme` — theme logged at compose
- `colorPalette` — colorPalette logged at compose
- `density` — density logged at compose
- `html_length` — reported HTML length (bytes)
- `html_present` — endpoint reported html present flag
- `chapters_count` — endpoint reported chapters count
- `title` — endpoint title (may be 'NOT SET')
- `serialized_bytes` — size of serialized response (bytes)
- `process_ms` — `genieService.process()` total duration (ms)
- `puppeteer_content_bytes` — approx bytes from `puppeteerBridge Setting content` (converted from KB)
- `pdf_bytes` — bytes from PDF render logs (when available)
- `date` — Date metadata from file header
- `branch` — Branch metadata from file header

Notes

- The extractor uses simple regex-based heuristics and expects logs in the format used by the repository's DATA files. Missing entries are emitted empty.
- If you want the script to scan a different folder, adjust `DATA_DIR` in the script.
