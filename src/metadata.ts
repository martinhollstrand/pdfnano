import { PDFStructure } from './structure';
import { PDFString, PDFReference, PDFDictionary, PDFNumber } from './objects';
import { PDFMetadata } from './types';

/**
 * Extracts metadata from the PDF structure
 * @param structure PDF structure info
 * @returns PDF metadata
 */
export function extractMetadata(structure: PDFStructure): PDFMetadata {
  const result: PDFMetadata = {
    // Default values
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    producer: '',
    pageCount: 0,
    isEncrypted: false
  };

  // Get info dictionary
  if (structure.info) {
    const info = structure.info;

    // Extract common metadata fields
    const title = info.get('Title');
    if (title instanceof PDFString) {
      result.title = title.value;
    }

    const author = info.get('Author');
    if (author instanceof PDFString) {
      result.author = author.value;
    }

    const subject = info.get('Subject');
    if (subject instanceof PDFString) {
      result.subject = subject.value;
    }

    const keywords = info.get('Keywords');
    if (keywords instanceof PDFString) {
      result.keywords = keywords.value;
    }

    const creator = info.get('Creator');
    if (creator instanceof PDFString) {
      result.creator = creator.value;
    }

    const producer = info.get('Producer');
    if (producer instanceof PDFString) {
      result.producer = producer.value;
    }

    // Parse dates
    const creationDate = info.get('CreationDate');
    if (creationDate instanceof PDFString) {
      // PDF dates are in the format: (D:YYYYMMDDHHmmSSOHH'mm')
      // where O is the relationship of local time to UTC (+ or -)
      try {
        result.creationDate = parsePDFDate(creationDate.value);
      } catch (e) {
        // Ignore date parsing errors
      }
    }

    const modDate = info.get('ModDate');
    if (modDate instanceof PDFString) {
      try {
        result.modificationDate = parsePDFDate(modDate.value);
      } catch (e) {
        // Ignore date parsing errors
      }
    }
  }

  // Get page count from pages tree
  if (structure.rootCatalog) {
    const catalogDict = structure.rootCatalog;
    const pagesRef = catalogDict.get('Pages');

    if (pagesRef instanceof PDFReference) {
      const pagesDict = structure.getObject(pagesRef.objectNumber, pagesRef.generation);

      if (pagesDict instanceof PDFDictionary) {
        const count = pagesDict.get('Count');

        if (count instanceof PDFNumber) {
          result.pageCount = count.value;
        }
      }
    }
  }

  // Check if the PDF is encrypted
  const trailer = structure.trailer;
  const encrypt = trailer.get('Encrypt');
  result.isEncrypted = encrypt !== undefined;

  return result;
}

/**
 * Parse a PDF date string into a JavaScript Date
 * @param dateString PDF date string
 * @returns JavaScript Date object
 */
function parsePDFDate(dateString: string): Date {
  // PDF dates are in the format: D:YYYYMMDDHHmmSSOHH'mm'
  // where O is the relationship of local time to UTC (+ or -)

  // Remove 'D:' prefix if present
  let dateStr = dateString;
  if (dateStr.startsWith('D:')) {
    dateStr = dateStr.substring(2);
  }

  // Basic parsing
  const year = parseInt(dateStr.substring(0, 4)) || 0;
  const month = parseInt(dateStr.substring(4, 6)) || 1;
  const day = parseInt(dateStr.substring(6, 8)) || 1;
  const hour = parseInt(dateStr.substring(8, 10)) || 0;
  const minute = parseInt(dateStr.substring(10, 12)) || 0;
  const second = parseInt(dateStr.substring(12, 14)) || 0;

  return new Date(year, month - 1, day, hour, minute, second);
}






