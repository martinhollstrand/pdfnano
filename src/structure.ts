/**
 * PDF document structure parser
 */
import * as Constants from './constants';
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

const MAX_XREF_OBJECTS = 10000; // Hard cap for reconstructed XRef
const MAX_PARSE_DEPTH = 50;     // Max recursion depth for value/dictionary parsing
const MAX_DICT_ENTRIES = 1000;  // Max entries in a dictionary
const MAX_ARRAY_ENTRIES = 1000; // Max entries in an array
export const DEBUG = false; // Set to true for verbose debug logging

/**
 * Represents a PDF cross-reference entry
 */
export interface XRefEntry {
  offset: number;
  generation: number;
  inUse: boolean;
  compressed?: boolean;
  objStreamNum?: number; // The object number of the Object Stream containing this object
}

/**
 * Represents a PDF document structure
 */
export class PDFStructure {
  /** PDF Version */
  version: string = '1.4';
  /** Cross-reference table entries */
  xref: Map<number, XRefEntry> = new Map();
  /** PDF trailer dictionary */
  trailer: PDFDictionary = new PDFDictionary();
  /** Object cache */
  objectCache: Map<number, PDFObject> = new Map();
  /** Raw buffer containing the PDF file */
  buffer: Buffer;
  /** Root catalog object */
  rootCatalog?: PDFDictionary;
  /** Info dictionary */
  info?: PDFDictionary;
  /** Object retrieval count */
  private objectRetrievalCount = 0;
  /** Object parse guard to prevent recursion */
  private currentlyParsingObjects: Set<string> = new Set();

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  /**
   * Parse the PDF document structure
   */
  parse(): void {
    try {
      // Remove debug buffer prints and forced XRef reconstruction
      // Restore normal parse flow
      this.version = this.extractPDFVersion();
      const startxrefPos = this.findStartXRef();
      if (startxrefPos >= 0) {
        const xrefOffset = this.readStartXRef(startxrefPos);
        this.parseXRef(xrefOffset);
      } else {
        if (DEBUG) console.log('No startxref found, attempting XRef reconstruction');
        this.reconstructXRefFromObjects();
      }
      this.trailer = this.parseTrailer();
      
      // Extract Root Catalog
      const rootRef = this.trailer.get('Root');
      if (rootRef instanceof PDFReference) {
        const rootObj = this.getObject(rootRef.objectNumber, rootRef.generation);
        if (rootObj instanceof PDFDictionary) {
          this.rootCatalog = rootObj;
        }
      } else if (rootRef instanceof PDFDictionary) {
        this.rootCatalog = rootRef;
      } else {
        if (DEBUG) console.log('Root Catalog not found in trailer, searching objects...');
        this.findRootCatalog();
      }

      const infoRef = this.trailer.get('Info');
      if (infoRef && infoRef instanceof PDFReference) {
        this.info = this.getObject(infoRef.objectNumber, infoRef.generation) as PDFDictionary;
      }
      return;
    } catch (err) {
      console.log(`Warning: Error in parse method: ${err}`);
      this.reconstructXRefFromObjects();
    }
  }

  /**
   * Extract PDF version from the header
   */
  private extractPDFVersion(): string {
    const maxHeaderSize = 20; // PDF header usually within first 20 bytes
    const headerStr = this.buffer.toString('ascii', 0, maxHeaderSize);
    const match = headerStr.match(Constants.PDF_HEADER_REGEX);

    if (!match || !match[1]) {
      throw new Error('Invalid PDF: Could not determine PDF version');
    }

    return match[1];
  }

  /**
   * Find the startxref position in the PDF
   */
  private findStartXRef(): number {
    // startxref is normally near the end of the file, so start from the end
    // Increase search window to 4KB to handle files with garbage at end or large trailers
    const lastBytes = Math.min(4096, this.buffer.length);
    const tail = this.buffer.slice(this.buffer.length - lastBytes);
    const tailStr = tail.toString('ascii');

    const startxrefIndex = tailStr.lastIndexOf(Constants.STARTXREF_MARKER);
    if (startxrefIndex < 0) {
      return -1;
    }

    return this.buffer.length - lastBytes + startxrefIndex;
  }

  /**
   * Read the xref table offset from the startxref position
   */
  private readStartXRef(startxrefPos: number): number {
    // Skip 'startxref' keyword and any whitespace
    let pos = startxrefPos + Constants.STARTXREF_MARKER.length;

    // Skip whitespace
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      pos++;
    }

    // Read offset
    let offsetStr = '';
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch < '0' || ch > '9') break;
      offsetStr += ch;
      pos++;
    }

    if (!offsetStr) {
      throw new Error('Invalid PDF: No xref offset found after startxref');
    }

    return parseInt(offsetStr, 10);
  }

  /**
   * Parse the cross-reference table
   */
  private parseXRef(offset: number): void {
    // Ensure offset is valid
    if (offset < 0 || offset >= this.buffer.length) {
      console.log(`Warning: Invalid xref offset: ${offset}, attempting to reconstruct`);
      this.reconstructXRefFromObjects();
      return;
    }

    // Check if this is an xref stream instead of a traditional xref table
    // In PDF 1.5+, the xref can be a stream object
    // Let's check what's at the offset
    try {
      const possibleObjHeader = this.buffer.toString('ascii', offset, offset + 20).trim();
      const objHeaderMatch = possibleObjHeader.match(/^(\d+)\s+(\d+)\s+obj/);

      if (objHeaderMatch) {
        // This appears to be an xref stream, handle it differently
        this.parseXRefStream(offset);
        return;
      }

      // Read xref marker
      const xrefMarker = this.buffer.toString('ascii', offset, offset + Constants.XREF_MARKER.length);
      if (xrefMarker !== Constants.XREF_MARKER) {
        // If we don't find the xref marker, try to reconstruct the xref table from objects
        console.log(`Warning: Invalid xref table marker at offset ${offset}, attempting to reconstruct`);
        this.reconstructXRefFromObjects();
        return;
      }

      let pos = offset + Constants.XREF_MARKER.length;

      // Skip whitespace and comments
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if ((ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') && ch !== '%') break;

        // Skip comment lines
        if (ch === '%') {
          while (pos < this.buffer.length && this.buffer[pos] !== 0x0A) pos++;
        }

        pos++;
      }

      // Process xref subsections
      while (pos < this.buffer.length) {
        // Skip whitespace
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
          pos++;
        }

        // Check for trailer
        if (pos + Constants.TRAILER_MARKER.length <= this.buffer.length) {
          const trailerCheck = this.buffer.toString('ascii', pos, pos + Constants.TRAILER_MARKER.length);
          if (trailerCheck === Constants.TRAILER_MARKER) {
            // Reached the trailer, we're done
            break;
          }
        }

        // Process a subsection
        try {
          // Read subsection header: "first count"
          let firstObjNum = 0;
          let count = 0;

          // Read first object number
          let numStr = '';
          while (pos < this.buffer.length) {
            const ch = String.fromCharCode(this.buffer[pos]);
            if (ch < '0' || ch > '9') break;
            numStr += ch;
            pos++;
          }
          firstObjNum = parseInt(numStr, 10);

          // Skip whitespace
          while (pos < this.buffer.length) {
            const ch = String.fromCharCode(this.buffer[pos]);
            if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
            pos++;
          }

          // Read count
          numStr = '';
          while (pos < this.buffer.length) {
            const ch = String.fromCharCode(this.buffer[pos]);
            if (ch < '0' || ch > '9') break;
            numStr += ch;
            pos++;
          }
          count = parseInt(numStr, 10);

          // Skip whitespace
          while (pos < this.buffer.length) {
            const ch = String.fromCharCode(this.buffer[pos]);
            if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
            pos++;
          }

          // Guard against unreasonable values
          if (firstObjNum < 0 || count < 0 || count > 1000000) {
            console.log(`Warning: Invalid xref subsection values: first=${firstObjNum}, count=${count}`);
            this.reconstructXRefFromObjects();
            return;
          }

          // Read entries
          for (let i = 0; i < count; i++) {
            // Each entry is 20 bytes: "offset 5 generation 5 n/f 2"
            const entryStr = this.buffer.toString('ascii', pos, pos + 20);
            const entryMatch = entryStr.match(/^(\d{10}) (\d{5}) (n|f)/);

            if (!entryMatch) {
              console.log(`Warning: Invalid xref entry at position ${pos}`);
              pos += 20;
              continue;
            }

            const offset = parseInt(entryMatch[1], 10);
            const gen = parseInt(entryMatch[2], 10);
            const inUse = entryMatch[3] === 'n';

            // Only add in-use objects to the xref table
            if (inUse && offset > 0) {
              this.xref.set(firstObjNum + i, {
                offset,
                generation: gen,
                inUse: true
              });
            }

            pos += 20;
          }
        } catch (err) {
          console.log(`Warning: Error processing xref subsection: ${err}`);
          this.reconstructXRefFromObjects();
          return;
        }
      }
    } catch (err) {
      console.log(`Warning: Error parsing xref table: ${err}`);
      this.reconstructXRefFromObjects();
    }
  }

  /**
   * Parse a cross-reference stream (used in PDF 1.5+)
   */
  private parseXRefStream(offset: number): void {
    // Parse the object at the offset
    try {
      // Read object header: "obj_num gen_num obj"
      const objHeader = this.buffer.toString('ascii', offset, offset + 50); // Assuming header < 50 bytes
      const match = objHeader.match(/^(\d+)\s+(\d+)\s+obj/);

      if (!match) {
        throw new Error(`Invalid object header at offset ${offset}`);
      }

      const objNum = parseInt(match[1], 10);
      const genNum = parseInt(match[2], 10);

      // Skip header
      let pos = offset + match[0].length;

      // Skip whitespace
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
      // Parse dictionary and stream
      const { value: obj } = this.parseValue(pos);

      if (obj instanceof PDFStream) {
        // Store this stream for later analysis of the trailer
        this.trailer = obj.dictionary;

        // The stream contains the xref data
        const streamData = obj.getDecodedData();
        this.parseXRefStreamData(obj.dictionary, streamData);
      } else {
        // Not a stream, fallback to reconstruction
        this.reconstructXRefFromObjects();
      }
    } catch (err) {
      // If parsing fails, try to reconstruct
      this.reconstructXRefFromObjects();
    }
  }

  /**
   * Parse the data from an xref stream
   */
  private parseXRefStreamData(dict: PDFDictionary, data: Buffer): void {
    // We need the /Type, /Size, /W (width array), and optionally /Index
    const typeObj = dict.get('Type');
    if (!(typeObj instanceof PDFName) || typeObj.name !== '/XRef') {
      // Not an XRef stream, try reconstruction
      this.reconstructXRefFromObjects();
      return;
    }

    // Get size (highest object number + 1)
    const sizeObj = dict.get('Size');
    if (!(sizeObj instanceof PDFNumber)) {
      this.reconstructXRefFromObjects();
      return;
    }

    // Get width array (sizes of each field in bytes)
    const widthObj = dict.get('W');
    if (!(widthObj instanceof PDFArray) || widthObj.length < 3) {
      this.reconstructXRefFromObjects();
      return;
    }

    const fieldWidths = [
      (widthObj.get(0) as PDFNumber).value,
      (widthObj.get(1) as PDFNumber).value,
      (widthObj.get(2) as PDFNumber).value
    ];

    // Get index array (optional, default is [0, Size])
    let indexArr: number[] = [0, (sizeObj as PDFNumber).value];
    const indexObj = dict.get('Index');
    if (indexObj instanceof PDFArray && indexObj.length >= 2) {
      indexArr = [];
      for (let i = 0; i < indexObj.length; i++) {
        const item = indexObj.get(i);
        if (item instanceof PDFNumber) {
          indexArr.push(item.value);
        }
      }
    }

    // Parse the stream data
    const entrySize = fieldWidths[0] + fieldWidths[1] + fieldWidths[2];

    let dataPos = 0;
    for (let i = 0; i < indexArr.length; i += 2) {
      const startObjNum = indexArr[i];
      const count = indexArr[i + 1];

      for (let j = 0; j < count; j++) {
        const objNum = startObjNum + j;

        // Read type field
        let type = 0;
        if (fieldWidths[0] > 0) {
          type = this.readIntFromBuffer(data, dataPos, fieldWidths[0]);
          dataPos += fieldWidths[0];
        }

        // Read offset/objstream position
        let offsetOrIndex = 0;
        if (fieldWidths[1] > 0) {
          offsetOrIndex = this.readIntFromBuffer(data, dataPos, fieldWidths[1]);
          dataPos += fieldWidths[1];
        }

        // Read generation/index
        let genOrIndex = 0;
        if (fieldWidths[2] > 0) {
          genOrIndex = this.readIntFromBuffer(data, dataPos, fieldWidths[2]);
          dataPos += fieldWidths[2];
        }

        // Create xref entry based on type
        // Type 0: free object
        // Type 1: normal object
        // Type 2: compressed object
        if (type === 1) { // Normal object
          this.xref.set(objNum, {
            offset: offsetOrIndex,
            generation: genOrIndex,
            inUse: true
          });
        } else if (type === 0) { // Free object
          this.xref.set(objNum, {
            offset: 0,
            generation: genOrIndex,
            inUse: false
          });
        } else if (type === 2) { // Compressed object
          this.xref.set(objNum, {
            offset: genOrIndex, // Index in the stream
            generation: 0,
            inUse: true,
            compressed: true,
            objStreamNum: offsetOrIndex // Object number of the stream
          });
        }
      }
    }
  }

  /**
   * Read an integer from a buffer at a given position with specified length
   */
  private readIntFromBuffer(buffer: Buffer, position: number, length: number): number {
    let value = 0;
    for (let i = 0; i < length; i++) {
      value = (value << 8) | buffer[position + i];
    }
    return value;
  }

  /**
   * Reconstruct the xref table by scanning for objects in the PDF
   */
  private reconstructXRefFromObjects(): void {
    console.log('Reconstructing xref table from objects in PDF...');
    try {
      this.xref.clear();
      let objectCount = 0;
      const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
      for (let offset = 0; offset < this.buffer.length; offset += CHUNK_SIZE) {
        if (objectCount >= MAX_XREF_OBJECTS) {
          console.log(`Warning: Aborting XRef reconstruction after ${MAX_XREF_OBJECTS} objects.`);
          break;
        }
        const endOffset = Math.min(offset + CHUNK_SIZE, this.buffer.length);
        const added = this.scanBufferChunkForObjects(offset, endOffset, MAX_XREF_OBJECTS - objectCount);
        objectCount += added;
        console.log(`XRef reconstruction: Found ${added} objects in chunk [${offset}, ${endOffset}), total so far: ${objectCount}`);
      }
      console.log(`XRef reconstruction complete. Total objects found: ${objectCount}`);
      
      // Step 2: Scan for Object Streams to find compressed objects
      this.scanForObjectStreams();
      
      this.findTrailerInReconstructedXRef();
    } catch (err) {
      console.log(`Warning: Error during reconstruction: ${err}`);
      this.trailer = new PDFDictionary();
    }
  }

  /**
   * Scan a chunk of the buffer for PDF objects
   * Returns the number of objects added
   */
  /**
   * Check if a byte code is a whitespace character
   */
  private isWhitespace(code: number): boolean {
    return code === 0x20 || // Space
      code === 0x09 || // Tab
      code === 0x0D || // CR
      code === 0x0A || // LF
      code === 0x0C || // FF
      code === 0x00;   // Null
  }

  /**
   * Scan a chunk of the buffer for PDF objects
   * Returns the number of objects added
   */
  private scanBufferChunkForObjects(startOffset: number, endOffset: number, maxToAdd: number = MAX_XREF_OBJECTS): number {
    let added = 0;
    try {
      // Search for 'obj' keyword directly in the main buffer to avoid chunk slicing issues
      const objKeyword = Buffer.from('obj', 'ascii');
      let currentPos = startOffset;

      while (currentPos < endOffset && added < maxToAdd) {
        // Find next 'obj' occurrence
        const objKeywordPos = this.buffer.indexOf(objKeyword, currentPos);

        // If not found or beyond our chunk, stop
        if (objKeywordPos === -1 || objKeywordPos >= endOffset) break;

        // Log context around each match (for debugging)
        if (DEBUG) {
          const contextStart = Math.max(0, objKeywordPos - 20);
          const contextEnd = Math.min(this.buffer.length, objKeywordPos + 20);
          const context = this.buffer.slice(contextStart, contextEnd).toString('ascii');
          console.log(`Found 'obj' at offset ${objKeywordPos}, context: ...${context.replace(/\n/g, '\\n')}...`);
        }

        // Potential object found. Now backtrack to find objNum and genNum.
        // Pattern: [Object Number] [Whitespace] [Generation Number] [Whitespace] obj

        let ptr = objKeywordPos - 1;

        // 1. Skip whitespace before 'obj'
        while (ptr >= 0 && this.isWhitespace(this.buffer[ptr])) {
          ptr--;
        }

        // 2. Read Generation Number (digits)
        const genEnd = ptr;
        while (ptr >= 0 && this.buffer[ptr] >= 0x30 && this.buffer[ptr] <= 0x39) {
          ptr--;
        }
        const genStart = ptr + 1;

        if (genEnd >= genStart) {
          // We found a generation number, now check for object number

          // 3. Skip whitespace between numbers
          while (ptr >= 0 && this.isWhitespace(this.buffer[ptr])) {
            ptr--;
          }

          // 4. Read Object Number (digits)
          const objEnd = ptr;
          while (ptr >= 0 && this.buffer[ptr] >= 0x30 && this.buffer[ptr] <= 0x39) {
            ptr--;
          }
          const objStart = ptr + 1;

          if (objEnd >= objStart) {
            // We found both numbers!
            const objNumStr = this.buffer.toString('ascii', objStart, objEnd + 1);
            const genNumStr = this.buffer.toString('ascii', genStart, genEnd + 1);

            try {
              const objNum = parseInt(objNumStr, 10);
              const genNum = parseInt(genNumStr, 10);

              if (Number.isFinite(objNum) && Number.isFinite(genNum) &&
                objNum >= 0 && objNum <= 10000000 &&
                genNum >= 0 && genNum <= 65535) {

                // The object starts at the object number
                const correctedAbsoluteOffset = objStart;

                if (!this.xref.has(objNum)) {
                  this.xref.set(objNum, {
                    offset: correctedAbsoluteOffset,
                    generation: genNum,
                    inUse: true
                  });
                  added++;
                  if (DEBUG) console.log(`XRef reconstruction: Found object ${objNum} ${genNum} at offset ${correctedAbsoluteOffset}`);
                }
              }
            } catch (err) {
              if (DEBUG) console.log(`XRef reconstruction: Error parsing object number/generation: ${err}`);
            }
          }
        }

        // Move past the 'obj' keyword to continue search
        currentPos = objKeywordPos + objKeyword.length;
      }
    } catch (err) {
      console.log(`Warning: Error scanning buffer chunk (${startOffset}-${endOffset}): ${err}`);
    }
    return added;
  }

  /**
   * Scan found objects to identify and process Object Streams
   */
  private scanForObjectStreams(): void {
    console.log('Scanning for Object Streams...');
    const keys = Array.from(this.xref.keys());
    let foundStreams = 0;
    let foundObjects = 0;
    
    for (const objNum of keys) {
      const entry = this.xref.get(objNum);
      if (!entry || !entry.inUse || entry.compressed) continue;
      
      try {
        const obj = this.parseObject(objNum, entry.generation);
        if (obj instanceof PDFStream) {
           const type = obj.dictionary.get('Type');
           if (type instanceof PDFName && type.name === '/ObjStm') {
             const added = this.processObjectStream(objNum, obj);
             if (added > 0) {
                foundStreams++;
                foundObjects += added;
             }
           }
        }
      } catch (e) {
        if (DEBUG) console.log(`Error checking object ${objNum} for ObjStm: ${e}`);
      }
    }
    console.log(`Found ${foundStreams} Object Streams containing ${foundObjects} additional objects.`);
  }

  /**
   * Process an Object Stream and add contained objects to xref
   */
  private processObjectStream(streamObjNum: number, stream: PDFStream): number {
     const nObj = stream.dictionary.get('N');
     const firstObj = stream.dictionary.get('First');
     
     if (!(nObj instanceof PDFNumber) || !(firstObj instanceof PDFNumber)) {
        return 0;
     }
     
     const n = nObj.value;
     const first = firstObj.value;
     
     let added = 0;
     try {
         const data = stream.getDecodedData();
         
         let pos = 0;
         const entries: {objNum: number, offset: number}[] = [];
         
         // Parse N pairs of (objNum, offset)
         for (let i = 0; i < n; i++) {
            const numRes = this.readIntFromData(data, pos);
            if (numRes.value === null) break;
            pos = numRes.newPos;
            
            const offRes = this.readIntFromData(data, pos);
            if (offRes.value === null) break;
            pos = offRes.newPos;
            
            entries.push({objNum: numRes.value!, offset: offRes.value!});
         }
         
         // Add to XRef
         for (let i = 0; i < entries.length; i++) {
            const {objNum} = entries[i];
            if (!this.xref.has(objNum)) {
               this.xref.set(objNum, {
                 offset: i, // Index in the stream
                 generation: 0,
                 inUse: true,
                 compressed: true,
                 objStreamNum: streamObjNum
               });
               added++;
            }
         }
     } catch (e) {
         if (DEBUG) console.log(`Error processing ObjStm ${streamObjNum}: ${e}`);
     }
     return added;
  }

  /**
   * Read integer from buffer, skipping whitespace
   */
  private readIntFromData(buffer: Buffer, pos: number): { value: number | null, newPos: number } {
      // Skip whitespace
      while (pos < buffer.length && this.isWhitespace(buffer[pos])) {
          pos++;
      }
      if (pos >= buffer.length) return { value: null, newPos: pos };
      
      let str = '';
      while (pos < buffer.length) {
          const ch = buffer[pos];
          if (ch >= 0x30 && ch <= 0x39) { // 0-9
              str += String.fromCharCode(ch);
              pos++;
          } else {
              break;
          }
      }
      
      if (str.length === 0) return { value: null, newPos: pos };
      return { value: parseInt(str, 10), newPos: pos };
  }

  /**
   * Parse a compressed object from an Object Stream
   */
  private parseCompressedObject(objectNumber: number, streamObjNum: number, index: number): PDFObject {
      const streamObj = this.getObject(streamObjNum); 
      
      if (!(streamObj instanceof PDFStream)) {
          throw new Error(`Object ${streamObjNum} is not a stream`);
      }
      
      const firstObj = streamObj.dictionary.get('First');
      if (!(firstObj instanceof PDFNumber)) {
          throw new Error(`ObjStm ${streamObjNum} missing First entry`);
      }
      const firstOffset = firstObj.value;
      const data = streamObj.getDecodedData();
      
      let pos = 0;
      let targetObjOffset = -1;
      
      for (let i = 0; i <= index; i++) {
          const numRes = this.readIntFromData(data, pos);
          pos = numRes.newPos;
          const offRes = this.readIntFromData(data, pos);
          pos = offRes.newPos;
          
          if (numRes.value === null || offRes.value === null) {
             throw new Error(`Error parsing ObjStm header in ${streamObjNum}`);
          }

          if (i === index) {
              targetObjOffset = offRes.value;
          }
      }
      
      if (targetObjOffset === -1) {
          throw new Error(`Could not find index ${index} in ObjStm ${streamObjNum}`);
      }
      
      const absolutePos = firstOffset + targetObjOffset;
      
      if (absolutePos >= data.length) {
          throw new Error(`Object offset ${absolutePos} out of bounds in ObjStm ${streamObjNum}`);
      }
      
      const originalBuffer = this.buffer;
      try {
          this.buffer = data;
          const { value } = this.parseValue(absolutePos);
          if (value instanceof PDFObject) {
              value.objectNumber = objectNumber;
              value.generation = 0;
          }
          // If it's a dictionary, ensure it is not treated as a stream (ObjStm objects are not streams)
          return value;
      } finally {
          this.buffer = originalBuffer;
      }
  }

  /**
   * Find the trailer dictionary in a reconstructed xref table
   */
  private findTrailerInReconstructedXRef(): void {
    try {
      // Look for the trailer marker without converting entire PDF to string
      const trailerMarker = Constants.TRAILER_MARKER;
      const markerBytes = Buffer.from(trailerMarker, 'ascii');

      // Do a chunked search for the trailer marker from the end of the file
      // This avoids loading the entire file into a string
      let trailerPos = -1;
      const CHUNK_SIZE = 10 * 1024; // 10KB chunks

      for (let startPos = this.buffer.length - CHUNK_SIZE; startPos >= 0 && trailerPos === -1; startPos -= CHUNK_SIZE) {
        const chunkSize = Math.min(CHUNK_SIZE, startPos + CHUNK_SIZE);
        const chunk = this.buffer.slice(startPos, startPos + chunkSize);
        const chunkStr = chunk.toString('ascii');

        const markerPos = chunkStr.lastIndexOf(trailerMarker);
        if (markerPos !== -1) {
          trailerPos = startPos + markerPos;
          break;
        }

        // If we've searched more than 1MB from the end, stop looking
        if (this.buffer.length - startPos > 1024 * 1024) {
          break;
        }
      }

      if (trailerPos >= 0) {
        // Skip trailer marker
        let pos = trailerPos + trailerMarker.length;

        // Skip whitespace
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
          pos++;
        }
        try {
          // Parse trailer dictionary
          const { value: result } = this.parseDictionary(pos);
          if (result instanceof PDFDictionary) {
            this.trailer = result;
          } else {
            // If not a dictionary (e.g., it's a stream), create an empty dictionary
            this.trailer = new PDFDictionary();
          }
        } catch (e) {
          console.log(`Warning: Error parsing trailer dictionary: ${e}`);
          this.trailer = new PDFDictionary();
        }
      } else {
        // No trailer found, create an empty one
        this.trailer = new PDFDictionary();

        // Try to find catalog
        this.findRootCatalog();
      }
    } catch (err) {
      console.log(`Warning: Error finding trailer: ${err}`);
      this.trailer = new PDFDictionary();
    }
  }

  /**
   * Find the root catalog in the PDF objects
   */
  private findRootCatalog(): void {
    // Look for /Type /Catalog in objects
    const MAX_CATALOG_SEARCH_OBJS = 10000; // Increased limit to ensure we find Catalog
    let objectsSearched = 0;

    // Prioritize lower object numbers by sorting keys, if xref is large
    const objectNumbers = Array.from(this.xref.keys());
    if (objectNumbers.length > MAX_CATALOG_SEARCH_OBJS) {
      objectNumbers.sort((a, b) => a - b); // Check lowest IDs first
    }

    for (const objNum of objectNumbers) {
      const entry = this.xref.get(objNum)!; // Should always exist as we iterated keys

      if (objectsSearched >= MAX_CATALOG_SEARCH_OBJS) {
        console.log(`Warning: findRootCatalog searched ${objectsSearched} objects without finding /Catalog. Aborting search.`);
        break;
      }
      objectsSearched++;

      if (entry.inUse) {
        try {
          const obj = this.parseObject(objNum, entry.generation);
          if (obj instanceof PDFDictionary) {
            let typeObj = obj.get('Type');
            
            // Resolve type reference if needed
            if (typeObj instanceof PDFReference) {
               try {
                 typeObj = this.getObject(typeObj.objectNumber, typeObj.generation);
               } catch (e) {
                 // Ignore
               }
            }

            if (typeObj instanceof PDFName && typeObj.name === '/Catalog') {
              // Found root catalog
              this.rootCatalog = obj;
              this.trailer.set('Root', new PDFReference(objNum, entry.generation));
              break;
            }
          }
        } catch (e) {
          // Ignore errors when parsing individual objects during search
          // console.log(`Debug: Error parsing object ${objNum} during catalog search: ${e}`);
        }
      }
    }

    if (!this.rootCatalog) {
      console.log(`Warning: Could not find Root Catalog after searching ${objectsSearched} objects.`);
    }
  }

  /**
   * Parse the trailer dictionary
   */
  private parseTrailer(): PDFDictionary {
    try {
      // Find trailer marker
      let trailerPos = -1;
      const lastBytes = Math.min(2048, this.buffer.length);
      const tail = this.buffer.slice(this.buffer.length - lastBytes);
      const tailStr = tail.toString('ascii');

      const trailerIndex = tailStr.lastIndexOf(Constants.TRAILER_MARKER);
      if (trailerIndex >= 0) {
        trailerPos = this.buffer.length - lastBytes + trailerIndex;
      }

      if (trailerPos < 0) {
        console.log('Warning: Could not find trailer, reconstructing xref table...');
        this.reconstructXRefFromObjects();
        return this.trailer;
      }

      // Skip trailer marker
      let pos = trailerPos + Constants.TRAILER_MARKER.length;

      // Skip whitespace
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }

      // Parse trailer dictionary
      try {
        const { value: result } = this.parseDictionary(pos);
        if (result instanceof PDFStream) {
          console.log('Warning: Unexpected stream in trailer, creating empty dictionary');
          return new PDFDictionary();
        }
        return result;
      } catch (e) {
        console.log(`Warning: Error parsing trailer dictionary: ${e}`);
        return new PDFDictionary();
      }
    } catch (e) {
      console.log(`Warning: Error in parseTrailer: ${e}`);
      this.reconstructXRefFromObjects();
      return this.trailer;
    }
  }

  /**
   * Parse a PDF object at the given offset
   */
  private parseObject(objectNumber: number, generation: number): PDFObject {
    const entry = this.xref.get(objectNumber);
    if (!entry || !entry.inUse) {
      throw new Error(`Object ${objectNumber} ${generation} R not found in xref table`);
    }
    const cacheKey = `${objectNumber}:${generation}`;
    if (this.currentlyParsingObjects.has(cacheKey)) {
      console.log(`Warning: Detected circular reference for object ${cacheKey}, returning empty dictionary.`);
      return new PDFDictionary();
    }
    // Early cache placeholder to break cycles
    if (!this.objectCache.has(objectNumber)) {
      this.objectCache.set(objectNumber, new PDFDictionary());
    }
    this.currentlyParsingObjects.add(cacheKey);
    try {
      // Handle compressed objects
      if (entry.compressed && entry.objStreamNum !== undefined) {
        const obj = this.parseCompressedObject(objectNumber, entry.objStreamNum, entry.offset);
        this.objectCache.set(objectNumber, obj);
        return obj;
      }

      const offset = entry.offset;
      const objHeader = this.buffer.toString('ascii', offset, offset + 50); // Assuming header < 50 bytes
      const match = objHeader.match(/^(\d+)\s+(\d+)\s+obj/);
      if (!match) {
        throw new Error(`Invalid object header at offset ${offset}`);
      }
      let pos = offset + match[0].length;
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
      // Parse object content
      const { value: obj } = this.parseValue(pos);
      if (obj) {
        if (obj instanceof PDFObject) {
          obj.objectNumber = objectNumber;
          obj.generation = generation;
        }
        this.objectCache.set(objectNumber, obj);
      }
      return obj;
    } finally {
      this.currentlyParsingObjects.delete(cacheKey);
    }
  }

  /**
   * Get an object by number and generation
   */
  getObject(objectNumber: number, generation: number = 0): PDFObject {
    // Safety check for unreasonable object numbers
    if (objectNumber < 0 || objectNumber > 1000000) {
      console.log(`Warning: Requested unreasonable object number: ${objectNumber}`);
      return new PDFDictionary(); // Return empty dictionary as fallback
    }

    // Check cache first
    if (this.objectCache.has(objectNumber)) {
      return this.objectCache.get(objectNumber)!;
    }

    // Track the number of objects retrieved to prevent infinite loops
    if (!this.objectRetrievalCount) {
      this.objectRetrievalCount = 0;
    }

    // Safety limit - prevent excessive object retrievals which may indicate circular references
    const MAX_OBJECT_RETRIEVALS = 5000;
    this.objectRetrievalCount++;

    if (this.objectRetrievalCount > MAX_OBJECT_RETRIEVALS) {
      console.log(`Warning: Exceeded maximum object retrievals (${MAX_OBJECT_RETRIEVALS}), possible circular reference`);
      return new PDFDictionary(); // Return empty dictionary as fallback
    }

    try {
      // Parse the object
      return this.parseObject(objectNumber, generation);
    } catch (err) {
      console.log(`Warning: Error retrieving object ${objectNumber} ${generation} R: ${err}`);
      return new PDFDictionary(); // Return empty dictionary as fallback
    }
  }

  /**
   * Parse a PDF value at the given position
   */
  private parseValue(pos: number, depth: number = 0): { value: any, newPos: number } {
    if (depth > MAX_PARSE_DEPTH) {
      console.log(`Warning: Max parse depth (${MAX_PARSE_DEPTH}) exceeded at position ${pos}`);
      return { value: null, newPos: pos };
    }
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      pos++;
    }
    if (pos >= this.buffer.length) {
      return { value: null, newPos: pos };
    }
    const char = String.fromCharCode(this.buffer[pos]);
    switch (char) {
      case 't':
        if (this.buffer.toString('ascii', pos, pos + 4) === 'true') return { value: true, newPos: pos + 4 };
        break;
      case 'f':
        if (this.buffer.toString('ascii', pos, pos + 5) === 'false') return { value: false, newPos: pos + 5 };
        break;
      case 'n':
        if (this.buffer.toString('ascii', pos, pos + 4) === 'null') return { value: null, newPos: pos + 4 };
        break;
      case '(': return this.parseString(pos);
      case '<':
        if (pos + 1 < this.buffer.length && this.buffer[pos + 1] === 0x3C) {
          return this.parseDictionary(pos, depth + 1);
        } else {
          return this.parseHexString(pos);
        }
      case '/': return this.parseName(pos);
      case '[': return this.parseArray(pos, depth);
      case '-':
      case '+':
      case '.': return this.parseNumber(pos);
      default:
        if (char >= '0' && char <= '9') {
          return this.parseNumberOrReference(pos);
        }
        pos++;
        return { value: null, newPos: pos };
    }
    pos++;
    return { value: null, newPos: pos };
  }

  /**
   * Parse a PDF string
   */
  private parseString(pos: number): { value: PDFString, newPos: number } {
    const start = pos;
    pos++;
    let value = '';
    let nestingLevel = 0;
    let escapeNext = false;
    while (pos < this.buffer.length) {
      const char = String.fromCharCode(this.buffer[pos]);
      if (escapeNext) {
        escapeNext = false;
        switch (char) {
          case 'n': value += '\n'; break;
          case 'r': value += '\r'; break;
          case 't': value += '\t'; break;
          case 'b': value += '\b'; break;
          case 'f': value += '\f'; break;
          case '(': value += '('; break;
          case ')': value += ')'; break;
          case '\\': value += '\\'; break;
          default: value += char;
        }
        pos++;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        pos++;
        continue;
      }
      if (char === '(') {
        nestingLevel++;
        value += char;
      } else if (char === ')') {
        if (nestingLevel === 0) {
          pos++;
          break;
        }
        nestingLevel--;
        value += char;
      } else {
        value += char;
      }
      pos++;
    }
    return { value: new PDFString(value), newPos: pos };
  }

  /**
   * Parse a PDF hexadecimal string
   */
  private parseHexString(pos: number): { value: PDFString, newPos: number } {
    pos++;
    let value = '';
    while (pos < this.buffer.length) {
      const char = String.fromCharCode(this.buffer[pos]);
      if (char === '>') {
        pos++;
        break;
      }
      if ((char >= '0' && char <= '9') ||
        (char >= 'A' && char <= 'F') ||
        (char >= 'a' && char <= 'f')) {
        value += char;
      }
      pos++;
    }
    return { value: new PDFString(value, true), newPos: pos };
  }

  /**
   * Parse a PDF name
   */
  private parseName(pos: number): { value: PDFName, newPos: number } {
    let name = '/';
    pos++;
    while (pos < this.buffer.length) {
      const char = String.fromCharCode(this.buffer[pos]);
      if (char === ' ' || char === '\t' || char === '\r' || char === '\n' ||
        char === '(' || char === ')' || char === '<' || char === '>' ||
        char === '[' || char === ']' || char === '{' || char === '}' ||
        char === '/' || char === '%') {
        break;
      }
      name += char;
      pos++;
    }
    return { value: new PDFName(name), newPos: pos };
  }

  /**
   * Parse a PDF array
   */
  private parseArray(pos: number, depth: number = 0): { value: PDFArray, newPos: number } {
    pos++;
    const items = [];
    // Skip whitespace
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      pos++;
    }
    while (pos < this.buffer.length) {
      const char = String.fromCharCode(this.buffer[pos]);
      if (char === ']') {
        pos++;
        break;
      }
      if (items.length >= MAX_ARRAY_ENTRIES) {
        console.log(`Warning: Array exceeded max entries (${MAX_ARRAY_ENTRIES}) at position ${pos}, truncating.`);
        break;
      }
      const { value, newPos } = this.parseValue(pos, depth + 1);
      items.push(value);
      pos = newPos;
      // Skip whitespace
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
    }
    return { value: new PDFArray(items), newPos: pos };
  }

  /**
   * Parse a PDF dictionary
   */
  private parseDictionary(pos: number, depth: number = 0): { value: PDFDictionary | PDFStream, newPos: number } {
    if (depth > MAX_PARSE_DEPTH) {
      console.log(`Warning: Max dictionary parse depth (${MAX_PARSE_DEPTH}) exceeded at position ${pos}`);
      return { value: new PDFDictionary(), newPos: pos };
    }
    pos += 2;
    const dict = new PDFDictionary();
    let entryCount = 0;
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      pos++;
    }
    while (pos < this.buffer.length) {
      if (pos + 1 < this.buffer.length && this.buffer[pos] === 0x3E && this.buffer[pos + 1] === 0x3E) {
        pos += 2;
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
          pos++;
        }
        if (pos + 6 < this.buffer.length && this.buffer.toString('ascii', pos, pos + 6) === 'stream') {
          return { value: this.parseStream(dict, pos), newPos: pos };
        }
        break;
      }
      if (dict.entries.size >= MAX_DICT_ENTRIES) {
        console.log(`Warning: Dictionary exceeded max entries (${MAX_DICT_ENTRIES}) at position ${pos}, truncating.`);
        break;
      }
      if (this.buffer[pos] !== 0x2F) {
        let found = false;
        for (let skip = 0; skip < 100 && pos + skip < this.buffer.length; ++skip) {
          if (this.buffer[pos + skip] === 0x2F || (pos + skip + 1 < this.buffer.length && this.buffer[pos + skip] === 0x3E && this.buffer[pos + skip + 1] === 0x3E)) {
            pos += skip;
            found = true;
            break;
          }
        }
        if (!found) {
          console.log(`Warning: Could not find next key or end of dictionary at position ${pos}, aborting dictionary parse.`);
          break;
        }
        continue;
      }
      const { value: key, newPos: keyPos } = this.parseName(pos);
      pos = keyPos;
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
      const { value, newPos } = this.parseValue(pos, depth + 1);
      dict.set(key.name, value);
      pos = newPos;
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch === '[' || ch === ']' || ch === '(' || ch === ')' || ch === '/' || ch === '<' || ch === '>' || ch === '%' || (ch >= '0' && ch <= '9')) break;
        pos++;
      }
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
    }
    return { value: dict, newPos: pos };
  }

  /**
   * Parse a PDF stream
   */
  private parseStream(dict: PDFDictionary, pos: number): PDFStream {
    // Skip 'stream' keyword
    pos += 6;

    // The stream content must start after a CRLF or LF
    if (this.buffer[pos] === 0x0D && this.buffer[pos + 1] === 0x0A) { // CRLF
      pos += 2;
    } else if (this.buffer[pos] === 0x0A) { // LF
      pos++;
    } else {
      throw new Error('Invalid stream: expected CRLF or LF after stream keyword');
    }

    // Get the stream length
    let length = 0;
    const lengthObj = dict.get('Length');

    if (lengthObj instanceof PDFReference) {
      // Resolve reference
      const obj = this.getObject(lengthObj.objectNumber, lengthObj.generation);
      if (obj instanceof PDFNumber) {
        length = obj.value;
      }
    } else if (lengthObj instanceof PDFNumber) {
      length = lengthObj.value;
    } else {
      throw new Error('Invalid stream: missing or invalid Length entry');
    }

    // Extract stream data
    const data = this.buffer.slice(pos, pos + length);

    // Check for 'endstream' marker
    pos += length;

    // Skip whitespace
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      pos++;
    }

    // Check for 'endstream' keyword
    if (pos + 9 < this.buffer.length &&
      this.buffer.toString('ascii', pos, pos + 9) === 'endstream') {
      pos += 9;
    } else {
      throw new Error('Invalid stream: missing endstream marker');
    }

    return new PDFStream(dict, data);
  }

  /**
   * Parse a PDF number
   */
  private parseNumber(pos: number): { value: PDFNumber, newPos: number } {
    let numStr = '';
    let hadDecimal = false;
    const start = pos;
    while (pos < this.buffer.length) {
      const char = String.fromCharCode(this.buffer[pos]);
      if (char === '.') {
        if (hadDecimal) {
          break;
        }
        hadDecimal = true;
        numStr += char;
      } else if ((char >= '0' && char <= '9') || char === '+' || char === '-') {
        numStr += char;
      } else {
        break;
      }
      pos++;
    }
    return { value: new PDFNumber(parseFloat(numStr)), newPos: pos };
  }

  /**
   * Parse a number or reference
   */
  private parseNumberOrReference(pos: number): { value: PDFNumber | PDFReference, newPos: number } {
    let startPos = pos;
    let objNumStr = '';
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch < '0' || ch > '9') break;
      objNumStr += ch;
      pos++;
    }
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      pos++;
    }
    if (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch >= '0' && ch <= '9') {
        let genNumStr = '';
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (ch < '0' || ch > '9') break;
          genNumStr += ch;
          pos++;
        }
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
          pos++;
        }
        if (pos < this.buffer.length && this.buffer[pos] === 0x52) { // 'R'
          const objNum = parseInt(objNumStr, 10);
          const genNum = parseInt(genNumStr, 10);
          pos++;
          return { value: new PDFReference(objNum, genNum), newPos: pos };
        }
      }
    }
    return { value: new PDFNumber(parseInt(objNumStr, 10)), newPos: pos };
  }
} 