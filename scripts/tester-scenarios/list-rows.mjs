import { parseFeatureRows } from './feature-rows.mjs';
const rows = parseFeatureRows();
console.log(rows.length);
let s = 0;
for (const x of rows) {
  if (x.section !== s) { s = x.section; console.log(`\n## ${s} ${x.sectionTitle}`); }
  console.log(`${x.id} ${x.text.slice(0, 68)} [${x.status.slice(0, 8)}]`);
}
