
const fs = require('fs');
const path = require('path');
const { PDFStructure } = require('../dist/structure');
const { PDFDictionary, PDFName, PDFStream, PDFArray, PDFReference } = require('../dist/objects');

async function debugPDF(filename) {
  console.log(`\n--- Debugging ${filename} ---`);
  const filePath = path.join(__dirname, '..', 'test', filename);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const structure = new PDFStructure(buffer);
  structure.parse();

  if (!structure.rootCatalog) {
      console.log("No Root Catalog found.");
      return;
  }

  // Simple page tree traversal (assuming flat or simple tree for now)
  const pagesRef = structure.rootCatalog.get('Pages');
  if (!pagesRef) {
      console.log("No Pages entry in Root Catalog.");
      return;
  }
  
  let pagesDict = pagesRef;
  if (pagesRef instanceof PDFReference) {
      pagesDict = structure.getObject(pagesRef.objectNumber, pagesRef.generation);
  }

  if (!pagesDict) {
      console.log("Could not resolve Pages dictionary.");
      return;
  }

  // Get Kids
  const kids = pagesDict.get('Kids');
  if (!kids) {
      console.log("No Kids in Pages dictionary.");
      return;
  }

  // Just grab the first page for debugging
  let firstPageRef = null;
  if (kids instanceof PDFArray && kids.length > 0) {
      firstPageRef = kids.get(0);
  }

  if (!firstPageRef) {
      console.log("No pages found.");
      return;
  }

  let firstPage = firstPageRef;
  if (firstPageRef instanceof PDFReference) {
      firstPage = structure.getObject(firstPageRef.objectNumber, firstPageRef.generation);
  }
  
  // Navigate down if it's an intermediate node (simplified)
  while (firstPage && firstPage.get('Type').name === '/Pages') {
      const k = firstPage.get('Kids');
      if (k && k.length > 0) {
          const r = k.get(0);
          firstPage = structure.getObject(r.objectNumber, r.generation);
      } else {
          break;
      }
  }

  console.log('Inspecting first page resources...');
  const resources = firstPage.get('Resources');
  if (resources) {
      let resDict = resources;
      if (resources instanceof PDFReference) {
          resDict = structure.getObject(resources.objectNumber, resources.generation);
      }
      
      const fonts = resDict.get('Font');
      if (fonts) {
        console.log('  Fonts:');
        let fontsDict = fonts;
        if (fonts instanceof PDFReference) {
            fontsDict = structure.getObject(fonts.objectNumber, fonts.generation);
        }

        if (fontsDict instanceof PDFDictionary) {
          for (const [name, fontRef] of fontsDict.entries.entries()) {
            console.log(`    Font: ${name}`);
            let fontDict = fontRef;
            if (fontRef instanceof PDFReference) {
               fontDict = structure.getObject(fontRef.objectNumber, fontRef.generation);
            }
            
            if (fontDict instanceof PDFDictionary) {
                const subtype = fontDict.get('Subtype');
                const baseFont = fontDict.get('BaseFont');
                const encoding = fontDict.get('Encoding');
                const toUnicode = fontDict.get('ToUnicode');
                const descFonts = fontDict.get('DescendantFonts');

                console.log(`      Subtype: ${subtype ? subtype.name : 'N/A'}`);
                console.log(`      BaseFont: ${baseFont ? baseFont.name : 'N/A'}`);
                console.log(`      Encoding: ${encoding ? (encoding.name || 'Dict') : 'N/A'}`);
                console.log(`      ToUnicode: ${toUnicode ? 'Present' : 'Missing'}`);
                
                if (toUnicode) {
                     let toUnicodeStream = toUnicode;
                     if (toUnicode instanceof PDFReference) {
                         toUnicodeStream = structure.getObject(toUnicode.objectNumber, toUnicode.generation);
                     }
                     if (toUnicodeStream instanceof PDFStream) {
                         const data = toUnicodeStream.getDecodedData().toString('utf8');
                         console.log('      ToUnicode Content (FULL):');
                         console.log(data);
                     }
                }

                if (encoding instanceof PDFDictionary) {
                    const diff = encoding.get('Differences');
                    if (diff) {
                        console.log(`      Differences: Present (${diff.length} items)`);
                        // Print first few differences
                        for(let i=0; i<Math.min(diff.length, 10); i++) {
                            const item = diff.get(i);
                            if (item.constructor.name === 'PDFNumber') console.log(`        ${item.value}`);
                            if (item.constructor.name === 'PDFName') console.log(`        ${item.name}`);
                        }
                    }
                }
                
                if (descFonts) {
                    console.log('      DescendantFonts: Present');
                }
            }
          }
        }
      } else {
          console.log('  No Font dictionary in Resources.');
      }
      
      const xObjects = resDict.get('XObject');
      if (xObjects) {
          console.log('  XObjects:');
          let xObjDict = xObjects;
           if (xObjects instanceof PDFReference) {
               xObjDict = structure.getObject(xObjects.objectNumber, xObjects.generation);
           }
           if (xObjDict instanceof PDFDictionary) {
               for (const [name, ref] of xObjDict.entries.entries()) {
                   console.log(`    XObject: ${name}`);
                   let obj = ref;
                   if (ref instanceof PDFReference) {
                       obj = structure.getObject(ref.objectNumber, ref.generation);
                   }
                   if (obj instanceof PDFStream) {
                       const subtype = obj.dictionary.get('Subtype');
                       console.log(`      Subtype: ${subtype ? subtype.name : 'N/A'}`);
                       if (subtype && subtype.name === '/Form') {
                           console.log('      This is a Form XObject (contains content).');
                           // Check resources of the Form
                           const formRes = obj.dictionary.get('Resources');
                           if (formRes) console.log('      Form has Resources.');
                       }
                   }
               }
           }
      }
  } else {
      console.log('  No Resources found on page.');
  }

  // Dump Content Stream
  console.log('  Content Stream (first 1000 chars):');
  const contents = firstPage.get('Contents');
  if (contents) {
      let contentObj = contents;
      if (contents instanceof PDFReference) {
          contentObj = structure.getObject(contents.objectNumber, contents.generation);
      }
      
      if (contentObj instanceof PDFArray) {
          // Join streams
          let data = '';
          for(let i=0; i<contentObj.length; i++) {
              let stream = contentObj.get(i);
              if (stream instanceof PDFReference) {
                  stream = structure.getObject(stream.objectNumber, stream.generation);
              }
              if (stream instanceof PDFStream) {
                  data += stream.getDecodedData().toString('latin1');
              }
          }
          console.log(data.substring(0, 1000));
      } else if (contentObj instanceof PDFStream) {
          console.log(contentObj.getDecodedData().toString('latin1').substring(0, 1000));
      }
  }

}

async function run() {
  await debugPDF('test10.pdf');
}

run().catch(console.error);
