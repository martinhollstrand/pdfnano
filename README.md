# PDFNano

![npm version](https://img.shields.io/npm/v/pdfnano.svg)
![MIT License](https://img.shields.io/badge/license-MIT-green.svg)

A lightweight, robust PDF parsing library for Node.js written in TypeScript. Extract text, images, and metadata from PDFs — even damaged ones — with no external dependencies.

## Features

- Parse PDF structure (XRef tables, trailer, object references)
- Extract text with layout and positioning
- Extract images (JPEG, PNG, JPX, raw) with smart packaging
- Get document metadata (title, author, creation/modification dates, etc.)
- Markdown and JSON output helpers (from file or buffer)
- Automatic recovery from damaged PDFs
- TypeScript typings included

## Installation

```bash
npm install pdfnano
```

## Quick Start

```typescript
import { PDFParser } from 'pdfnano';

async function parsePDF(filePath: string) {
  const parser = new PDFParser();
  const result = await parser.parseFile(filePath);
  console.log('Full text:', result.text);
  console.log('Pages:', result.pages.length);
  console.log('Title:', result.metadata.title);
}

parsePDF('document.pdf');
```

## What’s New (This Release)

- Text decoding fixes
  - ToUnicode CMap parsing (bfchar, bfrange, array mappings)
  - UTF‑16BE ToUnicode BOM handling
  - Operator parsing fix for content streams (reliable Tj/TJ and quotes)
- Image extraction improvements
  - Returns correct `mimeType` (e.g., `image/jpeg`, `image/png`)
  - Wraps raw 8‑bit DeviceGray/DeviceRGB/RGBA pixel data into a valid PNG automatically
  - Sets accurate `pageNumber` for images
- New convenience APIs
  - Markdown output: `parseFileToMarkdown`, `parseBufferToMarkdown`
  - JSON output: `parseFileToJSON`, `parseBufferToJSON` (base64‑encodes image data)
  - Image extraction: `extractImagesFromFile`, `extractImagesFromBuffer`

## API Reference

### PDFParser methods

- Core parsing
  - `parseFile(filePath: string): Promise<PDFParseResult>`
  - `parseBuffer(buffer: Buffer): Promise<PDFParseResult>`

- Markdown and JSON helpers
  - `parseFileToMarkdown(filePath: string): Promise<string>`
  - `parseBufferToMarkdown(buffer: Buffer): Promise<string>`
  - `parseFileToJSON(filePath: string): Promise<string>`
  - `parseBufferToJSON(buffer: Buffer): Promise<string>`

- Images only
  - `extractImagesFromFile(filePath: string): Promise<PDFImage[]>`
  - `extractImagesFromBuffer(buffer: Buffer): Promise<PDFImage[]>`

### PDFParseResult

- `text: string` — All text from the PDF
- `pages: PDFPage[]` — Per-page text, images, and dimensions
- `images: PDFImage[]` — All extracted images
- `metadata: PDFMetadata` — Title, author, page count, etc.

## Examples

### Parse a file and print a Markdown summary

```typescript
import { PDFParser } from 'pdfnano';

async function toMarkdown(filePath: string) {
  const parser = new PDFParser();
  const md = await parser.parseFileToMarkdown(filePath);
  console.log(md);
}

toMarkdown('document.pdf');
```

### Parse a buffer to JSON (with images as base64)

```typescript
import { PDFParser } from 'pdfnano';
import * as fs from 'fs';

async function toJSON(filePath: string) {
  const parser = new PDFParser();
  const buf = fs.readFileSync(filePath);
  const jsonStr = await parser.parseBufferToJSON(buf);
  const json = JSON.parse(jsonStr);
  console.log(json.pages.length, 'pages');
}

toJSON('document.pdf');
```

### Extract images and save to disk

```typescript
import { PDFParser } from 'pdfnano';
import * as fs from 'fs';
import * as path from 'path';

async function saveImages(filePath: string, outDir: string) {
  const parser = new PDFParser();
  const images = await parser.extractImagesFromFile(filePath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const ext = (m: string) => m === 'image/jpeg' ? 'jpg' : (m === 'image/png' ? 'png' : 'bin');
  images.forEach((img, i) => {
    const name = `image_${i + 1}_p${img.pageNumber}_${img.width}x${img.height}.${ext(img.mimeType)}`;
    fs.writeFileSync(path.join(outDir, name), img.data);
  });
  console.log(`Saved ${images.length} image(s) to`, outDir);
}

saveImages('document.pdf', './out');
```

## Behavior With Damaged PDFs

PDFNano attempts best-effort recovery when it encounters malformed XRef tables or missing markers. This allows parsing many real-world PDFs that otherwise fail. If you prefer strict mode (reject clearly invalid inputs), add a pre-check for the `%PDF-` header before calling the parser.

## Notes & Limitations

- Image color space conversions (e.g., CMYK → RGB) are not performed. CMYK images may be returned as raw data.
- Some advanced filters (LZW, JBIG2, CCITT) are placeholders; data is returned as-is.
- Text layout reconstruction is heuristic; exact visual layout is not guaranteed.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT