import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Feature flag forwarding. Without the FEAT_ALL default below, the
// featureFlags module sees `import.meta.env.FEAT_ALL === undefined`,
// tree-shakes every feature guard to false, and the APK / vite
// preview silently run without realtime collab, live cursors,
// follow-the-green, inline comments, etc. That bug shipped for weeks
// before being caught on 2026-04-15 (task #58). For production
// builds we default FEAT_ALL to '1' so the shipped bundle has every
// Track-A..E feature on; callers who need a pared-down build (CI
// perf runs, feature-flag tests) can still override with FEAT_ALL=0.
export default defineConfig(({ command }) => {
  const isProdBuild = command === 'build';
  const env = (key: string, prodDefault: string = '') =>
    JSON.stringify(process.env[key] ?? (isProdBuild ? prodDefault : ''));
  return {
  plugins: [react()],
  define: {
    'import.meta.env.FEAT_ALL': env('FEAT_ALL', '1'),
    'import.meta.env.FEAT_INLINE_COMMENTS': env('FEAT_INLINE_COMMENTS'),
    'import.meta.env.FEAT_RICH_TOOLBAR': env('FEAT_RICH_TOOLBAR'),
    'import.meta.env.FEAT_MENTIONS': env('FEAT_MENTIONS'),
    'import.meta.env.FEAT_TASK_LISTS': env('FEAT_TASK_LISTS'),
    'import.meta.env.FEAT_FOLLOW_GREEN': env('FEAT_FOLLOW_GREEN'),
    'import.meta.env.FEAT_VISUAL_DIFF': env('FEAT_VISUAL_DIFF'),
    'import.meta.env.FEAT_LIVE_CURSORS': env('FEAT_LIVE_CURSORS'),
    'import.meta.env.FEAT_TYPING_INDICATORS': env('FEAT_TYPING_INDICATORS'),
    'import.meta.env.FEAT_REALTIME_COLLAB': env('FEAT_REALTIME_COLLAB'),
    'import.meta.env.FEAT_WAVE_PLAYBACK': env('FEAT_WAVE_PLAYBACK'),
    'import.meta.env.FEAT_TASKS': env('FEAT_TASKS'),
    'import.meta.env.BUSINESS_ACCOUNT': env('BUSINESS_ACCOUNT'),
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
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8788',
        ws: true,
      },
      // Forward uploaded files to Express's express.static('/uploads') mount.
      // Without this, dev-mode requests for /uploads/<file> fall through to
      // the SPA catch-all and return index.html instead of the PNG/file —
      // so images uploaded via the editor's 🖼️ button (which save fine to
      // disk on the VPS) don't actually display in the browser. Discovered
      // 2026-04-22 during the depth-feature audit on the VPS.
      '/uploads': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
  };
});
