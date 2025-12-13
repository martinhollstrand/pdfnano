import { FontDecoder, FontInfo } from '../src/font-decoder';
import { PDFStructure } from '../src/structure';
import * as assert from 'assert';

// Mock PDFStructure since we only need it for the constructor
const mockStructure = {} as PDFStructure;

async function runTests() {
  console.log('Running FontDecoder tests...');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`✗ ${name} failed:`, e.message);
      failed++;
    }
  }

  const decoder = new FontDecoder(mockStructure);

  // Test WinAnsiEncoding
  test('WinAnsiEncoding: Euro symbol (0x80)', () => {
    const fontInfo: FontInfo = {
      fontName: 'TestFont',
      fontType: 'TrueType',
      encoding: 'WinAnsiEncoding',
      isSymbolic: false,
      isEmbedded: false,
      customEncoding: null,
      toUnicode: null
    };

    // 0x80 is Euro in WinAnsi
    const input = Buffer.from([0x80]);
    const result = decoder.decodeText(input, fontInfo);
    assert.strictEqual(result, '€');
  });

  test('WinAnsiEncoding: Smart quotes (0x93, 0x94)', () => {
    const fontInfo: FontInfo = {
      fontName: 'TestFont',
      fontType: 'TrueType',
      encoding: 'WinAnsiEncoding',
      isSymbolic: false,
      isEmbedded: false,
      customEncoding: null,
      toUnicode: null
    };

    // “Hello”
    const input = Buffer.from([0x93, 0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x94]);
    const result = decoder.decodeText(input, fontInfo);
    assert.strictEqual(result, '“Hello”');
  });

  // Test MacRomanEncoding
  test('MacRomanEncoding: Accented characters', () => {
    const fontInfo: FontInfo = {
      fontName: 'TestFont',
      fontType: 'TrueType',
      encoding: 'MacRomanEncoding',
      isSymbolic: false,
      isEmbedded: false,
      customEncoding: null,
      toUnicode: null
    };

    // 0x80 is Ä in MacRoman
    const input = Buffer.from([0x80]);
    const result = decoder.decodeText(input, fontInfo);
    assert.strictEqual(result, 'Ä');
  });

  test('MacRomanEncoding: Copyright (0xA9)', () => {
    const fontInfo: FontInfo = {
      fontName: 'TestFont',
      fontType: 'TrueType',
      encoding: 'MacRomanEncoding',
      isSymbolic: false,
      isEmbedded: false,
      customEncoding: null,
      toUnicode: null
    };

    const input = Buffer.from([0xA9]);
    const result = decoder.decodeText(input, fontInfo);
    assert.strictEqual(result, '©');
  });

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests();
