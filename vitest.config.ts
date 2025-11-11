import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Run middleware + stable waves route tests
    include: [
      'src/tests/middleware.*.test.ts',
      'src/tests/routes.waves*.test.ts',
      'src/tests/routes.topics*.test.ts',
      'src/tests/routes.auth.test.ts',
    ],
    setupFiles: ['src/tests/setup.ts'],
    pool: 'forks',
  },
});
