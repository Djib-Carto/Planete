import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/Planete/',
  define: {
    CESIUM_BASE_URL: JSON.stringify('/Planete/cesium')
  },
  server: {
    proxy: {
      '/wdpa-api': {
        target: 'https://data-gis.unep-wcmc.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wdpa-api/, '')
      },
      '/habitats-api': {
        target: 'https://data-gis.unep-wcmc.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/habitats-api/, '')
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 2000,
  }
});
