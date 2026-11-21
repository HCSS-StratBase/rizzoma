// Family Q: guard for the experimental native render path. ?render=native is an opt-in, unfinished port
// (docs/NATIVE_RENDER_PORT_PLAN.md phases 2 to 5; RizzomaTopicDetail.tsx:1850-1860 selects it only for the URL
// parameter or localStorage rizzoma_render_mode=native). Users never reach it by default or through a switch. This
// case FAILS if the default path stops being the React path or if the app starts offering a way into native
// before it has the topic reply box and blip rows the UI cases need.
import { newUser, sleep, BASE } from '../lib.mjs';

export default [
  {
    id: 'Q01', family: 'Q', paths: ['react'], title: 'guard: the default URL serves the React render path, the app sets no native preference and offers no switch to ?render=native',
    rows: ['13.1'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const id = await ctx.topic(a, 'native guard');
      await a.page.goto(`${BASE}/?layout=rizzoma#/topic/${id}`, { waitUntil: 'domcontentloaded' });
      await sleep(5500);
      ctx.eq(await a.page.locator('.rizzoma-native-mode').count(), 0, 'the default URL does not use the native renderer');
      ctx.ok((await a.page.locator('.write-reply-input').count()) > 0, 'the default path has the topic reply box');
      const pref = await a.page.evaluate(() => { try { return localStorage.getItem('rizzoma_render_mode'); } catch { return 'blocked'; } });
      ctx.ok(pref === null, 'the app itself never stores a native render preference', String(pref));
      const links = await a.page.evaluate(() => Array.from(document.querySelectorAll('a[href], button, [role=menuitem], option')).filter((e) => /render=native|native render/i.test((e.getAttribute('href') || '') + (e.textContent || ''))).length);
      ctx.eq(links, 0, 'no link, button or menu item leads to the native path');
    },
  },
];
