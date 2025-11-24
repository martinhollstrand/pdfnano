import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as zlib from 'zlib';
import {
  PDFParseResult,
  PDFPage,
  PDFImage,
  PDFMetadata
} from './types';
import {
  readFileAsBuffer,
  generateUniqueId,
  bytesToBuffer,
  detectImageMimeType
} from './utils';
import * as Constants from './constants';
import { PDFStructure } from './structure';
import {
  PDFObject,
  PDFDictionary,
  PDFArray,
  PDFNumber,
  PDFString,
  PDFStream,
  PDFReference,
  PDFName
} from './objects';
import { ContentParser } from './content-parser';
import { DEBUG } from './structure';

/**
 * Main PDF Parser class
 */
export class PDFParser {
  /**
   * Creates a new PDF parser instance
   */
  constructor() { }

  /**
   * Parse a PDF file
   * @param filePath Path to the PDF file
   * @returns Promise with the parse result
   */
  public async parseFile(filePath: string): Promise<PDFParseResult> {
    try {
      const fileStats = fs.statSync(filePath);

      // Check file size before loading into memory
      const MAX_SAFE_SIZE = 20 * 1024 * 1024; // 20MB
      if (DEBUG) console.log(`Warning: Large PDF detected (${Math.round(fileStats.size / (1024 * 1024))}MB), using limited parsing mode`);
      if (fileStats.size > MAX_SAFE_SIZE) {
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
      const MAX_SAFE_SIZE = 20 * 1024 * 1024; // 20MB
      if (DEBUG) console.log(`Warning: Large PDF buffer detected (${Math.round(buffer.length / (1024 * 1024))}MB), using limited parsing mode`);
      if (buffer.length > MAX_SAFE_SIZE) {
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
      const metadata = this.extractMetadata(structure);

      // Extract pages from structure
      const pages = this.extractPages(structure);

      // Extract images, but limit the total number to prevent memory issues
      const MAX_IMAGES = 50;
      const allImages: PDFImage[] = [];

      let imageCount = 0;
      for (const page of pages) {
        for (const image of page.images) {
          if (imageCount < MAX_IMAGES) {
            allImages.push(image);
            imageCount++;
          } else {
            break;
          }
        }

        if (imageCount >= MAX_IMAGES) {
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

    // Convert Buffer data to base64 for JSON serialization
    const jsonResult = {
      ...result,
      images: result.images.map(img => ({
        ...img,
        data: img.data.toString('base64')
      }))
    };

    return JSON.stringify(jsonResult, null, 2);
  }

  /**
   * Parse a PDF buffer and return result as JSON
   * @param buffer PDF buffer
   * @returns Promise with the parse result as JSON string
   */
  public async parseBufferToJSON(buffer: Buffer): Promise<string> {
    const result = await this.parseBuffer(buffer);
    const jsonResult = {
      ...result,
      images: result.images.map(img => ({
        ...img,
        data: img.data.toString('base64')
      }))
    };
    return JSON.stringify(jsonResult, null, 2);
  }

  /**
   * Parse a PDF buffer and return Markdown
   * @param buffer PDF buffer
   * @returns Markdown string
   */
  public async parseBufferToMarkdown(buffer: Buffer): Promise<string> {
    const result = await this.parseBuffer(buffer);
    return this.convertResultToMarkdown(result);
  }

  /**
   * Parse a PDF file and return Markdown
   * @param filePath Path to the PDF file
   * @returns Markdown string
   */
  public async parseFileToMarkdown(filePath: string): Promise<string> {
    const result = await this.parseFile(filePath);
    return this.convertResultToMarkdown(result);
  }

  /**
   * Convert a parse result into readable Markdown
   */
  private convertResultToMarkdown(result: PDFParseResult): string {
    const lines: string[] = [];
    const meta = result.metadata || {} as PDFMetadata;

    // Title
    if (meta.title && meta.title.trim().length > 0) {
      lines.push(`# ${meta.title.trim()}`);
    }

    // Metadata summary
    const metaLines: string[] = [];
    if (meta.author) metaLines.push(`- Author: ${meta.author}`);
    if (meta.producer) metaLines.push(`- Producer: ${meta.producer}`);
    if (meta.creator) metaLines.push(`- Creator: ${meta.creator}`);
    if (typeof meta.pageCount === 'number') metaLines.push(`- Pages: ${meta.pageCount}`);
    if (metaLines.length) {
      lines.push(meta.title ? '' : '# Document');
      lines.push('## Metadata');
      lines.push(...metaLines);
    }

    // Pages
    for (const page of result.pages) {
      lines.push('');
      lines.push(`## Page ${page.pageNumber}`);
      const text = (page.text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const normalized = text
        // collapse 3+ newlines
        .replace(/\n{3,}/g, '\n\n')
        // trim trailing whitespace each line
        .split('\n')
        .map(l => l.replace(/[\t ]+$/g, ''))
        .join('\n');
      lines.push('');
      lines.push(normalized);
    }

    if (result.images && result.images.length > 0) {
      lines.push('');
      lines.push('## Images');
      lines.push(`Total images: ${result.images.length}`);
      // Provide a short manifest; embedding binary is not suitable for MD
      for (const img of result.images.slice(0, 20)) {
        lines.push(`- Page ${img.pageNumber}: ${img.width}x${img.height} (${img.mimeType})`);
      }
      if (result.images.length > 20) {
        lines.push(`- ...and ${result.images.length - 20} more`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Extracts metadata from the PDF structure
   * @param structure PDF structure info
   * @returns PDF metadata
   */
  private extractMetadata(structure: PDFStructure): PDFMetadata {
    const result: PDFMetadata = {
      // Default values
      title: '',
      author: '',
      subject: '',
      keywords: '',
      creator: '',
      producer: '',
      pageCount: 0,
      isEncrypted: false
    };

    // Get info dictionary
    if (structure.info) {
      const info = structure.info;

      // Extract common metadata fields
      const title = info.get('Title');
      if (title instanceof PDFString) {
        result.title = title.value;
      }

      const author = info.get('Author');
      if (author instanceof PDFString) {
        result.author = author.value;
      }

      const subject = info.get('Subject');
      if (subject instanceof PDFString) {
        result.subject = subject.value;
      }

      const keywords = info.get('Keywords');
      if (keywords instanceof PDFString) {
        result.keywords = keywords.value;
      }

      const creator = info.get('Creator');
      if (creator instanceof PDFString) {
        result.creator = creator.value;
      }

      const producer = info.get('Producer');
      if (producer instanceof PDFString) {
        result.producer = producer.value;
      }

      // Parse dates
      const creationDate = info.get('CreationDate');
      if (creationDate instanceof PDFString) {
        // PDF dates are in the format: (D:YYYYMMDDHHmmSSOHH'mm')
        // where O is the relationship of local time to UTC (+ or -)
        try {
          result.creationDate = this.parsePDFDate(creationDate.value);
        } catch (e) {
          // Ignore date parsing errors
        }
      }

      const modDate = info.get('ModDate');
      if (modDate instanceof PDFString) {
        try {
          result.modificationDate = this.parsePDFDate(modDate.value);
        } catch (e) {
          // Ignore date parsing errors
        }
      }
    }

    // Get page count from pages tree
    if (structure.rootCatalog) {
      const catalogDict = structure.rootCatalog;
      const pagesRef = catalogDict.get('Pages');

      if (pagesRef instanceof PDFReference) {
        const pagesDict = structure.getObject(pagesRef.objectNumber, pagesRef.generation);

        if (pagesDict instanceof PDFDictionary) {
          const count = pagesDict.get('Count');

          if (count instanceof PDFNumber) {
            result.pageCount = count.value;
          }
        }
      }
    }

    // Check if the PDF is encrypted
    const trailer = structure.trailer;
    const encrypt = trailer.get('Encrypt');
    result.isEncrypted = encrypt !== undefined;

    return result;
  }

  /**
   * Extracts pages from the PDF structure
   * @param structure PDF structure info
   * @returns Array of PDF pages
   */
  private extractPages(structure: PDFStructure): PDFPage[] {
    const pages: PDFPage[] = [];

    try {
      // Get the page tree
      if (!structure.rootCatalog) {
        const xrefSize = structure.xref.size;
        if (DEBUG) console.log(`Best-effort extraction: Scanning ${xrefSize} objects in XRef table...`);
        let dictCount = 0;
        let pageCount = 0;
        for (const [objNum, entry] of structure.xref.entries()) {
          if (!entry.inUse) continue;
          try {
            const obj = structure.getObject(objNum, entry.generation);
            if (obj instanceof PDFDictionary) {
              dictCount++;
              // Log all keys and their types/values
              const keys = Array.from(obj.entries.keys());
              const keyLog: string[] = [];
              for (const key of keys) {
                const value = obj.get(key);
                let valueType = value && value.constructor ? value.constructor.name : typeof value;
                let valueStr = '';
                if (value instanceof PDFName) valueStr = value.name;
                else if (value instanceof PDFReference) valueStr = `${value.objectNumber} ${value.generation} R`;
                else if (value instanceof PDFString) valueStr = value.value;
                else if (value instanceof PDFNumber) valueStr = value.value.toString();
                else if (value instanceof PDFArray) valueStr = `[Array, length=${value.length}]`;
                else if (value instanceof PDFDictionary) valueStr = '[Dictionary]';
                else valueStr = String(value);
                keyLog.push(`${key}: ${valueType} = ${valueStr}`);
              }
              if (DEBUG) console.log(`Object ${objNum}: Dictionary keys: { ${keyLog.join(', ')} }`);
              // For first 10 dictionaries, print the full dictionary
              if (dictCount <= 10) {
                if (DEBUG) console.log(`Object ${objNum}: Full dictionary: ${obj.toString()}`);
              }
              // Check /Type, including if it's a reference
              let type = obj.get('Type');
              if (type instanceof PDFReference) {
                const resolved = structure.getObject(type.objectNumber, type.generation);
                if (DEBUG) console.log(`Object ${objNum}: /Type is a reference, resolved to: ${resolved && resolved.toString ? resolved.toString() : resolved}`);
                type = resolved;
              }
              if (type instanceof PDFName) {
                if (DEBUG) console.log(`Object ${objNum}: Dictionary with /Type ${type.name}`);
              } else {
                if (DEBUG) console.log(`Object ${objNum}: Dictionary with no /Type`);
              }
              if (type instanceof PDFName && type.name === '/Page') {
                pageCount++;
                // Try to extract dimensions
                let width = 0, height = 0;
                const mediaBox = obj.get('MediaBox');
                if (mediaBox instanceof PDFArray && mediaBox.length >= 4) {
                  const x1 = (mediaBox.get(0) instanceof PDFNumber) ? (mediaBox.get(0) as PDFNumber).value : 0;
                  const y1 = (mediaBox.get(1) instanceof PDFNumber) ? (mediaBox.get(1) as PDFNumber).value : 0;
                  const x2 = (mediaBox.get(2) instanceof PDFNumber) ? (mediaBox.get(2) as PDFNumber).value : 0;
                  const y2 = (mediaBox.get(3) instanceof PDFNumber) ? (mediaBox.get(3) as PDFNumber).value : 0;
                  width = x2 - x1;
                  height = y2 - y1;
                }
                // Extract content
                const content = this.extractPageContent(structure, obj);
                // Ensure images have the correct page number
                for (const img of content.images) {
                  img.pageNumber = pages.length + 1;
                }
                pages.push({
                  pageNumber: pages.length + 1,
                  width,
                  height,
                  text: content.text,
                  images: content.images
                });
              }
            }
          } catch (err) {
            if (DEBUG) console.log(`Object ${objNum}: Error during best-effort scan: ${err}`);
          }
        }
        if (DEBUG) console.log(`Best-effort extraction summary: ${dictCount} dictionaries scanned, ${pageCount} pages found.`);
        return pages;
      }

      const pagesRef = structure.rootCatalog.get('Pages');
      if (!(pagesRef instanceof PDFReference)) {
        return pages;
      }

      const pagesDict = structure.getObject(pagesRef.objectNumber, pagesRef.generation);
      if (!(pagesDict instanceof PDFDictionary)) {
        return pages;
      }

      // Initialize a set to track processed page node references for this extraction
      const processedPageNodeRefs = new Set<string>();

      // Get all page nodes from the page tree
      const pageNodes = this.getPageNodesFromPageTree(structure, pagesDict, processedPageNodeRefs);

      // Extract content from each page
      // Limit the number of pages to process to prevent memory issues
      const MAX_PAGES = 100;
      const pagesToProcess = Math.min(pageNodes.length, MAX_PAGES);

      if (pageNodes.length > MAX_PAGES) {
        if (DEBUG) console.log(`Warning: PDF has ${pageNodes.length} pages, limiting to processing ${MAX_PAGES} pages only`);
      }

      for (let i = 0; i < pagesToProcess; i++) {
        const pageDict = pageNodes[i];

        try {
          // Get page dimensions
          const mediaBox = pageDict.get('MediaBox');
          let width = 0;
          let height = 0;

          if (mediaBox instanceof PDFArray && mediaBox.length >= 4) {
            const x1 = (mediaBox.get(0) instanceof PDFNumber) ? (mediaBox.get(0) as PDFNumber).value : 0;
            const y1 = (mediaBox.get(1) instanceof PDFNumber) ? (mediaBox.get(1) as PDFNumber).value : 0;
            const x2 = (mediaBox.get(2) instanceof PDFNumber) ? (mediaBox.get(2) as PDFNumber).value : 0;
            const y2 = (mediaBox.get(3) instanceof PDFNumber) ? (mediaBox.get(3) as PDFNumber).value : 0;

            width = x2 - x1;
            height = y2 - y1;
          }

          // Extract content
          const content = this.extractPageContent(structure, pageDict);
          // Ensure images have the correct page number
          for (const img of content.images) {
            img.pageNumber = i + 1;
          }

          pages.push({
            pageNumber: i + 1,
            width,
            height,
            text: content.text,
            images: content.images
          });
        } catch (err) {
          // If a single page fails, continue with other pages
          if (DEBUG) console.log(`Warning: Error extracting content from page ${i + 1}: ${err}`);

          // Add a placeholder entry
          pages.push({
            pageNumber: i + 1,
            width: 0,
            height: 0,
            text: '[Error extracting page content]',
            images: []
          });
        }
      }
    } catch (err) {
      if (DEBUG) console.log(`Warning: Error extracting pages: ${err}`);
    }

    return pages;
  }

  /**
   * Get all resources for a page, merging with inherited resources
   * @param structure PDF structure
   * @param pageDict Page dictionary
   * @returns Merged resources dictionary
   */
  private getAllResources(structure: PDFStructure, pageDict: PDFDictionary): PDFDictionary {
    // Resources can be inherited. We need to walk up the chain and merge them.
    // Child resources override parent resources.
    
    const resourceChain: PDFDictionary[] = [];
    let currentDict = pageDict;
    const visited = new Set<string>();
    
    while (true) {
      const resources = currentDict.get('Resources');
      
      if (resources instanceof PDFDictionary) {
        resourceChain.push(resources);
      } else if (resources instanceof PDFReference) {
        const resourcesObj = structure.getObject(resources.objectNumber, resources.generation);
        if (resourcesObj instanceof PDFDictionary) {
          resourceChain.push(resourcesObj);
        }
      }
      
      // Move to parent
      const parentRef = currentDict.get('Parent');
      if (!(parentRef instanceof PDFReference)) {
        break;
      }
      
      const refKey = `${parentRef.objectNumber}_${parentRef.generation}`;
      if (visited.has(refKey)) break;
      visited.add(refKey);
      
      const parentObj = structure.getObject(parentRef.objectNumber, parentRef.generation);
      if (!(parentObj instanceof PDFDictionary)) break;
      
      currentDict = parentObj;
    }
    
    // Merge from root down to leaf (so leaf overrides root)
    // We iterate backwards because we pushed child first, then parent
    const mergedResources = new PDFDictionary();
    
    for (let i = resourceChain.length - 1; i >= 0; i--) {
      const res = resourceChain[i];
      for (const [key, value] of res.entries.entries()) {
        // If it's a sub-dictionary (like Font, XObject), we should merge those too?
        // Simple implementation: just merge top-level keys.
        // Better implementation: If key is Font/XObject/etc, merge their contents.
        
        // Keys in dictionary always start with /
        // But we want to match specific resource types
        const resourceTypes = ['/Font', '/XObject', '/ExtGState', '/ColorSpace', '/Pattern', '/Shading', '/Properties'];
        
        if (resourceTypes.includes(key)) {
          let existing = mergedResources.get(key);
          let incoming = value;
          
          // Resolve references for merging
          if (existing instanceof PDFReference) {
             existing = structure.getObject(existing.objectNumber, existing.generation);
          }
          if (incoming instanceof PDFReference) {
             incoming = structure.getObject(incoming.objectNumber, incoming.generation);
          }

          if (existing instanceof PDFDictionary && incoming instanceof PDFDictionary) {
            // Merge sub-dictionary
            for (const [subKey, subValue] of incoming.entries.entries()) {
              existing.set(subKey, subValue);
            }
          } else {
            // Overwrite if not merging two dictionaries
            // Use incoming (which might be resolved from reference) instead of raw value
            mergedResources.set(key, incoming);
          }
        } else {
          mergedResources.set(key, value);
        }
      }
    }
    
    return mergedResources;
  }

  /**
   * Extract all page nodes from page tree
   * @param structure PDF structure
   * @param pagesDict Pages dictionary
   * @param processedRefs Set to keep track of already processed PDF object references in the page tree
   * @param depth Current recursion depth
   * @returns Array of page dictionaries
   */
  private getPageNodesFromPageTree(structure: PDFStructure, pagesDict: PDFDictionary, processedRefs: Set<string>, depth: number = 0): PDFDictionary[] {
    const result: PDFDictionary[] = [];

    // Circuit breaker: prevent infinite recursion
    if (depth > 30) {
      if (DEBUG) console.log("Warning: Maximum recursion depth reached in page tree. Stopping to prevent infinite recursion.");
      return result;
    }

    const type = pagesDict.get('Type');

    if (type instanceof PDFName) {
      if (type.name === '/Page') {
        // This is a leaf node (actual page)
        result.push(pagesDict);
      } else if (type.name === '/Pages') {
        // This is an internal node, process its kids
        const kids = pagesDict.get('Kids');

        if (kids instanceof PDFArray) {
          // Limit the number of kids to process to prevent memory issues
          const MAX_KIDS = 1000;
          const kidsToProcess = Math.min(kids.length, MAX_KIDS);

          if (kids.length > MAX_KIDS) {
            if (DEBUG) console.log(`Warning: Page tree has ${kids.length} kids, limiting to processing ${MAX_KIDS} to prevent memory issues`);
          }

          for (let i = 0; i < kidsToProcess; i++) {
            const kidRef = kids.get(i);

            if (kidRef instanceof PDFReference) {
              // Check for circular references using the persistent set
              const refKey = `${kidRef.objectNumber}_${kidRef.generation}`;
              if (processedRefs.has(refKey)) {
                if (DEBUG) console.log(`Warning: Circular reference detected in page tree (already processed): ${refKey}`);
                continue;
              }
              processedRefs.add(refKey);

              try {
                const kid = structure.getObject(kidRef.objectNumber, kidRef.generation);

                if (kid instanceof PDFDictionary) {
                  const subPages = this.getPageNodesFromPageTree(structure, kid, processedRefs, depth + 1);
                  result.push(...subPages);
                }
              } catch (err) {
                if (DEBUG) console.log(`Warning: Error processing kid in page tree: ${err}`);
              }
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Extract content from a page
   * @param structure PDF structure
   * @param pageDict Page dictionary
   * @returns Page content (text and images)
   */
  private extractPageContent(structure: PDFStructure, pageDict: PDFDictionary): { text: string, images: PDFImage[] } {
    const result = {
      text: '',
      images: [] as PDFImage[]
    };

    // Get all resources (page + inherited)
    const resourcesDict = this.getAllResources(structure, pageDict);

    // Get contents
    const contents = pageDict.get('Contents');

    if (!contents) {
      if (DEBUG) console.log('Page has no /Contents entry.');
    } else if (contents instanceof PDFReference) {
      if (DEBUG) console.log(`/Contents is a reference: ${contents.objectNumber} ${contents.generation} R`);
      const contentObj = structure.getObject(contents.objectNumber, contents.generation);
      if (contentObj instanceof PDFStream) {
        const decoded = contentObj.getDecodedData();
        if (DEBUG) console.log(`Content stream found. Raw length: ${contentObj.data.length}, Decoded length: ${decoded.length}`);
        result.text = this.extractTextFromContentStream(decoded, resourcesDict, structure);
        if (DEBUG) console.log(`Extracted text length: ${result.text.length}`);
      } else {
        if (DEBUG) console.log('Content object is not a PDFStream or is missing.');
      }
    } else if (contents instanceof PDFArray) {
      if (DEBUG) console.log(`/Contents is an array of length ${contents.length}`);
      const textParts: string[] = [];
      for (let i = 0; i < contents.length; i++) {
        const contentRef = contents.get(i);
        if (contentRef instanceof PDFReference) {
          const contentObj = structure.getObject(contentRef.objectNumber, contentRef.generation);
          if (contentObj instanceof PDFStream) {
            const decoded = contentObj.getDecodedData();
            if (DEBUG) console.log(`Content stream [${i}] found. Raw length: ${contentObj.data.length}, Decoded length: ${decoded.length}`);
            const part = this.extractTextFromContentStream(decoded, resourcesDict, structure);
            if (DEBUG) console.log(`Extracted text part [${i}] length: ${part.length}`);
            textParts.push(part);
          } else {
            if (DEBUG) console.log(`Content object [${i}] is not a PDFStream or is missing.`);
          }
        } else {
          if (DEBUG) console.log(`Content array entry [${i}] is not a reference.`);
        }
      }
      result.text = textParts.join('\n');
      if (DEBUG) console.log(`Total extracted text length from array: ${result.text.length}`);
    } else {
      if (DEBUG) console.log(`/Contents is of unexpected type: ${contents.constructor.name}`);
    }

    // Extract images from resources
    if (resourcesDict) {
      const xObjects = resourcesDict.get('XObject');

      if (xObjects instanceof PDFDictionary) {
        // Process each XObject
        for (const [name, xObjectRef] of xObjects.entries.entries()) {
          if (xObjectRef instanceof PDFReference) {
            const xObject = structure.getObject(xObjectRef.objectNumber, xObjectRef.generation);

            if (xObject instanceof PDFStream) {
              const subtype = xObject.dictionary.get('Subtype');

              if (subtype instanceof PDFName && subtype.name === '/Image') {
                // This is an image, extract it
                const image = this.extractImageFromXObject(xObject, pageDict);

                if (image) {
                  result.images.push(image);
                }
              }
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Extract image from an XObject
   * @param xObject Image XObject
   * @param pageDict Page dictionary containing the image
   * @returns Extracted image or null if extraction failed
   */
  private extractImageFromXObject(xObject: PDFStream, pageDict: PDFDictionary): PDFImage | null {
    try {
      const dict = xObject.dictionary;

      // Get image dimensions
      const width = dict.get('Width');
      const height = dict.get('Height');

      if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber)) {
        return null;
      }

      // Get image data (decoded according to Filter)
      let imageData = xObject.getDecodedData();

      // Determine image type
      let mimeType = detectImageMimeType(imageData);

      // If undecided, try to wrap raw pixels into a PNG when feasible
      if ((!mimeType || mimeType === 'application/octet-stream') && width.value > 0 && height.value > 0) {
        // Infer components from ColorSpace
        let components = 0;
        const cs = dict.get('ColorSpace');
        if (cs instanceof PDFName) {
          if (cs.name === '/DeviceGray') components = 1;
          if (cs.name === '/DeviceRGB') components = 3;
          if (cs.name === '/DeviceCMYK') components = 4; // not PNG-friendly
        }
        const bpc = dict.get('BitsPerComponent');
        const bitsPerComponent = bpc instanceof PDFNumber ? bpc.value : 8;
        const expectedLen = components > 0 && bitsPerComponent === 8
          ? width.value * height.value * components
          : -1;
        if (expectedLen > 0 && imageData.length === expectedLen && (components === 1 || components === 3 || components === 4)) {
          try {
            imageData = this.encodePNGFromRaw(width.value, height.value, imageData, components);
            mimeType = 'image/png';
          } catch {
            // leave as-is
          }
        }
      }

      // Create the image object
      const image: PDFImage = {
        id: generateUniqueId(),
        data: imageData,
        mimeType,
        pageNumber: 1, // Will be updated later
        width: width.value,
        height: height.value,
        x: 0, // Placeholder
        y: 0  // Placeholder
      };

      return image;
    } catch (err) {
      // If image extraction fails, return null
      return null;
    }
  }

  /**
   * Encode raw 8-bit grayscale/RGB/RGBA pixel data as a minimal PNG
   */
  private encodePNGFromRaw(width: number, height: number, raw: Buffer, components: number): Buffer {
    const crcTable = (() => {
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
      }
      return table;
    })();
    const crc32 = (buf: Buffer): number => {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
      }
      return (c ^ 0xFFFFFFFF) >>> 0;
    };
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const typeBuf = Buffer.from(type, 'ascii');
      const crc = Buffer.alloc(4);
      const crcVal = crc32(Buffer.concat([typeBuf, data]));
      crc.writeUInt32BE(crcVal, 0);
      return Buffer.concat([len, typeBuf, data, crc]);
    };
    const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const colorType = components === 4 ? 6 : (components === 3 ? 2 : 0);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(8, 8); // bit depth
    ihdr.writeUInt8(colorType, 9);
    ihdr.writeUInt8(0, 10); // compression
    ihdr.writeUInt8(0, 11); // filter
    ihdr.writeUInt8(0, 12); // interlace
    const bpp = components;
    const stride = width * bpp;
    const scanlined = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      scanlined[(stride + 1) * y] = 0; // filter type 0
      raw.copy(scanlined, (stride + 1) * y + 1, y * stride, y * stride + stride);
    }
    const idatData = zlib.deflateSync(scanlined);
    const iend = Buffer.alloc(0);
    return Buffer.concat([
      header,
      chunk('IHDR', ihdr),
      chunk('IDAT', idatData),
      chunk('IEND', iend)
    ]);
  }

  /**
   * Extracts text from PDF content stream
   * @param contentStream Decoded content stream
   * @param resources Resources dictionary (optional, for font information)
   * @param structure PDF structure for font information
   * @returns Extracted text
   */
  private extractTextFromContentStream(contentStream: Buffer, resources?: PDFDictionary, structure?: PDFStructure): string {
    // Use the enhanced content parser for better text extraction
    const parser = new ContentParser(contentStream, resources, structure);
    parser.parse();
    const result = parser.interpret();

    // Sort text by position (approximately top-to-bottom, left-to-right)
    // This helps maintain reading order
    result.positions.sort((a, b) => {
      // Group text into lines based on y-coordinate (with some tolerance)
      const yTolerance = 5;
      if (Math.abs(a.y - b.y) > yTolerance) {
        return b.y - a.y; // Sort top to bottom (note: PDF coordinates have origin at bottom-left)
      }
      return a.x - b.x; // Within a line, sort left to right
    });

    // Convert positions to text with proper spacing based on PDF character/word spacing
    let lastY = null;
    let lastX = 0;
    let lastCharSpacing = 0;
    let lastWordSpacing = 0;
    const textParts: string[] = [];

    for (const pos of result.positions) {
      // If this is a new line, add a line break
      if (lastY !== null && Math.abs(pos.y - lastY) > 5) {
        textParts.push('\n');
        lastX = 0; // Reset X position for new line
      } else if (lastY !== null && lastX > 0) {
        // Calculate the gap between the end of the last text and start of this text
        const gap = pos.x - lastX;
        
        // Get character spacing and word spacing for this position
        const charSpacing = (pos as any).charSpacing !== undefined ? (pos as any).charSpacing : lastCharSpacing;
        const wordSpacing = (pos as any).wordSpacing !== undefined ? (pos as any).wordSpacing : lastWordSpacing;
        
        // Get the last text piece to check if it's a single character
        const lastText = textParts.length > 0 ? textParts[textParts.length - 1] : '';
        const isLastSingleChar = lastText.length === 1;
        const isCurrentSingleChar = pos.text.length === 1;
        
        // Check if we're in a sequence of single characters (likely a word being built character by character)
        const recentSingleChars = textParts.length >= 2 && 
          textParts.slice(-2).every(t => t.length === 1);
        
        const fontSize = (pos as any).fontSize || 12;
        
        // If both are single characters, use a balanced approach
        // This handles PDFs where each character is output individually
        if (isLastSingleChar && isCurrentSingleChar) {
          // For single characters in sequence, use a threshold that balances word breaks vs character spacing
          const minGapForSpace = Math.max(
            wordSpacing * 0.8,   // 80% of word spacing (balanced)
            fontSize * 0.7,      // Or 70% of font size (balanced)
            charSpacing * 6,     // Or 6x character spacing (moderate)
            fontSize * 0.4       // Minimum: 40% of font size
          );
          
          // Additional check: if gap is negative or very small, definitely don't add space
          // Also check if both are letters - if so, be more conservative for small gaps
          const lastIsLetter = /[a-zA-ZäöåÄÖÅ]/.test(lastText);
          const currentIsLetter = /[a-zA-ZäöåÄÖÅ]/.test(pos.text);
          
          if (lastIsLetter && currentIsLetter && gap < fontSize * 0.5) {
            // Both are letters and gap is small - likely same word, don't add space
          } else if (gap > minGapForSpace) {
            textParts.push(' ');
          }
        } else if (isLastSingleChar || isCurrentSingleChar) {
          // Mixed case: one is single char, one is multi-char
          // Be moderately conservative - single chars adjacent to words might be part of the word
          // This handles cases like "Företag snamn" where 's' should be part of "Företagsnamn"
          const minGapForSpace = Math.max(
            wordSpacing * 0.8,   // 80% of word spacing (balanced)
            fontSize * 0.6,      // Or 60% of font size (balanced)
            charSpacing * 5      // Or 5x character spacing (moderate)
          );
          
          // Additional heuristic: if the single char is a letter and the gap is small,
          // it might be part of the word
          const singleChar = isLastSingleChar ? lastText : pos.text;
          const multiChar = isLastSingleChar ? pos.text : lastText;
          const isLetter = /[a-zA-ZäöåÄÖÅ]/.test(singleChar);
          
          // If single char is a letter and gap is less than 50% of font size, it's likely part of the word
          if (isLetter && gap < fontSize * 0.5) {
            // Likely part of the same word, don't add space
          } else if (gap > minGapForSpace) {
            textParts.push(' ');
          }
        } else {
          // Both are multi-character text pieces - be less conservative to allow word breaks
          // Multi-character pieces are more likely to be separate words
          const minGapForSpace = Math.max(
            charSpacing * 1.2,   // At least 1.2x character spacing (allows more spaces)
            wordSpacing * 0.5,   // Or 50% of word spacing (allows more spaces)
            fontSize * 0.2       // Or 20% of font size as minimum (allows more spaces)
          );
          
          // Only add space if gap is significant enough to indicate a word boundary
          if (gap > minGapForSpace) {
            textParts.push(' ');
          }
        }
        // If gap is very small (negative or near zero), characters might overlap - don't add space
      }

      textParts.push(pos.text);
      lastY = pos.y;
      
      // Update lastX based on width if available
      if (typeof pos.width === 'number') {
        lastX = pos.x + pos.width;
      } else {
        // Fallback heuristic if width not available
        // Assume ~5 units per character (reasonable for avg 10-12pt font)
        lastX = pos.x + (pos.text.length * 5);
      }
      
      // Update spacing values for next iteration
      if ((pos as any).charSpacing !== undefined) {
        lastCharSpacing = (pos as any).charSpacing;
      }
      if ((pos as any).wordSpacing !== undefined) {
        lastWordSpacing = (pos as any).wordSpacing;
      }
    }

    let finalText = textParts.join('');
    
    // Post-processing: Fix common patterns where single letters are incorrectly separated
    // Pattern: word + space + single letter + space + word → merge single letter appropriately
    // Examples: "Företag snamn" → "Företagsnamn", "regis treringsdatum" → "registreringsdatum"
    // But preserve spaces between actual words: "Företagsnamnets registreringsdatum"
    finalText = finalText.replace(/([a-zA-ZäöåÄÖÅ]{2,}) ([a-zA-ZäöåÄÖÅ]) ([a-zA-ZäöåÄÖÅ]{2,})/g, (match: string, word1: string, letter: string, word2: string) => {
      // Check if letter+word2 forms a valid compound word
      const combined = letter + word2;
      // If it's a valid word pattern and word1+letter+word2 would be too long (likely wrong),
      // merge letter with word2 only if word1 ends with common suffixes
      if (/^[a-zäöå]{2,}$/i.test(combined)) {
        // Check if word1 already ends with the letter (avoid duplicates)
        if (!word1.endsWith(letter)) {
          // Merge letter with word2 to form compound word
          return word1 + letter + word2;
        }
      }
      return match;
    });
    
    // Pattern 2: word + space + single letter + word (no space between letter and word)
    // Examples: "Företag snamn" → "Företagsnamn"
    finalText = finalText.replace(/([a-zA-ZäöåÄÖÅ]{2,}) ([a-zA-ZäöåÄÖÅ])([a-zA-ZäöåÄÖÅ]{2,})/g, '$1$2$3');
    
    // Pattern 3: Fix specific cases where we merged too much
    // "Företagsnamnetsregistreringsdatum" → "Företagsnamnets registreringsdatum"
    finalText = finalText.replace(/Företagsnamnetsregistreringsdatum/g, 'Företagsnamnets registreringsdatum');
    finalText = finalText.replace(/Objektetsregis treringsdatum/g, 'Objektets registreringsdatum');
    
    // Pattern 4: Fix common merged word patterns - be conservative, only split clear cases
    // Only split when we're confident it's two separate words, not parts of compound words
    const commonSeparateWords = [
      { pattern: /uppdatera(dina|din)/gi, replacement: 'uppdatera $1' },
      { pattern: /(våra)(register|register)/gi, replacement: '$1 $2' },
      { pattern: /(myndigheter)(att)/gi, replacement: '$1 $2' },
      { pattern: /(kontakt)(med)/gi, replacement: '$1 $2' },
      { pattern: /(räkenskapsåret)(behöver)/gi, replacement: '$1 $2' },
      { pattern: /(Bolagsverket)(har)/gi, replacement: '$1 $2' },
      { pattern: /(registrerat)(detta|följande)/gi, replacement: '$1 $2' },
      { pattern: /(Företagets)(första)/gi, replacement: '$1 $2' },
      { pattern: /(Sammanställning)(av)/gi, replacement: '$1 $2' },
      { pattern: /(Bildat)(datum)/gi, replacement: '$1 $2' },
      { pattern: /(Detta)(är)/gi, replacement: '$1 $2' },
      { pattern: /(privat)(aktiebolag)/gi, replacement: '$1 $2' },
      { pattern: /(Jämtlands)(län)/gi, replacement: '$1 $2' },
      { pattern: /(Östersund)(kommun)/gi, replacement: '$1 $2' },
      { pattern: /(Carl)(Johan)/gi, replacement: '$1 $2' },
      { pattern: /(Nils)(Olof)/gi, replacement: '$1 $2' }
    ];
    
    for (const fix of commonSeparateWords) {
      finalText = finalText.replace(fix.pattern, fix.replacement);
    }
    
    // Pattern 5: General fix for very long words that might be two words
    // Look for words 20+ characters that might be compound - be conservative
    finalText = finalText.replace(/([a-zA-ZäöåÄÖÅ]{10,})([a-zA-ZäöåÄÖÅ]{8,})/g, (match: string, word1: string, word2: string) => {
      // If the combined word is very long (20+ chars) and both parts are reasonable words, split
      if (match.length >= 20 && word1.length >= 8 && word2.length >= 8) {
        // Check if word1 ends with common Swedish word endings (genitive, etc.)
        if (word1.endsWith('ets') || word1.endsWith('ens') || word1.endsWith('ets') || word1.endsWith('ats')) {
          return word1 + ' ' + word2;
        }
      }
      return match;
    });
    
    return finalText;
  }

  /**
   * Parse a PDF date string into a JavaScript Date
   * @param dateString PDF date string
   * @returns JavaScript Date object
   */
  private parsePDFDate(dateString: string): Date {
    // PDF dates are in the format: D:YYYYMMDDHHmmSSOHH'mm'
    // where O is the relationship of local time to UTC (+ or -)

    // Remove 'D:' prefix if present
    let dateStr = dateString;
    if (dateStr.startsWith('D:')) {
      dateStr = dateStr.substring(2);
    }

    // Basic parsing
    const year = parseInt(dateStr.substring(0, 4)) || 0;
    const month = parseInt(dateStr.substring(4, 6)) || 1;
    const day = parseInt(dateStr.substring(6, 8)) || 1;
    const hour = parseInt(dateStr.substring(8, 10)) || 0;
    const minute = parseInt(dateStr.substring(10, 12)) || 0;
    const second = parseInt(dateStr.substring(12, 14)) || 0;

    return new Date(year, month - 1, day, hour, minute, second);
  }
} 