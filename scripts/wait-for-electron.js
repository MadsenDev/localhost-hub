#!/usr/bin/env node

const { existsSync } = require('fs');
const { join } = require('path');

const mainJsPath = join(__dirname, '..', 'dist-electron', 'main.js');
const maxAttempts = 60; // 30 seconds total
const delayMs = 500;

function waitForFile(attempt = 0) {
  if (existsSync(mainJsPath)) {
    console.log(`Found ${mainJsPath}`);
    process.exit(0);
  }
  
  if (attempt >= maxAttempts) {
    console.error(`Error: ${mainJsPath} was not created after ${(maxAttempts * delayMs) / 1000}s`);
    console.error('Make sure vite-plugin-electron is building the main process correctly.');
    process.exit(1);
  }
  
  setTimeout(() => waitForFile(attempt + 1), delayMs);
}

waitForFile();

