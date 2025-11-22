
import { FontDecoder } from '../src/font-decoder';
import { PDFStream, PDFDictionary } from '../src/objects';
import { PDFStructure } from '../src/structure';

// Mock PDFStructure since we don't need it for this specific test of parseToUnicode
const mockStructure = {} as PDFStructure;

function runTest() {
  console.log('Running FontDecoder tests...');
  const decoder = new FontDecoder(mockStructure);

  // Test 1: Jammed hex strings
  {
    const cmapContent = `
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo <<
  /Registry (Adobe)
  /Ordering (UCS)
  /Supplement 0
>> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<00><FF>
endcodespacerange
2 beginbfrange
<21><21><0020>
<22><22><002b>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;

    const stream = new PDFStream(new PDFDictionary(), Buffer.from(cmapContent));
    
    // Access private method for testing
    const map = (decoder as any).parseToUnicode(stream);

    // Check if mappings were parsed
    if (map.size === 0) {
      console.error('✗ Test 1 failed: Parsed 0 entries from CMap');
      process.exit(1);
    }

    // <21> (33) -> <0020> (space, 32)
    if (map.get(0x21) !== '\u0020') {
      console.error(`✗ Test 1 failed: Expected 0x21 to map to space, got ${map.get(0x21)}`);
      process.exit(1);
    }

    // <22> (34) -> <002b> (+, 43)
    if (map.get(0x22) !== '\u002b') {
      console.error(`✗ Test 1 failed: Expected 0x22 to map to +, got ${map.get(0x22)}`);
      process.exit(1);
    }
    
    console.log('✓ Jammed CMap parsing test passed');
  }

  // Test 2: Space-separated hex strings
  {
    const cmapContent = `
1 beginbfrange
<21> <21> <0020>
endbfrange
`;

    const stream = new PDFStream(new PDFDictionary(), Buffer.from(cmapContent));
    const map = (decoder as any).parseToUnicode(stream);

    if (map.get(0x21) !== '\u0020') {
      console.error(`✗ Test 2 failed: Expected 0x21 to map to space, got ${map.get(0x21)}`);
      process.exit(1);
    }
    
    console.log('✓ Spaced CMap parsing test passed');
  }
  
  console.log('All FontDecoder tests passed');
}

runTest();
