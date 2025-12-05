#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Create a test script that playwright can run
const testScript = `
const { chromium } = require('@playwright/test');

(async () => {
  console.log('🚀 Launching Rizzoma Feature Test Browser\\n');
  
  const browser = await chromium.launch({
    headless: false,
    slowMo: 300
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  console.log('📍 Opening Rizzoma at http://localhost:3000');
  await page.goto('http://localhost:3000');
  
  console.log('\\n✅ Browser is open! You can now:');
  console.log('  1. Create/edit topics to see the rich text toolbar');
  console.log('  2. Type @ to test mentions');
  console.log('  3. Select text to add inline comments');
  console.log('  4. Look for "Follow the Green" navigation');
  console.log('  5. Open multiple tabs to see live cursors\\n');
  console.log('Press Ctrl+C to exit when done testing.\\n');

  // Keep browser open
  await new Promise(() => {});
})();
`;

// Write the test script to a temporary file
import { writeFileSync } from 'fs';
writeFileSync('/tmp/rizzoma-test.js', testScript);

// Run it with the global playwright installation
console.log('Starting Playwright test...\n');
try {
  const { stdout, stderr } = await execAsync('/home/stephan/miniconda3/envs/llm/bin/node /tmp/rizzoma-test.js');
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
} catch (error) {
  console.error('Error running test:', error.message);
  console.log('\nAlternatively, you can manually test by:');
  console.log('1. Opening http://localhost:3000 in your browser');
  console.log('2. Creating a topic and testing the features');
}