# PDFNano Changelog

## Version 0.1.1 (Latest)

### Major Enhancements

#### PDF Structure Parsing
- Enhanced XREF table parsing with support for PDF 1.5+ cross-reference streams
- Added automatic recovery for PDFs with damaged or incomplete XREF tables
- Implemented fallback object scanning for broken PDFs

#### Text Extraction
- Implemented complete content stream parser for PDF operators
- Added support for text positioning operators (Tm, Td, TD, T*)
- Implemented text state parameters handling (font, size, spacing, scaling)
- Added support for all text showing operators (Tj, TJ, ', ")
- Improved text positioning to maintain original document layout
- Added proper whitespace and line break handling

#### Font Handling
- Added font dictionary parsing and caching
- Implemented ToUnicode CMap parsing for better character mapping
- Added support for custom encoding dictionaries
- Implemented standard encoding maps for common PDF fonts
- Added character decoding based on font information

#### Error Recovery
- Implemented graceful error handling for malformed PDFs
- Added recovery strategies for common PDF structural errors
- Enhanced robustness for real-world PDFs with various issues

### Bug Fixes
- Fixed handling of PDFs with invalid XREF tables
- Fixed text extraction for PDFs with complex layouts
- Fixed character encoding issues in text extraction

## Testing the Enhancements

To test the enhanced PDF parsing capabilities:

1. **Basic Testing**:
   ```typescript
   import { PDFParser } from 'pdfnano';
   
   async function testPDF(filePath: string) {
     const parser = new PDFParser();
     try {
       const result = await parser.parseFile(filePath);
       console.log('Document Title:', result.metadata.title);
       console.log('Page Count:', result.metadata.pageCount);
       console.log('First 100 chars of text:', result.text.substring(0, 100));
     } catch (err) {
       console.error('Error parsing PDF:', err);
     }
   }
   
   testPDF('path/to/your/document.pdf');
   ```

2. **Testing with Damaged PDFs**:
   The library now automatically attempts to recover from PDF structural errors.
   Try parsing PDFs with known issues to verify the recovery mechanisms.

3. **Font Handling Test**:
   Test with PDFs containing various fonts, especially non-Latin character sets,
   to verify the font decoding capabilities.

## Version 0.1.0 (Initial Release)

- Basic PDF structure parsing (XREF tables, trailer)
- Simple object model (dictionaries, arrays, strings, numbers)
- Basic text extraction without positioning
- Simple image extraction for common formats 