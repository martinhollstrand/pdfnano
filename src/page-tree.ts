import { PDFStructure, DEBUG } from './structure';
import { PDFDictionary, PDFReference, PDFName, PDFArray, PDFNumber, PDFString, PDFStream, PDFObject } from './objects';
import { PDFPage, PDFImage, ParserOptions } from './types';
import { ContentParser } from './content-parser';
import { extractImageFromXObject } from './image-extraction';
import { processTextFromPositions } from './text-processing';

/**
 * Extracts pages from the PDF structure
 * @param structure PDF structure info
 * @param options Parser options (for maxPages)
 * @returns Array of PDF pages
 */
export function extractPages(structure: PDFStructure, options: ParserOptions): PDFPage[] {
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
              const content = extractPageContent(structure, obj);
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
    const pageNodes = getPageNodesFromPageTree(structure, pagesDict, processedPageNodeRefs);

    // Extract content from each page
    // Limit the number of pages to process to prevent memory issues
    const pagesToProcess = Math.min(pageNodes.length, options.maxPages!);

    if (pageNodes.length > options.maxPages!) {
      if (DEBUG) console.log(`Warning: PDF has ${pageNodes.length} pages, limiting to processing ${options.maxPages!} pages only`);
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
        const content = extractPageContent(structure, pageDict);
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
function getAllResources(structure: PDFStructure, pageDict: PDFDictionary): PDFDictionary {
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
function getPageNodesFromPageTree(structure: PDFStructure, pagesDict: PDFDictionary, processedRefs: Set<string>, depth: number = 0): PDFDictionary[] {
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
                const subPages = getPageNodesFromPageTree(structure, kid, processedRefs, depth + 1);
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
function extractPageContent(structure: PDFStructure, pageDict: PDFDictionary): { text: string, images: PDFImage[] } {
  const result = {
    text: '',
    images: [] as PDFImage[]
  };

  // Get all resources (page + inherited)
  const resourcesDict = getAllResources(structure, pageDict);

  const extractTextFromStream = (stream: PDFStream, label?: string): string => {
    const decoded = stream.getDecodedData();
    if (DEBUG) {
      const tag = label ? ` ${label}` : '';
      console.log(`Content stream${tag} found. Raw length: ${stream.data.length}, Decoded length: ${decoded.length}`);
    }
    const text = extractTextFromContentStream(decoded, resourcesDict, structure);
    if (DEBUG) console.log(`Extracted text${label ? ` ${label}` : ''} length: ${text.length}`);
    return text;
  };

  const extractTextFromContentsObject = (contentsObj: PDFObject, contextLabel: string): string => {
    if (contentsObj instanceof PDFStream) {
      return extractTextFromStream(contentsObj, contextLabel);
    }

    if (contentsObj instanceof PDFArray) {
      if (DEBUG) console.log(`${contextLabel} resolved to an array of length ${contentsObj.length}`);
      const textParts: string[] = [];
      for (let i = 0; i < contentsObj.length; i++) {
        const entry = contentsObj.get(i);

        // Entries are usually references to streams, but can occasionally be direct streams.
        let entryObj: PDFObject | null = null;
        if (entry instanceof PDFReference) {
          entryObj = structure.getObject(entry.objectNumber, entry.generation);
        } else if (entry instanceof PDFStream) {
          entryObj = entry;
        }

        if (entryObj instanceof PDFStream) {
          textParts.push(extractTextFromStream(entryObj, `${contextLabel}[${i}]`));
        } else {
          if (DEBUG) console.log(`${contextLabel}[${i}] is not a stream (type=${entryObj ? entryObj.constructor.name : typeof entry})`);
        }
      }
      return textParts.join('\n');
    }

    if (DEBUG) console.log(`${contextLabel} is of unexpected type: ${contentsObj.constructor.name}`);
    return '';
  };

  // Get contents
  const contents = pageDict.get('Contents');

  if (!contents) {
    if (DEBUG) console.log('Page has no /Contents entry.');
  } else if (contents instanceof PDFReference) {
    if (DEBUG) console.log(`/Contents is a reference: ${contents.objectNumber} ${contents.generation} R`);
    const contentObj = structure.getObject(contents.objectNumber, contents.generation);
    result.text = extractTextFromContentsObject(contentObj, '/Contents(ref)');
  } else if (contents instanceof PDFArray) {
    if (DEBUG) console.log(`/Contents is an array of length ${contents.length}`);
    result.text = extractTextFromContentsObject(contents, '/Contents(array)');
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
              const image = extractImageFromXObject(xObject);

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
 * Extracts text from PDF content stream
 * @param contentStream Decoded content stream
 * @param resources Resources dictionary (optional, for font information)
 * @param structure PDF structure for font information
 * @returns Extracted text
 */
function extractTextFromContentStream(contentStream: Buffer, resources?: PDFDictionary, structure?: PDFStructure): string {
  // Use the enhanced content parser for better text extraction
  const parser = new ContentParser(contentStream, resources, structure);
  parser.parse();
  const result = parser.interpret();
  
  // Use post-processing logic
  return processTextFromPositions(result.positions);
}






