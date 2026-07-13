import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(import.meta.dirname, 'client'),
  plugins: [react()],
  server: {
    port: 4173,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:4310',
      '/artifacts': 'http://127.0.0.1:4310',
      '/health': 'http://127.0.0.1:4310'
    }
  },
  build: { outDir: resolve(import.meta.dirname, '../../dist/web'), emptyOutDir: true }
});
