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
  /**
   * Best-effort glyph-id to Unicode mapping derived from embedded TrueType/OpenType cmap.
   * Primarily used for CIDFontType2 + CIDToGIDMap /Identity when ToUnicode is incomplete.
   */
  gidToUnicode?: Map<number, string> | null;
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

    // Best-effort: for Type0 fonts, try to build a glyph-id -> Unicode map from the embedded font,
    // since some generators provide extremely small /ToUnicode maps (not enough for real extraction).
    // This is common for CIDFontType2 with /CIDToGIDMap /Identity, where CID == GID.
    let gidToUnicode: Map<number, string> | null = null;
    if (isCIDFont) {
      try {
        const descendants = dict.get('DescendantFonts');
        if (descendants instanceof PDFArray && descendants.length > 0) {
          const first = descendants.get(0);
          const descendantObj = first instanceof PDFReference
            ? this.pdfStructure.getObject(first.objectNumber, first.generation)
            : first;
          if (descendantObj instanceof PDFDictionary) {
            gidToUnicode = this.buildGidToUnicodeFromCIDFontType2(descendantObj);
          }
        }
      } catch {
        // Best-effort only
      }
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
      isCIDFont,
      gidToUnicode
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
        } else if (fontInfo.gidToUnicode && fontInfo.gidToUnicode.has(cid)) {
          // For CIDFontType2 + CIDToGIDMap /Identity, CID is the glyph id
          result.push(fontInfo.gidToUnicode.get(cid)!);
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
   * Build a GID->Unicode mapping from an embedded TrueType/OpenType font program.
   * Only supports CIDFontType2 with CIDToGIDMap /Identity (common in modern PDFs).
   */
  private buildGidToUnicodeFromCIDFontType2(descendantFont: PDFDictionary): Map<number, string> | null {
    const subtype = descendantFont.get('Subtype');
    if (!(subtype instanceof PDFName) || subtype.name !== '/CIDFontType2') return null;

    const cidToGidMap = descendantFont.get('CIDToGIDMap');
    // We currently only support /Identity (CID == GID). Other forms require parsing a mapping stream.
    if (!(cidToGidMap instanceof PDFName) || cidToGidMap.name !== '/Identity') return null;

    const fd = descendantFont.get('FontDescriptor');
    const fdObj = fd instanceof PDFReference ? this.pdfStructure.getObject(fd.objectNumber, fd.generation) : fd;
    if (!(fdObj instanceof PDFDictionary)) return null;

    const ff2 = fdObj.get('FontFile2');
    const ff2Obj = ff2 instanceof PDFReference ? this.pdfStructure.getObject(ff2.objectNumber, ff2.generation) : ff2;
    if (!(ff2Obj instanceof PDFStream)) return null;

    const fontData = ff2Obj.getDecodedData();
    if (!Buffer.isBuffer(fontData) || fontData.length < 12) return null;

    return this.parseTrueTypeCmapGidToUnicode(fontData);
  }

  /**
   * Parse a TrueType/OpenType 'cmap' table and produce a glyph-id -> Unicode map.
   * Supports cmap format 4 (BMP) and 12 (full Unicode).
   */
  private parseTrueTypeCmapGidToUnicode(fontData: Buffer): Map<number, string> | null {
    const readU16 = (off: number) => fontData.readUInt16BE(off);
    const readI16 = (off: number) => fontData.readInt16BE(off);
    const readU32 = (off: number) => fontData.readUInt32BE(off);

    if (fontData.length < 12) return null;
    const numTables = readU16(4);
    const tableDirOffset = 12;
    let cmapOffset = -1;
    let cmapLength = 0;

    for (let i = 0; i < numTables; i++) {
      const recOff = tableDirOffset + i * 16;
      if (recOff + 16 > fontData.length) break;
      const tag = fontData.toString('ascii', recOff, recOff + 4);
      const offset = readU32(recOff + 8);
      const length = readU32(recOff + 12);
      if (tag === 'cmap') {
        cmapOffset = offset;
        cmapLength = length;
        break;
      }
    }

    if (cmapOffset < 0 || cmapOffset + 4 > fontData.length) return null;
    const cmapStart = cmapOffset;
    const cmapNumSubtables = readU16(cmapStart + 2);

    // Pick best subtable: prefer Windows Unicode (3,10) then (3,1), then Unicode (0,*)
    type Sub = { platform: number; encoding: number; offset: number };
    const subs: Sub[] = [];
    for (let i = 0; i < cmapNumSubtables; i++) {
      const off = cmapStart + 4 + i * 8;
      if (off + 8 > fontData.length) break;
      const platform = readU16(off);
      const encoding = readU16(off + 2);
      const subOffset = readU32(off + 4);
      subs.push({ platform, encoding, offset: subOffset });
    }

    const pick = subs.find(s => s.platform === 3 && s.encoding === 10)
      ?? subs.find(s => s.platform === 3 && s.encoding === 1)
      ?? subs.find(s => s.platform === 0)
      ?? subs[0];
    if (!pick) return null;

    const subStart = cmapStart + pick.offset;
    if (subStart + 2 > fontData.length) return null;
    const format = readU16(subStart);

    const gidToUni = new Map<number, string>();
    const setIfAbsent = (gid: number, codePoint: number) => {
      if (gid === 0) return;
      if (!gidToUni.has(gid)) {
        gidToUni.set(gid, String.fromCodePoint(codePoint));
      }
    };

    if (format === 4) {
      if (subStart + 14 > fontData.length) return null;
      const length = readU16(subStart + 2);
      const segCount = readU16(subStart + 6) / 2;
      const endCodeOff = subStart + 14;
      const startCodeOff = endCodeOff + segCount * 2 + 2; // + reservedPad
      const idDeltaOff = startCodeOff + segCount * 2;
      const idRangeOffOff = idDeltaOff + segCount * 2;
      const glyphArrayOff = idRangeOffOff + segCount * 2;

      if (glyphArrayOff > subStart + length || glyphArrayOff > fontData.length) return null;

      for (let seg = 0; seg < segCount; seg++) {
        const endCode = readU16(endCodeOff + seg * 2);
        const startCode = readU16(startCodeOff + seg * 2);
        const idDelta = readI16(idDeltaOff + seg * 2);
        const idRangeOffset = readU16(idRangeOffOff + seg * 2);

        // Skip sentinel segment
        if (startCode === 0xFFFF && endCode === 0xFFFF) continue;

        for (let code = startCode; code <= endCode; code++) {
          let gid = 0;
          if (idRangeOffset === 0) {
            gid = (code + idDelta) & 0xFFFF;
          } else {
            // Address of this segment's idRangeOffset word
            const roWordAddr = idRangeOffOff + seg * 2;
            const glyphIndexAddr = roWordAddr + idRangeOffset + (code - startCode) * 2;
            if (glyphIndexAddr + 2 > fontData.length) continue;
            const glyphIndex = readU16(glyphIndexAddr);
            if (glyphIndex === 0) {
              gid = 0;
            } else {
              gid = (glyphIndex + idDelta) & 0xFFFF;
            }
          }
          if (gid !== 0) setIfAbsent(gid, code);
        }
      }

      return gidToUni;
    }

    if (format === 12) {
      if (subStart + 16 > fontData.length) return null;
      const nGroups = readU32(subStart + 12);
      let grpOff = subStart + 16;
      for (let i = 0; i < nGroups; i++) {
        if (grpOff + 12 > fontData.length) break;
        const startChar = readU32(grpOff);
        const endChar = readU32(grpOff + 4);
        const startGlyph = readU32(grpOff + 8);
        const count = endChar - startChar;
        for (let c = 0; c <= count; c++) {
          setIfAbsent(startGlyph + c, startChar + c);
        }
        grpOff += 12;
      }
      return gidToUni;
    }

    return gidToUni.size > 0 ? gidToUni : null;
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

      const decodeUtf16BeHex = (hex: string): string => {
        if (!hex) return '';
        // Most ToUnicode destinations are UTF-16BE code units.
        // If it's an odd length (shouldn't happen), ignore the last nibble.
        const normalized = hex.length % 2 === 0 ? hex : hex.slice(0, -1);
        if (normalized.length % 4 === 0) {
          let out = '';
          for (let i = 0; i < normalized.length; i += 4) {
            const codeUnit = parseInt(normalized.slice(i, i + 4), 16);
            if (!isNaN(codeUnit)) out += String.fromCharCode(codeUnit);
          }
          return out;
        }
        // Fallback: treat as bytes and map directly to code points
        const bytes = Buffer.from(normalized, 'hex');
        return bytes.toString('latin1');
      };

      // Some producers (notably Canva) may emit bfchar/bfrange mappings without newlines,
      // or with multiple mappings on the same line. Parsing must be token-based, not line-based.

      // beginbfchar/endbfchar sections (simple pairs: <src> <dst>)
      const bfcharRegex = /beginbfchar\s+([\s\S]*?)endbfchar/g;
      let match: RegExpExecArray | null;
      while ((match = bfcharRegex.exec(streamData)) !== null) {
        const block = match[1];
        const tokens = block.match(/<[0-9a-fA-F]+>/g) || [];
        for (let i = 0; i + 1 < tokens.length; i += 2) {
          const srcHex = tokens[i].slice(1, -1);
          const dstHex = tokens[i + 1].slice(1, -1);
          const cid = parseInt(srcHex, 16);
          if (isNaN(cid)) continue;
          result.set(cid, decodeUtf16BeHex(dstHex));
        }
      }

      // beginbfrange/endbfrange sections (triples: <start> <end> <dst> OR <start> <end> [<v1>...])
      const bfrangeRegex = /beginbfrange\s+([\s\S]*?)endbfrange/g;
      while ((match = bfrangeRegex.exec(streamData)) !== null) {
        const block = match[1];
        const tokens = block.match(/\[[\s\S]*?\]|<[0-9a-fA-F]+>/g) || [];
        let idx = 0;
        while (idx + 2 < tokens.length) {
          const startTok = tokens[idx++];
          const endTok = tokens[idx++];
          const dstTok = tokens[idx++];

          if (!startTok.startsWith('<') || !endTok.startsWith('<')) continue;

          const startCode = parseInt(startTok.slice(1, -1), 16);
          const endCode = parseInt(endTok.slice(1, -1), 16);
          if (isNaN(startCode) || isNaN(endCode)) continue;

          if (dstTok.startsWith('<')) {
            const dstHex = dstTok.slice(1, -1);
            // Common case: a single UTF-16BE code unit for the start; subsequent codes increment by 1
            if (dstHex.length === 4) {
              const base = parseInt(dstHex, 16);
              if (!isNaN(base)) {
                for (let i = 0; i <= endCode - startCode; i++) {
                  result.set(startCode + i, String.fromCharCode(base + i));
                }
              }
            } else {
              // If it's longer, treat it as a fixed string for all entries (best-effort)
              const fixed = decodeUtf16BeHex(dstHex);
              for (let i = 0; i <= endCode - startCode; i++) {
                result.set(startCode + i, fixed);
              }
            }
          } else if (dstTok.startsWith('[')) {
            const inner = dstTok.slice(1, -1);
            const dsts = inner.match(/<[0-9a-fA-F]+>/g) || [];
            let current = startCode;
            for (const dst of dsts) {
              const dstHex = dst.slice(1, -1);
              result.set(current, decodeUtf16BeHex(dstHex));
              current++;
              if (current > endCode) break;
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