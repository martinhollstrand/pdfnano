/**
 * PDF Font decoder
 * 
 * Handles decoding of text content based on PDF font information.
 */
import { PDFDictionary, PDFArray, PDFString, PDFStream, PDFReference, PDFName, PDFNumber } from './objects';
import { PDFStructure } from './structure';

// Standard font characteristics interface
interface FontCharacteristics {
  isSerif: boolean;
  isSymbolic: boolean;
  isScript: boolean;
  isMonospace?: boolean;
}

// Standard PDF font encodings with index signatures
const STANDARD_ENCODINGS: {
  [key: string]: { [code: number]: string }
} = {
  StandardEncoding: {
    // Standard encoding map
    0x41: 'A', 0x42: 'B', 0x43: 'C', 0x44: 'D', 0x45: 'E',
    0x46: 'F', 0x47: 'G', 0x48: 'H', 0x49: 'I', 0x4A: 'J',
    0x4B: 'K', 0x4C: 'L', 0x4D: 'M', 0x4E: 'N', 0x4F: 'O',
    0x50: 'P', 0x51: 'Q', 0x52: 'R', 0x53: 'S', 0x54: 'T',
    0x55: 'U', 0x56: 'V', 0x57: 'W', 0x58: 'X', 0x59: 'Y',
    0x5A: 'Z', 0x61: 'a', 0x62: 'b', 0x63: 'c', 0x64: 'd',
    0x65: 'e', 0x66: 'f', 0x67: 'g', 0x68: 'h', 0x69: 'i',
    0x6A: 'j', 0x6B: 'k', 0x6C: 'l', 0x6D: 'm', 0x6E: 'n',
    0x6F: 'o', 0x70: 'p', 0x71: 'q', 0x72: 'r', 0x73: 's',
    0x74: 't', 0x75: 'u', 0x76: 'v', 0x77: 'w', 0x78: 'x',
    0x79: 'y', 0x7A: 'z', 0x30: '0', 0x31: '1', 0x32: '2',
    0x33: '3', 0x34: '4', 0x35: '5', 0x36: '6', 0x37: '7',
    0x38: '8', 0x39: '9', 0x20: ' ', 0x21: '!', 0x22: '"',
    0x23: '#', 0x24: '$', 0x25: '%', 0x26: '&', 0x27: "'",
    0x28: '(', 0x29: ')', 0x2A: '*', 0x2B: '+', 0x2C: ',',
    0x2D: '-', 0x2E: '.', 0x2F: '/'
    // Full map would include all standard encoding values
  },
  WinAnsiEncoding: {
    // Windows ANSI encoding (CP1252)
    0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
    0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž',
    0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
    0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ',
    0xA0: ' ', 0xA1: '¡', 0xA2: '¢', 0xA3: '£', 0xA4: '¤', 0xA5: '¥', 0xA6: '¦', 0xA7: '§',
    0xA8: '¨', 0xA9: '©', 0xAA: 'ª', 0xAB: '«', 0xAC: '¬', 0xAD: '', 0xAE: '®', 0xAF: '¯',
    0xB0: '°', 0xB1: '±', 0xB2: '²', 0xB3: '³', 0xB4: '´', 0xB5: 'µ', 0xB6: '¶', 0xB7: '·',
    0xB8: '¸', 0xB9: '¹', 0xBA: 'º', 0xBB: '»', 0xBC: '¼', 0xBD: '½', 0xBE: '¾', 0xBF: '¿',
    0xC0: 'À', 0xC1: 'Á', 0xC2: 'Â', 0xC3: 'Ã', 0xC4: 'Ä', 0xC5: 'Å', 0xC6: 'Æ', 0xC7: 'Ç',
    0xC8: 'È', 0xC9: 'É', 0xCA: 'Ê', 0xCB: 'Ë', 0xCC: 'Ì', 0xCD: 'Í', 0xCE: 'Î', 0xCF: 'Ï',
    0xD0: 'Ð', 0xD1: 'Ñ', 0xD2: 'Ò', 0xD3: 'Ó', 0xD4: 'Ô', 0xD5: 'Õ', 0xD6: 'Ö', 0xD7: '×',
    0xD8: 'Ø', 0xD9: 'Ù', 0xDA: 'Ú', 0xDB: 'Û', 0xDC: 'Ü', 0xDD: 'Ý', 0xDE: 'Þ', 0xDF: 'ß',
    0xE0: 'à', 0xE1: 'á', 0xE2: 'â', 0xE3: 'ã', 0xE4: 'ä', 0xE5: 'å', 0xE6: 'æ', 0xE7: 'ç',
    0xE8: 'è', 0xE9: 'é', 0xEA: 'ê', 0xEB: 'ë', 0xEC: 'ì', 0xED: 'í', 0xEE: 'î', 0xEF: 'ï',
    0xF0: 'ð', 0xF1: 'ñ', 0xF2: 'ò', 0xF3: 'ó', 0xF4: 'ô', 0xF5: 'õ', 0xF6: 'ö', 0xF7: '÷',
    0xF8: 'ø', 0xF9: 'ù', 0xFA: 'ú', 0xFB: 'û', 0xFC: 'ü', 0xFD: 'ý', 0xFE: 'þ', 0xFF: 'ÿ'
  },
  MacRomanEncoding: {
    // Mac OS Roman encoding
    0x80: 'Ä', 0x81: 'Å', 0x82: 'Ç', 0x83: 'É', 0x84: 'Ñ', 0x85: 'Ö', 0x86: 'Ü', 0x87: 'á',
    0x88: 'à', 0x89: 'â', 0x8A: 'ä', 0x8B: 'ã', 0x8C: 'å', 0x8D: 'ç', 0x8E: 'é', 0x8F: 'è',
    0x90: 'ê', 0x91: 'ë', 0x92: 'í', 0x93: 'ì', 0x94: 'î', 0x95: 'ï', 0x96: 'ñ', 0x97: 'ó',
    0x98: 'ò', 0x99: 'ô', 0x9A: 'ö', 0x9B: 'õ', 0x9C: 'ú', 0x9D: 'ù', 0x9E: 'û', 0x9F: 'ü',
    0xA0: '†', 0xA1: '°', 0xA2: '¢', 0xA3: '£', 0xA4: '§', 0xA5: '•', 0xA6: '¶', 0xA7: 'ß',
    0xA8: '®', 0xA9: '©', 0xAA: '™', 0xAB: '´', 0xAC: '¨', 0xAD: '≠', 0xAE: 'Æ', 0xAF: 'Ø',
    0xB0: '∞', 0xB1: '±', 0xB2: '≤', 0xB3: '≥', 0xB4: '¥', 0xB5: 'µ', 0xB6: '∂', 0xB7: '∑',
    0xB8: '∏', 0xB9: 'π', 0xBA: '∫', 0xBB: 'ª', 0xBC: 'º', 0xBD: 'Ω', 0xBE: 'æ', 0xBF: 'ø',
    0xC0: '¿', 0xC1: '¡', 0xC2: '¬', 0xC3: '√', 0xC4: 'ƒ', 0xC5: '≈', 0xC6: '∆', 0xC7: '«',
    0xC8: '»', 0xC9: '…', 0xCA: ' ', 0xCB: 'À', 0xCC: 'Ã', 0xCD: 'Õ', 0xCE: 'Œ', 0xCF: 'œ',
    0xD0: '–', 0xD1: '—', 0xD2: '“', 0xD3: '”', 0xD4: '‘', 0xD5: '’', 0xD6: '÷', 0xD7: '◊',
    0xD8: 'ÿ', 0xD9: 'Ÿ', 0xDA: '⁄', 0xDB: '€', 0xDC: '‹', 0xDD: '›', 0xDE: 'ﬁ', 0xDF: 'ﬂ',
    0xE0: '‡', 0xE1: '·', 0xE2: '‚', 0xE3: '„', 0xE4: '‰', 0xE5: 'Â', 0xE6: 'Ê', 0xE7: 'Á',
    0xE8: 'Ë', 0xE9: 'È', 0xEA: 'Í', 0xEB: 'Î', 0xEC: 'Ï', 0xED: 'Ì', 0xEE: 'Ó', 0xEF: 'Ô',
    0xF0: '', 0xF1: 'Ò', 0xF2: 'Ú', 0xF3: 'Û', 0xF4: 'Ù', 0xF5: 'ı', 0xF6: 'ˆ', 0xF7: '˜',
    0xF8: '¯', 0xF9: '˘', 0xFA: '˙', 0xFB: '˚', 0xFC: '¸', 0xFD: '˝', 0xFE: '˛', 0xFF: 'ˇ'
  },
  // Other standard encodings would be defined here
};

// Standard PDF font metrics (simplified)
const STANDARD_FONTS: { [key: string]: FontCharacteristics } = {
  'Helvetica': { isSerif: false, isSymbolic: false, isScript: false },
  'Helvetica-Bold': { isSerif: false, isSymbolic: false, isScript: false },
  'Helvetica-Oblique': { isSerif: false, isSymbolic: false, isScript: false },
  'Helvetica-BoldOblique': { isSerif: false, isSymbolic: false, isScript: false },
  'Times-Roman': { isSerif: true, isSymbolic: false, isScript: false },
  'Times-Bold': { isSerif: true, isSymbolic: false, isScript: false },
  'Times-Italic': { isSerif: true, isSymbolic: false, isScript: false },
  'Times-BoldItalic': { isSerif: true, isSymbolic: false, isScript: false },
  'Courier': { isSerif: true, isSymbolic: false, isScript: false, isMonospace: true },
  'Courier-Bold': { isSerif: true, isSymbolic: false, isScript: false, isMonospace: true },
  'Courier-Oblique': { isSerif: true, isSymbolic: false, isScript: false, isMonospace: true },
  'Courier-BoldOblique': { isSerif: true, isSymbolic: false, isScript: false, isMonospace: true },
  'Symbol': { isSerif: false, isSymbolic: true, isScript: false },
  'ZapfDingbats': { isSerif: false, isSymbolic: true, isScript: false },
};

/**
 * Font information required for text decoding
 */
export interface FontInfo {
  fontName: string;
  fontType: string;
  encoding: string | null;
  isSymbolic: boolean;
  isEmbedded: boolean;
  customEncoding: Map<number, string> | null;
  toUnicode: Map<number, string> | null;
  isCIDFont?: boolean;
}

/**
 * PDF Font Decoder class
 */
export class FontDecoder {
  private pdfStructure: PDFStructure;
  private fontCache: Map<string, FontInfo> = new Map();

  constructor(pdfStructure: PDFStructure) {
    this.pdfStructure = pdfStructure;
  }

  /**
   * Get font information from font dictionary
   * @param fontDict Font dictionary or reference
   * @returns Font information
   */
  public getFont(fontDict: PDFDictionary | PDFReference): FontInfo | null {
    let dict: PDFDictionary;

    // Resolve reference if needed
    if (fontDict instanceof PDFReference) {
      const obj = this.pdfStructure.getObject(fontDict.objectNumber, fontDict.generation);
      if (!(obj instanceof PDFDictionary)) {
        return null;
      }
      dict = obj;
    } else {
      dict = fontDict;
    }

    // Check if we've already processed this font
    const fontRef = dict.toString();
    if (this.fontCache.has(fontRef)) {
      return this.fontCache.get(fontRef)!;
    }

    // Extract basic font information
    const subtype = dict.get('Subtype');
    if (!(subtype instanceof PDFName)) {
      return null;
    }

    const fontType = subtype.name.replace('/', '');
    const baseFont = dict.get('BaseFont');
    const fontName = baseFont instanceof PDFName ? baseFont.name.replace('/', '') : 'Unknown';

    // Get encoding information
    const encoding = dict.get('Encoding');
    let encodingName: string | null = null;
    let customEncoding: Map<number, string> | null = null;

    if (encoding instanceof PDFName) {
      encodingName = encoding.name.replace('/', '');
    } else if (encoding instanceof PDFDictionary) {
      // Custom encoding dictionary
      customEncoding = this.parseEncodingDict(encoding);
    }

    // Check for ToUnicode mapping
    const toUnicode = dict.get('ToUnicode');
    let unicodeMap: Map<number, string> | null = null;

    if (toUnicode instanceof PDFStream) {
      unicodeMap = this.parseToUnicode(toUnicode);
    } else if (toUnicode instanceof PDFReference) {
      const obj = this.pdfStructure.getObject(toUnicode.objectNumber, toUnicode.generation);
      if (obj instanceof PDFStream) {
        unicodeMap = this.parseToUnicode(obj);
      }
    }

    // Determine if font is symbolic
    let isSymbolic = false;
    const flags = dict.get('Flags');
    if (flags instanceof PDFNumber) {
      // Bit 3 (value 4) indicates symbolic font
      isSymbolic = (flags.value & 4) !== 0;
    } else {
      // If flags not specified, check standard fonts
      isSymbolic = STANDARD_FONTS[fontName]?.isSymbolic || false;
    }

    // Check if font is embedded
    let isEmbedded = false;
    const fontDescriptor = dict.get('FontDescriptor');
    if (fontDescriptor instanceof PDFDictionary || fontDescriptor instanceof PDFReference) {
      isEmbedded = true;
    }

    // Detect CID font (Type0 with Identity-H or DescendantFonts)
    let isCIDFont = false;
    if (fontType === 'Type0' && (encodingName === 'Identity-H' || dict.get('DescendantFonts'))) {
      isCIDFont = true;
    }

    // Create font info and cache it
    const fontInfo: FontInfo = {
      fontName,
      fontType,
      encoding: encodingName,
      isSymbolic,
      isEmbedded,
      customEncoding,
      toUnicode: unicodeMap,
      isCIDFont
    };

    this.fontCache.set(fontRef, fontInfo);
    return fontInfo;
  }

  /**
   * Decode a text string using font information
   * @param text Text string to decode (raw bytes)
   * @param fontInfo Font information
   * @returns Decoded text
   */
  public decodeText(text: string | Buffer, fontInfo: FontInfo): string {
    if (!fontInfo) {
      return typeof text === 'string' ? text : text.toString('binary');
    }

    // Handle CID fonts (Type0/Identity-H)
    if (fontInfo.isCIDFont) {
      const buf = typeof text === 'string' ? Buffer.from(text, 'binary') : text;
      const result: string[] = [];
      for (let i = 0; i < buf.length; i += 2) {
        if (i + 1 >= buf.length) break;
        const cid = (buf[i] << 8) | buf[i + 1];
        if (fontInfo.toUnicode && fontInfo.toUnicode.has(cid)) {
          const uni = fontInfo.toUnicode.get(cid)!;
          result.push(uni);
        } else {
          result.push(String.fromCharCode(cid));
        }
      }
      return result.join('');
    }

    // For simple cases without any encoding or mappings, just return the text
    if (!fontInfo.isSymbolic && !fontInfo.customEncoding && !fontInfo.toUnicode && !fontInfo.encoding) {
      return typeof text === 'string' ? text : text.toString('binary');
    }

    // Convert string to character codes
    const str = typeof text === 'string' ? text : text.toString('binary');
    const codes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      codes.push(str.charCodeAt(i));
    }

    // Decode using available mappings
    const result: string[] = [];

    for (const code of codes) {
      // First try ToUnicode if available (best mapping)
      if (fontInfo.toUnicode && fontInfo.toUnicode.has(code)) {
        result.push(fontInfo.toUnicode.get(code)!);
        continue;
      }

      // Then try custom encoding
      if (fontInfo.customEncoding && fontInfo.customEncoding.has(code)) {
        result.push(fontInfo.customEncoding.get(code)!);
        continue;
      }

      // Fall back to standard encoding or direct mapping
      if (fontInfo.encoding && STANDARD_ENCODINGS[fontInfo.encoding]) {
        const map = STANDARD_ENCODINGS[fontInfo.encoding];
        const mapped = map[code];
        if (mapped) {
          result.push(mapped);
        } else {
          result.push(String.fromCharCode(code));
        }
      } else {
        // Default to the original character
        result.push(String.fromCharCode(code));
      }
    }

    return result.join('');
  }

  /**
   * Parse a custom encoding dictionary
   * @param encodingDict Encoding dictionary
   * @returns Mapping from character codes to characters
   */
  private parseEncodingDict(encodingDict: PDFDictionary): Map<number, string> {
    const result = new Map<number, string>();

    // Check for a base encoding
    const baseEncoding = encodingDict.get('BaseEncoding');
    if (baseEncoding instanceof PDFName) {
      const baseName = baseEncoding.name.replace('/', '');
      if (STANDARD_ENCODINGS[baseName]) {
        // Start with the base encoding
        for (const [code, char] of Object.entries(STANDARD_ENCODINGS[baseName])) {
          result.set(parseInt(code), char);
        }
      }
    }

    // Check for differences array
    const differences = encodingDict.get('Differences');
    if (differences instanceof PDFArray) {
      let currentCode = 0;

      for (let i = 0; i < differences.length; i++) {
        const item = differences.get(i);

        if (item instanceof PDFNumber) {
          // Set current code
          currentCode = item.value;
        } else if (item instanceof PDFName) {
          // Add name to mapping
          const charName = item.name.replace('/', '');
          // Map character name to actual character (simplified)
          result.set(currentCode, charName);
          currentCode++;
        }
      }
    }

    return result;
  }

  /**
   * Parse a ToUnicode CMap
   * @param toUnicodeStream ToUnicode CMap stream
   * @returns Mapping from character codes to Unicode
   */
  private parseToUnicode(toUnicodeStream: PDFStream): Map<number, string> {
    const result = new Map<number, string>();

    try {
      // Get stream data
      const raw = toUnicodeStream.getDecodedData();
      // Most ToUnicode CMaps are ASCII, but allow UTF-16BE with BOM
      let streamData: string;
      if (raw.length >= 2 && raw[0] === 0xFE && raw[1] === 0xFF) {
        // UTF-16BE with BOM; Node doesn't support 'utf16be' directly.
        // Swap byte order to LE and decode as 'utf16le'.
        const swapped = Buffer.alloc(raw.length - 2);
        for (let i = 2, j = 0; i + 1 < raw.length; i += 2, j += 2) {
          swapped[j] = raw[i + 1];
          swapped[j + 1] = raw[i];
        }
        streamData = swapped.toString('utf16le');
      } else {
        streamData = raw.toString('utf8');
      }

      // Find beginbfchar/endbfchar sections for simple mappings
      const bfcharRegex = /beginbfchar\s+([\s\S]*?)endbfchar/g;
      let match;

      while ((match = bfcharRegex.exec(streamData)) !== null) {
        const mappings = match[1].trim().split(/\s*\n\s*/);

        for (const mapping of mappings) {
          // Find all hex strings in the line (handles both space-separated and jammed formats)
          const parts = mapping.match(/<[0-9a-fA-F]+>/g);

          if (parts && parts.length >= 2) {
            // Parse hex strings (support multi-byte CIDs and Unicode)
            const srcHex = parts[0].replace(/<|>/g, '');
            const dstHex = parts[1].replace(/<|>/g, '');
            const cid = parseInt(srcHex, 16);
            // Unicode can be >2 bytes, decode as UTF-16BE
            let unicode = '';
            if (dstHex.length % 4 === 0) {
              for (let i = 0; i < dstHex.length; i += 4) {
                const code = parseInt(dstHex.slice(i, i + 4), 16);
                unicode += String.fromCharCode(code);
              }
            } else {
              // Fallback: treat as single code point
              unicode = String.fromCharCode(parseInt(dstHex, 16));
            }
            if (!isNaN(cid)) {
              result.set(cid, unicode);
            }
          }
        }
      }

      // Find beginbfrange/endbfrange sections for range mappings
      const bfrangeRegex = /beginbfrange\s+([\s\S]*?)endbfrange/g;

      while ((match = bfrangeRegex.exec(streamData)) !== null) {
        const ranges = match[1].trim().split(/\s*\n\s*/);

        for (const range of ranges) {
          // Find all hex strings in the line
          const parts = range.match(/<[0-9a-fA-F]+>/g);

          if (parts && parts.length >= 3) {
            const startHex = parts[0].replace(/<|>/g, '');
            const endHex = parts[1].replace(/<|>/g, '');
            const startCode = parseInt(startHex, 16);
            const endCode = parseInt(endHex, 16);

            // Check if the third part is an array (not fully supported by this regex approach if jammed)
            // If jammed like <start><end>[<v1><v2>], the regex /<...>/g will just find start, end, v1, v2...
            // We need to distinguish between range mapping <start><end><dst> and array mapping <start><end>[<v1>...]

            const lineContent = range.trim();
            const hasArray = lineContent.includes('[') && lineContent.includes(']');

            if (!hasArray) {
              const dstHex = parts[2].replace(/<|>/g, '');
              // Unicode can be >2 bytes, decode as UTF-16BE
              for (let i = 0; i <= endCode - startCode; i++) {
                let unicode = '';
                if (dstHex.length % 4 === 0) {
                  for (let j = 0; j < dstHex.length; j += 4) {
                    const code = parseInt(dstHex.slice(j, j + 4), 16) + i;
                    unicode += String.fromCharCode(code);
                  }
                } else {
                  unicode = String.fromCharCode(parseInt(dstHex, 16) + i);
                }
                result.set(startCode + i, unicode);
              }
            } else {
              // Array mapping: <start> <end> [ <v1> <v2> ... ]
              // We can use the parts array, but we need to skip start and end
              const dsts = parts.slice(2);
              let current = startCode;
              for (const dst of dsts) {
                const dstHex = dst.replace(/<|>/g, '');
                let unicode = '';
                if (dstHex.length % 4 === 0) {
                  for (let j = 0; j < dstHex.length; j += 4) {
                    const code = parseInt(dstHex.slice(j, j + 4), 16);
                    unicode += String.fromCharCode(code);
                  }
                } else if (dstHex.length > 0) {
                  unicode = String.fromCharCode(parseInt(dstHex, 16));
                }
                result.set(current, unicode);
                current++;
                if (current > endCode) break;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Error parsing ToUnicode CMap:', e);
    }

    return result;
  }
} 