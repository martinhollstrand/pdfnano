
const assert = require('assert');
const { PDFParser } = require('../dist');
const fs = require('fs');
const path = require('path');

// Build a PDF where object definitions use newlines instead of spaces
// e.g. "1 0\nobj" instead of "1 0 obj"
function buildNewlineObjectPDF() {
  const header = Buffer.from('%PDF-1.4\n');

  // Object 1: Catalog
  // Uses newline between generation and obj
  const obj1 = Buffer.from('1 0\nobj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  // Uses newline between object number and generation
  const obj2 = Buffer.from('2\n0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');

  // Object 3: Page
  // Standard spacing
  const obj3 = Buffer.from('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>\nendobj\n');

  // Corrupt XRef to force reconstruction
  // We intentionally provide a bad offset for the xref table or just omit it effectively
  // by pointing startxref to a non-xref location or providing garbage.
  // Here we'll just make a minimal trailer that points to a non-existent xref to trigger reconstruction.
  const trailer = Buffer.from('trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n99999\n%%EOF');

  return Buffer.concat([header, obj1, obj2, obj3, trailer]);
}

async function runTest() {
  console.log('Running reproduction test for newline-separated objects...');

  const parser = new PDFParser();
  const buf = buildNewlineObjectPDF();

  try {
    // This should trigger XRef reconstruction
    // If the scanner doesn't handle newlines, it won't find objects 1 and 2
    // And thus parsing will likely fail or return incomplete data
    const res = await parser.parseBuffer(buf);

    // We expect to find pages if reconstruction worked
    if (res && Array.isArray(res.pages) && res.pages.length > 0) {
      console.log('✓ Test Passed: Successfully parsed PDF with newline-separated objects');
    } else {
      console.error('✗ Test Failed: Parsed result is missing pages or invalid');
      process.exit(1);
    }
  } catch (e) {
    console.error('✗ Test Failed: Exception during parsing', e);
    process.exit(1);
  }
}

runTest();
