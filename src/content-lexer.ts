/**
 * PDF Content Stream Lexer
 * 
 * Handles parsing of PDF content streams into operations and operands.
 */

export interface ContentOperation {
  operator: string;
  operands: any[];
}

export class ContentLexer {
  private buffer: Buffer;
  private pos: number = 0;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  /**
   * Parse the content stream into operations
   */
  public parse(): ContentOperation[] {
    const operations: ContentOperation[] = [];
    this.pos = 0;
    let operands: any[] = [];

    while (this.pos < this.buffer.length) {
      this.skipWhitespace();

      if (this.pos >= this.buffer.length) break;

      const char = String.fromCharCode(this.buffer[this.pos]);

      if (char === '/') {
        operands.push(this.parseName());
      } else if (char === '(') {
        operands.push(this.parseString());
      } else if (char === '<') {
        if (this.pos + 1 < this.buffer.length && this.buffer[this.pos + 1] === 0x3C) {
          // Dictionary <<
          operands.push(this.parseDictionary());
        } else {
          // Hex string <
          operands.push(this.parseHexString());
        }
      } else if (char === '[') {
        operands.push(this.parseArray());
      } else if (
        (char >= '0' && char <= '9') ||
        char === '-' ||
        char === '.'
      ) {
        operands.push(this.parseNumber());
      } else if (
        (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        char === '*' ||
        char === '"' ||
        char === '\'' ||
        char === '`'
      ) {
        const operator = this.parseOperator();
        operations.push({
          operator,
          operands: [...operands]
        });
        operands = [];
      } else {
        // Unknown or unexpected character, skip
        this.pos++;
      }
    }

    return operations;
  }

  private skipWhitespace(): void {
    while (this.pos < this.buffer.length) {
      const ch = this.buffer[this.pos];
      // Space, Tab, CR, LF, FF, Null
      if (ch !== 0x20 && ch !== 0x09 && ch !== 0x0D && ch !== 0x0A && ch !== 0x0C && ch !== 0x00) break;
      this.pos++;
    }
  }

  private parseName(): string {
    let name = '/';
    this.pos++; // Skip '/'

    while (this.pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[this.pos]);
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' ||
        ch === '(' || ch === ')' || ch === '<' || ch === '>' ||
        ch === '[' || ch === ']' || ch === '{' || ch === '}' ||
        ch === '/' || ch === '%') {
        break;
      }
      name += ch;
      this.pos++;
    }
    return name;
  }

  private parseString(): { str: string, buf: Buffer } {
    let str = '';
    let bytes: number[] = [];
    let nestingLevel = 0;
    let escapeNext = false;
    this.pos++; // Skip '('

    while (this.pos < this.buffer.length) {
      const chCode = this.buffer[this.pos];
      const ch = String.fromCharCode(chCode);
      
      if (escapeNext) {
        escapeNext = false;
        let code = -1;
        let isOctal = false;

        // Check for octal escape (1-3 digits)
        if (ch >= '0' && ch <= '7') {
          isOctal = true;
          let octalStr = ch;
          this.pos++; // Consume first digit
          
          // Try to consume up to 2 more digits
          for (let i = 0; i < 2; i++) {
            if (this.pos >= this.buffer.length) break;
            const nextCh = String.fromCharCode(this.buffer[this.pos]);
            if (nextCh >= '0' && nextCh <= '7') {
              octalStr += nextCh;
              this.pos++;
            } else {
              break;
            }
          }
          code = parseInt(octalStr, 8);
          // Modulo 256 per PDF spec
          code = code % 256;
          // Don't increment pos at end of loop, we already did (or tried to)
          this.pos--; // Adjust for the main loop increment
        } else {
          switch (ch) {
            case 'n': str += '\n'; code = 0x0A; break;
            case 'r': str += '\r'; code = 0x0D; break;
            case 't': str += '\t'; code = 0x09; break;
            case 'b': str += '\b'; code = 0x08; break;
            case 'f': str += '\f'; code = 0x0C; break;
            case '(': str += '('; code = 0x28; break;
            case ')': str += ')'; code = 0x29; break;
            case '\\': str += '\\'; code = 0x5C; break;
            case '\r': // Line continuation (CR or CRLF)
              if (this.pos + 1 < this.buffer.length && this.buffer[this.pos + 1] === 0x0A) {
                this.pos++; // Skip LF
              }
              // Fallthrough to ignore
              break;
            case '\n': // Line continuation (LF)
              // Ignore
              break;
            default: 
              // Unknown escape, just ignore backslash and use char
              str += ch; code = chCode; break;
          }
        }

        if (code !== -1) {
            if (isOctal) {
                str += String.fromCharCode(code);
            }
            bytes.push(code);
        }
        this.pos++;
        continue;
      }

      if (ch === '\\') {
        escapeNext = true;
      } else if (ch === '(') {
        nestingLevel++;
        str += ch;
        bytes.push(0x28);
      } else if (ch === ')') {
        if (nestingLevel === 0) {
          this.pos++;
          break;
        }
        nestingLevel--;
        str += ch;
        bytes.push(0x29);
      } else {
        str += ch;
        bytes.push(chCode);
      }
      this.pos++;
    }

    return { str, buf: Buffer.from(bytes) };
  }

  private parseHexString(): { str: string, buf: Buffer } {
    let hex = '';
    this.pos++; // Skip '<'

    while (this.pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[this.pos]);

      if (ch === '>') {
        this.pos++;
        break;
      }

      if ((ch >= '0' && ch <= '9') ||
        (ch >= 'A' && ch <= 'F') ||
        (ch >= 'a' && ch <= 'f')) {
         hex += ch;
      }
      
      this.pos++;
    }

    let hexStr = '';
    let hexBytes: number[] = [];
    if (hex.length % 2 !== 0) hex += '0';

    for (let i = 0; i < hex.length; i += 2) {
      const hexPair = hex.substring(i, i + 2);
      const val = parseInt(hexPair, 16);
      hexStr += String.fromCharCode(val);
      hexBytes.push(val);
    }
    return { str: hexStr, buf: Buffer.from(hexBytes) };
  }

  private parseArray(): any[] {
    const array: any[] = [];
    this.pos++; // Skip '['

    while (this.pos < this.buffer.length) {
      this.skipWhitespace();
      if (this.pos >= this.buffer.length) break;
      
      const char = String.fromCharCode(this.buffer[this.pos]);
      if (char === ']') {
        this.pos++;
        break;
      }
      
      const val = this.parseAny();
      if (val !== undefined) {
          array.push(val);
      } else {
          // Avoid infinite loop if parseAny fails to consume
          this.pos++;
      }
    }
    return array;
  }

  private parseDictionary(): any {
    const dict: any = {};
    this.pos += 2; // Skip '<<'

    while (this.pos < this.buffer.length) {
      this.skipWhitespace();
      if (this.pos >= this.buffer.length) break;

      if (this.pos + 1 < this.buffer.length && 
          this.buffer[this.pos] === 0x3E && this.buffer[this.pos + 1] === 0x3E) { // '>>'
        this.pos += 2;
        break;
      }

      if (String.fromCharCode(this.buffer[this.pos]) !== '/') {
        // Unexpected token in dict, break
        break;
      }

      const key = this.parseName();
      this.skipWhitespace();
      const value = this.parseAny();
      
      if (key && value !== undefined) {
        dict[key] = value;
      }
    }
    return dict;
  }

  private parseNumber(): number {
    let numStr = '';
    
    while (this.pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[this.pos]);
      if (!((ch >= '0' && ch <= '9') || ch === '-' || ch === '.')) break;
      numStr += ch;
      this.pos++;
    }
    return parseFloat(numStr);
  }

  private parseOperator(): string {
    let operator = '';
    
    while (this.pos < this.buffer.length) {
      const ch = String.fromCharCode(this.buffer[this.pos]);
      if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '*' || ch === '"' || ch === '\'' || ch === '`')) break;
      operator += ch;
      this.pos++;
    }
    
    if (operator === '' && this.pos < this.buffer.length) {
       // Should have been handled by caller checking chars?
       // But if we are called, we assume it's an operator.
       // E.g. potentially single chars not covered by loop if any
       operator = String.fromCharCode(this.buffer[this.pos]);
       this.pos++;
    }
    return operator;
  }

  private parseAny(): any {
    if (this.pos >= this.buffer.length) return undefined;

    const char = String.fromCharCode(this.buffer[this.pos]);
    if (char === '/') return this.parseName();
    if (char === '(') return this.parseString();
    if (char === '<') {
       if (this.pos + 1 < this.buffer.length && this.buffer[this.pos + 1] === 0x3C) return this.parseDictionary();
       return this.parseHexString();
    }
    if (char === '[') return this.parseArray();
    if ((char >= '0' && char <= '9') || char === '-' || char === '.') return this.parseNumber();
    
    // Ignore others?
    return undefined;
  }
}

