import * as zlib from 'zlib';
import { promisify } from 'util';
import { IMAGE_SUBTYPES } from './constants';

/**
 * Utility class for handling PDF stream decoding
 */
export class StreamDecoder {
  /**
   * Decode a stream with the given filters
   * @param data The stream data to decode
   * @param filters Array of filter names to apply
   * @param params Decoding parameters for the filters
   * @returns Decoded data
   */
  public static decode(data: Buffer, filters: string[], params: any = {}): Buffer {
    if (!filters || filters.length === 0) {
      return data;
    }

    let decodedData = data;

    // Apply filters in order
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      const filterParams = Array.isArray(params) ? params[i] : params;

      decodedData = this.applySingleFilter(decodedData, filter, filterParams);
    }

    return decodedData;
  }

  /**
   * Apply a single filter to the data
   * @param data Data to filter
   * @param filter Filter name
   * @param params Filter parameters
   * @returns Filtered data
   */
  private static applySingleFilter(data: Buffer, filter: string, params: any = {}): Buffer {
    switch (filter) {
      case IMAGE_SUBTYPES.FLATE:
        return this.flateDecode(data, params);
      case IMAGE_SUBTYPES.JPEG:
        return data; // DCTDecode is JPEG, which can be used directly
      case IMAGE_SUBTYPES.JPEG2000:
        return data; // JPXDecode is JPEG2000, which needs special handling
      case IMAGE_SUBTYPES.ASCII85:
        return this.ascii85Decode(data);
      case IMAGE_SUBTYPES.ASCII_HEX:
        return this.asciiHexDecode(data);
      case IMAGE_SUBTYPES.RUN_LENGTH:
        return this.runLengthDecode(data);
      case IMAGE_SUBTYPES.LZW:
        return this.lzwDecode(data, params);
      case IMAGE_SUBTYPES.CCITT:
        return data; // CCITT fax decoding is complex and requires special handling
      case IMAGE_SUBTYPES.JBIG2:
        return data; // JBIG2 decoding is complex and requires special handling
      default:
        console.warn(`Unsupported filter: ${filter}`);
        return data;
    }
  }

  /**
   * Decode FlateDecode filter (zlib/deflate)
   * @param data Compressed data
   * @param params Decode parameters
   * @returns Decompressed data
   */
  private static flateDecode(data: Buffer, params: any = {}): Buffer {
    try {
      // Try standard zlib inflate
      return zlib.inflateSync(data);
    } catch (err) {
      try {
        // Try raw inflate (no header)
        return zlib.inflateRawSync(data);
      } catch (e2) {
        try {
          // Sometimes there's an extra header that needs to be removed (legacy fallback)
          return zlib.inflateSync(data.slice(2));
        } catch (e3) {
          console.error('Error during FlateDecode:', err);
          return data;
        }
      }
    }
  }

  /**
   * Decode ASCII85 filter
   * @param data ASCII85 encoded data
   * @returns Decoded data
   */
  private static ascii85Decode(data: Buffer): Buffer {
    let str = data.toString('ascii');

    // Remove delimiters if present
    if (str.startsWith('<~')) {
      str = str.substring(2);
    }
    if (str.endsWith('~>')) {
      str = str.substring(0, str.length - 2);
    }

    // Remove whitespace
    str = str.replace(/\s/g, '');

    const result: number[] = [];
    let p = 0;

    while (p < str.length) {
      const c = str[p];

      // Handle 'z' - zero run
      if (c === 'z') {
        result.push(0, 0, 0, 0);
        p++;
        continue;
      }

      // Need 5 characters for a tuple, or remaining characters for the last tuple
      let tuple = 0;
      let count = 0;

      for (let i = 0; i < 5; i++) {
        if (p + i < str.length) {
          const charCode = str.charCodeAt(p + i);
          // ASCII85 characters are usually between 33 (!) and 117 (u)
          // But we should just subtract 33.
          tuple = tuple * 85 + (charCode - 33);
          count++;
        } else {
          // Padding
          tuple = tuple * 85 + 84; // Pad with 'u' (117 - 33 = 84)
        }
      }

      // Output bytes
      // 5 base-85 chars -> 4 bytes
      // If we had fewer than 5 chars, we output (count - 1) bytes

      if (count > 1) {
        // Extract bytes from the 32-bit tuple
        // Note: bitwise operations in JS are 32-bit signed, so use unsigned right shift
        result.push((tuple >>> 24) & 0xFF);
        if (count > 2) result.push((tuple >>> 16) & 0xFF);
        if (count > 3) result.push((tuple >>> 8) & 0xFF);
        if (count > 4) result.push(tuple & 0xFF);
      }

      p += count; // If we padded, we consumed the rest of the string
    }

    return Buffer.from(result);
  }

  /**
   * Decode ASCIIHex filter
   * @param data ASCIIHex encoded data
   * @returns Decoded data
   */
  private static asciiHexDecode(data: Buffer): Buffer {
    // Convert ASCII hex to binary
    let hex = data.toString('ascii').replace(/\s/g, '');

    // Remove delimiters if present
    if (hex.startsWith('<')) hex = hex.substring(1);
    if (hex.endsWith('>')) hex = hex.substring(0, hex.length - 1);

    // Handle odd length by appending '0'
    if (hex.length % 2 !== 0) {
      hex += '0';
    }

    const result = Buffer.alloc(Math.ceil(hex.length / 2));

    for (let i = 0; i < hex.length; i += 2) {
      const value = parseInt(hex.substring(i, i + 2), 16);
      result[i / 2] = value;
    }

    return result;
  }

  /**
   * Decode RunLength filter
   * @param data RunLength encoded data
   * @returns Decoded data
   */
  private static runLengthDecode(data: Buffer): Buffer {
    const result: number[] = [];
    let p = 0;

    while (p < data.length) {
      const len = data[p];
      p++;

      if (len === 128) {
        // EOD
        break;
      } else if (len < 128) {
        // Copy next len + 1 bytes
        const count = len + 1;
        for (let i = 0; i < count; i++) {
          if (p < data.length) {
            result.push(data[p]);
            p++;
          }
        }
      } else {
        // Repeat next byte 257 - len times
        const count = 257 - len;
        if (p < data.length) {
          const byte = data[p];
          p++;
          for (let i = 0; i < count; i++) {
            result.push(byte);
          }
        }
      }
    }

    return Buffer.from(result);
  }

  /**
   * Decode LZW filter
   * @param data LZW encoded data
   * @param params Decode parameters
   * @returns Decoded data
   */
  private static lzwDecode(data: Buffer, params: any = {}): Buffer {
    // LZW decoding - simplified implementation
    // PDF LZW is similar to GIF LZW but with different clear/eod codes

    // For now, we'll stick with the warning as LZW is complex and less common in modern PDFs
    // But we can at least try to return something if it's simple
    console.warn('LZW decoding not fully implemented');
    return data;
  }
} 