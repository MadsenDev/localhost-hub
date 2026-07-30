import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The interface displays the real application version rather than a literal that
// has to be remembered on release.
const version = JSON.parse(readFileSync('./package.json', 'utf8')).version;

export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: mode === 'development'
  }
}));
