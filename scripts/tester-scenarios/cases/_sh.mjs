// One-shot shell helper for contract cases: runs a command once and returns { status, out }.
import { execFileSync } from 'node:child_process';
import { repoRoot } from '../feature-rows.mjs';

export function sh(cmd, args, timeout = 240000) {
  try {
    return { status: 0, out: execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { status: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}
