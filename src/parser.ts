import * as fs from 'fs';
import {
  PDFParseResult,
  PDFImage,
  ParserOptions
} from './types';
import { readFileAsBuffer } from './utils';
import { PDFStructure, DEBUG } from './structure';
import { extractMetadata } from './metadata';
import { extractPages } from './page-tree';
import { formatToMarkdown, formatToJSON } from './output-formatters';

/**
 * Main PDF Parser class
 */
export class PDFParser {
  private options: ParserOptions;

  /**
   * Creates a new PDF parser instance
   * @param options Parser configuration options
   */
  constructor(options: ParserOptions = {}) {
    this.options = {
      maxPages: options.maxPages ?? 100,
      maxSafeSize: options.maxSafeSize ?? 20 * 1024 * 1024, // 20MB
      maxImages: options.maxImages ?? 50
    };
  }

  /**
   * Parse a PDF file
   * @param filePath Path to the PDF file
   * @returns Promise with the parse result
   */
  public async parseFile(filePath: string): Promise<PDFParseResult> {
    try {
      const fileStats = fs.statSync(filePath);

      // Check file size before loading into memory
      if (DEBUG) console.log(`Warning: Large PDF detected (${Math.round(fileStats.size / (1024 * 1024))}MB), using limited parsing mode`);
      if (fileStats.size > this.options.maxSafeSize!) {
        return this.parseLargeFile(filePath);
      }

      const buffer = await readFileAsBuffer(filePath);
      return this.parseBuffer(buffer);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Error parsing PDF file: ${errorMessage}`);
    }
  }

  /**
   * Parse a large PDF file with memory constraints
   * @param filePath Path to the large PDF file
   * @returns Promise with a simplified parse result
   */
  private async parseLargeFile(filePath: string): Promise<PDFParseResult> {
    // For large files, just return basic metadata and limited text extraction
    return {
      text: "PDF file too large for complete text extraction",
      pages: [{
        pageNumber: 1,
        width: 0,
        height: 0,
        text: "PDF file too large for complete text extraction",
        images: []
      }],
      images: [],
      metadata: {
        title: '',
        author: '',
        subject: '',
        keywords: '',
        creator: '',
        producer: '',
        pageCount: 0,
        isEncrypted: false
      }
    };
  }

  /**
   * Parse a PDF from a buffer
   * @param buffer PDF buffer
   * @returns Promise with the parse result
   */
  public async parseBuffer(buffer: Buffer): Promise<PDFParseResult> {
    try {
      // Check buffer size
      if (DEBUG) console.log(`Warning: Large PDF buffer detected (${Math.round(buffer.length / (1024 * 1024))}MB), using limited parsing mode`);
      if (buffer.length > this.options.maxSafeSize!) {
        return {
          text: "PDF buffer too large for complete text extraction",
          pages: [{
            pageNumber: 1,
            width: 0,
            height: 0,
            text: "PDF buffer too large for complete text extraction",
            images: []
          }],
          images: [],
          metadata: {
            title: '',
            author: '',
            subject: '',
            keywords: '',
            creator: '',
            producer: '',
            pageCount: 0,
            isEncrypted: false
          }
        };
      }

      // Parse the PDF structure
      const structure = new PDFStructure(buffer);
      structure.parse();

      // Extract metadata from structure
      const metadata = extractMetadata(structure);

      // Extract pages from structure
      const pages = extractPages(structure, this.options);

      // Extract images, but limit the total number to prevent memory issues
      const allImages: PDFImage[] = [];

      let imageCount = 0;
      for (const page of pages) {
        for (const image of page.images) {
          if (imageCount < this.options.maxImages!) {
            allImages.push(image);
            imageCount++;
          } else {
            break;
          }
        }

        if (imageCount >= this.options.maxImages!) {
          break;
        }
      }

      // Combine all text
      const fullText = pages.map(page => page.text).join('\n\n');

      if (pages.length === 0 && structure.xref.size === 0) {
        throw new Error('Invalid PDF: No pages found and structure is empty');
      }

      return {
        text: fullText,
        pages,
        images: allImages,
        metadata
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Error parsing PDF: ${errorMessage}`);
    }
  }

  /**
   * Extract images from a PDF buffer
   * @param buffer PDF buffer
   * @returns Array of extracted images
   */
  public async extractImagesFromBuffer(buffer: Buffer): Promise<PDFImage[]> {
    const result = await this.parseBuffer(buffer);
    return result.images;
  }

  /**
   * Extract images from a PDF file
   * @param filePath Path to the PDF file
   * @returns Array of extracted images
   */
  public async extractImagesFromFile(filePath: string): Promise<PDFImage[]> {
    const result = await this.parseFile(filePath);
    return result.images;
  }

  /**
   * Parse a PDF file and return result as JSON
   * @param filePath Path to the PDF file
   * @returns Promise with the parse result as JSON string
   */
  public async parseFileToJSON(filePath: string): Promise<string> {
    const result = await this.parseFile(filePath);
    return formatToJSON(result);
  }

  /**
   * Parse a PDF buffer and return result as JSON
   * @param buffer PDF buffer
   * @returns Promise with the parse result as JSON string
   */
  public async parseBufferToJSON(buffer: Buffer): Promise<string> {
    const result = await this.parseBuffer(buffer);
    return formatToJSON(result);
  }

  /**
   * Parse a PDF buffer and return Markdown
   * @param buffer PDF buffer
   * @returns Markdown string
   */
  public async parseBufferToMarkdown(buffer: Buffer): Promise<string> {
    const result = await this.parseBuffer(buffer);
    return formatToMarkdown(result);
  }

  /**
   * Parse a PDF file and return Markdown
   * @param filePath Path to the PDF file
   * @returns Markdown string
   */
  public async parseFileToMarkdown(filePath: string): Promise<string> {
    const result = await this.parseFile(filePath);
    return formatToMarkdown(result);
  }
}
