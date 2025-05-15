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

/**
 * Represents a PDF cross-reference entry
 */
export interface XRefEntry {
  offset: number;
  generation: number;
  inUse: boolean;
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

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  /**
   * Parse the PDF document structure
   */
  parse(): void {
    // Extract PDF version from header
    this.version = this.extractPDFVersion();
    
    // Find startxref position
    const startXRefPos = this.findStartXRef();
    if (startXRefPos < 0) {
      throw new Error('Invalid PDF: Could not find startxref');
    }
    
    // Get xref offset from startxref
    const xrefOffset = this.readStartXRef(startXRefPos);
    
    // Parse xref table
    this.parseXRef(xrefOffset);
    
    // Parse trailer
    this.trailer = this.parseTrailer();
    
    // Get root catalog
    const rootRef = this.trailer.get('Root');
    if (rootRef && rootRef instanceof PDFReference) {
      this.rootCatalog = this.getObject(rootRef.objectNumber, rootRef.generation) as PDFDictionary;
    }
    
    // Get info dictionary
    const infoRef = this.trailer.get('Info');
    if (infoRef && infoRef instanceof PDFReference) {
      this.info = this.getObject(infoRef.objectNumber, infoRef.generation) as PDFDictionary;
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
    const lastBytes = Math.min(1024, this.buffer.length);
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
      throw new Error(`Invalid xref offset: ${offset}`);
    }
    
    // Read xref marker
    const xrefMarker = this.buffer.toString('ascii', offset, offset + Constants.XREF_MARKER.length);
    if (xrefMarker !== Constants.XREF_MARKER) {
      throw new Error(`Invalid xref table: Expected "${Constants.XREF_MARKER}" at offset ${offset}`);
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
    
    // Parse sections until trailer
    while (pos < this.buffer.length) {
      // Check if we've reached the trailer
      if (this.buffer.toString('ascii', pos, pos + Constants.TRAILER_MARKER.length) === Constants.TRAILER_MARKER) {
        break;
      }
      
      // Read section header: object number and count
      let startObjNumStr = '';
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch < '0' || ch > '9') break;
        startObjNumStr += ch;
        pos++;
      }
      
      // Skip whitespace
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
      
      let countStr = '';
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch < '0' || ch > '9') break;
        countStr += ch;
        pos++;
      }
      
      if (!startObjNumStr || !countStr) {
        throw new Error('Invalid xref section header');
      }
      
      const startObjNum = parseInt(startObjNumStr, 10);
      const count = parseInt(countStr, 10);
      
      // Skip to entries
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
      
      // Read entries
      for (let i = 0; i < count; i++) {
        // Each entry is 20 bytes: 10 byte offset + 5 byte generation + 1 byte flag (f/n) + 4 bytes whitespace
        if (pos + 20 > this.buffer.length) {
          throw new Error('Incomplete xref entry');
        }
        
        const entryStr = this.buffer.toString('ascii', pos, pos + 20);
        const match = entryStr.match(/^(\d{10}) (\d{5}) ([fn]) /);
        
        if (!match) {
          throw new Error(`Invalid xref entry: ${entryStr}`);
        }
        
        const [, offsetStr, genStr, flag] = match;
        const objNum = startObjNum + i;
        const entry: XRefEntry = {
          offset: parseInt(offsetStr, 10),
          generation: parseInt(genStr, 10),
          inUse: flag === 'n'
        };
        
        this.xref.set(objNum, entry);
        pos += 20;
      }
    }
  }

  /**
   * Parse the trailer dictionary
   */
  private parseTrailer(): PDFDictionary {
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
      throw new Error('Invalid PDF: Could not find trailer');
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
    const result = this.parseDictionary(pos);
    if (result instanceof PDFStream) {
      throw new Error('Unexpected stream in trailer');
    }
    return result;
  }

  /**
   * Parse a PDF object at the given offset
   */
  private parseObject(objectNumber: number, generation: number): PDFObject {
    const entry = this.xref.get(objectNumber);
    if (!entry || !entry.inUse) {
      throw new Error(`Object ${objectNumber} ${generation} R not found in xref table`);
    }
    
    const offset = entry.offset;
    
    // Read object header: "obj_num gen_num obj"
    const objHeader = this.buffer.toString('ascii', offset, offset + 50); // Assuming header < 50 bytes
    const match = objHeader.match(/^(\d+) (\d+) obj/);
    
    if (!match) {
      throw new Error(`Invalid object header at offset ${offset}`);
    }
    
    // Skip header
    let pos = offset + match[0].length;
    
    // Skip whitespace
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      pos++;
    }
    
    // Parse object content
    const obj = this.parseValue(pos);
    
    if (obj) {
      // Set object number and generation
      if (obj instanceof PDFObject) {
        obj.objectNumber = objectNumber;
        obj.generation = generation;
      }
      
      // Cache the object
      this.objectCache.set(objectNumber, obj);
    }
    
    return obj;
  }

  /**
   * Get an object by number and generation
   */
  getObject(objectNumber: number, generation: number = 0): PDFObject {
    // Check cache first
    if (this.objectCache.has(objectNumber)) {
      return this.objectCache.get(objectNumber)!;
    }
    
    // Parse the object
    return this.parseObject(objectNumber, generation);
  }

  /**
   * Parse a PDF value at the given position
   */
  private parseValue(pos: number): any {
    // Skip whitespace
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      pos++;
    }
    
    if (pos >= this.buffer.length) {
      throw new Error('Unexpected end of file while parsing value');
    }
    
    const char = String.fromCharCode(this.buffer[pos]);
    
    // Parse value based on first character
    switch (char) {
      case 't': // true
        if (this.buffer.toString('ascii', pos, pos + 4) === 'true') {
          return true;
        }
        break;
        
      case 'f': // false
        if (this.buffer.toString('ascii', pos, pos + 5) === 'false') {
          return false;
        }
        break;
        
      case 'n': // null
        if (this.buffer.toString('ascii', pos, pos + 4) === 'null') {
          return null;
        }
        break;
        
      case '(': // String
        return this.parseString(pos);
        
      case '<': // Hex string or dictionary
        if (pos + 1 < this.buffer.length && this.buffer[pos + 1] === 0x3C) { // <<
          return this.parseDictionary(pos);
        } else {
          return this.parseHexString(pos);
        }
        
      case '/': // Name
        return this.parseName(pos);
        
      case '[': // Array
        return this.parseArray(pos);
        
      case '-': // Number (negative)
      case '+': // Number (explicit positive)
      case '.': // Number (decimal)
        // Could be a number
        return this.parseNumber(pos);
        
      default:
        // Check if it's a digit (number)
        if (char >= '0' && char <= '9') {
          // Could be a number or a reference
          return this.parseNumberOrReference(pos);
        }
    }
    
    throw new Error(`Unexpected character at position ${pos}: ${char}`);
  }

  /**
   * Parse a PDF string
   */
  private parseString(pos: number): PDFString {
    // Skip '('
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
          // End of string
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
    
    return new PDFString(value);
  }

  /**
   * Parse a PDF hexadecimal string
   */
  private parseHexString(pos: number): PDFString {
    // Skip '<'
    pos++;
    
    let value = '';
    
    while (pos < this.buffer.length) {
      const char = String.fromCharCode(this.buffer[pos]);
      
      if (char === '>') {
        // End of hex string
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
    
    return new PDFString(value, true);
  }

  /**
   * Parse a PDF name
   */
  private parseName(pos: number): PDFName {
    // Keep the '/'
    let name = '/';
    pos++;
    
    while (pos < this.buffer.length) {
      const char = String.fromCharCode(this.buffer[pos]);
      
      // Name ends at whitespace or delimiter
      if (char === ' ' || char === '\t' || char === '\r' || char === '\n' || 
          char === '(' || char === ')' || char === '<' || char === '>' || 
          char === '[' || char === ']' || char === '{' || char === '}' || 
          char === '/' || char === '%') {
        break;
      }
      
      name += char;
      pos++;
    }
    
    return new PDFName(name);
  }

  /**
   * Parse a PDF array
   */
  private parseArray(pos: number): PDFArray {
    // Skip '['
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
        // End of array
        pos++;
        break;
      }
      
      // Parse value
      const value = this.parseValue(pos);
      items.push(value);
      
      // Find next token
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        // Break if we hit a token start character or digit
        if (ch === '[' || ch === ']' || ch === '(' || ch === ')' || 
            ch === '/' || ch === '<' || ch === '>' || ch === '%' ||
            (ch >= '0' && ch <= '9')) {
          break;
        }
        pos++;
      }
      
      // Skip whitespace
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
    }
    
    return new PDFArray(items);
  }

  /**
   * Parse a PDF dictionary
   */
  private parseDictionary(pos: number): PDFDictionary | PDFStream {
    // Skip '<<'
    pos += 2;
    
    const dict = new PDFDictionary();
    
    // Skip whitespace
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      pos++;
    }
    
    while (pos < this.buffer.length) {
      // Check for end of dictionary
      if (pos + 1 < this.buffer.length && 
          this.buffer[pos] === 0x3E && this.buffer[pos + 1] === 0x3E) { // >>
        // End of dictionary
        pos += 2;
        
        // Check if this is a stream
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
          pos++;
        }
        
        // Check for 'stream' keyword
        if (pos + 6 < this.buffer.length && 
            this.buffer.toString('ascii', pos, pos + 6) === 'stream') {
          return this.parseStream(dict, pos);
        }
        
        break;
      }
      
      // Parse key (must be a name)
      if (this.buffer[pos] !== 0x2F) { // '/'
        throw new Error(`Expected name as dictionary key at position ${pos}`);
      }
      
      const key = this.parseName(pos);
      
      // Skip whitespace
      pos++;
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
      
      // Parse value
      const value = this.parseValue(pos);
      
      dict.set(key.name, value);
      
      // Find next token
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        // Break if we hit a token start character or digit
        if (ch === '[' || ch === ']' || ch === '(' || ch === ')' || 
            ch === '/' || ch === '<' || ch === '>' || ch === '%' ||
            (ch >= '0' && ch <= '9')) {
          break;
        }
        pos++;
      }
      
      // Skip whitespace
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
    }
    
    return dict;
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
  private parseNumber(pos: number): PDFNumber {
    let numStr = '';
    let hadDecimal = false;
    
    while (pos < this.buffer.length) {
      const char = String.fromCharCode(this.buffer[pos]);
      
      if (char === '.') {
        if (hadDecimal) {
          break; // Already had a decimal point
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
    
    return new PDFNumber(parseFloat(numStr));
  }

  /**
   * Parse a number or reference
   */
  private parseNumberOrReference(pos: number): PDFNumber | PDFReference {
    let startPos = pos;
    let objNumStr = '';
    
    // Parse object number
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch < '0' || ch > '9') break;
      objNumStr += ch;
      pos++;
    }
    
    // Skip whitespace
    while (pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[pos]);
      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
      pos++;
    }
    
    // Check for generation number
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
        
        // Skip whitespace
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
          pos++;
        }
        
        // Check for 'R' marker
        if (pos < this.buffer.length && this.buffer[pos] === 0x52) { // 'R'
          // This is a reference
          const objNum = parseInt(objNumStr, 10);
          const genNum = parseInt(genNumStr, 10);
          
          return new PDFReference(objNum, genNum);
        }
      }
    }
    
    // If not a reference, it's a number
    return new PDFNumber(parseInt(objNumStr, 10));
  }
} 