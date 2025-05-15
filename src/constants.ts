/**
 * PDF format constants
 */

// PDF Header: %PDF-{version}
export const PDF_HEADER_REGEX = /%PDF-(\d+\.\d+)/;

// PDF comments start with '%'
export const COMMENT_MARKER = '%';

// PDF end of file marker
export const EOF_MARKER = '%%EOF';

// PDF objects start with "obj" and end with "endobj"
export const OBJ_START = 'obj';
export const OBJ_END = 'endobj';

// PDF streams
export const STREAM_START = 'stream';
export const STREAM_END = 'endstream';

// PDF xref table
export const XREF_MARKER = 'xref';

// PDF trailer
export const TRAILER_MARKER = 'trailer';

// PDF startxref
export const STARTXREF_MARKER = 'startxref';

// PDF dictionary markers
export const DICT_START = '<<';
export const DICT_END = '>>';

// PDF array markers
export const ARRAY_START = '[';
export const ARRAY_END = ']';

// PDF object reference
export const REFERENCE_SUFFIX = 'R';

// Standard PDF object types
export const PDF_OBJECT_TYPES = {
  CATALOG: '/Catalog',
  PAGES: '/Pages',
  PAGE: '/Page',
  XOBJECT: '/XObject',
  IMAGE: '/Image',
  FONT: '/Font',
  CONTENTS: '/Contents',
  RESOURCES: '/Resources',
  METADATA: '/Metadata',
  INFO: '/Info'
};

// Image types
export const IMAGE_SUBTYPES = {
  JPEG: '/DCTDecode',
  JPEG2000: '/JPXDecode',
  JBIG2: '/JBIG2Decode',
  CCITT: '/CCITTFaxDecode',
  FLATE: '/FlateDecode',
  LZW: '/LZWDecode',
  RUN_LENGTH: '/RunLengthDecode',
  ASCII85: '/ASCII85Decode',
  ASCII_HEX: '/ASCIIHexDecode'
}; 