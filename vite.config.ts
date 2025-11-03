import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: './src/client',
  publicDir: '../../public',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/client/index.html'),
        mobile: path.resolve(__dirname, 'src/client/mobile.html'),
        settings: path.resolve(__dirname, 'src/client/settings.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, './src/client'),
      '@shared': path.resolve(__dirname, './src/share'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8000',
        ws: true,
      },
    },
  },
});