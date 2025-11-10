import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],
    pool: 'forks',
    server: {
      deps: {
        // Force Node resolution for CJS server deps instead of Vite pre-bundling
        external: [
          'express','qs','body-parser','cookie-parser','cors','express-session',
          'nano','node-fetch','winston','socket.io','socket.io-client'
        ],
      },
    },
  },
});
