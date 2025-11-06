// Wrapper around bcrypt that prefers native module when available
// and transparently falls back to bcryptjs to avoid native build issues.
import bcryptjs from 'bcryptjs';

let impl: any = bcryptjs;
// Try dynamic import of native bcrypt in ESM environment.
try {
  const mod: any = await import('bcrypt');
  impl = mod?.default || mod;
  // eslint-disable-next-line no-empty
} catch (_) {}

export function hash(data: string, rounds: number): Promise<string> {
  return impl.hash(data, rounds);
}

export function compare(data: string, encrypted: string): Promise<boolean> {
  return impl.compare(data, encrypted);
}

