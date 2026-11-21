// Every cases/<family>-*.mjs file default-exports an array of case specs:
//   { id, family, title, rows: ['<section>.<n>', ...]  // RIZZOMA_FEATURES_STATUS.md row ids covered
//     paths?: ['react','native'], na?: { native: 'reason' }, expect?: [RegExp] (expected problem lines),
//     client?: { viewport }, run: async (ctx) => {...} }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadCases() {
  const files = fs.readdirSync(here).filter((f) => /^[A-Z]-.*\.mjs$/.test(f)).sort();
  const all = [];
  for (const f of files) {
    const mod = await import(path.join(here, f));
    for (const c of mod.default) all.push(c);
  }
  const ids = new Set();
  for (const c of all) { if (ids.has(c.id)) throw new Error(`duplicate case id ${c.id}`); ids.add(c.id); }
  return all;
}
