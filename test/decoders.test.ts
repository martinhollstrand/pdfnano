import { StreamDecoder } from '../src/decoders';
import { IMAGE_SUBTYPES } from '../src/constants';
import * as zlib from 'zlib';
import * as assert from 'assert';

async function runTests() {
  console.log('Running Decoder tests...');
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

  // ASCII85 Tests
  test('ASCII85: basic string', () => {
    // "Man " -> "9jqo^"
    const input = Buffer.from('9jqo^');
    const expected = Buffer.from('Man ');
    const result = StreamDecoder.decode(input, [IMAGE_SUBTYPES.ASCII85]);
    assert.strictEqual(result.toString(), expected.toString());
  });

  test('ASCII85: "z" for zero run', () => {
    // "z" -> 4 null bytes
    const input = Buffer.from('z');
    const expected = Buffer.alloc(4, 0);
    const result = StreamDecoder.decode(input, [IMAGE_SUBTYPES.ASCII85]);
    assert.deepStrictEqual(result, expected);
  });

  test('ASCII85: padding', () => {
    // "Man" -> "9jqo"
    const input = Buffer.from('9jqo');
    const expected = Buffer.from('Man');
    const result = StreamDecoder.decode(input, [IMAGE_SUBTYPES.ASCII85]);
    assert.strictEqual(result.toString(), expected.toString());
  });

  test('ASCII85: ignore whitespace', () => {
    const input = Buffer.from('9j\nqo^');
    const expected = Buffer.from('Man ');
    const result = StreamDecoder.decode(input, [IMAGE_SUBTYPES.ASCII85]);
    assert.strictEqual(result.toString(), expected.toString());
  });

  test('ASCII85: delimiters <~ and ~>', () => {
    const input = Buffer.from('<~9jqo^~>');
    const expected = Buffer.from('Man ');
    const result = StreamDecoder.decode(input, [IMAGE_SUBTYPES.ASCII85]);
    assert.strictEqual(result.toString(), expected.toString());
  });

  // FlateDecode Tests
  test('FlateDecode: standard zlib stream', () => {
    const expected = Buffer.from('Hello World');
    const input = zlib.deflateSync(expected);
    const result = StreamDecoder.decode(input, [IMAGE_SUBTYPES.FLATE]);
    assert.strictEqual(result.toString(), expected.toString());
  });

  test('FlateDecode: raw deflate stream (no header)', () => {
    const expected = Buffer.from('Hello World Raw');
    const input = zlib.deflateRawSync(expected);
    const result = StreamDecoder.decode(input, [IMAGE_SUBTYPES.FLATE]);
    assert.strictEqual(result.toString(), expected.toString());
  });

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests();
