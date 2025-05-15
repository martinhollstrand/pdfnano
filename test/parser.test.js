// Simple test file for PDFParser
// In a real-world scenario, you would use Jest, Mocha, or another test framework

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { PDFParser } = require('../dist');

// Test data - a simple PDF header
const validPDFData = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj
3 0 obj
<< /Type /Page /MediaBox [0 0 612 792] /Contents 4 0 R /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 100 700 Td (Hello, World!) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000010 00000 n
0000000059 00000 n
0000000116 00000 n
0000000236 00000 n
0000000331 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
402
%%EOF`;

const invalidPDFData = 'This is not a PDF file';

// Tests
async function runTests() {
  console.log('Running PDFParser tests...');
  
  // Test 1: Parser should be instantiable
  try {
    const parser = new PDFParser();
    console.log('✓ Test 1: Parser can be instantiated');
  } catch (err) {
    console.error('✗ Test 1: Parser instantiation failed', err);
    return;
  }
  
  // Test 2: Parser should parse valid PDF data
  const parser = new PDFParser();
  
  try {
    const validBuffer = Buffer.from(validPDFData);
    const result = await parser.parseBuffer(validBuffer);
    console.log('✓ Test 2: Valid PDF data was parsed successfully');
  } catch (err) {
    console.error('✗ Test 2: Valid PDF data parsing failed', err);
  }
  
  // Test 3: Parser should reject invalid PDF data
  try {
    let threwError = false;
    try {
      const invalidBuffer = Buffer.from(invalidPDFData);
      await parser.parseBuffer(invalidBuffer);
    } catch (err) {
      threwError = true;
    }
    
    if (threwError) {
      console.log('✓ Test 3: Invalid PDF data was rejected');
    } else {
      console.error('✗ Test 3: Invalid PDF data was not rejected');
    }
  } catch (err) {
    console.error('✗ Test 3: Test failed with error', err);
  }
  
  console.log('Tests completed');
}

runTests(); 