
import { PDFStructure } from './src/structure';
import { FontDecoder, FontInfo } from './src/font-decoder';
import { PDFDictionary, PDFName, PDFReference, PDFStream } from './src/objects';
import * as fs from 'fs';
import * as path from 'path';

async function debugFonts() {
  const filePath = path.join(__dirname, 'test', 'test10.pdf');
  console.log(`Analyzing fonts in ${filePath}...`);
  
  const buffer = fs.readFileSync(filePath);
  const structure = new PDFStructure(buffer);
  structure.parse();
  
  const fontDecoder = new FontDecoder(structure);
  const pages = structure.rootCatalog?.get('Pages');
  
  if (!pages) {
    console.error('No Pages found');
    return;
  }

  // Very simple page traversal (just first level)
  let pageKids: PDFReference[] = [];
  
  // Resolve Pages reference
  let pagesObj = pages;
  if (pagesObj instanceof PDFReference) {
      pagesObj = structure.getObject(pagesObj.objectNumber, pagesObj.generation);
  }
  
  if (pagesObj instanceof PDFDictionary) {
      const kids = pagesObj.get('Kids');
      if (Array.isArray(kids?.items)) {
          pageKids = kids.items;
      }
  }

  console.log(`Found ${pageKids.length} pages (shallow check)`);

  for (let i = 0; i < Math.min(pageKids.length, 5); i++) {
      const pageRef = pageKids[i];
      if (!(pageRef instanceof PDFReference)) continue;
      
      const page = structure.getObject(pageRef.objectNumber, pageRef.generation);
      if (!(page instanceof PDFDictionary)) continue;
      
      const resources = page.get('Resources');
      let resDict = resources;
      if (resources instanceof PDFReference) {
          resDict = structure.getObject(resources.objectNumber, resources.generation);
      }
      
      if (!(resDict instanceof PDFDictionary)) continue;
      
      const fonts = resDict.get('Font');
      let fontDict = fonts;
      if (fonts instanceof PDFReference) {
          fontDict = structure.getObject(fonts.objectNumber, fonts.generation);
      }
      
      if (fontDict instanceof PDFDictionary) {
          console.log(`\nPage ${i + 1} Fonts:`);
          for (const [name, fontRef] of fontDict.entries) {
              let fontObj = fontRef;
              if (fontRef instanceof PDFReference) {
                  fontObj = structure.getObject(fontRef.objectNumber, fontRef.generation);
              }
              
              if (fontObj instanceof PDFDictionary) {
                  const fontInfo = fontDecoder.getFont(fontObj);
                  if (fontInfo) {
                      console.log(`  Font: ${name}`);
                      console.log(`    BaseFont: ${fontInfo.fontName}`);
                      console.log(`    Type: ${fontInfo.fontType}`);
                      console.log(`    Encoding: ${fontInfo.encoding}`);
                      console.log(`    IsCID: ${fontInfo.isCIDFont}`);
                      console.log(`    ToUnicode: ${fontInfo.toUnicode ? `Yes (${fontInfo.toUnicode.size} entries)` : 'No'}`);
                      if (fontInfo.toUnicode) {
                          // Dump all entries sorted
                          const entries = Array.from(fontInfo.toUnicode.entries()).sort((a, b) => a[0] - b[0]);
                          console.log(`      ToUnicode Map (First 20):`);
                          entries.slice(0, 20).forEach(([k, v]) => console.log(`        ${k} (0x${k.toString(16)}) -> '${v}'`));
                          console.log(`      ToUnicode Map (Around 't' 116):`);
                          entries.filter(([k]) => k >= 100 && k <= 130).forEach(([k, v]) => console.log(`        ${k} (0x${k.toString(16)}) -> '${v}'`));
                      }
                      console.log(`    CustomEncoding: ${fontInfo.customEncoding ? `Yes (${fontInfo.customEncoding.size} entries)` : 'No'}`);
                      if (fontInfo.customEncoding) {
                          const entries = Array.from(fontInfo.customEncoding.entries()).sort((a, b) => a[0] - b[0]);
                          console.log(`      CustomEncoding Map (First 20):`);
                          entries.slice(0, 20).forEach(([k, v]) => console.log(`        ${k} (0x${k.toString(16)}) -> '${v}'`));
                          console.log(`      CustomEncoding Map (Around 't' 116):`);
                          entries.filter(([k]) => k >= 100 && k <= 130).forEach(([k, v]) => console.log(`        ${k} (0x${k.toString(16)}) -> '${v}'`));
                      }
                      
                      // Check DescendantFonts for CID
                      const descendants = fontObj.get('DescendantFonts');
                      if (descendants) {
                          console.log('    DescendantFonts found');
                          // Inspect CIDToGIDMap
                          const firstDesc = Array.isArray(descendants.items) ? descendants.items[0] : null;
                          if (firstDesc) {
                              let descObj = firstDesc;
                              if (firstDesc instanceof PDFReference) {
                                  descObj = structure.getObject(firstDesc.objectNumber, firstDesc.generation);
                              }
                              if (descObj instanceof PDFDictionary) {
                                  const cidToGid = descObj.get('CIDToGIDMap');
                                  console.log(`      CIDToGIDMap: ${cidToGid instanceof PDFName ? cidToGid.name : (cidToGid ? 'Stream/Ref' : 'None')}`);
                              }
                          }
                      }
                  }
              }
          }
      }
  }
}

debugFonts();

