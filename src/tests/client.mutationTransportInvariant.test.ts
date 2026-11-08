import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIENT_ROOT = resolve(process.cwd(), 'src/client');
const STATE_CHANGING_FETCH = /fetch\([\s\S]{0,500}?method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/g;

describe('client: mutation transport invariant', () => {
  it('routes every client state change through the shared API boundary', () => {
    const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) return visit(path);
        return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
      });
    const offenders = visit(CLIENT_ROOT).flatMap((path) => {
      const matches = readFileSync(path, 'utf8').match(STATE_CHANGING_FETCH) ?? [];
      return matches.map(() => path.slice(CLIENT_ROOT.length + 1));
    });
    expect(offenders).toEqual([]);
  });

  it('marks every converted Rizzoma blip mutation as online-only', () => {
    const source = readFileSync(resolve(CLIENT_ROOT, 'components/blip/RizzomaBlip.tsx'), 'utf8');
    for (const endpoint of [
      "api('/api/blips'",
      'api(`/api/blips/${encodeURIComponent(blip.id)}`',
      'api(`/api/blips/${encodeURIComponent(blip.id)}/duplicate`',
    ]) {
      const start = source.indexOf(endpoint);
      expect(start, `missing ${endpoint}`).toBeGreaterThanOrEqual(0);
      expect(source.slice(start, start + 220)).toContain('queueable: false');
    }
  });
});
