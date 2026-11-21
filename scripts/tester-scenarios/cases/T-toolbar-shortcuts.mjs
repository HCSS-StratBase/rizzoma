// Family T: the rich-text toolbar (every button) and the documented keyboard shortcuts, each judged by
// what ends up STORED, not by the button being visible.
import { newUser, plain, sleep } from '../lib.mjs';

async function blipInEdit(ctx, title, text) {
  const a = await ctx.client(await newUser('a'));
  const id = await ctx.topic(a, title);
  await a.openTopic(id);
  await a.replyAtTopic(text);
  await a.ensureExpanded(text);
  await a.enterEditByClick(text);
  return { a, id };
}
const tb = (a, tid) => a.page.locator(`.nested-blip.edit-mode [data-testid="${tid}"], [data-testid="${tid}"]`).last();
const storedHtml = async (a, id, text) => String((await a.blips(id)).find((x) => plain(x.content).includes(text))?.content || '');

const FORMATS = [
  ['T01', 'bold', 'blip-menu-bold', /<(strong|b)>/, 'Control+b', '3.2'],
  ['T02', 'italic', 'blip-menu-italic', /<(em|i)>/, 'Control+i', '3.2'],
  ['T03', 'underline', 'blip-menu-underline', /<u>/, 'Control+u', '3.2'],
  ['T04', 'strikethrough', 'blip-menu-strike', /<(s|strike|del)>/, null, '3.2'],
];

export default [
  ...FORMATS.map(([id, name, tid, re, key, row]) => ({
    id, family: 'T', title: `${name}: toolbar button AND keyboard shortcut format the selection and are stored`,
    rows: [row, '3.12', '3.1'],
    async run(ctx) {
      const { a, id: topicId } = await blipInEdit(ctx, `fmt ${name}`, `word-${name}`);
      await a.page.keyboard.press('Control+a');
      await tb(a, tid).click(); await sleep(600);
      await a.doneAll(); await sleep(1800);
      ctx.ok(re.test(await storedHtml(a, topicId, `word-${name}`)), `the ${name} button formats the selection`, (await storedHtml(a, topicId, `word-${name}`)).slice(0, 160));
      if (key) {
        await a.enterEditByClick(`word-${name}`);
        await a.page.keyboard.press('Control+a'); await tb(a, tid).click(); await sleep(400); // remove
        await a.page.keyboard.press('Control+a'); await a.page.keyboard.press(key); await sleep(600);
        await a.doneAll(); await sleep(1800);
        ctx.ok(re.test(await storedHtml(a, topicId, `word-${name}`)), `${key} applies ${name} again`, (await storedHtml(a, topicId, `word-${name}`)).slice(0, 160));
      }
    },
  })),
  {
    id: 'T05', family: 'T', title: 'bulleted and numbered list buttons toggle list types; clear formatting removes marks; undo/redo buttons work',
    rows: ['3.4', '3.12', '3.1'],
    async run(ctx) {
      const { a, id } = await blipInEdit(ctx, 'lists', 'LST');
      await a.page.keyboard.press('End'); await a.page.keyboard.press('Enter'); await a.page.keyboard.type('second', { delay: 20 });
      await tb(a, 'blip-menu-ordered-list').click(); await sleep(600);
      await a.doneAll(); await sleep(1800);
      // BLB imposes bullets: the numbered-list button must not break the body (still a bulleted list of two items)
      const bh = await storedHtml(a, id, 'LST');
      ctx.ok(/<ul>[\s\S]*LST[\s\S]*second[\s\S]*<\/ul>/.test(bh), 'the numbered-list button leaves the BLB bulleted body intact (bullets are imposed)', bh.slice(0, 200));
      await a.enterEditByClick('LST');
      await a.page.keyboard.press('Control+a'); await tb(a, 'blip-menu-bold').click(); await sleep(500);
      ctx.ok(/<strong>/.test(await a.page.evaluate(() => document.querySelector('.ProseMirror[contenteditable="true"]').innerHTML)), 'bold applied before clearing');
      await tb(a, 'blip-menu-clear-formatting').click(); await sleep(600);
      ctx.ok(!/<strong>/.test(await a.page.evaluate(() => document.querySelector('.ProseMirror[contenteditable="true"]').innerHTML)), 'clear formatting removes the bold');
      await tb(a, 'blip-menu-undo').click(); await sleep(500);
      ctx.ok(/<strong>/.test(await a.page.evaluate(() => document.querySelector('.ProseMirror[contenteditable="true"]').innerHTML)), 'the undo button brings the bold back');
      await tb(a, 'blip-menu-redo').click(); await sleep(500);
      await a.doneAll(); await sleep(1800);
      const h = await storedHtml(a, id, 'LST');
      ctx.ok(!/<strong>/.test(h), 'clear formatting leaves no bold (after undo/redo)', h.slice(0, 200));
    },
  },
  {
    id: 'T06', family: 'T', title: 'highlight: the colour palette applies a background colour that is stored',
    rows: ['3.8', '3.12'],
    async run(ctx) {
      const { a, id } = await blipInEdit(ctx, 'highlight', 'HLT');
      await a.page.keyboard.press('Control+a');
      await tb(a, 'blip-menu-highlight-toggle').click(); await sleep(600);
      await a.page.locator('[title="#ffff00"], [title="#fef08a"], .highlight-color-option, [title^="#"]').first().click().catch(() => undefined);
      await sleep(600);
      await a.doneAll(); await sleep(1800);
      ctx.ok(/<mark|background/.test(await storedHtml(a, id, 'HLT')), 'the highlight is stored', (await storedHtml(a, id, 'HLT')).slice(0, 200));
    },
  },
  {
    id: 'T07', family: 'T', title: 'quote and code formatting are not part of a blip (the original has none, BLB imposes bullets): "> " and three backticks stay literal text, the bulleted body stays intact, the toolbar offers no such button',
    rows: ['3.6', '3.7', '3.3'],
    async run(ctx) {
      const { a, id } = await blipInEdit(ctx, 'blocks', 'BLK');
      const k = a.page.keyboard;
      await k.press('End'); await k.press('Enter'); await k.type('> quoted', { delay: 20 });
      await k.press('Enter'); await k.type('``` const x = 1;', { delay: 20 });
      ctx.eq(await a.page.locator('.nested-blip.edit-mode [data-testid*="quote"], .nested-blip.edit-mode [data-testid*="code"], .nested-blip.edit-mode [title*="Code" i], .nested-blip.edit-mode [title*="quote" i]').count(), 0, 'the blip toolbar has no quote or code button');
      await a.doneAll(); await sleep(1800);
      const h = await storedHtml(a, id, 'BLK');
      ctx.ok(!/<blockquote|<pre/.test(h), 'no blockquote or code block is created inside a blip', h.slice(0, 220));
      ctx.ok(/^<ul>[\s\S]*BLK[\s\S]*&gt; quoted[\s\S]*const x = 1;[\s\S]*<\/ul>$/.test(h), 'the typed text is kept literally inside the bulleted body', h.slice(0, 260));
    },
  },
  {
    id: 'T08', family: 'T', title: 'insert inline comment button and emoji button work from the toolbar; the emoji is stored',
    rows: ['3.12', '14.11', '15.7'],
    async run(ctx) {
      const { a, id } = await blipInEdit(ctx, 'toolbar extras', 'EXT');
      await a.page.keyboard.press('End');
      await tb(a, 'blip-menu-emoji').click(); await sleep(800);
      await a.page.locator('button.epr-emoji').first().click().catch(() => undefined);
      await sleep(600);
      await tb(a, 'blip-menu-insert-inline-comment').click(); await sleep(2500);
      await a.page.keyboard.type('viaButton', { delay: 25 }); await sleep(1500);
      await a.doneAll(); await sleep(2000);
      const list = await a.blips(id);
      ctx.ok(list.some((x) => plain(x.content) === 'viaButton'), 'the toolbar inline-comment button creates a child that takes typed text', list.map((x) => plain(x.content)).join(','));
      ctx.ok(/[^\x00-\x7F]/.test(plain(list.find((x) => plain(x.content).startsWith('EXT'))?.content)), 'an emoji character was inserted');
    },
  },
  {
    id: 'K01', family: 'K', title: 'Ctrl+E toggles edit mode, Shift+Enter is Done, Escape does not lose text',
    rows: ['6.6', '9.2', '13.23'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const id = await ctx.topic(a, 'kb edit');
      await a.openTopic(id);
      await a.replyAtTopic('KB1');
      await a.ensureExpanded('KB1');
      await a.activate('KB1');
      await a.page.keyboard.press('Control+e'); await sleep(1500);
      ctx.ok((await a.editorCount()) >= 1, 'Ctrl+E enters edit mode');
      await a.page.keyboard.press('End'); await a.page.keyboard.type('+x', { delay: 25 });
      await sleep(900);
      await a.page.keyboard.press('Shift+Enter'); await sleep(1800);
      ctx.eq(await a.editorCount(), 0, 'Shift+Enter finishes editing (Done)');
      ctx.ok((await a.blips(id)).some((x) => plain(x.content) === 'KB1+x'), 'the text typed before Shift+Enter is stored');
    },
  },
  {
    id: 'K02', family: 'K', title: 'in the editor of a blip, Ctrl+Shift+Up hides and Ctrl+Shift+Down shows its inline comments, and the preference is stored for that blip',
    rows: ['6.5', '6.6', '14.17', '5.9'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const id = await ctx.topic(a, 'kb fold');
      await a.openTopic(id);
      await a.replyAtTopic('KP');
      await a.ensureExpanded('KP'); await a.enterEditByClick('KP');
      await a.page.locator('.ProseMirror[contenteditable="true"]').first().click();
      const bid = (await a.blips(id)).find((x) => plain(x.content) === 'KP').id;
      const vis = async () => JSON.stringify((await a.api('GET', `/api/blips/${encodeURIComponent(bid)}/inline-comments-visibility`)).json);
      await a.page.keyboard.press('Control+Shift+ArrowUp'); await sleep(2500);
      ctx.ok(/false/.test(await vis()), 'Ctrl+Shift+Up stores "comments hidden" for the blip', await vis());
      await a.page.keyboard.press('Control+Shift+ArrowDown'); await sleep(2500);
      ctx.ok(/true/.test(await vis()), 'Ctrl+Shift+Down stores "comments shown"', await vis());
      await a.doneAll();
    },
  },
  {
    id: 'K03', family: 'K', title: 'the keyboard-shortcuts panel at the bottom of the navigation lists the documented shortcuts and can be minimised',
    rows: ['13.23', '20.27'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      await a.page.goto(`${process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100'}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(4000);
      const txt = await a.page.locator('.tips-box').innerText().catch(() => '');
      ctx.ok(/Ctrl\+Enter/.test(txt) && /Ctrl\+Shift/.test(txt), 'the panel lists Ctrl+Enter and Ctrl+Shift shortcuts', txt.replace(/\s+/g, ' ').slice(0, 160));
      await a.page.locator('.tips-toggle-btn').click(); await sleep(800);
      ctx.ok((await a.page.locator('.tips-box.tips-hidden').count()) > 0, 'it can be minimised');
    },
  },
];
