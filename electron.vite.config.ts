import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      // Dependencies stay external and are shipped in node_modules (pdfmake reads its font files from disk)
      externalizeDeps: true,
    },
  },
  preload: {
    build: {
      // Sandboxed preload scripts must be a single CommonJS file
      externalizeDeps: false,
    },
  },
  renderer: {
    plugins: [react()],
  },
});
