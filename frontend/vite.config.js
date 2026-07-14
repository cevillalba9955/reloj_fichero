import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// feature 007 — Config de Vite (dev server + build) y Vitest (tests de
// componente). En dev, /api se proxya al backend Node (src/web/server.js).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4173',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.js',
    include: ['src/**/*.test.{js,jsx}'],
  },
});
