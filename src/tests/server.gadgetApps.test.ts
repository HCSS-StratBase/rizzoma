// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { GADGET_APPS_MOUNT, GADGET_APP_CSP, gadgetAppsRouter } from '../server/middleware/gadgetApps';

/**
 * Regression for the blank Kanban gadget (2026-11-17). Gadget apps are embedded as
 * <iframe sandbox="allow-scripts ..."> WITHOUT allow-same-origin, so the frame runs in an
 * opaque origin: its module-script fetch sends `Origin: null`, its stylesheet is a
 * cross-origin no-cors fetch, and the application-wide production hardening (cors
 * allowlist, helmet CORP same-origin + script-src 'self') emptied every frame.
 */

const APPS_DIR = path.resolve(__dirname, '../../public/gadgets/apps');
const APP_IDS = ['kanban-board', 'calendar-planner', 'focus-timer', 'notes-scratchpad'];

function productionLikeApp(fixtureDir: string, withGadgetMount: boolean) {
  const app = express();
  if (withGadgetMount) app.use(GADGET_APPS_MOUNT, gadgetAppsRouter(fixtureDir));
  // Same shape as src/server/app.ts in production.
  app.use(helmet({ contentSecurityPolicy: { directives: { objectSrc: ["'none'"], scriptSrc: ["'self'"] } } }));
  const allowed = ['https://rizzoma.example'];
  app.use(cors({
    origin: (origin, cb) => (!origin || allowed.includes(origin) ? cb(null, true) : cb(new Error('CORS not allowed'))),
    credentials: true,
  }));
  app.use(express.static(path.dirname(fixtureDir)));
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: 'server_error', message: err?.message }));
  return app;
}

describe('server: sandboxed gadget app assets', () => {
  let fixtureRoot: string;
  let gadgetDir: string;
  const servers: Server[] = [];

  async function listen(app: express.Express): Promise<string> {
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  beforeAll(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gadget-apps-'));
    gadgetDir = path.join(fixtureRoot, 'gadgets', 'apps');
    fs.mkdirSync(path.join(gadgetDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(gadgetDir, 'shared-styles.css'), 'body{margin:0}');
    fs.writeFileSync(path.join(gadgetDir, 'app-shell.js'), 'export const x = 1;');
    fs.writeFileSync(path.join(gadgetDir, 'demo', 'index.html'), '<!doctype html><div id="app"></div>');
  });

  afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('control: the production stack alone rejects the opaque origin (the original defect)', async () => {
    const base = await listen(productionLikeApp(gadgetDir, false));
    const response = await fetch(`${base}/gadgets/apps/app-shell.js`, { headers: { Origin: 'null' } });
    expect(response.status).toBe(500);
    // ...and serves the stylesheet with CORP same-origin, which an opaque-origin frame cannot load.
    const css = await fetch(`${base}/gadgets/apps/shared-styles.css`);
    expect(css.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('serves module scripts to an opaque-origin frame (Origin: null) with CORS allowed', async () => {
    const base = await listen(productionLikeApp(gadgetDir, true));
    const response = await fetch(`${base}/gadgets/apps/app-shell.js`, { headers: { Origin: 'null' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    // Public, credential-free assets: never credentialed CORS.
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(await response.text()).toContain('export const x');
  });

  it('lets the opaque-origin frame load its stylesheet (CORP cross-origin)', async () => {
    const base = await listen(productionLikeApp(gadgetDir, true));
    const response = await fetch(`${base}/gadgets/apps/shared-styles.css`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('keeps a strict CSP on gadget documents: own-origin scripts only, no network, own-app framing', async () => {
    const base = await listen(productionLikeApp(gadgetDir, true));
    const response = await fetch(`${base}/gadgets/apps/demo/index.html`);
    expect(response.status).toBe(200);
    const csp = response.headers.get('content-security-policy') || '';
    expect(csp).toBe(GADGET_APP_CSP);
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('answers a missing gadget file with 404, never the SPA index.html', async () => {
    const base = await listen(productionLikeApp(gadgetDir, true));
    const response = await fetch(`${base}/gadgets/apps/does-not-exist.js`, { headers: { Origin: 'null' } });
    expect(response.status).toBe(404);
  });

  it('ships every gadget page with external scripts only (inline script is blocked by the CSP)', () => {
    for (const appId of APP_IDS) {
      const html = fs.readFileSync(path.join(APPS_DIR, appId, 'index.html'), 'utf8');
      const scripts = html.match(/<script\b[^>]*>/gi) || [];
      expect(scripts.length, `${appId} has a script`).toBeGreaterThan(0);
      for (const tag of scripts) {
        expect(tag, `${appId}: <script> must have src`).toMatch(/\ssrc="[^"]+"/);
      }
      expect(html, `${appId}: no inline script bodies`).not.toMatch(/<script\b[^>]*>\s*(?!<\/script>)\S/i);
      expect(fs.existsSync(path.join(APPS_DIR, appId, 'main.js')), `${appId}/main.js exists`).toBe(true);
    }
  });
});
