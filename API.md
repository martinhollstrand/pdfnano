# PDFNano API Documentation

This document describes the public API for the PDFify library, a pure JavaScript/TypeScript PDF parser with no external dependencies.

## Table of Contents
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [API Reference](#api-reference)
  - [PDFParser Class](#pdfparser-class)
  - [Types](#types)
  - [Utilities](#utilities)
- [Examples](#examples)

## Installation

```bash
npm install pdfnano
```

## Basic Usage

```javascript
// JavaScript
const { PDFParser } = require('pdfify');

// Parse a PDF file
const parser = new PDFParser();
parser.parseFile('/path/to/document.pdf')
  .then(result => {
    console.log(result.text); // Full text content
    console.log(result.pages); // Array of pages with text and images
    console.log(result.images); // Array of extracted images
  });
```

```typescript
// TypeScript
import { PDFParser, PDFParseResult } from 'pdfify';

// Parse a PDF file
const parser = new PDFParser();
parser.parseFile('/path/to/document.pdf')
  .then((result: PDFParseResult) => {
    console.log(result.text); // Full text content
    console.log(result.pages); // Array of pages with text and images
    console.log(result.images); // Array of extracted images
  });
```

## API Reference

### PDFParser Class

The main class for parsing PDF documents.

#### Constructor

```typescript
new PDFParser()
```

Creates a new instance of the PDF parser.

#### Methods

##### parseFile

```typescript
async parseFile(filePath: string): Promise<PDFParseResult>
```

Parses a PDF file from the given file path.

- **Parameters**:
  - `filePath` - Path to the PDF file
- **Returns**: Promise that resolves to a PDFParseResult object

##### parseBuffer

```typescript
async parseBuffer(buffer: Buffer): Promise<PDFParseResult>
```

Parses a PDF from a buffer.

- **Parameters**:
  - `buffer` - Buffer containing the PDF data
- **Returns**: Promise that resolves to a PDFParseResult object

##### parseFileToJSON

```typescript
async parseFileToJSON(filePath: string): Promise<string>
```

Parses a PDF file and returns the result as a JSON string.

- **Parameters**:
  - `filePath` - Path to the PDF file
- **Returns**: Promise that resolves to a JSON string

### Types

#### PDFParseResult

```typescript
interface PDFParseResult {
  /** The complete text content of the PDF */
  text: string;
  /** Array of pages with their content */
  pages: PDFPage[];
  /** All images extracted from the PDF */
  images: PDFImage[];
  /** Metadata extracted from the PDF */
  metadata: PDFMetadata;
}
```

#### PDFPage

```typescript
interface PDFPage {
  /** Page number (1-based) */
  pageNumber: number;
  /** Text content of the page */
  text: string;
  /** Images found on this page */
  images: PDFImage[];
  /** Width of the page in points */
  width: number;
  /** Height of the page in points */
  height: number;
}
```

#### PDFImage

```typescript
interface PDFImage {
  /** Unique identifier for the image */
  id: string;
  /** Image data as a Buffer */
  data: Buffer;
  /** MIME type of the image */
  mimeType: string;
  /** Page number where the image was found (1-based) */
  pageNumber: number;
  /** Width of the image in pixels */
  width: number;
  /** Height of the image in pixels */
  height: number;
  /** X coordinate of the image on the page */
  x: number;
  /** Y coordinate of the image on the page */
  y: number;
}
```

#### PDFMetadata

```typescript
interface PDFMetadata {
  /** Title of the document */
  title?: string;
  /** Author of the document */
  author?: string;
  /** Subject of the document */
  subject?: string;
  /** Keywords associated with the document */
  keywords?: string;
  /** Creator of the document */
  creator?: string;
  /** Producer of the document */
  producer?: string;
  /** Creation date of the document */
  creationDate?: Date;
  /** Modification date of the document */
  modificationDate?: Date;
  /** Number of pages in the document */
  pageCount: number;
  /** Whether the document is encrypted */
  isEncrypted: boolean;
}
```

### Utilities

The library also provides a set of utility functions that you can use for custom PDF handling:

#### readFileAsBuffer

```typescript
async function readFileAsBuffer(filePath: string): Promise<Buffer>
```

Reads a file as a buffer.

#### generateUniqueId

```typescript
function generateUniqueId(): string
```

Generates a unique ID for images or other elements.

#### detectImageMimeType

```typescript
function detectImageMimeType(data: Buffer): string
```

Determines the MIME type of an image from its headers.

## Examples

See the `examples` directory in the repository for complete working examples:

- `basic-usage.js` - Basic JavaScript usage example
- `typescript-usage.ts` - TypeScript usage example 