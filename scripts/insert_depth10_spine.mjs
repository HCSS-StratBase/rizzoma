#!/usr/bin/env node
/**
 * Insert a depth-10 spine of blips directly into CouchDB.
 *
 * Builds 10 nested child blips, each containing a single bullet label
 * "Spine - depth N" and a BLIP element pointing to the next deeper child.
 * The root of the spine is then anchored under the FIRST label of the
 * existing Try topic by appending a BLIP element to its content array.
 *
 * After insert, reload the topic in the browser to see the new spine.
 *
 * Run: COUCH_URL=http://127.0.0.1:15984 COUCH_AUTH=admin:password \
 *      DB=project_rizzoma TOPIC=0_b_1_1 \
 *      node scripts/insert_depth10_spine.mjs
 */
import { argv, env, exit } from 'node:process';

const couchUrl = env.COUCH_URL || 'http://127.0.0.1:15984';
const couchAuth = env.COUCH_AUTH || 'admin:password';
const db = env.DB || 'project_rizzoma';
const topicBlipId = env.TOPIC || '0_b_1_1';
const waveId = env.WAVE || '0_w_1';
const DEPTH = parseInt(env.DEPTH || '10', 10);

const headers = {
  'content-type': 'application/json',
  'authorization': 'Basic ' + Buffer.from(couchAuth).toString('base64'),
};

const fetchJson = async (path, opts = {}) => {
  const res = await fetch(couchUrl.replace(/\/$/, '') + path, { headers, ...opts });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
};

const RANDOM = () => Math.random();

// Generate a fresh blipId in the original Rizzoma format (0_b_<wave>_<n>).
const newBlipId = (n) => `0_b_${waveId.split('_')[2]}_${1000 + n}`;
const newThreadId = () => Math.random().toString().slice(2);

// Build content for one blip in the spine.
const spineBlipContent = (label, childId) => {
  const content = [
    { t: ' ', params: { __TYPE: 'LINE', RANDOM: RANDOM(), L_BULLETED: 0 } },
    { t: label, params: { __TYPE: 'TEXT' } },
  ];
  if (childId) {
    content.push({
      t: ' ',
      params: { __TYPE: 'BLIP', __ID: childId, RANDOM: RANDOM(), __THREAD_ID: newThreadId() },
    });
  }
  return content;
};

const spineBlipDoc = (id, content) => ({
  _id: id,
  version: 1,
  format: 20,
  waveId: waveId,
  content,
  readers: {},
  removed: false,
  contentTimestamp: Date.now(),
  isRootBlip: false,
  isContainer: false,
  contributors: [{ id: '0_u_2' }],
  isFoldedByDefault: true,
  pluginData: {},
  contentVersion: 1,
  needNotificate: false,
  notificationRecipients: {},
  type: 'blip',
});

(async () => {
  console.log(`Building depth-${DEPTH} spine, anchored under topic root ${topicBlipId} (wave ${waveId})`);

  // Generate ids upfront so we can wire each blip's content to point at the next.
  const ids = Array.from({ length: DEPTH }, (_, i) => newBlipId(i));
  const docs = [];
  for (let d = 0; d < DEPTH; d++) {
    const childId = d < DEPTH - 1 ? ids[d + 1] : null; // last has no further child
    const label = `Spine - depth ${d + 1}`;
    docs.push(spineBlipDoc(ids[d], spineBlipContent(label, childId)));
  }

  // Bulk insert.
  const bulk = await fetchJson(`/${db}/_bulk_docs`, {
    method: 'POST',
    body: JSON.stringify({ docs }),
  });
  const failed = bulk.filter((r) => r.error);
  if (failed.length) {
    console.error('Bulk insert failures:', failed);
    exit(1);
  }
  console.log(`✓ Inserted ${docs.length} new blip docs`);

  // Append a BLIP element to the topic root's content pointing at ids[0].
  const root = await fetchJson(`/${db}/${topicBlipId}`);
  console.log(`Topic root has ${root.content.length} content elements; appending BLIP → ${ids[0]}`);
  root.content.push({
    t: ' ',
    params: { __TYPE: 'BLIP', __ID: ids[0], RANDOM: RANDOM(), __THREAD_ID: newThreadId() },
  });
  root.contentTimestamp = Date.now();
  root.contentVersion = (root.contentVersion || 0) + 1;
  root.version = (root.version || 0) + 1;

  const upd = await fetchJson(`/${db}/${topicBlipId}`, {
    method: 'PUT',
    body: JSON.stringify(root),
  });
  console.log(`✓ Updated topic root, new rev: ${upd.rev}`);

  console.log(`\nReload the topic in browser to see the new depth-${DEPTH} spine.`);
})().catch((err) => {
  console.error('FATAL', err);
  exit(1);
});
