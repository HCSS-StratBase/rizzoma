import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, 'src/server'),
      '@client': path.resolve(__dirname, 'src/client'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@types': path.resolve(__dirname, 'src/types'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/tests/middleware.*.test.ts',
      'src/tests/routes.waves*.test.ts',
      'src/tests/routes.topics*.test.ts',
      'src/tests/routes.auth.test.ts',
      'src/tests/routes.editor*.test.ts',
      'src/tests/routes.comments*.test.ts',
      'src/tests/routes.blips*.test.ts',
      'src/tests/routes.uploads*.test.ts',
      'src/tests/server.*.test.ts',
      'src/tests/client.*.test.ts?(x)',
    ],
    setupFiles: ['src/tests/setup.ts'],
    pool: 'forks',
  },
});
