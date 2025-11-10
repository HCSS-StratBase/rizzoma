// src/server/lib/hash.ts
// Lightweight wrapper that tries native bcrypt first and falls back to bcryptjs.
// Works seamlessly in WSL, Docker, CI, and prod.

import type { CompareSync, GenSaltSync, HashSync } from 'bcrypt';

type HashAPI = {
  hash: (plaintext: string, saltRounds: number) => Promise<string>;
  compare: (plaintext: string, digest: string) => Promise<boolean>;
  genSalt: (rounds: number) => Promise<string>;
};

let impl: HashAPI | null = null;

(async () => {
  try {
    // Try native bcrypt (if installed and built)
    const bcrypt = (await import('bcrypt')) as unknown as {
      default?: { hash: HashSync; compare: CompareSync; genSalt: GenSaltSync };
      hash: HashSync;
      compare: CompareSync;
      genSalt: GenSaltSync;
    };
    const b = (bcrypt as any).default ?? bcrypt;
    impl = {
      hash: async (p, r) => b.hash(p, r),
      compare: async (p, d) => b.compare(p, d),
      genSalt: async (r) => b.genSalt(r),
    };
    console.log('[hash] using native bcrypt');
  } catch {
    // Fallback to pure JS bcryptjs (no native build)
    const bcryptjs = await import('bcryptjs');
    impl = {
      hash: async (p, r) => bcryptjs.hash(p, r),
      compare: async (p, d) => bcryptjs.compare(p, d),
      genSalt: async (r) => bcryptjs.genSalt(r),
    };
    console.log('[hash] using bcryptjs fallback');
  }
})();

async function ready() {
  while (!impl) await new Promise((res) => setTimeout(res, 5));
}

// API exports
export async function hash(plaintext: string, rounds = 10) {
  await ready();
  return impl!.hash(plaintext, rounds);
}

export async function compare(plaintext: string, digest: string) {
  await ready();
  return impl!.compare(plaintext, digest);
}

export async function genSalt(rounds = 10) {
  await ready();
  return impl!.genSalt(rounds);
}
