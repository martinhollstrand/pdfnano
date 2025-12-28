import { PDFParseResult, PDFMetadata } from './types';

/**
 * Output formatters for PDF parsing results
 */

/**
 * Convert a parse result into readable Markdown
 */
export function formatToMarkdown(result: PDFParseResult): string {
  const lines: string[] = [];
  const meta = result.metadata || {} as PDFMetadata;

  // Title
  if (meta.title && meta.title.trim().length > 0) {
    lines.push(`# ${meta.title.trim()}`);
  }

  // Metadata summary
  const metaLines: string[] = [];
  if (meta.author) metaLines.push(`- Author: ${meta.author}`);
  if (meta.producer) metaLines.push(`- Producer: ${meta.producer}`);
  if (meta.creator) metaLines.push(`- Creator: ${meta.creator}`);
  if (typeof meta.pageCount === 'number') metaLines.push(`- Pages: ${meta.pageCount}`);
  if (metaLines.length) {
    lines.push(meta.title ? '' : '# Document');
    lines.push('## Metadata');
    lines.push(...metaLines);
  }

  // Pages
  for (const page of result.pages) {
    lines.push('');
    lines.push(`## Page ${page.pageNumber}`);
    const text = (page.text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const normalized = text
      // collapse 3+ newlines
      .replace(/\n{3,}/g, '\n\n')
      // trim trailing whitespace each line
      .split('\n')
      .map(l => l.replace(/[\t ]+$/g, ''))
      .join('\n');
    lines.push('');
    lines.push(normalized);
  }

  if (result.images && result.images.length > 0) {
    lines.push('');
    lines.push('## Images');
    lines.push(`Total images: ${result.images.length}`);
    // Provide a short manifest; embedding binary is not suitable for MD
    for (const img of result.images.slice(0, 20)) {
      lines.push(`- Page ${img.pageNumber}: ${img.width}x${img.height} (${img.mimeType})`);
    }
    if (result.images.length > 20) {
      lines.push(`- ...and ${result.images.length - 20} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Convert parse result to JSON string (handling buffer to base64 conversion)
 */
export function formatToJSON(result: PDFParseResult): string {
  // Convert Buffer data to base64 for JSON serialization
  const jsonResult = {
    ...result,
    images: result.images.map(img => ({
      ...img,
      data: img.data.toString('base64')
    }))
  };

  return JSON.stringify(jsonResult, null, 2);
}






