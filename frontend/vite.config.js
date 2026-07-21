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
  build: {
    // antd + @ant-design/icons son el grueso del bundle; separarlos de
    // react/react-dom en su propio chunk evita el warning de "chunk > 500kB"
    // y deja que el navegador cachee ese chunk (grande pero estable) aparte
    // del código propio de la app, que cambia mucho más seguido.
    rolldownOptions: {
      output: {
        // Rolldown solo acepta `manualChunks` como función (a diferencia de
        // Rollup, que también admite el objeto {chunkName: [ids]}).
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('antd') || id.includes('@ant-design')) return 'antd';
            if (id.includes('react')) return 'react';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.js',
    include: ['src/**/*.test.{js,jsx}'],
  },
});
