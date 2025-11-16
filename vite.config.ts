import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts'
      },
      preload: {
        input: 'electron/preload.ts'
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist/renderer',
    sourcemap: mode === 'development'
  }
}));
