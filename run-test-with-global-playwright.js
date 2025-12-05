#!/usr/bin/env node

// This script uses the globally installed playwright
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set environment variable
process.env.FEAT_ALL = '1';

console.log('🚀 Running Rizzoma tests with global Playwright installation...\n');

// Run the test file
const testFile = join(__dirname, 'test-rizzoma-features.js');
const child = spawn('node', [testFile], {
  env: { ...process.env, NODE_PATH: '/home/stephan/miniconda3/envs/llm/lib/node_modules' },
  stdio: 'inherit'
});

child.on('error', (err) => {
  console.error('Failed to run test:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code);
});