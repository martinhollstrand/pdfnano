#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure the scripts directory exists
if (!fs.existsSync('scripts')) {
  fs.mkdirSync('scripts');
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Execute a command and log output
function execute(command, errorMessage) {
  try {
    console.log(`${colors.cyan}Executing:${colors.reset} ${command}`);
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`${colors.red}${errorMessage || 'Command failed'}${colors.reset}`);
    console.error(error.message);
    return false;
  }
}

// Clean the output directory
console.log(`\n${colors.bright}${colors.blue}Cleaning output directory...${colors.reset}`);
if (!execute('npm run clean', 'Failed to clean output directory')) {
  console.log('Creating dist directory...');
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
  }
}

// Run TypeScript compiler
console.log(`\n${colors.bright}${colors.blue}Compiling TypeScript...${colors.reset}`);
if (!execute('tsc', 'TypeScript compilation failed')) {
  process.exit(1);
}

// Run linting
console.log(`\n${colors.bright}${colors.blue}Running type checks...${colors.reset}`);
execute('npm run lint', 'Type checking failed');

// Copy README.md and LICENSE to dist
console.log(`\n${colors.bright}${colors.blue}Copying files to dist...${colors.reset}`);
if (fs.existsSync('README.md')) {
  fs.copyFileSync('README.md', path.join('dist', 'README.md'));
  console.log('Copied README.md to dist');
}

if (fs.existsSync('LICENSE')) {
  fs.copyFileSync('LICENSE', path.join('dist', 'LICENSE'));
  console.log('Copied LICENSE to dist');
}

// Run tests
console.log(`\n${colors.bright}${colors.blue}Running tests...${colors.reset}`);
if (!execute('npm test', 'Tests failed')) {
  console.warn(`${colors.yellow}Warning: Tests failed but continuing with build${colors.reset}`);
}

console.log(`\n${colors.green}${colors.bright}Build completed successfully!${colors.reset}`);
console.log(`You can now run examples with ${colors.cyan}npm run example${colors.reset}\n`); 