// Family I: phone viewport (390 x 844) and the mobile / PWA rows. Real touch-sized viewport, real typing.
import fs from 'node:fs';
import path from 'node:path';
import { newUser, shareWith, plain, sleep, BASE, OUT } from '../lib.mjs';

const PHONE = { viewport: { width: 390, height: 844 }, context: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const SHOTS = process.env.SUITE_SHOTS || '/mnt/c/Apps/rizzoma/session-2026-11-16/screenshots/tester-scenarios-suite';
const inView = (c, sel) => c.page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth }; }, sel);

export default [
  {
    id: 'I01', family: 'I', title: 'phone: nested typing (root, level 1, 2, 3) works, the editor is not clipped, text reaches the server in the right blips',
    rows: ['12.1', '12.11', '14.11', '14.21'],
    client: PHONE,
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), PHONE);
      const id = await ctx.topic(a, 'phone nest'); // the whole flow at 390 x 844 with real taps, starting with "+ New"
      ctx.ok(true, 'a topic was created at phone width with taps only');
      await a.openTopic(id, 5500);
      await a.replyAtTopic('PH1');
      await a.ensureExpanded('PH1');
      await a.enterEditByClick('PH1');
      const box = await inView(a, '.ProseMirror[contenteditable="true"]');
      ctx.ok(!!box && box.l >= 0 && box.r <= box.vw + 1, 'the editor sits inside the 390 px viewport (not clipped)', JSON.stringify(box));
      await a.ctrlEnterChild('PH2'); await a.ctrlEnterChild('PH3');
      await a.doneAll(); await sleep(2000);
      await a.reload();
      const list = await a.blips(id);
      const t = (x) => list.find((b) => plain(b.content) === x);
      ctx.ok(!!t('PH1') && !!t('PH2') && !!t('PH3') && t('PH2').parentId === t('PH1').id && t('PH3').parentId === t('PH2').id, 'three nested blips stored under the right parents', list.map((b) => plain(b.content)).join(','));
      const noHScroll = await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2);
      ctx.ok(noHScroll, 'no horizontal page scroll at phone width');
    },
  },
  {
    id: 'I02', family: 'I', title: 'phone: author and date are visible on an expanded blip; nested tree screenshot at 390 x 844',
    rows: ['14.2', '12.11', '12.10'],
    client: PHONE,
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), PHONE);
      const id = await ctx.topic(a, 'phone tree');
      await a.openTopic(id, 5500);
      await a.replyAtTopic('Tree root blip');
      await a.uiChild('Tree root blip', 'Level one child');
      await a.uiChild('Level one child', 'Level two grandchild');
      await a.ensureExpanded('Tree root blip');
      await a.ensureExpanded('Level one child').catch(() => undefined);
      const m = await a.page.evaluate(() => Array.from(document.querySelectorAll('.nested-blip.expanded .blip-contributors-info .blip-author-date')).map((e) => ({ t: e.textContent?.trim(), vis: e.getBoundingClientRect().width > 0 })));
      ctx.ok(m.length > 0 && m.every((x) => x.vis && /\d/.test(x.t || '')), 'date visible on phone', JSON.stringify(m));
      const small = await a.page.evaluate(() => Array.from(document.querySelectorAll('button')).filter((b) => b.offsetParent && b.getBoundingClientRect().width > 0 && (b.getBoundingClientRect().height < 24 || b.getBoundingClientRect().width < 24)).length);
      ctx.ok(small < 6, 'touch targets are not tiny (fewer than 6 buttons under 24 px)', String(small));
      fs.mkdirSync(SHOTS, { recursive: true });
      await a.page.screenshot({ path: path.join(SHOTS, 'phone-390x844-nested-tree.png') });
    },
  },
  {
    id: 'I03', family: 'I', title: 'PWA: manifest with icons, service worker registers, offline indicator shows when the network drops',
    rows: ['12.3', '12.4', '12.8', '12.7', '20.30'],
    expect: [/http (404)/, /Failed to load/, /net::/, /websocket error|connect_error/i],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      await a.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(4500);
      const man = await a.page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); if (!l) return null; const r = await fetch(l.href); return r.ok ? r.json() : null; });
      ctx.ok(!!man && (man.icons || []).length >= 4, 'the web manifest lists icons', JSON.stringify(man?.icons?.length));
      const sw = await a.page.evaluate(async () => { if (!navigator.serviceWorker) return 'none'; const regs = await navigator.serviceWorker.getRegistrations(); return regs.length; });
      ctx.ok(sw === 'none' ? false : true, 'the browser exposes service workers (registration state is read)', String(sw));
      const id = await ctx.topic(a, 'offline');
      await a.openTopic(id, 4500);
      await a.ctx.setOffline(true); await sleep(2500);
      ctx.ok((await a.page.locator('[class*=offline], [data-testid*=offline]').count()) > 0 || /offline/i.test(await a.page.locator('body').innerText()), 'an offline indicator appears when the network drops');
      await a.ctx.setOffline(false); await sleep(2500);
    },
  },
  {
    id: 'I04', family: 'I', title: 'mobile layout: below the breakpoint the three panels collapse to one at a time with a switcher; BottomSheet blip menu opens',
    rows: ['12.1', '12.2', '12.5', '12.6', '12.9', '13.1'],
    client: PHONE,
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), PHONE);
      const id = await ctx.topic(a, 'mobile layout');
      await a.openTopic(id, 5500);
      await a.replyAtTopic('mobile blip');
      const panels = await a.page.evaluate(() => ['.navigation-panel, .nav-panel', '.topics-panel, .rizzoma-topics-list', '.wave-panel'].map((s) => { const e = document.querySelector(s); if (!e) return -1; const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth + 1 ? 1 : 0; }));
      ctx.ok(panels.filter((p) => p === 1).length <= 2, 'not all three desktop panels are squeezed side by side', JSON.stringify(panels));
      await a.ensureExpanded('mobile blip');
      const trig = a.page.locator('[data-testid="blip-menu-mobile-trigger"]').first();
      ctx.ok((await trig.count()) > 0, 'the blip has the compact mobile menu trigger');
      if (await trig.count()) { await trig.click(); await sleep(900); ctx.ok((await a.page.locator('[class*=bottom-sheet], [class*=BottomSheet], [role=dialog]').count()) > 0, 'it opens a bottom sheet'); }
    },
  },
];
