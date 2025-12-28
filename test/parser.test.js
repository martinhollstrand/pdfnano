// Simple test file for PDFParser
// This is a minimal, framework-less test script suitable for CI

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { PDFParser } = require('../dist');
const zlib = require('zlib');

// Build a small single-page PDF with an inline image (1x1 red pixel)
function buildInlineImagePDF() {
  const pixel = Buffer.from([255, 0, 0]);
  const compressed = zlib.deflateSync(pixel);
  const header = Buffer.from('%PDF-1.4\n');
  const obj1 = Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  const obj2 = Buffer.from('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');
  const obj3 = Buffer.from('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>\nendobj\n');
  const contentStart = Buffer.from('4 0 obj\n<< /Length ');
  const contentPrefix = Buffer.from(' >>\nstream\nq 100 0 0 100 0 0 cm\nBI\n/W 1\n/H 1\n/CS /RGB\n/BPC 8\n/F /FlateDecode\nID\n');
  const contentSuffix = Buffer.from('\nEI\nQ\nendstream\nendobj\n');
  const contentBody = Buffer.concat([contentPrefix, compressed, contentSuffix]);
  const lengthStr = Buffer.from(String(contentBody.length));
  const contentObj = Buffer.concat([contentStart, lengthStr, contentBody]);
  const trailer = Buffer.from('trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n0\n%%EOF');
  return Buffer.concat([header, obj1, obj2, obj3, contentObj, trailer]);
}

const invalidPDFData = 'This is not a PDF file';

async function runTests() {
  console.log('Running PDFNano parser tests...');

  // Instantiate
  try {
    new PDFParser();
    console.log('✓ Instantiation');
  } catch (e) {
    console.error('✗ Instantiation failed', e);
    process.exit(1);
  }

  const parser = new PDFParser();

  // Parse from buffer (with inline image)
  try {
    const buf = buildInlineImagePDF();
    const res = await parser.parseBuffer(buf);
    assert(res && Array.isArray(res.pages));
    console.log('✓ parseBuffer');
  } catch (e) {
    console.error('✗ parseBuffer failed', e);
  }

  // parseBufferToMarkdown
  try {
    const buf = buildInlineImagePDF();
    const md = await parser.parseBufferToMarkdown(buf);
    assert.strictEqual(typeof md, 'string');
    console.log('✓ parseBufferToMarkdown');
  } catch (e) {
    console.error('✗ parseBufferToMarkdown failed', e);
  }

  // parseBufferToJSON
  try {
    const buf = buildInlineImagePDF();
    const jsonStr = await parser.parseBufferToJSON(buf);
    const obj = JSON.parse(jsonStr);
    assert(obj && Array.isArray(obj.pages));
    console.log('✓ parseBufferToJSON');
  } catch (e) {
    console.error('✗ parseBufferToJSON failed', e);
  }

  // extractImagesFromBuffer (expect array; may be empty for this minimal PDF)
  try {
    const buf = buildInlineImagePDF();
    const images = await parser.extractImagesFromBuffer(buf);
    assert(Array.isArray(images));
    console.log('✓ extractImagesFromBuffer');
  } catch (e) {
    console.error('✗ extractImagesFromBuffer failed', e);
  }

  // Invalid buffer should throw
  try {
    let threw = false;
    try {
      await parser.parseBuffer(Buffer.from(invalidPDFData));
    } catch (e) {
      threw = true;
    }
    if (threw) console.log('✓ invalid buffer rejected');
    else console.error('✗ invalid buffer not rejected');
  } catch (e) {
    console.error('✗ invalid buffer test failed', e);
  }

  // File-based tests using a temporary file created from the image PDF
  try {
    const tmpDir = path.join(__dirname, '.tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPdf = path.join(tmpDir, 'sample.pdf');
    fs.writeFileSync(tmpPdf, buildInlineImagePDF());

    const resFile = await parser.parseFile(tmpPdf);
    assert(resFile && Array.isArray(resFile.pages));
    console.log('✓ parseFile');

    const mdFile = await parser.parseFileToMarkdown(tmpPdf);
    assert.strictEqual(typeof mdFile, 'string');
    console.log('✓ parseFileToMarkdown');

    const jsonFile = await parser.parseFileToJSON(tmpPdf);
    const parsed = JSON.parse(jsonFile);
    assert(parsed && Array.isArray(parsed.pages));
    console.log('✓ parseFileToJSON');

    const imgs = await parser.extractImagesFromFile(tmpPdf);
    assert(Array.isArray(imgs));
    console.log('✓ extractImagesFromFile');

    // Cleanup temp files
    try { fs.unlinkSync(tmpPdf); } catch {}
    try { fs.rmdirSync(tmpDir); } catch {}
  } catch (e) {
    console.error('✗ file-based tests failed', e);
  }

  // Regression test: Canva-generated PDF (test/test.pdf) should extract readable text
  try {
    const regressionPdf = path.join(__dirname, 'test.pdf');
    if (!fs.existsSync(regressionPdf)) {
      console.log('↷ regression PDF missing (skipping):', regressionPdf);
    } else {
      const res = await parser.parseFile(regressionPdf);
      assert(res && Array.isArray(res.pages));
      assert.strictEqual(res.pages.length, 1);

      // Metadata sanity
      assert(res.metadata);
      assert.strictEqual(res.metadata.author, 'Winta');
      assert(
        typeof res.metadata.title === 'string' &&
          res.metadata.title.includes('CV Resume')
      );

      // Text extraction sanity (high-signal phrases)
      assert.strictEqual(typeof res.text, 'string');
      assert(res.text.length > 500);
      assert(res.text.includes('UTBILDNING'));
      assert(res.text.includes('ARBETSERFARENHET'));
      assert(res.text.includes('KONTAKTUPPGIFTER'));
      assert(res.text.includes('winta.abraham@outlook.com'));
      assert(res.text.includes('MTR'));
      assert(res.text.includes('BIRKAGÅRDENS'));

      console.log('✓ regression parse (test/test.pdf)');
      console.log(res.text);
    }
  } catch (e) {
    console.error('✗ regression parse (test/test.pdf) failed', e);
  }

  // Additional sample PDFs: parse + print text (light assertions for known edge-cases)
  for (const fileName of ['test2.pdf', 'test3.pdf', 'test4.pdf', 'test5.pdf', 'test6.pdf', 'test7.pdf', 'test8.pdf', 'test9.pdf', 'test10.pdf', 'test11.pdf']) {
    try {
      const pdfPath = path.join(__dirname, fileName);
      if (!fs.existsSync(pdfPath)) {
        console.log(`↷ sample PDF missing (skipping): ${pdfPath}`);
        continue;
      }
      const res = await parser.parseFile(pdfPath);
      assert(res && Array.isArray(res.pages));

      // Regression: test5.pdf uses a referenced /Contents array; page 1 should not be empty.
      if (fileName === 'test5.pdf') {
        assert.strictEqual(res.pages.length, 2);
        assert.strictEqual(typeof res.pages[0].text, 'string');
        assert(res.pages[0].text.length > 500);
        assert(res.pages[0].text.includes('Luca'));
        assert(res.pages[0].text.toUpperCase().includes('PROFILE'));
      }

      // Regression: test6.pdf text is in sensible content-stream order; avoid scrambling via position sorting.
      if (fileName === 'test6.pdf') {
        assert(res.pages.length >= 1);
        assert.strictEqual(typeof res.text, 'string');
        assert(res.text.length > 1000);
        assert(res.text.includes('Therese'));
        assert(res.text.includes('Arbetslivserfarenhet'));
        assert(res.text.toLowerCase().includes('therese.wernang@gmail.com'));
      }

      console.log(" ");
      console.log(`===============================================`);
      console.log(`✓ ===== PARSED (${fileName}) =====`);
      console.log(`===============================================`);
      console.log(" ");
      console.log(res.text);
    } catch (e) {
      console.error(`✗ parse (${fileName}) failed`, e);
    }
  }

  console.log('All tests completed');
}

runTests();