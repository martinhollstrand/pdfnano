import { PDFStream, PDFDictionary, PDFNumber, PDFName } from './objects';
import { PDFImage } from './types';
import { generateUniqueId } from './utils';
import { detectImageMimeType, encodePNGFromRaw } from './image-utils';

/**
 * Extract image from an XObject
 * @param xObject Image XObject
 * @returns Extracted image or null if extraction failed
 */
export function extractImageFromXObject(xObject: PDFStream): PDFImage | null {
  try {
    const dict = xObject.dictionary;

    // Get image dimensions
    const width = dict.get('Width');
    const height = dict.get('Height');

    if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber)) {
      return null;
    }

    // Get image data (decoded according to Filter)
    let imageData = xObject.getDecodedData();

    // Determine image type
    let mimeType = detectImageMimeType(imageData);

    // If undecided, try to wrap raw pixels into a PNG when feasible
    if ((!mimeType || mimeType === 'application/octet-stream') && width.value > 0 && height.value > 0) {
      // Infer components from ColorSpace
      let components = 0;
      const cs = dict.get('ColorSpace');
      if (cs instanceof PDFName) {
        if (cs.name === '/DeviceGray') components = 1;
        if (cs.name === '/DeviceRGB') components = 3;
        if (cs.name === '/DeviceCMYK') components = 4; // not PNG-friendly
      }
      const bpc = dict.get('BitsPerComponent');
      const bitsPerComponent = bpc instanceof PDFNumber ? bpc.value : 8;
      const expectedLen = components > 0 && bitsPerComponent === 8
        ? width.value * height.value * components
        : -1;
      if (expectedLen > 0 && imageData.length === expectedLen && (components === 1 || components === 3 || components === 4)) {
        try {
          imageData = encodePNGFromRaw(width.value, height.value, imageData, components);
          mimeType = 'image/png';
        } catch {
          // leave as-is
        }
      }
    }

    // Create the image object
    const image: PDFImage = {
      id: generateUniqueId(),
      data: imageData,
      mimeType,
      pageNumber: 1, // Will be updated later
      width: width.value,
      height: height.value,
      x: 0, // Placeholder
      y: 0  // Placeholder
    };

    return image;
  } catch (err) {
    // If image extraction fails, return null
    return null;
  }
}






