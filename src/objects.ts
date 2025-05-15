/**
 * Classes representing PDF objects
 */
import { StreamDecoder } from './decoders';

/**
 * PDF object reference
 */
export class PDFReference {
  objectNumber: number;
  generation: number;

  constructor(objectNumber: number, generation: number = 0) {
    this.objectNumber = objectNumber;
    this.generation = generation;
  }

  toString(): string {
    return `${this.objectNumber} ${this.generation} R`;
  }
}

/**
 * Base PDF object
 */
export abstract class PDFObject {
  objectNumber?: number;
  generation?: number;

  constructor(objectNumber?: number, generation: number = 0) {
    this.objectNumber = objectNumber;
    this.generation = generation;
  }

  getReference(): PDFReference | undefined {
    if (this.objectNumber === undefined) return undefined;
    return new PDFReference(this.objectNumber, this.generation || 0);
  }
}

/**
 * PDF Null object
 */
export class PDFNull extends PDFObject {
  toString(): string {
    return 'null';
  }
}

/**
 * PDF Boolean object
 */
export class PDFBoolean extends PDFObject {
  value: boolean;

  constructor(value: boolean, objectNumber?: number, generation?: number) {
    super(objectNumber, generation);
    this.value = value;
  }

  toString(): string {
    return this.value ? 'true' : 'false';
  }
}

/**
 * PDF Number object
 */
export class PDFNumber extends PDFObject {
  value: number;

  constructor(value: number, objectNumber?: number, generation?: number) {
    super(objectNumber, generation);
    this.value = value;
  }

  toString(): string {
    return this.value.toString();
  }
}

/**
 * PDF String object
 */
export class PDFString extends PDFObject {
  value: string;
  isHex: boolean;

  constructor(value: string, isHex: boolean = false, objectNumber?: number, generation?: number) {
    super(objectNumber, generation);
    this.value = value;
    this.isHex = isHex;
  }

  toString(): string {
    if (this.isHex) {
      return `<${this.value}>`;
    }
    return `(${this.value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
  }
}

/**
 * PDF Name object
 */
export class PDFName extends PDFObject {
  name: string;

  constructor(name: string, objectNumber?: number, generation?: number) {
    super(objectNumber, generation);
    this.name = name.startsWith('/') ? name : `/${name}`;
  }

  toString(): string {
    return this.name;
  }
}

/**
 * PDF Array object
 */
export class PDFArray extends PDFObject {
  items: any[];

  constructor(items: any[] = [], objectNumber?: number, generation?: number) {
    super(objectNumber, generation);
    this.items = items;
  }

  get(index: number): any {
    return this.items[index];
  }

  add(item: any): void {
    this.items.push(item);
  }

  get length(): number {
    return this.items.length;
  }

  toString(): string {
    return `[${this.items.map(item => item.toString()).join(' ')}]`;
  }
}

/**
 * PDF Dictionary object
 */
export class PDFDictionary extends PDFObject {
  entries: Map<string, any>;

  constructor(entries: Map<string, any> | Record<string, any> = {}, objectNumber?: number, generation?: number) {
    super(objectNumber, generation);
    this.entries = new Map();
    
    if (entries instanceof Map) {
      entries.forEach((value, key) => {
        this.set(key, value);
      });
    } else {
      Object.entries(entries).forEach(([key, value]) => {
        this.set(key, value);
      });
    }
  }

  get(key: string): any {
    const normalizedKey = key.startsWith('/') ? key : `/${key}`;
    return this.entries.get(normalizedKey);
  }

  set(key: string, value: any): void {
    const normalizedKey = key.startsWith('/') ? key : `/${key}`;
    this.entries.set(normalizedKey, value);
  }

  has(key: string): boolean {
    const normalizedKey = key.startsWith('/') ? key : `/${key}`;
    return this.entries.has(normalizedKey);
  }

  getType(): string | undefined {
    const type = this.get('Type');
    return type ? type.name : undefined;
  }

  toString(): string {
    const entries = Array.from(this.entries.entries())
      .map(([key, value]) => `${key} ${value.toString()}`)
      .join(' ');
    return `<<${entries}>>`;
  }
}

/**
 * PDF Stream object
 */
export class PDFStream extends PDFObject {
  dictionary: PDFDictionary;
  data: Buffer;
  decodedData?: Buffer;

  constructor(dictionary: PDFDictionary, data: Buffer, objectNumber?: number, generation?: number) {
    super(objectNumber, generation);
    this.dictionary = dictionary;
    this.data = data;
  }

  /**
   * Get decoded stream data
   */
  getDecodedData(): Buffer {
    if (this.decodedData) {
      return this.decodedData;
    }

    // Get filters
    let filters: string[] = [];
    const filter = this.dictionary.get('Filter');
    
    if (filter instanceof PDFName) {
      filters = [filter.name];
    } else if (filter instanceof PDFArray) {
      filters = filter.items.map(item => item.name);
    }

    // Get decode parameters
    let decodeParms: any = null;
    const params = this.dictionary.get('DecodeParms');
    
    if (params) {
      decodeParms = params;
    }

    // Decode the data
    this.decodedData = filters.length > 0 
      ? StreamDecoder.decode(this.data, filters, decodeParms)
      : this.data;
    
    return this.decodedData;
  }
}

/**
 * Creates PDF objects from primitive JavaScript values
 * @param value The value to convert to a PDF object
 * @returns PDF object
 */
export function createPDFObject(value: any): PDFObject {
  if (value === null || value === undefined) {
    return new PDFNull();
  }
  
  if (typeof value === 'boolean') {
    return new PDFBoolean(value);
  }
  
  if (typeof value === 'number') {
    return new PDFNumber(value);
  }
  
  if (typeof value === 'string') {
    if (value.startsWith('/')) {
      return new PDFName(value);
    }
    return new PDFString(value);
  }
  
  if (Array.isArray(value)) {
    return new PDFArray(value.map(item => createPDFObject(item)));
  }
  
  if (value instanceof Buffer) {
    const dict = new PDFDictionary({
      Length: new PDFNumber(value.length)
    });
    return new PDFStream(dict, value);
  }
  
  if (typeof value === 'object') {
    const entries = new Map();
    Object.entries(value).forEach(([key, val]) => {
      entries.set(key.startsWith('/') ? key : `/${key}`, createPDFObject(val));
    });
    return new PDFDictionary(entries);
  }
  
  return new PDFNull();
} 