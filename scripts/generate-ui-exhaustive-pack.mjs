import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const dateCode = new Date().toISOString().slice(2, 10).replace(/-/g, '');
const runTs = Date.now();
const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const outRoot = path.resolve('screenshots', dateCode, `ui-exhaustive-${runTs}`);
const imgDir = path.join(outRoot, 'images');
const notesDir = path.join(outRoot, 'notes');
const summaryPath = path.join(outRoot, 'SUMMARY.md');
const uiElementsDocPath = path.resolve('docs', 'UI_ELEMENTS_EXHAUSTIVE.md');

const profiles = [
  {
    name: 'desktop',
    contextOptions: { viewport: { width: 1366, height: 900 } },
  },
  {
    name: 'desktop-wide',
    contextOptions: { viewport: { width: 1920, height: 1080 } },
  },
  {
    name: 'tablet',
    contextOptions: { ...devices['iPad (gen 7)'], viewport: { width: 1024, height: 768 } },
  },
  {
    name: 'mobile',
    contextOptions: { ...devices['iPhone 12'] },
  },
  {
    name: 'mobile-android',
    contextOptions: { ...devices['Pixel 7'] },
  },
];

const navStates = ['Topics', 'Mentions', 'Tasks', 'Publics', 'Store', 'Teams', 'Help'];
const rightViewStates = ['Text view', 'Mind map'];
const densityStates = ['short', 'expanded'];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function clickTextLoose(page, label) {
  const exact = page.getByText(label, { exact: true }).first();
  if (await exact.count()) {
    await exact.click({ timeout: 2000 }).catch(() => {});
    return true;
  }
  const loose = page.getByText(label).first();
  if (await loose.count()) {
    await loose.click({ timeout: 2000 }).catch(() => {});
    return true;
  }
  return false;
}

async function ensureAuth(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const email = `ui-pack+${Date.now()}@example.com`;
  const password = 'UiPack!234';
  const auth = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' }).catch(() => {});
    const xsrfRaw = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='));
    const xsrf = xsrfRaw ? decodeURIComponent(xsrfRaw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': xsrf };

    let resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!resp.ok) {
      resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
    }
    if (!resp.ok) {
      return { ok: false, status: resp.status, body: await resp.text() };
    }
    return { ok: true };
  }, { email, password });
  if (!auth.ok) {
    throw new Error(`Auth failed: ${auth.status} ${auth.body}`);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
}

async function getXsrf(page) {
  return page.evaluate(() => {
    const raw = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='));
    return raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  });
}

async function seedWave(page) {
  const xsrf = await getXsrf(page);
  const title = `UI Exhaustive ${Date.now()}`;

  const topic = await page.evaluate(async ({ title, xsrf }) => {
    const resp = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': xsrf },
      credentials: 'include',
      body: JSON.stringify({ title, content: `<p>${title}</p>` }),
    });
    return { ok: resp.ok, status: resp.status, data: await resp.json() };
  }, { title, xsrf });
  if (!topic.ok) throw new Error(`Topic create failed (${topic.status})`);
  const waveId = topic.data.id;

  const root = await page.evaluate(async ({ waveId, xsrf }) => {
    const resp = await fetch('/api/blips', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': xsrf },
      credentials: 'include',
      body: JSON.stringify({ waveId, parentId: null, content: '<p>Root blip for exhaustive UI pack</p>' }),
    });
    return { ok: resp.ok, status: resp.status, data: await resp.json() };
  }, { waveId, xsrf });
  if (!root.ok) throw new Error(`Root blip create failed (${root.status})`);
  const rootId = root.data?.id || root.data?.blip?._id || root.data?.blip?.id;

  const child1 = await page.evaluate(async ({ waveId, rootId, xsrf }) => {
    const resp = await fetch('/api/blips', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': xsrf },
      credentials: 'include',
      body: JSON.stringify({ waveId, parentId: rootId, content: '<p>Child level 1</p>' }),
    });
    return { ok: resp.ok, data: await resp.json() };
  }, { waveId, rootId, xsrf });
  const child1Id = child1.data?.id || child1.data?.blip?._id || child1.data?.blip?.id;

  await page.evaluate(async ({ waveId, child1Id, xsrf }) => {
    await fetch('/api/blips', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': xsrf },
      credentials: 'include',
      body: JSON.stringify({ waveId, parentId: child1Id, content: '<p>Child level 2</p>' }),
    });
  }, { waveId, child1Id, xsrf });

  return { waveId };
}

async function goWave(page, waveId) {
  await page.goto(`${baseUrl}/#/topic/${encodeURIComponent(waveId)}?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
}

async function collectUiElements(page) {
  return page.evaluate(() => {
    const rows = [];
    const nodes = Array.from(document.querySelectorAll('button, a, input, textarea, select, [role="button"], [data-testid]'));
    for (const node of nodes) {
      const r = node.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const text = (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      const testid = node.getAttribute('data-testid') || '';
      const role = node.getAttribute('role') || '';
      const tag = node.tagName.toLowerCase();
      const id = node.id || '';
      let area = 'center-pane';
      if (r.left < window.innerWidth * 0.23) area = 'left-pane';
      if (r.left > window.innerWidth * 0.78) area = 'right-rail';
      if (r.top < 90) area = 'top-bar';
      if (/auth|signin|sign in|sign up/i.test(text)) area = 'auth';
      rows.push({
        area,
        tag,
        role,
        id,
        testid,
        text,
      });
    }
    return rows;
  });
}

function evaluateChecks(snapshotText, checks) {
  const right = [];
  const wrong = [];
  for (const check of checks) {
    if (snapshotText.includes(check)) right.push(check);
    else wrong.push(check);
  }
  return { right, wrong };
}

async function writeScenarioNote(noteFile, scenario, right, wrong, fileName) {
  const status = wrong.length === 0 ? 'PASS' : right.length === 0 ? 'FAIL' : 'PARTIAL';
  const lines = [
    `# ${fileName}`,
    '',
    `- Scenario: ${scenario}`,
    `- Result: ${status}`,
    '',
    '## Right',
    ...(right.length ? right.map((r) => `- Found: ${r}`) : ['- No expected tokens matched']),
    '',
    '## Wrong',
    ...(wrong.length ? wrong.map((w) => `- Missing: ${w}`) : ['- No missing expected tokens']),
  ];
  await fs.writeFile(noteFile, lines.join('\n'), 'utf8');
  return status;
}

async function generateUiElementsDoc(elementsByArea, profileCount, screenshotCount, outDirRel) {
  const order = ['auth', 'top-bar', 'left-pane', 'center-pane', 'right-rail'];
  const lines = [
    '# UI Elements Exhaustive',
    '',
    `Generated on: ${new Date().toISOString()}`,
    `Source screenshot run: \`${outDirRel}\``,
    `Profiles covered: ${profileCount}`,
    `Screenshots generated: ${screenshotCount}`,
    '',
    'This document tracks UI elements (clickable/interactive) and is intentionally separate from functionality docs.',
    '',
  ];
  for (const area of order) {
    const set = elementsByArea.get(area) || new Set();
    lines.push(`## ${area}`);
    if (!set.size) {
      lines.push('- (no elements captured)');
      lines.push('');
      continue;
    }
    const items = Array.from(set).sort();
    for (const item of items) lines.push(`- ${item}`);
    lines.push('');
  }
  await fs.writeFile(uiElementsDocPath, lines.join('\n'), 'utf8');
}

async function main() {
  await ensureDir(imgDir);
  await ensureDir(notesDir);

  const browser = await chromium.launch({ headless: true });
  const seedCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const seedPage = await seedCtx.newPage();
  await ensureAuth(seedPage);
  const { waveId } = await seedWave(seedPage);
  const statePath = path.join(outRoot, 'storage-state.json');
  await seedCtx.storageState({ path: statePath });
  await seedCtx.close();

  const scenarios = [];
  for (const nav of navStates) {
    for (const view of rightViewStates) {
      for (const density of densityStates) {
        scenarios.push({
          name: `nav-${slugify(nav)}__view-${slugify(view)}__density-${slugify(density)}`,
          checks: [nav, view, density, 'Write a reply', 'Invite'],
          async action(page) {
            await goWave(page, waveId);
            await clickTextLoose(page, nav);
            await page.waitForTimeout(250);
            await clickTextLoose(page, view);
            await page.waitForTimeout(250);
            await clickTextLoose(page, density);
            await page.waitForTimeout(250);
          },
        });
      }
    }
  }

  const editorScenarios = [
    {
      name: 'editor-view-root',
      checks: ['Edit', 'Write a reply', 'Invite'],
      async action(page) {
        await goWave(page, waveId);
        await page.locator('.rizzoma-blip').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
      },
    },
    {
      name: 'editor-edit-mode',
      checks: ['Done', 'Bold', 'Italic', 'Write a reply'],
      async action(page) {
        await goWave(page, waveId);
        await page.locator('.rizzoma-blip').first().click({ timeout: 2000 }).catch(() => {});
        const editBtn = page.locator('[data-testid="blip-menu-edit"]').first();
        if (await editBtn.count()) await editBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      },
    },
    {
      name: 'editor-reply-focus',
      checks: ['Write a reply', 'Invite'],
      async action(page) {
        await goWave(page, waveId);
        const reply = page.getByPlaceholder('Write a reply...').first();
        if (await reply.count()) await reply.click().catch(() => {});
        await page.waitForTimeout(300);
      },
    },
    {
      name: 'dialog-invite-attempt',
      checks: ['Invite', 'Sign in', 'email', 'team'],
      async action(page) {
        await goWave(page, waveId);
        await clickTextLoose(page, 'Invite');
        await page.waitForTimeout(600);
      },
    },
    {
      name: 'dialog-share-attempt',
      checks: ['Share', 'Public', 'link', 'privacy'],
      async action(page) {
        await goWave(page, waveId);
        await clickTextLoose(page, 'Share');
        await page.waitForTimeout(600);
      },
    },
    {
      name: 'auth-signed-in-shell',
      checks: ['Topics', 'Invite', 'Write a reply'],
      async action(page) {
        await goWave(page, waveId);
      },
    },
  ];
  scenarios.push(...editorScenarios);

  let seq = 0;
  const summaryRows = [];
  const elementsByArea = new Map();

  for (const profile of profiles) {
    const context = await browser.newContext({
      ...profile.contextOptions,
      storageState: statePath,
    });
    const page = await context.newPage();

    // one explicit auth state screenshot per profile (logged-out)
    await page.context().clearCookies();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const authFile = `ui-${profile.name}-${String(seq).padStart(4, '0')}-auth-login-${runTs}.png`;
    const authPng = path.join(imgDir, authFile);
    await page.screenshot({ path: authPng, fullPage: true });
    const authText = await page.locator('body').innerText();
    const authEval = evaluateChecks(authText, ['Sign in', 'Sign up', 'Email', 'Password']);
    const authMd = path.join(notesDir, authFile.replace('.png', '.md'));
    const authStatus = await writeScenarioNote(authMd, `${profile.name} / auth-login`, authEval.right, authEval.wrong, authFile);
    summaryRows.push({ file: authFile, profile: profile.name, scenario: 'auth-login', status: authStatus });
    seq += 1;

    // restore signed-in state
    await context.close();
    const signedContext = await browser.newContext({
      ...profile.contextOptions,
      storageState: statePath,
    });
    const signedPage = await signedContext.newPage();

    for (const scenario of scenarios) {
      await scenario.action(signedPage);
      const text = await signedPage.locator('body').innerText();
      const { right, wrong } = evaluateChecks(text, scenario.checks);

      const file = `ui-${profile.name}-${String(seq).padStart(4, '0')}-${scenario.name}-${runTs}.png`;
      const pngPath = path.join(imgDir, file);
      const mdPath = path.join(notesDir, file.replace('.png', '.md'));

      await signedPage.screenshot({ path: pngPath, fullPage: true });
      const status = await writeScenarioNote(mdPath, `${profile.name} / ${scenario.name}`, right, wrong, file);
      summaryRows.push({ file, profile: profile.name, scenario: scenario.name, status });

      const elements = await collectUiElements(signedPage);
      for (const el of elements) {
        const key = `${el.tag}${el.role ? ` role=${el.role}` : ''}${el.testid ? ` data-testid=${el.testid}` : ''}${el.text ? ` text="${el.text}"` : ''}`;
        if (!elementsByArea.has(el.area)) elementsByArea.set(el.area, new Set());
        elementsByArea.get(el.area).add(key);
      }

      seq += 1;
    }

    await signedContext.close();
  }

  const pass = summaryRows.filter((r) => r.status === 'PASS').length;
  const partial = summaryRows.filter((r) => r.status === 'PARTIAL').length;
  const fail = summaryRows.filter((r) => r.status === 'FAIL').length;

  const summaryLines = [
    '# Exhaustive UI Screenshot Summary',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Base URL: ${baseUrl}`,
    `- Wave ID used: ${waveId}`,
    `- Profiles: ${profiles.map((p) => p.name).join(', ')}`,
    `- Total screenshots: ${summaryRows.length}`,
    `- PASS: ${pass}`,
    `- PARTIAL: ${partial}`,
    `- FAIL: ${fail}`,
    '',
    '## Files',
    ...summaryRows.map((r) => `- ${r.file} | ${r.profile} | ${r.scenario} | ${r.status}`),
  ];
  await fs.writeFile(summaryPath, summaryLines.join('\n'), 'utf8');

  await generateUiElementsDoc(
    elementsByArea,
    profiles.length,
    summaryRows.length,
    path.relative(path.resolve('.'), outRoot),
  );

  await browser.close();

  console.log(`OUT_DIR=${outRoot}`);
  console.log(`SCREENSHOTS=${summaryRows.length}`);
  console.log(`PASS=${pass} PARTIAL=${partial} FAIL=${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
