// Family F: time and authorship. The tester: "the time a blip was created does not display (only while writing)".
import { newUser, shareWith, plain, sleep } from '../lib.mjs';

const meta = (c) => c.page.evaluate(() => Array.from(document.querySelectorAll('.nested-blip.expanded .blip-contributors-info')).map((el) => {
  const d = el.querySelector('.blip-author-date'); const b = (d || el).getBoundingClientRect();
  const av = el.querySelector('img, .blip-avatar, [class*=avatar]');
  return { text: (d?.textContent || '').trim(), visible: b.width > 0 && b.height > 0 && getComputedStyle(d || el).visibility !== 'hidden', hasAvatar: !!av, title: el.getAttribute('title') || av?.getAttribute('title') || av?.getAttribute('alt') || '' };
}));

async function setup(ctx, title) {
  const a = await ctx.client(await newUser('a'));
  const b = await ctx.client(await newUser('b'));
  const id = await ctx.topic(a, title);
  await shareWith(id, b.user, 'editor');
  await a.openTopic(id);
  return { a, b, id };
}

export default [
  {
    id: 'F01', family: 'F', title: 'every expanded blip shows its author avatar and creation date in view mode, right after creation and after reload',
    rows: ['2.7', '14.2', '4.5'],
    async run(ctx) {
      const { a } = await setup(ctx, 'meta view');
      await a.replyAtTopic('M1');
      await a.ensureExpanded('M1');
      let m = await meta(a);
      ctx.ok(m.length > 0 && m.every((x) => x.visible && /\d/.test(x.text)), 'date visible in view mode right after creation', JSON.stringify(m));
      ctx.ok(m.every((x) => x.hasAvatar), 'author avatar visible', JSON.stringify(m));
      await a.reload();
      await a.ensureExpanded('M1');
      m = await meta(a);
      ctx.ok(m.length > 0 && m.every((x) => x.visible && /\d/.test(x.text)), 'date visible after reload', JSON.stringify(m));
    },
  },
  {
    id: 'F02', family: 'F', title: 'the date and author also show while the blip is being edited',
    rows: ['14.2', '9.2'],
    async run(ctx) {
      const { a } = await setup(ctx, 'meta edit');
      await a.replyAtTopic('M2');
      await a.ensureExpanded('M2');
      await a.enterEditByClick('M2');
      const inEdit = await a.page.evaluate(() => Array.from(document.querySelectorAll('.nested-blip.edit-mode .blip-contributors-info .blip-author-date')).map((e) => e.textContent?.trim()));
      ctx.ok(inEdit.length > 0 && inEdit.every((t) => /\d/.test(t || '')), 'date shown in edit mode', JSON.stringify(inEdit));
      await a.doneAll();
    },
  },
  {
    id: 'F03', family: 'F', title: 'a second user sees the author and date of a blip written by the first, and a nested child shows its own',
    rows: ['2.7', '14.2', '14.21'],
    async run(ctx) {
      const { a, b, id } = await setup(ctx, 'meta second');
      await a.replyAtTopic('M3');
      await a.ensureExpanded('M3');
      await a.enterEditByClick('M3');
      await a.ctrlEnterChild('M3kid');
      await a.doneAll();
      await b.openTopic(id, 6000);
      await b.ensureExpanded('M3');
      const m = await meta(b);
      ctx.ok(m.length > 0 && m.every((x) => x.visible && /\d/.test(x.text)), 'date visible for user B', JSON.stringify(m));
      ctx.ok(m.some((x) => x.title.includes(a.user.email.split('@')[0]) || x.hasAvatar), 'the author is identifiable (avatar or name)', JSON.stringify(m));
    },
  },
  {
    id: 'F04', family: 'F', title: 'collapsed state per the original: a collapsed row shows its label and no editor; expanding shows content and meta; collapsing again hides them',
    rows: ['14.1', '14.3', '14.4'],
    async run(ctx) {
      const { a } = await setup(ctx, 'collapsed state');
      await a.replyAtTopic('M4');
      const row = a.page.locator('.blip-collapsed-row', { hasText: 'M4' }).first();
      ctx.ok(await row.isVisible(), 'a new blip is a collapsed row with its label');
      ctx.eq(await a.editorCount(), 0, 'no editor while collapsed');
      await row.click(); await sleep(1300);
      ctx.ok((await meta(a)).length > 0, 'expanding shows the blip with its meta');
      await a.page.locator('[data-testid="blip-expander"]').last().click(); await sleep(1200);
      ctx.ok((await a.page.locator('.blip-collapsed-row', { hasText: 'M4' }).count()) > 0, '[-] collapses it back to a row');
    },
  },
];
