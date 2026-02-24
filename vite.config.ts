import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    // Pass environment variables to the client
    'import.meta.env.FEAT_ALL': JSON.stringify(process.env.FEAT_ALL || ''),
    'import.meta.env.FEAT_INLINE_COMMENTS': JSON.stringify(process.env.FEAT_INLINE_COMMENTS || ''),
    'import.meta.env.FEAT_RICH_TOOLBAR': JSON.stringify(process.env.FEAT_RICH_TOOLBAR || ''),
    'import.meta.env.FEAT_MENTIONS': JSON.stringify(process.env.FEAT_MENTIONS || ''),
    'import.meta.env.FEAT_TASK_LISTS': JSON.stringify(process.env.FEAT_TASK_LISTS || ''),
    'import.meta.env.FEAT_FOLLOW_GREEN': JSON.stringify(process.env.FEAT_FOLLOW_GREEN || ''),
    'import.meta.env.FEAT_VISUAL_DIFF': JSON.stringify(process.env.FEAT_VISUAL_DIFF || ''),
    'import.meta.env.FEAT_LIVE_CURSORS': JSON.stringify(process.env.FEAT_LIVE_CURSORS || ''),
    'import.meta.env.FEAT_TYPING_INDICATORS': JSON.stringify(process.env.FEAT_TYPING_INDICATORS || ''),
    'import.meta.env.FEAT_REALTIME_COLLAB': JSON.stringify(process.env.FEAT_REALTIME_COLLAB || ''),
  },
  root: './src/client',
  publicDir: '../../public',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/client/index.html'),
        settings: path.resolve(__dirname, 'src/client/settings.html'),
        testEditor: path.resolve(__dirname, 'src/client/test-editor.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, './src/client'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3000,
    allowedHosts: true,
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
