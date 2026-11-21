// Parses the machine-readable feature contract (RIZZOMA_FEATURES_STATUS.md, "Comprehensive Feature
// Comparison") into rows with stable ids "<section>.<n>" (n counts table rows inside the section).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');

export function parseFeatureRows(file = path.join(repoRoot, 'RIZZOMA_FEATURES_STATUS.md')) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('## Comprehensive Feature Comparison'));
  if (start < 0) throw new Error('feature table heading not found');
  const rows = [];
  let section = null;
  let sectionTitle = '';
  let n = 0;
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (/^## /.test(l)) break;
    const h = l.match(/^### (\d+)\.\s*(.*)$/);
    if (h) { section = Number(h[1]); sectionTitle = h[2].trim(); n = 0; continue; }
    if (!section || !l.startsWith('|')) continue;
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (/^functionality$/i.test(cells[0]) || /^-+$/.test(cells[0].replace(/[\s:]/g, ''))) continue;
    n += 1;
    rows.push({ id: `${section}.${n}`, section, sectionTitle, text: cells[0], status: cells[1], line: i + 1 });
  }
  return rows;
}
