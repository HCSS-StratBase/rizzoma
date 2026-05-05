import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command, mode }) => {
  const featAll = process.env.FEAT_ALL || (command === 'build' || mode === 'production' ? '1' : '');

  return {
    plugins: [react()],
    define: {
      // Pass feature flags to the browser bundle. Production builds default to
      // full parity unless explicitly overridden by the deploy environment.
      'import.meta.env.FEAT_ALL': JSON.stringify(featAll),
      'import.meta.env.FEAT_INLINE_COMMENTS': JSON.stringify(process.env.FEAT_INLINE_COMMENTS || ''),
      'import.meta.env.FEAT_RICH_TOOLBAR': JSON.stringify(process.env.FEAT_RICH_TOOLBAR || ''),
      'import.meta.env.FEAT_MENTIONS': JSON.stringify(process.env.FEAT_MENTIONS || ''),
      'import.meta.env.FEAT_TASK_LISTS': JSON.stringify(process.env.FEAT_TASK_LISTS || ''),
      'import.meta.env.FEAT_FOLLOW_GREEN': JSON.stringify(process.env.FEAT_FOLLOW_GREEN || ''),
      'import.meta.env.FEAT_VISUAL_DIFF': JSON.stringify(process.env.FEAT_VISUAL_DIFF || ''),
      'import.meta.env.FEAT_LIVE_CURSORS': JSON.stringify(process.env.FEAT_LIVE_CURSORS || ''),
      'import.meta.env.FEAT_TYPING_INDICATORS': JSON.stringify(process.env.FEAT_TYPING_INDICATORS || ''),
      'import.meta.env.FEAT_REALTIME_COLLAB': JSON.stringify(process.env.FEAT_REALTIME_COLLAB || ''),
      'import.meta.env.FEAT_WAVE_PLAYBACK': JSON.stringify(process.env.FEAT_WAVE_PLAYBACK || ''),
      'import.meta.env.FEAT_TASKS': JSON.stringify(process.env.FEAT_TASKS || ''),
      'import.meta.env.BUSINESS_ACCOUNT': JSON.stringify(process.env.BUSINESS_ACCOUNT || ''),
      // Track F: visual parity with original rizzoma.com (B1 reskin + B2 inline render).
      // OFF by default — opt in via FEAT_RIZZOMA_PARITY_RENDER=1. Without this define,
      // the client's import.meta.env.FEAT_RIZZOMA_PARITY_RENDER is undefined and the
      // FEATURES.RIZZOMA_PARITY_RENDER flag stays false even when the server-side env
      // is set — which is what was happening on the dev VPS through 2026-05-05.
      'import.meta.env.FEAT_RIZZOMA_PARITY_RENDER': JSON.stringify(process.env.FEAT_RIZZOMA_PARITY_RENDER || ''),
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
  };
});
