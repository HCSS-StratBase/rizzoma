// Vitest <-> Jest compatibility shim so legacy jest.* tests still work.
import { vi, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Minimal jest global mapping
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jestCompat: any = {
  fn: vi.fn,
  spyOn: vi.spyOn,
  mock: vi.mock,
  doMock: vi.doMock,
  unmock: vi.unmock,
  resetModules: vi.resetModules,
  clearAllMocks: vi.clearAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
};
// @ts-ignore
globalThis.jest = jestCompat;

// Re-export vitest globals for tests that import them
export { vi, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it };

