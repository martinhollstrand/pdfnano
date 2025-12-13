/**
 * PDF parsing result
 */
export interface PDFParseResult {
  /** The complete text content of the PDF */
  text: string;
  /** Array of pages with their content */
  pages: PDFPage[];
  /** All images extracted from the PDF */
  images: PDFImage[];
  /** Metadata extracted from the PDF */
  metadata: PDFMetadata;
}

/**
 * Represents a single page in a PDF document
 */
export interface PDFPage {
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

/**
 * Represents an image extracted from a PDF
 */
export interface PDFImage {
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

/**
 * PDF document metadata
 */
export interface PDFMetadata {
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

/**
 * Parser configuration options
 */
export interface ParserOptions {
  /** Maximum number of pages to process (default: 100) */
  maxPages?: number;
  /** Maximum safe file size in bytes (default: 20MB) */
  maxSafeSize?: number;
  /** Maximum number of images to extract (default: 50) */
  maxImages?: number;
} 