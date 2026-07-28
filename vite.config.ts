import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'electron' ? [electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['sql.js', 'toml']
            }
          }
        }
      },
      preload: {
        input: 'electron/preload.ts'
      }
    })] : [])
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: mode === 'electron' ? 'dist/renderer' : 'dist',
    sourcemap: mode === 'development'
  }
}));
