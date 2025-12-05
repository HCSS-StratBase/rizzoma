import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/tests/middleware.*.test.ts',
      'src/tests/routes.waves*.test.ts',
      'src/tests/routes.topics*.test.ts',
      'src/tests/routes.auth.test.ts',
      'src/tests/routes.editor*.test.ts',
      'src/tests/routes.comments*.test.ts',
      'src/tests/client.*.test.ts',
    ],
    setupFiles: ['src/tests/setup.ts'],
    pool: 'forks',
  },
});
