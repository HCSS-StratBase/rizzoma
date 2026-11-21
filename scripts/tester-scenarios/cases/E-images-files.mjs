// Family E: images and files. The tester: "screenshots work but a pasted image takes almost the whole page".
import { newUser, shareWith, plain, sleep } from '../lib.mjs';

async function setup(ctx, title) {
  const a = await ctx.client(await newUser('a'));
  const b = await ctx.client(await newUser('b'));
  const id = await ctx.topic(a, title);
  await shareWith(id, b.user, 'editor');
  await a.openTopic(id);
  return { a, b, id };
}

/** Real PNG put on the REAL clipboard (navigator.clipboard.write) and pasted with a real Ctrl+V keystroke. */
async function pasteImage(c, w = 1200, h = 800) {
  const put = await c.page.evaluate(async ({ w, h }) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.fillStyle = '#3b82f6'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(Math.floor(w / 24), Math.floor(h / 16), Math.floor(w / 6), Math.floor(h / 8));
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); return 'ok'; } catch (e) { return String(e); }
  }, { w, h });
  if (put !== 'ok') return put;
  await c.page.keyboard.press('End');
  await c.page.keyboard.press('Control+v');
  return 'pasted';
}
const imgBox = (c, scope) => c.page.evaluate((sc) => { const i = document.querySelector(`${sc} img`); if (!i) return null; const r = i.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), src: i.getAttribute('src')?.slice(0, 40) }; }, scope);

export default [
  {
    id: 'E01', family: 'E', title: 'a PNG pasted from the real clipboard (Ctrl+V) becomes exactly one thumbnail (max 200 x 150) in edit and in view mode, survives reload and shows for a second user',
    rows: ['3.10', '7.7', '7.5'],
    async run(ctx) {
      const { a, b, id } = await setup(ctx, 'image paste');
      await a.replyAtTopic('pic');
      await a.ensureExpanded('pic');
      await a.enterEditByClick('pic');
      ctx.eq(await pasteImage(a), 'pasted', 'a real PNG was put on the clipboard and Ctrl+V pressed');
      await sleep(5000);
      const edit = await imgBox(a, '.ProseMirror[contenteditable="true"]');
      ctx.ok(!!edit && edit.w > 0 && edit.w <= 200 && edit.h <= 150, 'thumbnail size in edit mode', JSON.stringify(edit));
      await a.doneAll();
      await sleep(2000);
      const stored = (await a.blips(id)).find((x) => plain(x.content).startsWith('pic'));
      ctx.eq((String(stored?.content).match(/<img/g) || []).length, 1, 'exactly ONE image node is stored after one paste (no double insertion)');
      await a.reload();
      await a.ensureExpanded('pic');
      const view = await imgBox(a, '.blip-text');
      ctx.ok(!!view && view.w > 0 && view.w <= 200 && view.h <= 150, 'thumbnail size in view mode after reload', JSON.stringify(view));
      await b.openTopic(id, 6000);
      await b.ensureExpanded('pic');
      const other = await imgBox(b, '.blip-text');
      ctx.ok(!!other && other.w > 0, 'a second user sees the image too', JSON.stringify(other));
      await a.shot('E01-image');
    },
  },
  {
    id: 'E02', family: 'E', title: 'attachment upload through the toolbar file chooser: stored, shown in the blip, downloadable after reload',
    rows: ['7.1', '7.7', '3.14'],
    async run(ctx) {
      const { a, id } = await setup(ctx, 'attachment');
      await a.replyAtTopic('doc');
      await a.ensureExpanded('doc');
      await a.enterEditByClick('doc');
      await a.page.keyboard.press('Control+End'); // the click may land mid-word; a person moves to the end before attaching
      const [chooser] = await Promise.all([
        a.page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null),
        a.page.locator('[data-testid="blip-menu-insert-attachment"]').last().click(),
      ]);
      ctx.ok(!!chooser, 'the Insert attachment button opens a real file chooser');
      if (chooser) {
        await chooser.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('attachment body for the suite') });
        await sleep(5000);
      }
      await a.doneAll();
      await sleep(2000);
      const stored = (await a.blips(id)).find((x) => plain(x.content).startsWith('doc'));
      ctx.ok(/notes\.txt|attachment|data-attachment|\/api\/uploads|\/uploads\//i.test(String(stored?.content)), 'the blip carries the attachment', String(stored?.content).slice(0, 220));
      await a.reload();
      await a.ensureExpanded('doc');
      ctx.ok((await a.page.locator('.blip-text a[href*="upload"], .blip-text [data-attachment], .blip-text .attachment').count()) > 0 || /notes\.txt/.test(await a.page.locator('.blip-text').first().innerText()), 'the attachment is visible after reload');
    },
  },
  {
    id: 'E03', family: 'E', title: 'a large (2400 x 1600) image is also capped, and a tiny one is not stretched',
    rows: ['3.10'],
    async run(ctx) {
      const { a } = await setup(ctx, 'image sizes');
      await a.replyAtTopic('sz');
      await a.ensureExpanded('sz');
      await a.enterEditByClick('sz');
      await pasteImage(a, 2400, 1600);
      await sleep(5000);
      const big = await imgBox(a, '.ProseMirror[contenteditable="true"]');
      ctx.ok(!!big && big.w <= 200 && big.h <= 150, 'a 2400 x 1600 image is capped', JSON.stringify(big));
      await pasteImage(a, 40, 30);
      await sleep(3000);
      const sizes = await a.page.evaluate(() => Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"] img')).map((i) => Math.round(i.getBoundingClientRect().width)));
      ctx.eq(sizes.length, 2, 'two pastes give exactly two images');
      ctx.ok(sizes.some((w) => w > 0 && w <= 60), 'a 40 px image stays small', JSON.stringify(sizes));
      await a.doneAll();
    },
  },
];
