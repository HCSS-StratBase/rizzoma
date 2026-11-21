import { newUser, sleep } from '../lib.mjs';
export default [{
  id: 'Z01', family: 'Z', title: 'probe: right edges of nested levels', rows: [], client: { viewport: { width: 1440, height: 950 } }, timeoutMs: 300000,
  async run(ctx) {
    const a = await ctx.client(await newUser('a'), { viewport: { width: 1440, height: 950 } }); const id = await ctx.topic(a, 'probe nest');
    await a.openTopic(id, 4500); await a.replyAtTopic('L1'); await a.ensureExpanded('L1'); await a.enterEditByClick('L1');
    for (const n of ['L2', 'L3', 'L4', 'L5', 'L6']) await a.ctrlEnterChild(n);
    await a.doneAll(); await sleep(1500); await a.reload(); await a.ensureExpanded('L1');
    for (let i = 0; i < 5; i += 1) { await a.page.locator('.blip-thread-marker').filter({ visible: true }).last().click(); await sleep(1200); }
    const info = await a.page.evaluate(() => {
      const pane = document.querySelector('.rizzoma-topic-detail')?.getBoundingClientRect();
      const out = { pane: pane && [Math.round(pane.left), Math.round(pane.right)], levels: [] };
      document.querySelectorAll('.inline-child-expanded').forEach((e, i) => {
        const r = e.getBoundingClientRect(); const m = e.querySelector('.blip-contributors-info'); const mr = m && m.getBoundingClientRect();
        let anc = m; let pos = null; while (anc && anc !== e) { anc = anc.parentElement; if (anc && getComputedStyle(anc).position !== 'static') { pos = anc.className.toString().slice(0, 40) + ' r=' + Math.round(anc.getBoundingClientRect().right); break; } }
        const ov = []; let p = e; while (p && p !== document.body) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible') ov.push(p.className.toString().slice(0, 30) + ':' + cs.overflowX + ' r=' + Math.round(p.getBoundingClientRect().right)); p = p.parentElement; }
        out.levels.push({ i, box: [Math.round(r.left), Math.round(r.right)], meta: mr && [Math.round(mr.left), Math.round(mr.right)], posAnc: pos, overflow: ov.slice(0, 3) });
      }); return out; });
    const chain = await a.page.evaluate(() => { let e = document.querySelectorAll('.inline-child-expanded')[3]; const out = []; while (e && !e.classList.contains('topic-blip-body')) { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); out.push(`${e.tagName.toLowerCase()}.${e.className.toString().replace(/\s+/g, '.').slice(0, 50)} L${Math.round(r.left)} R${Math.round(r.right)} W${Math.round(r.width)} disp=${cs.display} pos=${cs.position} pad=${cs.paddingLeft}/${cs.paddingRight} mar=${cs.marginLeft}/${cs.marginRight} w=${e.style.width || cs.width} minw=${cs.minWidth} bs=${cs.boxSizing} flex=${cs.flex}`); e = e.parentElement; } return out; });
    console.log('CHAIN\n' + chain.join('\n'));
    ctx.notes.push(JSON.stringify(info)); console.log('PROBE', JSON.stringify(info, null, 1)); await a.shot('probe');
  },
}];
