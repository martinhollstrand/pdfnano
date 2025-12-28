
import { PDFStructure } from '../src/structure';
import { ContentParser } from '../src/content-parser';
import { PDFDictionary, PDFName, PDFReference, PDFStream, PDFArray } from '../src/objects';
import * as fs from 'fs';
import * as path from 'path';

async function reproduce() {
  const filePath = path.join(__dirname, '..', 'test', 'test10.pdf');
  console.log(`Analyzing ${filePath}...`);
  
  const buffer = fs.readFileSync(filePath);
  const structure = new PDFStructure(buffer);
  structure.parse();
  
  const pages = structure.rootCatalog?.get('Pages');
  if (!pages) return;

  let pagesObj = pages;
  if (pagesObj instanceof PDFReference) {
      pagesObj = structure.getObject(pagesObj.objectNumber, pagesObj.generation);
  }
  
  // Get first page
  let pageKids: PDFReference[] = [];
  if (pagesObj instanceof PDFDictionary) {
      const kids = pagesObj.get('Kids');
      if (Array.isArray(kids?.items)) {
          pageKids = kids.items;
      }
  }

  if (pageKids.length === 0) return;

  const pageRef = pageKids[0];
  const page = structure.getObject(pageRef.objectNumber, pageRef.generation);
  if (!(page instanceof PDFDictionary)) return;

  const resources = page.get('Resources');
  let resDict = resources;
  if (resources instanceof PDFReference) {
      resDict = structure.getObject(resources.objectNumber, resources.generation);
  }

  // Parse content stream
  const contents = page.get('Contents');
  let contentBuffer: Buffer = Buffer.alloc(0);
  
  if (contents) {
      let contentObj = contents;
      if (contents instanceof PDFReference) {
          contentObj = structure.getObject(contents.objectNumber, contents.generation);
      }
      
      if (contentObj instanceof PDFArray) {
          for(let i=0; i<contentObj.length; i++) {
              let stream = contentObj.get(i);
              if (stream instanceof PDFReference) {
                  stream = structure.getObject(stream.objectNumber, stream.generation);
              }
              if (stream instanceof PDFStream) {
                  contentBuffer = Buffer.concat([contentBuffer, stream.getDecodedData()]);
              }
          }
      } else if (contentObj instanceof PDFStream) {
          contentBuffer = contentObj.getDecodedData();
      }
  }

  // Create custom parser to log operations
  console.log('--- Content Operations ---');
  const parser = new ContentParser(contentBuffer, resDict, structure);
  parser.parse();

  // Access private operations (dirty hack for debugging)
  const ops = (parser as any).operations;
  let currentFont = 'None';
  
  for (const op of ops) {
      if (op.operator === 'Tf') {
          currentFont = op.operands[0];
          console.log(`Font selected: ${currentFont}`);
      } else if (op.operator === 'Tj') {
          const operand = op.operands[0];
          const hex = operand.buf ? operand.buf.toString('hex') : Buffer.from(operand, 'binary').toString('hex');
          const str = operand.str || operand;
          console.log(`Tj: <${hex}> (str: "${str}") [Font: ${currentFont}]`);
          
          // Try to decode
          const decoded = (parser as any).decodeText(operand);
          console.log(`   -> Decoded: "${decoded}"`);
      } else if (op.operator === 'TJ') {
          console.log(`TJ: [Font: ${currentFont}]`);
          const arr = op.operands[0];
          for (const item of arr) {
              if (typeof item === 'object' || typeof item === 'string') {
                  const val = typeof item === 'string' ? item : (item.str || item);
                   const buf = typeof item === 'string' ? Buffer.from(item, 'binary') : item.buf;
                   const hex = buf ? buf.toString('hex') : '';
                   console.log(`    Item: <${hex}> (str: "${val}")`);
                   const decoded = (parser as any).decodeText(item);
                   console.log(`       -> Decoded: "${decoded}"`);
              }
          }
      } else if (op.operator === 'BDC') {
           console.log('BDC:', op.operands);
      }
  }
}

reproduce().catch(console.error);

