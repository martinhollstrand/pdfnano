import * as zlib from 'zlib';

/**
 * Determines the MIME type of an image from its headers
 * @param data Image data buffer
 * @returns MIME type string
 */
export function detectImageMimeType(data: Buffer): string {
  // Check for PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4E &&
    data[3] === 0x47 &&
    data[4] === 0x0D &&
    data[5] === 0x0A &&
    data[6] === 0x1A &&
    data[7] === 0x0A
  ) {
    return 'image/png';
  }

  // Check for JPEG signature: FF D8 FF
  if (
    data.length >= 3 &&
    data[0] === 0xFF &&
    data[1] === 0xD8 &&
    data[2] === 0xFF
  ) {
    return 'image/jpeg';
  }

  // Check for GIF signature: 'GIF87a' or 'GIF89a'
  if (
    data.length >= 6 &&
    data[0] === 0x47 && // G
    data[1] === 0x49 && // I
    data[2] === 0x46 && // F
    data[3] === 0x38 && // 8
    (data[4] === 0x37 || data[4] === 0x39) && // 7 or 9
    data[5] === 0x61 // a
  ) {
    return 'image/gif';
  }

  // Default
  return 'application/octet-stream';
}

/**
 * Encode raw 8-bit grayscale/RGB/RGBA pixel data as a minimal PNG
 */
export function encodePNGFromRaw(width: number, height: number, raw: Buffer, components: number): Buffer {
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






