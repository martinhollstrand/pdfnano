
import * as fs from 'fs';
import * as path from 'path';
import { PDFParser } from '../src/parser';

async function run() {
  // Get file path from command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Please provide a file path.');
    console.error('Usage: npx ts-node scripts/test_parse.ts <path/to/file.pdf>');
    process.exit(1);
  }

  const relativePath = args[0];
  const filePath = path.resolve(process.cwd(), relativePath);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Parsing file: ${filePath}`);
  console.log('-'.repeat(50));

  try {
    const parser = new PDFParser();
    const result = await parser.parseFile(filePath);

    // Print Metadata
    if (result.metadata) {
      console.log('Metadata:');
      console.log(JSON.stringify(result.metadata, null, 2));
      console.log('-'.repeat(50));
    }

    // Print Text Preview
    console.log(`Extracted Text (${result.text.length} characters):`);
    console.log('-'.repeat(20) + ' START ' + '-'.repeat(20));
    // Show first 2000 characters to avoid flooding terminal, but enough to see context
    //console.log(result.text.substring(0, 2000)); 
    console.log(result.text);
    if (result.text.length > 2000) {
      console.log(`\n... (and ${result.text.length - 2000} more characters) ...`);
    }
    console.log('-'.repeat(20) + '  END  ' + '-'.repeat(20));

    // Print Page Info
    console.log(`\nTotal Pages: ${result.pages.length}`);
    if (result.images && result.images.length > 0) {
        console.log(`Total Images: ${result.images.length}`);
    }

  } catch (err) {
    console.error('Error parsing PDF:', err);
    process.exit(1);
  }
}

run();

