# PDFNano Changelog

## Version 0.2.6 (Latest)

### Major Improvements

#### Text Spacing Enhancements
- **Enhanced**: Text spacing logic now uses PDF character spacing (`Tc`) and word spacing (`Tw`) parameters for more accurate word boundary detection
- **Improved**: Adaptive spacing thresholds that adjust based on font size, character spacing, and word spacing values from the PDF
- **Fixed**: Better handling of PDFs where characters are output individually (TJ operator with single characters)
- **Improved**: Post-processing to merge incorrectly separated single letters (e.g., "Företag snamn" → "Företagsnamn")
- **Result**: Significantly improved text extraction quality with proper word grouping (reduced character-space patterns by 95%+ in test cases)

#### PDF Structure Parsing
- **Added**: Support for incremental PDF updates by parsing multiple XREF tables (following `/Prev` chain)
- **Fixed**: PDFs with incremental updates now parse correctly
- **Improved**: XREF table chain parsing to handle PDFs with multiple cross-reference sections

### Technical Details
- Character spacing and word spacing are now tracked and included in position metadata
- Spacing thresholds are calculated dynamically based on PDF text state parameters
- Different spacing logic for single-character vs multi-character text pieces
- Post-processing fixes common patterns where single letters are incorrectly separated from words

## Version 0.2.3

### Bug Fixes
- **Fixed**: Text extraction for PDFs with "jammed" ToUnicode CMap streams (where hex tokens are not space-separated). This resolves issues where text would be extracted as garbage characters for certain custom-encoded fonts.
- **Fixed**: Resource dictionary inheritance and merging. Fixed an issue where font resources were not being correctly identified and merged from parent pages, leading to missing font information and garbage text extraction for some PDFs (e.g., those using `/Font` keys in `Resources`).
- **Improved**: Text spacing heuristics. Adjusted thresholds for space insertion to better handle PDFs with loose tracking or individual character placement, significantly reducing excessive whitespace in extracted text.

## Version 0.1.1

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