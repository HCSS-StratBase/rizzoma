// Vitest <-> Jest compatibility shim so legacy jest.* tests still work.
import { vi, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Minimal jest global mapping
const jestCompat = {
  fn: vi.fn,
  spyOn: vi.spyOn,
  mock: vi.mock,
  doMock: vi.doMock,
  unmock: vi.unmock,
  resetModules: vi.resetModules,
  clearAllMocks: vi.clearAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
} as const;
// define a global 'jest' object for legacy tests, without using any
// Assign compat object to global without augmenting ambient 'jest' module
(globalThis as unknown as { jest?: typeof jestCompat }).jest = jestCompat;

// Re-export vitest globals for tests that import them
export { vi, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it };
