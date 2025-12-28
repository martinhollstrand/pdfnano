/**
 * PDF Content Stream Lexer
 * 
 * Handles parsing of PDF content streams into operations and operands.
 */

/**
 * Represents a parsed content stream operation
 */
export interface ContentOperation {
  operator: string;
  operands: any[];
}

export class ContentLexer {
  private buffer: Buffer;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  /**
   * Parse the content stream into operations
   */
  public parse(): ContentOperation[] {
    const operations: ContentOperation[] = [];
    let pos = 0;
    let operands: any[] = [];

    while (pos < this.buffer.length) {
      // Skip whitespace
      while (pos < this.buffer.length) {
        const ch = String.fromCharCode(this.buffer[pos]);
        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
        pos++;
      }

      if (pos >= this.buffer.length) break;

      const char = String.fromCharCode(this.buffer[pos]);

      if (char === '/') {
        // Name object
        let name = '/';
        pos++;

        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' ||
            ch === '(' || ch === ')' || ch === '<' || ch === '>' ||
            ch === '[' || ch === ']' || ch === '{' || ch === '}' ||
            ch === '/' || ch === '%') {
            break;
          }
          name += ch;
          pos++;
        }

        operands.push(name);
      } else if (char === '(') {
        // String object
        let str = '';
        let bytes: number[] = [];
        let nestingLevel = 0;
        let escapeNext = false;
        pos++;
        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (escapeNext) {
            escapeNext = false;
            let code = 0;
            switch (ch) {
              case 'n': str += '\n'; code = 0x0A; break;
              case 'r': str += '\r'; code = 0x0D; break;
              case 't': str += '\t'; code = 0x09; break;
              case 'b': str += '\b'; code = 0x08; break;
              case 'f': str += '\f'; code = 0x0C; break;
              case '(': str += '('; code = 0x28; break;
              case ')': str += ')'; code = 0x29; break;
              case '\\': str += '\\'; code = 0x5C; break;
              default: str += ch; code = ch.charCodeAt(0); break;
            }
            bytes.push(code);
            pos++;
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
              pos++;
              break;
            }
            nestingLevel--;
            str += ch;
            bytes.push(0x29);
          } else {
            str += ch;
            bytes.push(ch.charCodeAt(0));
          }
          pos++;
        }
        // Push both string and Buffer for downstream use
        operands.push({ str, buf: Buffer.from(bytes) });
      } else if (char === '<' && pos + 1 < this.buffer.length && this.buffer[pos + 1] === 0x3C) {
        // Dictionary - not fully implemented for content streams
        // Skip to closing '>>'
        pos += 2;
        let nestedLevel = 1;

        while (pos < this.buffer.length && nestedLevel > 0) {
          if (this.buffer[pos] === 0x3C && this.buffer[pos + 1] === 0x3C) {
            nestedLevel++;
            pos += 2;
          } else if (this.buffer[pos] === 0x3E && this.buffer[pos + 1] === 0x3E) {
            nestedLevel--;
            pos += 2;
          } else {
            pos++;
          }
        }

        // Skip this for now
        operands.push({});
      } else if (char === '<') {
        // Hex string
        let hex = '';
        pos++;

        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);

          if (ch === '>') {
            pos++;
            break;
          }

          if ((ch >= '0' && ch <= '9') ||
            (ch >= 'A' && ch <= 'F') ||
            (ch >= 'a' && ch <= 'f')) {
            hex += ch;
          }

          pos++;
        }

        // Convert hex string to normal string and buffer
        let hexStr = '';
        let hexBytes: number[] = [];
        for (let i = 0; i < hex.length; i += 2) {
          const hexPair = hex.substring(i, i + 2);
          if (hexPair.length === 2) {
            const val = parseInt(hexPair, 16);
            hexStr += String.fromCharCode(val);
            hexBytes.push(val);
          }
        }
        operands.push({ str: hexStr, buf: Buffer.from(hexBytes) });
      } else if (char === '[') {
        // Array
        const array: any[] = [];
        pos++;
        while (pos < this.buffer.length) {
          // Skip whitespace
          while (pos < this.buffer.length) {
            const ch = String.fromCharCode(this.buffer[pos]);
            if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') break;
            pos++;
          }
          if (pos >= this.buffer.length) break;
          const arrayChar = String.fromCharCode(this.buffer[pos]);
          if (arrayChar === ']') {
            pos++;
            break;
          }
          if (arrayChar === '(') {
            // String in array
            let str = '';
            let bytes: number[] = [];
            let nestingLevel = 0;
            let escapeNext = false;
            pos++;
            while (pos < this.buffer.length) {
              const ch = String.fromCharCode(this.buffer[pos]);
              if (escapeNext) {
                escapeNext = false;
                let code = 0;
                switch (ch) {
                  case 'n': str += '\n'; code = 0x0A; break;
                  case 'r': str += '\r'; code = 0x0D; break;
                  case 't': str += '\t'; code = 0x09; break;
                  case 'b': str += '\b'; code = 0x08; break;
                  case 'f': str += '\f'; code = 0x0C; break;
                  case '(': str += '('; code = 0x28; break;
                  case ')': str += ')'; code = 0x29; break;
                  case '\\': str += '\\'; code = 0x5C; break;
                  default: str += ch; code = ch.charCodeAt(0); break;
                }
                bytes.push(code);
                pos++;
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
                  pos++;
                  break;
                }
                nestingLevel--;
                str += ch;
                bytes.push(0x29);
              } else {
                str += ch;
                bytes.push(ch.charCodeAt(0));
              }
              pos++;
            }
            array.push({ str, buf: Buffer.from(bytes) });
          } else if (arrayChar === '<' && pos + 1 < this.buffer.length && this.buffer[pos + 1] !== 0x3C) {
            // Hex string in array
            let hex = '';
            pos++;
            while (pos < this.buffer.length) {
              const ch = String.fromCharCode(this.buffer[pos]);
              if (ch === '>') {
                pos++;
                break;
              }
              if ((ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'F') || (ch >= 'a' && ch <= 'f')) {
                hex += ch;
              }
              pos++;
            }
            let hexStr = '';
            let hexBytes: number[] = [];
            for (let i = 0; i < hex.length; i += 2) {
              const hexPair = hex.substring(i, i + 2);
              if (hexPair.length === 2) {
                const val = parseInt(hexPair, 16);
                hexStr += String.fromCharCode(val);
                hexBytes.push(val);
              }
            }
            array.push({ str: hexStr, buf: Buffer.from(hexBytes) });
          } else if ((arrayChar >= '0' && arrayChar <= '9') || arrayChar === '-' || arrayChar === '.') {
            // Number in array
            let numStr = '';
            while (pos < this.buffer.length) {
              const ch = String.fromCharCode(this.buffer[pos]);
              if (!((ch >= '0' && ch <= '9') || ch === '-' || ch === '.')) break;
              numStr += ch;
              pos++;
            }
            array.push(parseFloat(numStr));
          } else {
            // Skip other types for now
            pos++;
          }
        }
        operands.push(array);
      } else if (
        (char >= '0' && char <= '9') ||
        char === '-' ||
        char === '.'
      ) {
        // Number
        let numStr = '';

        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (!((ch >= '0' && ch <= '9') || ch === '-' || ch === '.')) break;
          numStr += ch;
          pos++;
        }

        operands.push(parseFloat(numStr));
      } else if (
        (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        char === '*' ||
        char === '"' ||
        char === '\'' ||
        char === '`'
      ) {
        // Operator
        let operator = '';

        while (pos < this.buffer.length) {
          const ch = String.fromCharCode(this.buffer[pos]);
          if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '*' || ch === '"' || ch === '\'')) break;
          operator += ch;
          pos++;
        }

        // Special case for single character operators
        if (operator === '') {
          operator = char;
          pos++;
        }

        // Record the operation
        operations.push({
          operator,
          operands: [...operands]
        });

        // Clear operands for next operation
        operands = [];
      } else {
        // Skip unknown character
        pos++;
      }
    }

    return operations;
  }
}






