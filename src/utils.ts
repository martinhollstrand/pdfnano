import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

/**
 * Utility functions for PDF parsing
 */

/**
 * Reads a file as a buffer
 * @param filePath Path to the file
 * @returns Promise with the file buffer
 */
export async function readFileAsBuffer(filePath: string): Promise<Buffer> {
  const readFile = promisify(fs.readFile);
  return readFile(filePath);
}

/**
 * Generates a unique ID for images or other elements
 * @returns Unique ID string
 */
export function generateUniqueId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Converts a byte array to a Buffer
 * @param bytes Byte array
 * @returns Buffer
 */
export function bytesToBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes);
}

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