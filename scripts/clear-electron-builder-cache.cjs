#!/usr/bin/env node

/**
 * Clears the electron-builder cache to resolve symlink extraction issues on Windows.
 * This is particularly useful when encountering "Cannot create symbolic link" errors
 * during Windows code signing.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const cacheDir = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache');

console.log('Clearing electron-builder cache...');
console.log(`Cache directory: ${cacheDir}`);

if (fs.existsSync(cacheDir)) {
  try {
    // Remove the winCodeSign cache specifically, as that's where the symlink issue occurs
    const winCodeSignCache = path.join(cacheDir, 'winCodeSign');
    if (fs.existsSync(winCodeSignCache)) {
      console.log('Removing winCodeSign cache...');
      fs.rmSync(winCodeSignCache, { recursive: true, force: true });
      console.log('✓ winCodeSign cache cleared');
    } else {
      console.log('ℹ winCodeSign cache not found (may already be cleared)');
    }
  } catch (error) {
    console.error('Error clearing cache:', error.message);
    console.error('You may need to run this script as Administrator or enable Developer Mode');
    process.exit(1);
  }
} else {
  console.log('ℹ Cache directory does not exist');
}

console.log('Cache clearing complete');

