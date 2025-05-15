# PDFNano

![npm version](https://img.shields.io/npm/v/pdfnano.svg)
![MIT License](https://img.shields.io/badge/license-MIT-green.svg)

A lightweight, robust PDF parsing library for Node.js written in TypeScript. Extract text, images, and metadata from PDFs—even damaged ones—with no external dependencies.

## Features

- Parse PDF structure (XREF tables, trailer, object references)
- Extract text with layout and positioning
- Extract images (JPEG, PNG, etc.)
- Get document metadata (title, author, creation date, etc.)
- Automatic recovery from damaged PDFs
- No external dependencies for core parsing
- TypeScript support

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
  console.log('Title:', result.metadata.title);
  console.log('Pages:', result.metadata.pageCount);
}

parsePDF('document.pdf');
```

## API Reference

### PDFParser

- `parseFile(filePath: string): Promise<PDFParseResult>`
- `parseBuffer(buffer: Buffer): Promise<PDFParseResult>`

### PDFParseResult
- `text: string` — All text from the PDF
- `pages: PDFPage[]` — Per-page text, images, and dimensions
- `images: PDFImage[]` — All extracted images
- `metadata: PDFMetadata` — Title, author, page count, etc.

## Advanced Usage

### Parsing from Buffer

```typescript
const buffer = fs.readFileSync('document.pdf');
const result = await parser.parseBuffer(buffer);
```

### Error Recovery

PDFNano automatically recovers from structural errors in PDFs, making it suitable for damaged or non-standard files.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT