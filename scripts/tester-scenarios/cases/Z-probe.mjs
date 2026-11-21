import { newUser, shareWith, sleep } from '../lib.mjs';
export default [{
  id: 'Z02', family: 'Z', title: 'probe: End key with a second editor', rows: [], timeoutMs: 200000,
  async run(ctx) {
    const a = await ctx.client(await newUser('a')); const b = await ctx.client(await newUser('b'));
    const id = await ctx.topic(a, 'probe end'); await shareWith(id, b.user, 'editor');
    await a.openTopic(id, 4500); await a.replyAtTopic('shared'); await b.openTopic(id, 6000);
    for (const c of [a, b]) await c.ensureExpanded('shared');
    const sel = (c) => c.page.evaluate(() => { const s = getSelection(); const pm = document.querySelector('.ProseMirror[contenteditable="true"]'); return { text: pm?.innerText, anchor: s.anchorNode?.textContent?.slice(0, 30), off: s.anchorOffset, active: document.activeElement?.className?.toString().slice(0, 30) }; });
    await a.enterEditByClick('shared'); console.log('A after enter', JSON.stringify(await sel(a)));
    await b.enterEditByClick('shared'); console.log('A after B enter', JSON.stringify(await sel(a)));
    await sleep(2000);
    await a.page.keyboard.press('End'); console.log('A after End', JSON.stringify(await sel(a)));
    await a.page.keyboard.type(' A1', { delay: 60 }); console.log('A after typing', JSON.stringify(await sel(a)));
  },
}];
