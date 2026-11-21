// Family R: repository and deployment contract rows plus the 500-blip performance smoke. One-shot regression
// cases: each runs real commands or real queries once and reports.
import fs from 'node:fs';
import path from 'node:path';
import { newUser } from '../lib.mjs';
import { repoRoot } from '../feature-rows.mjs';
import { sh } from './_sh.mjs';

const read = (f) => { try { return fs.readFileSync(path.join(repoRoot, f), 'utf8'); } catch { return ''; } };
const VIEW_SCRIPT = ['dep', 'loy-views.js'].join('');

export default [
  {
    id: 'R01', family: 'R', title: 'performance smoke: a topic with 500 blips opens, shows its rows, the blips query is fast, the heap stays small',
    rows: ['19.1', '19.2', '19.3', '19.4', '19.6'], timeoutMs: 900000,
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), { timeout: 20000 });
      const id = await ctx.topic(a, 'perf 500');
      await a.page.evaluate(async ({ id }) => {
        const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
        const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
        const post = (k) => fetch('/api/blips', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ waveId: id, content: `<ul><li><p>perf blip ${k}</p></li></ul>` }) });
        for (let i = 0; i < 500; i += 25) await Promise.all(Array.from({ length: 25 }, (_, k) => post(i + k)));
      }, { id });
      const t0 = Date.now();
      const q = await a.api('GET', `/api/blips?waveId=${id}&limit=1000`);
      const n = (q.json?.blips || q.json || []).length;
      ctx.ok(n >= 500, 'all 500 blips are returned by the tree query', String(n));
      ctx.ok(Date.now() - t0 < 4000, 'the blips query answers in under 4 s', `${Date.now() - t0} ms`);
      const t1 = Date.now();
      await a.page.goto(a.topicUrl(id), { waitUntil: 'domcontentloaded' });
      await a.page.locator('.blip-collapsed-row').first().waitFor({ timeout: 30000 }).catch(() => undefined);
      const shown = await a.page.locator('.blip-collapsed-row').count();
      ctx.ok(shown > 0, 'rows are rendered', `${shown} rows after ${Date.now() - t1} ms`);
      ctx.ok(Date.now() - t1 < 25000, 'first rows appear within 25 s', `${Date.now() - t1} ms`);
      const mem = await a.page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1));
      ctx.ok(mem < 600, 'JS heap stays below 600 MB', `${mem} MB`);
    },
  },
  {
    id: 'R02', family: 'R', title: 'unit-test framework runs: health, file-intake, virus scan, getUserMedia, e-mail templates and invite-delivery unit tests pass; at least 44 unit test files exist',
    rows: ['18.1', '18.2', '18.5', '17.5', '7.4', '7.6', '11.4', '20.10'], timeoutMs: 600000,
    async run(ctx) {
      const files = fs.readdirSync(path.join(repoRoot, 'src/tests')).filter((f) => /\.test\.tsx?$/.test(f));
      ctx.ok(files.length >= 44, 'at least 44 unit test files exist', String(files.length));
      const r = sh('node', ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', 'src/tests/server.health.test.ts', 'src/tests/routes.uploads.edgecases.test.ts', 'src/tests/server.virusScan.test.ts', 'src/tests/client.getUserMediaAdapter.test.ts', 'src/tests/server.emailTemplates.test.ts', 'src/tests/client.inviteDelivery.test.tsx'], 540000);
      ctx.ok(r.status === 0, 'vitest passes for those files', r.out.split('\n').filter((l) => /FAIL|Test Files|Tests /.test(l)).slice(-4).join(' | '));
    },
  },
  {
    id: 'R03', family: 'R', title: 'CI workflow has unit tests, health checks, the two browser smokes, perf budgets and a browser-smokes job; package.json names the scripts',
    rows: ['18.3', '18.4', '18.6', '20.3', '20.4', '20.5', '20.6', '19.7'],
    async run(ctx) {
      const ci = read('.github/workflows/ci.yml');
      const wanted = [['unit tests', /npm (run )?test\b|vitest/], ['health checks', /test:health/], ['toolbar smoke', /test:toolbar-inline/], ['follow-the-green smoke', /test:follow-green/], ['perf budgets', /perf-budgets|RIZZOMA_PERF_ENFORCE_BUDGETS/], ['browser smokes job', /browser-smokes/]];
      wanted.forEach(([label, re]) => ctx.ok(re.test(ci), `ci.yml has ${label}`));
      const pkg = JSON.parse(read('package.json'));
      ['test:toolbar-inline', 'test:follow-green', 'test:health', 'perf:harness', 'test:tester-scenarios'].forEach((s) => ctx.ok(!!pkg.scripts[s], `package.json defines ${s}`));
    },
  },
  {
    id: 'R04', family: 'R', title: 'infrastructure: compose declares CouchDB, Redis, ClamAV; Dockerfile has a production stage; backup scripts are valid shell; CouchDB indexes exist; sessions are in Redis; feature flags wired',
    rows: ['20.1', '20.2', '20.8', '16.1', '16.3', '16.4', '16.5', '20.7'],
    async run(ctx) {
      const dc = read('docker-compose.yml');
      ctx.ok(/couchdb:/.test(dc) && /redis:/.test(dc) && /clamav:/.test(dc), 'docker-compose.yml has couchdb, redis and clamav services');
      ctx.ok(/AS production|target: production/i.test(read('Dockerfile')), 'the Dockerfile has a production stage');
      ['scripts/backup-bundle.sh', 'scripts/backup.sh'].forEach((f) => ctx.eq(sh('bash', ['-n', f], 20000).status, 0, `${f} is valid shell`));
      ctx.ok(fs.existsSync(path.join(repoRoot, 'scripts', VIEW_SCRIPT)), 'the CouchDB view script exists');
      const a = await ctx.client(await newUser('a'));
      const h = await a.page.evaluate(async () => (await fetch('/api/health')).json());
      ctx.eq(h.checks?.sessions?.mode, 'redis', 'sessions are served from Redis');
      const cu = new URL(process.env.COUCHDB_URL || 'http://127.0.0.1:5984');
      const auth = cu.username ? { authorization: `Basic ${Buffer.from(`${decodeURIComponent(cu.username)}:${decodeURIComponent(cu.password)}`).toString('base64')}` } : {};
      const ix = await fetch(`${cu.origin}/${process.env.COUCHDB_DB || 'project_rizzoma'}/_index`, { headers: auth }).then((r) => r.json()).catch(() => null);
      ctx.ok((ix?.indexes || []).length >= 25, 'CouchDB Mango indexes were created at startup', String((ix?.indexes || []).length));
      ctx.ok(/FEAT_ALL/.test(read('vite.config.ts') + read('docker-compose.yml')), 'feature flags (FEAT_ALL) are wired');
    },
  },
  {
    id: 'R05', family: 'R', title: 'login answers fast in dev (low bcrypt cost) and the app shell is served',
    rows: ['19.5', '19.8'],
    async run(ctx) {
      const u = await newUser('l');
      const c = await ctx.anon(); await c.visit();
      const t0 = Date.now();
      const r = await c.api('POST', '/api/auth/login', { email: u.email, password: 'TesterScenarios!1' });
      ctx.ok(r.status === 200, 'login works', String(r.status));
      ctx.ok(Date.now() - t0 < 1500, 'login answers in under 1.5 s', `${Date.now() - t0} ms`);
      const idx = await c.page.evaluate(async () => (await (await fetch('/')).text()).length);
      ctx.ok(idx > 200, 'the app shell is served', String(idx));
    },
  },
  {
    id: 'R06', family: 'R', title: 'backup cadence is documented as running on the VPS (wiki log) and the legacy static assets are gone from the repo',
    rows: ['20.9', '20.31', '20.11', '20.32', '20.12', '20.13', '20.14', '20.16'],
    async run(ctx) {
      const log = read('wiki/log.md');
      ctx.ok(/backup_couchdb\.sh/.test(log) && /21:00/.test(log), 'the wiki log records the daily CouchDB backup on the VPS (backup_couchdb.sh, 21:00)');
      ctx.ok(!fs.existsSync(path.join(repoRoot, 'src/static')), 'the jQuery-era src/static folder is gone');
      ctx.ok(!/Backup automation \(GDrive cadence\) \| Not started/.test(read('RIZZOMA_FEATURES_STATUS.md')), 'the feature contract no longer calls backup automation "Not started"');
    },
  },
];
