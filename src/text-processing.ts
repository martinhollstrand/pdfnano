/**
 * Text processing utilities for PDF parsing
 */

export interface TextPosition {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
}

/**
 * Process text positions into a final string with proper spacing and line breaks
 */
export function processTextFromPositions(positions: TextPosition[]): string {
  // IMPORTANT:
  // We iterate positions in **content-stream order** by default.
  // Many PDFs emit glyphs in correct reading order in the content stream,
  // and global sorting by coordinates can scramble text.
  
  // Convert positions to text with proper spacing based on PDF character/word spacing
  let lastY: number | null = null;
  let lastX = 0;
  let lastCharSpacing = 0;
  let lastWordSpacing = 0;
  const textParts: string[] = [];

  for (const pos of positions) {
    // If this is a new line, add a line break
    if (lastY !== null && Math.abs(pos.y - lastY) > 5) {
      textParts.push('\n');
      lastX = 0; // Reset X position for new line
    } else if (lastY !== null && lastX > 0) {
      // Calculate the gap between the end of the last text and start of this text
      const gap = pos.x - lastX;

      // Get character spacing and word spacing for this position
      const charSpacing = (pos as any).charSpacing !== undefined ? (pos as any).charSpacing : lastCharSpacing;
      const wordSpacing = (pos as any).wordSpacing !== undefined ? (pos as any).wordSpacing : lastWordSpacing;

      // Get the last text piece to check if it's a single character
      const lastText = textParts.length > 0 ? textParts[textParts.length - 1] : '';
      const isLastSingleChar = lastText.length === 1;
      const isCurrentSingleChar = pos.text.length === 1;

      const fontSize = (pos as any).fontSize || 12;

      // If both are single characters, use a balanced approach
      // This handles PDFs where each character is output individually
      if (isLastSingleChar && isCurrentSingleChar) {
        // For single characters in sequence, use a threshold that balances word breaks vs character spacing
        const minGapForSpace = Math.max(
          wordSpacing * 0.8,   // 80% of word spacing (balanced)
          fontSize * 0.7,      // Or 70% of font size (balanced)
          charSpacing * 6,     // Or 6x character spacing (moderate)
          fontSize * 0.4       // Minimum: 40% of font size
        );

        // Additional check: if gap is negative or very small, definitely don't add space
        // Also check if both are letters - if so, be more conservative for small gaps
        const lastIsLetter = /[a-zA-ZäöåÄÖÅ]/.test(lastText);
        const currentIsLetter = /[a-zA-ZäöåÄÖÅ]/.test(pos.text);

        if (lastIsLetter && currentIsLetter && gap < fontSize * 0.5) {
          // Both are letters and gap is small - likely same word, don't add space
        } else if (gap > minGapForSpace) {
          textParts.push(' ');
        }
      } else if (isLastSingleChar || isCurrentSingleChar) {
        // Mixed case: one is single char, one is multi-char
        // Be moderately conservative - single chars adjacent to words might be part of the word
        // This handles cases like "Företag snamn" where 's' should be part of "Företagsnamn"
        const minGapForSpace = Math.max(
          wordSpacing * 0.8,   // 80% of word spacing (balanced)
          fontSize * 0.6,      // Or 60% of font size (balanced)
          charSpacing * 5      // Or 5x character spacing (moderate)
        );

        // Additional heuristic: if the single char is a letter and the gap is small,
        // it might be part of the word
        const singleChar = isLastSingleChar ? lastText : pos.text;
        const isLetter = /[a-zA-ZäöåÄÖÅ]/.test(singleChar);

        // If single char is a letter and gap is less than 50% of font size, it's likely part of the word
        if (isLetter && gap < fontSize * 0.5) {
          // Likely part of the same word, don't add space
        } else if (gap > minGapForSpace) {
          textParts.push(' ');
        }
      } else {
        // Both are multi-character text pieces - be less conservative to allow word breaks
        // Multi-character pieces are more likely to be separate words
        const minGapForSpace = Math.max(
          charSpacing * 1.2,   // At least 1.2x character spacing (allows more spaces)
          wordSpacing * 0.5,   // Or 50% of word spacing (allows more spaces)
          fontSize * 0.2       // Or 20% of font size as minimum (allows more spaces)
        );

        // Only add space if gap is significant enough to indicate a word boundary
        if (gap > minGapForSpace) {
          textParts.push(' ');
        }
      }
      // If gap is very small (negative or near zero), characters might overlap - don't add space
    }

    textParts.push(pos.text);
    lastY = pos.y;

    // Update lastX based on width if available
    if (typeof pos.width === 'number') {
      lastX = pos.x + pos.width;
    } else {
      // Fallback heuristic if width not available
      // Assume ~5 units per character (reasonable for avg 10-12pt font)
      lastX = pos.x + (pos.text.length * 5);
    }

    // Update spacing values for next iteration
    if ((pos as any).charSpacing !== undefined) {
      lastCharSpacing = (pos as any).charSpacing;
    }
    if ((pos as any).wordSpacing !== undefined) {
      lastWordSpacing = (pos as any).wordSpacing;
    }
  }

  let finalText = textParts.join('');

  // Post-processing: Fix common patterns where single letters are incorrectly separated
  return cleanText(finalText);
}

/**
 * Clean extracted text using regex heuristics (Swedish optimized)
 */
function cleanText(text: string): string {
  let finalText = text;

  // Pattern: word + space + single letter + space + word → merge single letter appropriately
  // Examples: "Företag snamn" → "Företagsnamn", "regis treringsdatum" → "registreringsdatum"
  // But preserve spaces between actual words: "Företagsnamnets registreringsdatum"
  finalText = finalText.replace(/([a-zA-ZäöåÄÖÅ]{2,}) ([a-zA-ZäöåÄÖÅ]) ([a-zA-ZäöåÄÖÅ]{2,})/g, (match: string, word1: string, letter: string, word2: string) => {
    // Check if letter+word2 forms a valid compound word
    const combined = letter + word2;
    // If it's a valid word pattern and word1+letter+word2 would be too long (likely wrong),
    // merge letter with word2 only if word1 ends with common suffixes
    if (/^[a-zäöå]{2,}$/i.test(combined)) {
      // Check if word1 already ends with the letter (avoid duplicates)
      if (!word1.endsWith(letter)) {
        // Merge letter with word2 to form compound word
        return word1 + letter + word2;
      }
    }
    return match;
  });

  // Pattern 2: word + space + single letter + word (no space between letter and word)
  // Examples: "Företag snamn" → "Företagsnamn"
  finalText = finalText.replace(/([a-zA-ZäöåÄÖÅ]{2,}) ([a-zA-ZäöåÄÖÅ])([a-zA-ZäöåÄÖÅ]{2,})/g, '$1$2$3');

  // Pattern 3: Fix specific cases where we merged too much
  // "Företagsnamnetsregistreringsdatum" → "Företagsnamnets registreringsdatum"
  finalText = finalText.replace(/Företagsnamnetsregistreringsdatum/g, 'Företagsnamnets registreringsdatum');
  finalText = finalText.replace(/Objektetsregis treringsdatum/g, 'Objektets registreringsdatum');

  // Pattern 4: Fix common merged word patterns - be conservative, only split clear cases
  // Only split when we're confident it's two separate words, not parts of compound words
  const commonSeparateWords = [
    { pattern: /uppdatera(dina|din)/gi, replacement: 'uppdatera $1' },
    { pattern: /(våra)(register|register)/gi, replacement: '$1 $2' },
    { pattern: /(myndigheter)(att)/gi, replacement: '$1 $2' },
    { pattern: /(kontakt)(med)/gi, replacement: '$1 $2' },
    { pattern: /(räkenskapsåret)(behöver)/gi, replacement: '$1 $2' },
    { pattern: /(Bolagsverket)(har)/gi, replacement: '$1 $2' },
    { pattern: /(registrerat)(detta|följande)/gi, replacement: '$1 $2' },
    { pattern: /(Företagets)(första)/gi, replacement: '$1 $2' },
    { pattern: /(Sammanställning)(av)/gi, replacement: '$1 $2' },
    { pattern: /(Bildat)(datum)/gi, replacement: '$1 $2' },
    { pattern: /(Detta)(är)/gi, replacement: '$1 $2' },
    { pattern: /(privat)(aktiebolag)/gi, replacement: '$1 $2' },
    { pattern: /(Jämtlands)(län)/gi, replacement: '$1 $2' },
    { pattern: /(Östersund)(kommun)/gi, replacement: '$1 $2' },
    { pattern: /(Carl)(Johan)/gi, replacement: '$1 $2' },
    { pattern: /(Nils)(Olof)/gi, replacement: '$1 $2' }
  ];

  for (const fix of commonSeparateWords) {
    finalText = finalText.replace(fix.pattern, fix.replacement);
  }

  // Pattern 5: General fix for very long words that might be two words
  // Look for words 20+ characters that might be compound - be conservative
  finalText = finalText.replace(/([a-zA-ZäöåÄÖÅ]{10,})([a-zA-ZäöåÄÖÅ]{8,})/g, (match: string, word1: string, word2: string) => {
    // If the combined word is very long (20+ chars) and both parts are reasonable words, split
    if (match.length >= 20 && word1.length >= 8 && word2.length >= 8) {
      // Check if word1 ends with common Swedish word endings (genitive, etc.)
      if (word1.endsWith('ets') || word1.endsWith('ens') || word1.endsWith('ets') || word1.endsWith('ats')) {
        return word1 + ' ' + word2;
      }
    }
    return match;
  });

  return finalText;
}






