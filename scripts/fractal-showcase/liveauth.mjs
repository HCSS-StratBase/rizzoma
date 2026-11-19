// Live sign-in helper. Credentials are read from the credential file inside this process, typed into
// the real sign-in form, and NEVER printed, logged or screenshotted. The sign-in happens in a throwaway
// context WITHOUT video; the session cookies are then handed to the recorded context.
import fs from 'node:fs';
import { sleep, TYPE_DELAY } from './lib.mjs';


export function loadFractalCreds(n) {
  if (!process.env.GDRIVE_ROOT && !process.env.FS_CRED_FILE) throw new Error('set GDRIVE_ROOT (or FS_CRED_FILE)');
  const ENV_FILE = process.env.FS_CRED_FILE || `${process.env.GDRIVE_ROOT}/SYSTEM_CREDENTIALS.env`;
  const wanted = { user: `RIZZOMA_MODERN_FRACTAL${n}_USER`, pass: `RIZZOMA_MODERN_FRACTAL${n}_PASSWORD` };
  const out = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    for (const [k, name] of Object.entries(wanted)) if (m[1] === name) out[k] = m[2].replace(/^['"]|['"]$/g, '');
  }
  if (!out.user || !out.pass) throw new Error(`credentials for fractal tester ${n} not found (names only: ${Object.values(wanted).join(', ')})`);
  return out;
}

/** Sign in through the real form in a throwaway context; returns the storage-state path (cookies only). */
export async function signInLive(browser, base, n, statePath) {
  // Credential file unreachable (Drive mount down)? reuse a session state saved by an earlier real sign-in.
  const reuse = process.env[`FS_REUSE_STATE_${n}`];
  if (reuse && fs.existsSync(reuse)) { fs.copyFileSync(reuse, statePath); return { statePath, email: process.env[`FS_EMAIL_${n}`] || `tester${n}` }; }
  const { user, pass } = loadFractalCreds(n);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  if (!(await p.locator('input.login-input[type="email"]').count())) {
    await p.evaluate(() => window.dispatchEvent(new CustomEvent('rizzoma:request-sign-in')));
    await sleep(800);
  }
  await p.locator('input.login-input[type="email"]').first().click();
  await p.keyboard.press('Control+A');
  await p.keyboard.type(user, { delay: TYPE_DELAY });
  await p.locator('input.login-input[type="password"]').first().click();
  await p.keyboard.press('Control+A');
  await p.keyboard.type(pass, { delay: TYPE_DELAY });
  await p.keyboard.press('Enter');
  await sleep(4500);
  const me = await p.evaluate(async () => { const r = await fetch('/api/auth/me', { credentials: 'include' }); return r.status; });
  if (me !== 200) throw new Error(`live sign-in failed for tester ${n}: /api/auth/me ${me}`);
  await ctx.storageState({ path: statePath });
  fs.chmodSync(statePath, 0o600);
  await ctx.close();
  return { statePath, email: user };
}
