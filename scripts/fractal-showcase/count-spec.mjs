// Count the blips and the deepest level a spec will create (no browser).
import { buildSpec } from './spec.mjs';
const count = (b) => b.lines.reduce((n, l) => n + (l.anchors || []).reduce((m, a) => m + 1 + count(a.child), 0), 0);
const depth = (b) => 1 + Math.max(0, ...b.lines.flatMap((l) => (l.anchors || []).map((a) => depth(a.child))));
const spec = buildSpec();
console.log(`spec blips (excluding the topic root): ${count(spec)}; deepest level below the root: ${depth(spec) - 1}`);
