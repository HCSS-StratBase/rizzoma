#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import vm from 'vm';
// Use built-in fetch (Node 18+)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COUCHDB_URL = process.env.COUCHDB_URL || 'http://admin:password@localhost:5984';
const COUCHDB_DB = process.env.COUCHDB_DB || 'project_rizzoma';
const ROOT = path.join(__dirname, '..');
const VIEWS_DIR = path.join(ROOT, 'src', 'server', 'couch_views');

async function readDesignDoc(filePath) {
  const code = await fs.readFile(filePath, 'utf-8');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require: (mod) => {
      if (mod === 'couchapp') return {};
      throw new Error(`Unsupported require: ${mod}`);
    },
    console,
  };
  vm.createContext(sandbox);
  // Execute in sandbox; the files are CommonJS style
  vm.runInContext(code, sandbox, { filename: filePath });
  return sandbox.module.exports;
}

async function listJsFilesRecursive(dir) {
  const result = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await listJsFilesRecursive(full);
      result.push(...sub);
    } else if (entry.isFile() && full.endsWith('.js')) {
      result.push(full);
    }
  }
  return result;
}

function transformFunctionsToStrings(obj) {
  if (obj == null) return obj;
  if (typeof obj === 'function') {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(transformFunctionsToStrings);
  }
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = transformFunctionsToStrings(v);
    }
    return out;
  }
  return obj;
}

function buildAuthHeader(urlString) {
  const u = new URL(urlString);
  if (u.username || u.password) {
    const token = Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64');
    // strip credentials from URL for requests
    u.username = '';
    u.password = '';
    return { base: u.toString().replace(/\/$/, ''), header: `Basic ${token}` };
  }
  return { base: urlString.replace(/\/$/, ''), header: undefined };
}

async function httpJson(method, url, body, authHeader) {
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  if (!res.ok) {
    const msg = json?.reason || json?.error || text || res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return json;
}

async function ensureDb(baseUrl, dbName, authHeader) {
  const dbUrl = `${baseUrl}/${encodeURIComponent(dbName)}`;
  try {
    await httpJson('GET', dbUrl, undefined, authHeader);
  } catch (e) {
    if (String(e.message).startsWith('404')) {
      await httpJson('PUT', dbUrl, undefined, authHeader);
    } else {
      throw e;
    }
  }
  return dbUrl;
}

async function main() {
  console.log(`[deploy:views] Using CouchDB at ${COUCHDB_URL}, db=${COUCHDB_DB}`);

  // Ensure views dir exists
  try {
    await fs.access(VIEWS_DIR);
  } catch {
    console.error(`[deploy:views] Views directory not found: ${VIEWS_DIR}`);
    console.error('Hint: copy legacy views:');
    console.error('  cp -r rizzoma/src/server/couch_views/* src/server/couch_views/');
    process.exit(1);
  }

  const files = await listJsFilesRecursive(VIEWS_DIR);
  if (files.length === 0) {
    console.error(`[deploy:views] No view files found under ${VIEWS_DIR}`);
    process.exit(1);
  }
  console.log(`[deploy:views] Found ${files.length} design files`);

  const { base, header } = buildAuthHeader(COUCHDB_URL);
  const dbUrl = await ensureDb(base, COUCHDB_DB, header);

  let ok = 0;
  for (const file of files) {
    try {
      let doc = await readDesignDoc(file);
      if (!doc || !doc._id) {
        console.warn(`[deploy:views] Skipping ${file}: no _id`);
        continue;
      }
      // Convert all function values (views.map/reduce, shows, lists, etc.) to strings as CouchDB expects
      doc = transformFunctionsToStrings(doc);
      const idPath = doc._id.startsWith('_design/') ? doc._id : encodeURIComponent(doc._id);
      const docUrl = `${dbUrl}/${idPath}`;
      try {
        const existing = await httpJson('GET', docUrl, undefined, header);
        if (existing?._rev) doc._rev = existing._rev;
      } catch (e) {
        if (!String(e.message).startsWith('404')) throw e;
      }
      await httpJson('PUT', docUrl, doc, header);
      console.log(`  ✓ ${path.basename(file)} -> ${doc._id}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ Failed ${file}: ${e.message}`);
    }
  }

  console.log(`[deploy:views] Deployed ${ok}/${files.length} design documents`);
}

main().catch((e) => {
  console.error('[deploy:views] Error:', e);
  process.exit(1);
});
