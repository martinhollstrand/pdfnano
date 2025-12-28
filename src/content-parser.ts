/**
 * PDF Content Stream Parser
 * 
 * Handles parsing and interpretation of PDF content streams,
 * including text extraction with positioning and font handling.
 */
import { PDFDictionary, PDFReference } from './objects';
import { PDFStructure } from './structure';
import { FontDecoder, FontInfo } from './font-decoder';
import { ContentLexer, ContentOperation } from './content-lexer';
import { multiplyMatrix, transformPoint } from './geometry';

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
   * Normalize resource names.
   *
   * In PDF dictionaries, resource keys are typically stored without the leading "/"
   * (e.g. "F7"), but in content streams they are referenced as name objects (e.g. "/F7").
   * Normalizing avoids missing lookups for fonts/XObjects, which can cause garbled text.
   */
  private normalizeResourceName(name: string): string {
    if (!name) return name;
    return name.startsWith('/') ? name : `/${name}`;
  }

  /**
   * Initialize resources from a resource dictionary
   */
  private initializeResources(resources?: PDFDictionary): void {
    if (!resources) return;

    // Extract fonts from resources
    const fontEntry = resources.get('Font');
    let fontDict: PDFDictionary | null = null;

    if (fontEntry instanceof PDFDictionary) {
      fontDict = fontEntry;
    } else if (fontEntry instanceof PDFReference && this.pdfStructure) {
      const resolved = this.pdfStructure.getObject(fontEntry.objectNumber, fontEntry.generation);
      if (resolved instanceof PDFDictionary) {
        fontDict = resolved;
      }
    }

    if (fontDict) {
      for (const [name, fontRef] of fontDict.entries.entries()) {
        // Store font information for later use
        const normalized = this.normalizeResourceName(name);
        this.fontDict.set(normalized, fontRef);
      }
    }
  }

  /**
   * Parse the content stream
   */
  public parse(): void {
    const lexer = new ContentLexer(this.buffer);
    this.operations = lexer.parse();
    
    const operatorCounts: Record<string, number> = {};
    for (const op of this.operations) {
      operatorCounts[op.operator] = (operatorCounts[op.operator] || 0) + 1;
    }
  }

  /**
   * Interpret the parsed content stream operations
   * @returns Extracted text with positions and other information
   */
  public interpret(): { text: string, positions: Array<{ text: string, x: number, y: number, width: number, fontSize: number, charSpacing: number, wordSpacing: number }> } {
    const result: { text: string, positions: Array<{ text: string, x: number, y: number, width: number, fontSize: number, charSpacing: number, wordSpacing: number }> } = {
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

      const getTextRenderingMatrix = (): number[] => {
        // PDF text rendering matrix is: Trm = CTM * Tm
        // (ignoring text state parameters like rise for now; good enough for ordering).
        return multiplyMatrix(this.graphicsState.ctm, this.textState.matrix);
      };

      const getUserSpacePoint = (): { x: number, y: number } => {
        const trm = getTextRenderingMatrix();
        return transformPoint(trm, 0, 0);
      };

      const advanceTextMatrix = (tx: number): void => {
        // Advance in text space by tx (post-multiply the current text matrix).
        // New origin becomes currentMatrix(tx, 0).
        const translate: number[] = [1, 0, 0, 1, tx, 0];
        this.textState.matrix = multiplyMatrix(this.textState.matrix, translate);
        // Keep legacy x/y in sync with matrix translation for any remaining callers.
        this.textState.x = this.textState.matrix[4];
        this.textState.y = this.textState.matrix[5];
      };

      // Text operators
      switch (operator) {
        case 'BT': // Begin text object
          // Reset text matrices per PDF spec
          this.textState.matrix = [1, 0, 0, 1, 0, 0];
          this.textState.lineMatrix = [1, 0, 0, 1, 0, 0];
          this.textState.x = 0;
          this.textState.y = 0;
          break;

        case 'ET': // End text object
          // No-op for now
          break;

        // Text positioning operators
        case 'Tm': // Text matrix
          if (operands.length === 6) {
            this.textState.matrix = [...operands];
            this.textState.lineMatrix = [...operands];
            // Keep legacy x/y in sync with translation terms.
            this.textState.x = this.textState.matrix[4];
            this.textState.y = this.textState.matrix[5];
          }
          break;

        case 'Td': // Move text position
          if (operands.length === 2) {
            const [tx, ty] = operands;
            // Calculate new matrix: [1 0 0 1 tx ty] × lineMatrix
            const newMatrix = [
              1, 0, 0, 1, tx, ty
            ];
            this.textState.matrix = multiplyMatrix(newMatrix, this.textState.lineMatrix);
            this.textState.lineMatrix = [...this.textState.matrix];
            // Keep legacy x/y in sync
            this.textState.x = this.textState.matrix[4];
            this.textState.y = this.textState.matrix[5];
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
            this.textState.matrix = multiplyMatrix(newMatrix, this.textState.lineMatrix);
            this.textState.lineMatrix = [...this.textState.matrix];
            // Keep legacy x/y in sync
            this.textState.x = this.textState.matrix[4];
            this.textState.y = this.textState.matrix[5];
          }
          break;

        case 'T*': // Move to start of next line
          // Same as Td(0, -leading)
          const tx = 0;
          const ty = -this.textState.leading;
          const newMatrix = [
            1, 0, 0, 1, tx, ty
          ];
          this.textState.matrix = multiplyMatrix(newMatrix, this.textState.lineMatrix);
          this.textState.lineMatrix = [...this.textState.matrix];
          // Keep legacy x/y in sync
          this.textState.x = this.textState.matrix[4];
          this.textState.y = this.textState.matrix[5];
          break;

        // Text showing operators
        case 'Tj': // Show text
          if (operands.length === 1) {
            const rawText = operands[0];
            // Decode text with font information if available
            const decodedText = this.decodeText(rawText);

            // Add text to result
            result.text += decodedText;
            const width = this.getEstimatedWidth(decodedText);
            // Character spacing is applied between characters, so for a string of length n,
            // we add (n-1) * charSpacing to the width
            const totalWidth = width + (decodedText.length > 1 ? (decodedText.length - 1) * this.textState.charSpacing : 0);
            const { x: ux, y: uy } = getUserSpacePoint();
            // Estimate width in user space by transforming (totalWidth,0) through Trm.
            const trm = getTextRenderingMatrix();
            const end = transformPoint(trm, totalWidth, 0);
            const userWidth = Math.hypot(end.x - ux, end.y - uy);
            result.positions.push({
              text: decodedText,
              x: ux,
              y: uy,
              width: userWidth,
              fontSize: this.textState.fontSize,
              charSpacing: this.textState.charSpacing,
              wordSpacing: this.textState.wordSpacing
            });

            // Advance the text matrix in text space
            advanceTextMatrix(totalWidth);
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
            this.textState.matrix = multiplyMatrix(newMatrix, this.textState.lineMatrix);
            this.textState.lineMatrix = [...this.textState.matrix];
            // Update current position
            this.textState.x += tx;
            this.textState.y += ty;

            // Then show text
            const rawText = operands[0];
            const decodedText = this.decodeText(rawText);
            const width = this.getEstimatedWidth(decodedText);
            // Character spacing is applied between characters
            const totalWidth = width + (decodedText.length > 1 ? (decodedText.length - 1) * this.textState.charSpacing : 0);

            result.text += decodedText;
            const { x: ux, y: uy } = getUserSpacePoint();
            const trm = getTextRenderingMatrix();
            const end = transformPoint(trm, totalWidth, 0);
            const userWidth = Math.hypot(end.x - ux, end.y - uy);
            result.positions.push({
              text: decodedText,
              x: ux,
              y: uy,
              width: userWidth,
              fontSize: this.textState.fontSize,
              charSpacing: this.textState.charSpacing,
              wordSpacing: this.textState.wordSpacing
            });

            // Advance the text matrix in text space
            advanceTextMatrix(totalWidth);
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
            this.textState.matrix = multiplyMatrix(newMatrix, this.textState.lineMatrix);
            this.textState.lineMatrix = [...this.textState.matrix];
            // Update current position
            this.textState.x += tx;
            this.textState.y += ty;

            // Show text
            const rawText = operands[2];
            const decodedText = this.decodeText(rawText);
            const width = this.getEstimatedWidth(decodedText);
            // Character spacing is applied between characters
            const totalWidth = width + (decodedText.length > 1 ? (decodedText.length - 1) * this.textState.charSpacing : 0);

            result.text += decodedText;
            const { x: ux, y: uy } = getUserSpacePoint();
            const trm = getTextRenderingMatrix();
            const end = transformPoint(trm, totalWidth, 0);
            const userWidth = Math.hypot(end.x - ux, end.y - uy);
            result.positions.push({
              text: decodedText,
              x: ux,
              y: uy,
              width: userWidth,
              fontSize: this.textState.fontSize,
              charSpacing: this.textState.charSpacing,
              wordSpacing: this.textState.wordSpacing
            });

            // Advance the text matrix in text space
            advanceTextMatrix(totalWidth);
          }
          break;

        case 'TJ': // Show text with individual positioning
          if (operands.length === 1 && Array.isArray(operands[0])) {
            const textArray = operands[0];
            let textPiece = '';
            const startPoint = getUserSpacePoint();
            const startTextMatrix = [...this.textState.matrix];
            const startTrm = multiplyMatrix(this.graphicsState.ctm, startTextMatrix);
            let currentAdvance = 0;
            let lastWasText = false;

            for (const item of textArray) {
              if (typeof item === 'string') {
                // Decode and add text
                const decodedItem = this.decodeText(item);
                textPiece += decodedItem;
                const itemWidth = this.getEstimatedWidth(decodedItem);
                currentAdvance += itemWidth;
                lastWasText = decodedItem.length > 0;
                advanceTextMatrix(itemWidth);
              } else if (typeof item === 'number') {
                // In TJ arrays, numbers adjust spacing (in thousandths of a unit of text space)
                // Negative numbers move the text position right (reduce spacing)
                // Positive numbers move the text position left (increase spacing)
                const adjustment = -item / 1000 * this.textState.fontSize * (this.textState.horizontalScale / 100);
                currentAdvance += adjustment;
                advanceTextMatrix(adjustment);

                // The adjustment already accounts for character spacing and word spacing
                // We only add a space in the output text if this is a significant gap
                // Use word spacing as a threshold - if adjustment is close to word spacing, it's likely a word break
                const wordSpacingThreshold = Math.max(
                  this.textState.wordSpacing * 0.7,  // 70% of word spacing
                  this.textState.fontSize * 0.4      // Or 40% of font size
                );
                if (adjustment > wordSpacingThreshold && textPiece && lastWasText) {
                  textPiece += ' ';
                }
                lastWasText = false;
              } else if (item && item.str) {
                // If item is an object with str/buf (from string/hex parsing)
                const decodedItem = this.decodeText(item);
                textPiece += decodedItem;
                const itemWidth = this.getEstimatedWidth(decodedItem);
                currentAdvance += itemWidth;
                lastWasText = decodedItem.length > 0;
                advanceTextMatrix(itemWidth);
              }
            }

            if (textPiece) {
              result.text += textPiece;
              const ux = startPoint.x;
              const uy = startPoint.y;
              const end = transformPoint(startTrm, currentAdvance, 0);
              const userWidth = Math.hypot(end.x - ux, end.y - uy);
              result.positions.push({
                text: textPiece,
                x: ux,
                y: uy,
                width: userWidth,
                fontSize: this.textState.fontSize,
                charSpacing: this.textState.charSpacing,
                wordSpacing: this.textState.wordSpacing
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
            const fontName = typeof operands[0] === 'string' ? operands[0] : String(operands[0]);
            const fontSize = operands[1];

            this.textState.font = fontName;
            this.textState.fontSize = fontSize;

            // Look up font reference
            const normalizedFontName = this.normalizeResourceName(fontName);
            if (this.fontDict.has(normalizedFontName)) {
              this.textState.fontDict = this.fontDict.get(normalizedFontName)!;

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
          this.graphicsStateStack.push({ ...this.graphicsState });
          this.textStateStack.push({ ...this.textState });
          break;

        case 'Q': // Restore graphics state
          if (this.graphicsStateStack.length > 0) {
            this.graphicsState = this.graphicsStateStack.pop()!;
          }
          if (this.textStateStack.length > 0) {
            this.textState = this.textStateStack.pop()!;
          }
          break;

        case 'cm': // Concatenate matrix to current transformation matrix
          if (operands.length === 6) {
            const m = [...operands] as number[];
            // New CTM = m * CTM (left-multiply)
            this.graphicsState.ctm = multiplyMatrix(m, this.graphicsState.ctm);
          }
          break;
      }
    }

    // Sort text positions for correct reading order
    // Group by Y coordinate (with tolerance for same line) then sort by X
    // NOTE:
    // We intentionally keep `result.positions` in **content-stream order**.
    // Some PDFs (notably Word/Office exports) emit glyphs in a sensible reading order
    // in the content stream, but their absolute positions can cause global sorting to
    // scramble text. Higher-level extraction can still choose to sort if needed.

    return result;
  }

  /**
   * Sort text positions by vertical position (Y, descending) then horizontal (X, ascending)
   * Groups text on the same line using a tolerance based on font size
   */
  private sortTextPositions(positions: Array<{ text: string, x: number, y: number, width: number, fontSize: number, charSpacing: number, wordSpacing: number }>): Array<{ text: string, x: number, y: number, width: number, fontSize: number, charSpacing: number, wordSpacing: number }> {
    if (positions.length === 0) return positions;

    // Sort by Y (descending, since PDF Y increases upward), then by X (ascending)
    const sorted = [...positions].sort((a, b) => {
      // Determine line height tolerance (use larger fontSize of the two)
      const tolerance = Math.max(a.fontSize, b.fontSize) * 0.5;

      // If Y coordinates are within tolerance, they're on the same line
      if (Math.abs(a.y - b.y) <= tolerance) {
        // Sort by X (left to right)
        return a.x - b.x;
      }

      // Otherwise sort by Y (top to bottom, so higher Y comes first)
      return b.y - a.y;
    });

    return sorted;
  }

  /**
   * Decode text using current font information
   */
  private decodeText(text: string | Buffer | { str: string, buf: Buffer }): string {
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
   * Calculate estimated width of text string
   * @param text Text string to measure
   */
  private getEstimatedWidth(text: string): number {
    // Average character width is approx 0.5em to 0.6em
    // We use 0.55em as a safe estimate
    const width = text.length * this.textState.fontSize * 0.55;
    // Apply horizontal scaling if not 100%
    return width * (this.textState.horizontalScale / 100);
  }
}
