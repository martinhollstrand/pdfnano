/**
 * PDF Content Stream Parser
 * 
 * Handles parsing and interpretation of PDF content streams,
 * including text extraction with positioning and font handling.
 */
import { PDFDictionary, PDFArray, PDFNumber, PDFName, PDFString, PDFReference } from './objects';
import { PDFStructure } from './structure';
import { FontDecoder, FontInfo } from './font-decoder';

/**
 * Represents a PDF text state
 */
export interface TextState {
  // Character spacing in text space units
  charSpacing: number;
  // Word spacing in text space units
  wordSpacing: number;
  // Horizontal scaling (percentage)
  horizontalScale: number;
  // Leading in text space units
  leading: number;
  // Font and font size
  font: string | null;
  fontSize: number;
  // Current font dictionary
  fontDict: PDFDictionary | PDFReference | null;
  // Font information
  fontInfo: FontInfo | null;
  // Text rendering mode
  renderMode: number;
  // Text rise in text space units
  rise: number;
  // Transformation matrix
  matrix: number[];
  // Line matrix (updated by text positioning operators)
  lineMatrix: number[];
  // Current position
  x: number;
  y: number;
}

/**
 * Represents a PDF graphics state
 */
export interface GraphicsState {
  // Current transformation matrix
  ctm: number[];
  // Line width
  lineWidth: number;
  // Line cap style
  lineCap: number;
  // Line join style
  lineJoin: number;
  // Miter limit
  miterLimit: number;
  // Dash pattern
  dashPattern: {
    array: number[];
    phase: number;
  };
  // Rendering intent
  renderingIntent: string;
  // Stroke adjustment
  strokeAdjustment: boolean;
  // Blend mode
  blendMode: string;
  // Soft mask
  softMask: any;
  // Alpha constant for strokes
  strokeAlpha: number;
  // Alpha constant for fills
  fillAlpha: number;
  // Alpha source flag
  alphaSource: boolean;
}

/**
 * Represents a parsed content stream operation
 */
interface ContentOperation {
  operator: string;
  operands: any[];
}

/**
 * PDF Content Stream Parser class
 */
export class ContentParser {
  private buffer: Buffer;
  private fontDict: Map<string, PDFDictionary | PDFReference> = new Map();
  private operations: ContentOperation[] = [];
  private textState: TextState = {
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScale: 100,
    leading: 0,
    font: null,
    fontSize: 0,
    fontDict: null,
    fontInfo: null,
    renderMode: 0,
    rise: 0,
    matrix: [1, 0, 0, 1, 0, 0],
    lineMatrix: [1, 0, 0, 1, 0, 0],
    x: 0,
    y: 0
  };
  private graphicsState: GraphicsState = {
    ctm: [1, 0, 0, 1, 0, 0],
    lineWidth: 1,
    lineCap: 0,
    lineJoin: 0,
    miterLimit: 10,
    dashPattern: {
      array: [],
      phase: 0
    },
    renderingIntent: 'RelativeColorimetric',
    strokeAdjustment: false,
    blendMode: 'Normal',
    softMask: null,
    strokeAlpha: 1,
    fillAlpha: 1,
    alphaSource: false
  };
  private graphicsStateStack: GraphicsState[] = [];
  private textStateStack: TextState[] = [];
  private fontDecoder: FontDecoder | null = null;
  private pdfStructure: PDFStructure | null = null;

  /**
   * Create a new content parser
   * @param buffer Content stream buffer
   * @param resources Resources dictionary
   * @param structure Optional PDF structure for font decoding
   */
  constructor(buffer: Buffer, resources?: PDFDictionary, structure?: PDFStructure) {
    this.buffer = buffer;
    this.pdfStructure = structure || null;
    
    if (this.pdfStructure) {
      this.fontDecoder = new FontDecoder(this.pdfStructure);
    }
    
    this.initializeResources(resources);
  }

  /**
   * Initialize resources from a resource dictionary
   */
  private initializeResources(resources?: PDFDictionary): void {
    if (!resources) return;

    // Extract fonts from resources
    const fontDict = resources.get('Font');
    if (fontDict instanceof PDFDictionary) {
      for (const [name, fontRef] of fontDict.entries.entries()) {
        // Store font information for later use
        this.fontDict.set(name, fontRef);
      }
    }
  }

  /**
   * Parse the content stream
   */
  public parse(): void {
    // Reset state
    this.operations = [];
    
    let pos = 0;
    let operands: any[] = [];
    
    while (pos < this.buffer.length) {
      // Skip whitespace
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }
      
      if (pos >= this.buffer.length) break;
      
      const char = String.fromCharCode(this.buffer[pos]);
      
      if (char === '/') {
        // Name object
        let name = '/';
        pos++;
        
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || 
              ch === '(' || ch === ')' || ch === '<' || ch === '>' || 
              ch === '[' || ch === ']' || ch === '{' || ch === '}' || 
              ch === '/' || ch === '%') {
            break;
          }
          name += ch;
          pos++;
        }
        
        operands.push(name);
      } else if (char === '(') {
        // String object
        let str = '';
        let bytes: number[] = [];
        let nestingLevel = 0;
        let escapeNext = false;
        pos++;
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (escapeNext) {
            escapeNext = false;
            let code = 0;
            switch (ch) {
              case 'n': str += '\n'; code = 0x0A; break;
              case 'r': str += '\r'; code = 0x0D; break;
              case 't': str += '\t'; code = 0x09; break;
              case 'b': str += '\b'; code = 0x08; break;
              case 'f': str += '\f'; code = 0x0C; break;
              case '(': str += '('; code = 0x28; break;
              case ')': str += ')'; code = 0x29; break;
              case '\\': str += '\\'; code = 0x5C; break;
              default: str += ch; code = ch.charCodeAt(0); break;
            }
            bytes.push(code);
            pos++;
            continue;
          }
          if (ch === '\\') {
            escapeNext = true;
          } else if (ch === '(') {
            nestingLevel++;
            str += ch;
            bytes.push(0x28);
          } else if (ch === ')') {
            if (nestingLevel === 0) {
              pos++;
              break;
            }
            nestingLevel--;
            str += ch;
            bytes.push(0x29);
          } else {
            str += ch;
            bytes.push(ch.charCodeAt(0));
          }
          pos++;
        }
        // Push both string and Buffer for downstream use
        operands.push({ str, buf: Buffer.from(bytes) });
      } else if (char === '<' && pos + 1 < this.buffer.length && this.buffer[pos + 1] === 0x3C) {
        // Dictionary - not fully implemented for content streams
        // Skip to closing '>>'
        pos += 2;
        let nestedLevel = 1;
        
        while (pos < this.buffer.length && nestedLevel > 0) {
          if (this.buffer[pos] === 0x3C && this.buffer[pos + 1] === 0x3C) {
            nestedLevel++;
            pos += 2;
          } else if (this.buffer[pos] === 0x3E && this.buffer[pos + 1] === 0x3E) {
            nestedLevel--;
            pos += 2;
          } else {
            pos++;
          }
        }
        
        // Skip this for now
        operands.push({});
      } else if (char === '<') {
        // Hex string
        let hex = '';
        pos++;
        
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          
          if (ch === '>') {
            pos++;
            break;
          }
          
          if ((ch >= '0' && ch <= '9') || 
              (ch >= 'A' && ch <= 'F') || 
              (ch >= 'a' && ch <= 'f')) {
            hex += ch;
          }
          
          pos++;
        }
        
        // Convert hex string to normal string and buffer
        let hexStr = '';
        let hexBytes: number[] = [];
        for (let i = 0; i < hex.length; i += 2) {
          const hexPair = hex.substring(i, i + 2);
          if (hexPair.length === 2) {
            const val = parseInt(hexPair, 16);
            hexStr += String.fromCharCode(val);
            hexBytes.push(val);
          }
        }
        operands.push({ str: hexStr, buf: Buffer.from(hexBytes) });
      } else if (char === '[') {
        // Array
        const array: any[] = [];
        pos++;
        while (pos < this.buffer.length) {
          // Skip whitespace
          while (pos < this.buffer.length) {
            const ch = String.fromCharCode(this.buffer[pos]);
            if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
            pos++;
          }
          if (pos >= this.buffer.length) break;
          const arrayChar = String.fromCharCode(this.buffer[pos]);
          if (arrayChar === ']') {
            pos++;
            break;
          }
          if (arrayChar === '(') {
            // String in array
            let str = '';
            let bytes: number[] = [];
            let nestingLevel = 0;
            let escapeNext = false;
            pos++;
            while (pos < this.buffer.length) {
              const ch = String.fromCharCode(this.buffer[pos]);
              if (escapeNext) {
                escapeNext = false;
                let code = 0;
                switch (ch) {
                  case 'n': str += '\n'; code = 0x0A; break;
                  case 'r': str += '\r'; code = 0x0D; break;
                  case 't': str += '\t'; code = 0x09; break;
                  case 'b': str += '\b'; code = 0x08; break;
                  case 'f': str += '\f'; code = 0x0C; break;
                  case '(': str += '('; code = 0x28; break;
                  case ')': str += ')'; code = 0x29; break;
                  case '\\': str += '\\'; code = 0x5C; break;
                  default: str += ch; code = ch.charCodeAt(0); break;
                }
                bytes.push(code);
                pos++;
                continue;
              }
              if (ch === '\\') {
                escapeNext = true;
              } else if (ch === '(') {
                nestingLevel++;
                str += ch;
                bytes.push(0x28);
              } else if (ch === ')') {
                if (nestingLevel === 0) {
                  pos++;
                  break;
                }
                nestingLevel--;
                str += ch;
                bytes.push(0x29);
              } else {
                str += ch;
                bytes.push(ch.charCodeAt(0));
              }
              pos++;
            }
            array.push({ str, buf: Buffer.from(bytes) });
          } else if (arrayChar === '<' && pos + 1 < this.buffer.length && this.buffer[pos + 1] !== 0x3C) {
            // Hex string in array
            let hex = '';
            pos++;
            while (pos < this.buffer.length) {
              const ch = String.fromCharCode(this.buffer[pos]);
              if (ch === '>') {
                pos++;
                break;
              }
              if ((ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'F') || (ch >= 'a' && ch <= 'f')) {
                hex += ch;
              }
              pos++;
            }
            let hexStr = '';
            let hexBytes: number[] = [];
            for (let i = 0; i < hex.length; i += 2) {
              const hexPair = hex.substring(i, i + 2);
              if (hexPair.length === 2) {
                const val = parseInt(hexPair, 16);
                hexStr += String.fromCharCode(val);
                hexBytes.push(val);
              }
            }
            array.push({ str: hexStr, buf: Buffer.from(hexBytes) });
          } else if ((arrayChar >= '0' && arrayChar <= '9') || arrayChar === '-' || arrayChar === '.') {
            // Number in array
            let numStr = '';
            while (pos < this.buffer.length) {
              const ch = String.fromCharCode(this.buffer[pos]);
              if (!((ch >= '0' && ch <= '9') || ch === '-' || ch === '.')) break;
              numStr += ch;
              pos++;
            }
            array.push(parseFloat(numStr));
          } else {
            // Skip other types for now
            pos++;
          }
        }
        operands.push(array);
      } else if (
        (char >= '0' && char <= '9') || 
        char === '-' || 
        char === '.'
      ) {
        // Number
        let numStr = '';
        
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (!((ch >= '0' && ch <= '9') || ch === '-' || ch === '.')) break;
          numStr += ch;
          pos++;
        }
        
        operands.push(parseFloat(numStr));
      } else if (
        (char >= 'a' && char <= 'z') || 
        (char >= 'A' && char <= 'Z') || 
        char === '*' || 
        char === '"' || 
        char === '\'' || 
        char === '`'
      ) {
        // Operator
        let operator = '';
        
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '*' || ch === '"' || ch === '\'')) break;
          operator += ch;
          pos++;
        }
        
        // Special case for single character operators
        if (operator === '') {
          operator = char;
          pos++;
        }
        
        // Record the operation
        this.operations.push({
          operator,
          operands: [...operands]
        });
        
        // Clear operands for next operation
        operands = [];
      } else {
        // Skip unknown character
        pos++;
      }
    }
    
    const operatorCounts: Record<string, number> = {};
    for (const op of this.operations) {
      operatorCounts[op.operator] = (operatorCounts[op.operator] || 0) + 1;
    }
  }

  /**
   * Interpret the parsed content stream operations
   * @returns Extracted text with positions and other information
   */
  public interpret(): { text: string, positions: Array<{ text: string, x: number, y: number }> } {
    const result: { text: string, positions: Array<{ text: string, x: number, y: number }> } = {
      text: '',
      positions: []
    };
    
    // Reset state
    this.textState = {
      charSpacing: 0,
      wordSpacing: 0,
      horizontalScale: 100,
      leading: 0,
      font: null,
      fontSize: 0,
      fontDict: null,
      fontInfo: null,
      renderMode: 0,
      rise: 0,
      matrix: [1, 0, 0, 1, 0, 0],
      lineMatrix: [1, 0, 0, 1, 0, 0],
      x: 0,
      y: 0
    };
    
    // Process each operation
    for (const operation of this.operations) {
      const { operator, operands } = operation;
      
      // Text operators
      switch (operator) {
        // Text positioning operators
        case 'Tm': // Text matrix
          if (operands.length === 6) {
            this.textState.matrix = [...operands];
            this.textState.lineMatrix = [...operands];
            // Update current position
            this.textState.x = operands[4];
            this.textState.y = operands[5];
          }
          break;
          
        case 'Td': // Move text position
          if (operands.length === 2) {
            const [tx, ty] = operands;
            // Calculate new matrix: [1 0 0 1 tx ty] × lineMatrix
            const newMatrix = [
              1, 0, 0, 1, tx, ty
            ];
            this.textState.matrix = this.multiplyMatrix(newMatrix, this.textState.lineMatrix);
            this.textState.lineMatrix = [...this.textState.matrix];
            // Update current position
            this.textState.x += tx;
            this.textState.y += ty;
          }
          break;
          
        case 'TD': // Move text position and set leading
          if (operands.length === 2) {
            const [tx, ty] = operands;
            // Set leading to -ty
            this.textState.leading = -ty;
            // Same as Td
            const newMatrix = [
              1, 0, 0, 1, tx, ty
            ];
            this.textState.matrix = this.multiplyMatrix(newMatrix, this.textState.lineMatrix);
            this.textState.lineMatrix = [...this.textState.matrix];
            // Update current position
            this.textState.x += tx;
            this.textState.y += ty;
          }
          break;
          
        case 'T*': // Move to start of next line
          // Same as Td(0, -leading)
          const tx = 0;
          const ty = -this.textState.leading;
          const newMatrix = [
            1, 0, 0, 1, tx, ty
          ];
          this.textState.matrix = this.multiplyMatrix(newMatrix, this.textState.lineMatrix);
          this.textState.lineMatrix = [...this.textState.matrix];
          // Update current position
          this.textState.x += tx;
          this.textState.y += ty;
          break;
          
        // Text showing operators
        case 'Tj': // Show text
          if (operands.length === 1) {
            const rawText = operands[0];
            // Decode text with font information if available
            const decodedText = this.decodeText(rawText);
            
            // Add text to result
            result.text += decodedText;
            result.positions.push({
              text: decodedText,
              x: this.textState.x,
              y: this.textState.y
            });
          }
          break;
          
        case "'": // Move to next line and show text
          if (operands.length === 1) {
            // First perform T*
            const tx = 0;
            const ty = -this.textState.leading;
            const newMatrix = [
              1, 0, 0, 1, tx, ty
            ];
            this.textState.matrix = this.multiplyMatrix(newMatrix, this.textState.lineMatrix);
            this.textState.lineMatrix = [...this.textState.matrix];
            // Update current position
            this.textState.x += tx;
            this.textState.y += ty;
            
            // Then show text
            const rawText = operands[0];
            const decodedText = this.decodeText(rawText);
            
            result.text += decodedText;
            result.positions.push({
              text: decodedText,
              x: this.textState.x,
              y: this.textState.y
            });
          }
          break;
          
        case '"': // Set word and character spacing, move to next line, and show text
          if (operands.length === 3) {
            // Set word and character spacing
            this.textState.wordSpacing = operands[0];
            this.textState.charSpacing = operands[1];
            
            // T*
            const tx = 0;
            const ty = -this.textState.leading;
            const newMatrix = [
              1, 0, 0, 1, tx, ty
            ];
            this.textState.matrix = this.multiplyMatrix(newMatrix, this.textState.lineMatrix);
            this.textState.lineMatrix = [...this.textState.matrix];
            // Update current position
            this.textState.x += tx;
            this.textState.y += ty;
            
            // Show text
            const rawText = operands[2];
            const decodedText = this.decodeText(rawText);
            
            result.text += decodedText;
            result.positions.push({
              text: decodedText,
              x: this.textState.x,
              y: this.textState.y
            });
          }
          break;
          
        case 'TJ': // Show text with individual positioning
          if (operands.length === 1 && Array.isArray(operands[0])) {
            const textArray = operands[0];
            let textPiece = '';
            let currentX = this.textState.x;
            for (const item of textArray) {
              if (typeof item === 'string') {
                // Decode and add text
                const decodedItem = this.decodeText(item);
                textPiece += decodedItem;
              } else if (typeof item === 'number') {
                // Negative numbers move right in TJ arrays
                const offset = -item / 1000 * this.textState.fontSize;
                currentX += offset;
                // Add a space for significant shifts
                if (offset > this.textState.fontSize / 3 && textPiece) {
                  textPiece += ' ';
                }
              } else if (item && item.str) {
                // If item is an object with str/buf (from string/hex parsing)
                const decodedItem = this.decodeText(item);
                textPiece += decodedItem;
              }
            }
            if (textPiece) {
              result.text += textPiece;
              result.positions.push({
                text: textPiece,
                x: this.textState.x,
                y: this.textState.y
              });
            }
          }
          break;
          
        // Text state operators
        case 'Tc': // Set character spacing
          if (operands.length === 1) {
            this.textState.charSpacing = operands[0];
          }
          break;
          
        case 'Tw': // Set word spacing
          if (operands.length === 1) {
            this.textState.wordSpacing = operands[0];
          }
          break;
          
        case 'Tz': // Set horizontal scaling
          if (operands.length === 1) {
            this.textState.horizontalScale = operands[0];
          }
          break;
          
        case 'TL': // Set text leading
          if (operands.length === 1) {
            this.textState.leading = operands[0];
          }
          break;
          
        case 'Tf': // Set text font and size
          if (operands.length === 2) {
            const fontName = operands[0];
            const fontSize = operands[1];
            
            this.textState.font = fontName;
            this.textState.fontSize = fontSize;
            
            // Look up font reference
            if (this.fontDict.has(fontName)) {
              this.textState.fontDict = this.fontDict.get(fontName)!;
              
              // Get font info if font decoder available
              if (this.fontDecoder && this.pdfStructure) {
                this.textState.fontInfo = this.fontDecoder.getFont(this.textState.fontDict);
              }
            }
          }
          break;
          
        case 'Tr': // Set text rendering mode
          if (operands.length === 1) {
            this.textState.renderMode = operands[0];
          }
          break;
          
        case 'Ts': // Set text rise
          if (operands.length === 1) {
            this.textState.rise = operands[0];
          }
          break;
          
        // Graphics state operators
        case 'q': // Save graphics state
          this.graphicsStateStack.push({...this.graphicsState});
          this.textStateStack.push({...this.textState});
          break;
          
        case 'Q': // Restore graphics state
          if (this.graphicsStateStack.length > 0) {
            this.graphicsState = this.graphicsStateStack.pop()!;
          }
          if (this.textStateStack.length > 0) {
            this.textState = this.textStateStack.pop()!;
          }
          break;
      }
    }
    
    return result;
  }

  /**
   * Decode text using current font information
   */
  private decodeText(text: string | Buffer | {str: string, buf: Buffer}): string {
    if (!text) return '';
    let str: string;
    let buf: Buffer | undefined;
    if (typeof text === 'string') {
      str = text;
    } else if (Buffer.isBuffer(text)) {
      buf = text;
      str = text.toString('binary');
    } else {
      str = text.str;
      buf = text.buf;
    }
    if (this.fontDecoder && this.textState.fontInfo) {
      if (this.textState.fontInfo.isCIDFont && buf) {
        return this.fontDecoder.decodeText(buf, this.textState.fontInfo);
      }
      return this.fontDecoder.decodeText(str, this.textState.fontInfo);
    }
    return str;
  }

  /**
   * Multiply two transformation matrices
   */
  private multiplyMatrix(a: number[], b: number[]): number[] {
    // PDF matrices are represented as [a b c d e f]
    // which represents the matrix:
    // | a b 0 |
    // | c d 0 |
    // | e f 1 |
    
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
    const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5];
    
    return [
      a0 * b0 + a1 * b2,
      a0 * b1 + a1 * b3,
      a2 * b0 + a3 * b2,
      a2 * b1 + a3 * b3,
      a4 * b0 + a5 * b2 + b4,
      a4 * b1 + a5 * b3 + b5
    ];
  }
} 