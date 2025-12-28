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
