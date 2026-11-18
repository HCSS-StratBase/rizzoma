// Real-input building blocks for the Fractal Showcase. Everything here is keyboard / mouse.
// DOM reads are used only to LOCATE things (never to write content).
import { sleep, TYPE_DELAY } from './lib.mjs';

export const EDITOR = '.ProseMirror[contenteditable="true"]';

/** Wait until at least one editable editor exists and the caret lives in one. */
export async function waitEditorFocus(p, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await p.evaluate((sel) => { const a = document.activeElement; return !!(a && a.closest && a.closest(sel)); }, EDITOR);
    if (ok) return true;
    await sleep(120);
  }
  return false;
}

/** The blip id that owns the focused editor (null when focus is outside every blip). */
export async function focusedBlipId(p) {
  return p.evaluate(() => document.activeElement?.closest?.('[data-blip-id]')?.getAttribute('data-blip-id') || null);
}

/** All blip ids currently rendered. */
export async function blipIds(p) {
  return p.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('[data-blip-id]')).map((e) => e.getAttribute('data-blip-id')))));
}

/** Type lines separated by Enter (first line goes where the caret is). */
export async function typeLines(p, lines, delay = TYPE_DELAY) {
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) await p.keyboard.press('Enter');
    await p.keyboard.type(lines[i], { delay });
  }
}

/** Click the list item that starts with `startText`, inside the editor that is editable. */
export async function clickLine(p, startText) {
  const sel = `${EDITOR} li`;
  let li = p.locator(sel, { hasText: startText }).last();
  try { await li.waitFor({ state: 'visible', timeout: 3500 }); } catch {
    // The topic-root editor can be torn down by the socket-triggered reload (open defect 1).
    // Recover the way a user would: reload the page and press the root Edit button again.
    globalThis.__fsRecoveries = (globalThis.__fsRecoveries || 0) + 1;
    if (globalThis.__fsShotOnFail) await globalThis.__fsShotOnFail();
    await p.reload({ waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await p.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click();
    await sleep(1500);
    li = p.locator(sel, { hasText: startText }).last();
    await li.waitFor({ state: 'visible', timeout: 8000 });
  }
  const box = await li.boundingBox();
  // click inside the text, near the start (a real click never lands on the child's own editor)
  await p.mouse.click(box.x + 14, box.y + Math.min(10, box.height / 2));
  await sleep(250);
}

/**
 * Put the caret after `offset` characters of the line that starts with `startText`
 * (Home, then ArrowRight offset times). Markers already inserted to the LEFT count one step each,
 * so callers insert anchors right-to-left.
 */
export async function caretAt(p, startText, offset) {
  await clickLine(p, startText);
  await p.keyboard.press('Home');
  for (let i = 0; i < offset; i += 1) await p.keyboard.press('ArrowRight');
  if (globalThis.__fsTraceFocus) globalThis.__fsTraceFocus(`caret in blip ${(await focusedBlipId(p) || '-').slice(-5)} line "${startText}" offset ${offset}`);
}

/** Ctrl+Enter at the caret, then wait for a NEW blip to own the focus. Returns its id. */
export async function ctrlEnterChild(p, tries = 3) {
  const before = new Set(await blipIds(p));
  const parent = await focusedBlipId(p);
  for (let k = 0; k < tries; k += 1) {
    globalThis.__fsCE = globalThis.__fsCE || { presses: 0, retries: 0 };
    globalThis.__fsCE.presses += 1; if (k > 0) globalThis.__fsCE.retries += 1;
    await p.keyboard.press('Control+Enter');
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const f = await focusedBlipId(p);
      if (f && !before.has(f) && f !== parent) { await sleep(500); return f; }
      await sleep(120);
    }
  }
  return null;
}

export async function shotPage(p, file, opts = {}) { await p.screenshot({ path: file, ...opts }); return file; }

/**
 * Put the caret in line `lineIdx` of blip `selfId` (null = the topic root editor) after `offset` characters.
 * First anchor of a freshly built blip: the caret already is in that blip's editor (at the end of its last
 * line), so only keys are used (ArrowUp to the line, Home, ArrowRight). After a child subtree was built the
 * focus is deeper: the child's own Done is pressed (by buildBlip) and a REAL click on this blip's own list
 * item brings the caret back. Markers already inserted to the left count one step each, so anchors are
 * processed right to left.
 */
export async function refocusLine(p, selfId, lineIdx, offset, nLines, returning) {
  if (returning) {
    // A real mouse click on this blip's own list item brings the caret back after a child subtree.
    // (Needs the nested-pointer fix: before it, ProseMirror of the PARENT swallowed the press.)
    const ed = selfId ? p.locator(`[data-blip-id="${selfId}"] .ProseMirror[contenteditable="true"]`).first()
      : p.locator('.topic-content-edit .ProseMirror[contenteditable="true"]').first();
    const li = ed.locator(':scope > ul > li').nth(lineIdx);
    try { await li.click({ position: { x: 48, y: 8 }, timeout: 6000 }); } catch (e) {
      if (selfId) { if (globalThis.__fsShotOnFail) await globalThis.__fsShotOnFail(); throw e; }
      // Open defect 1 (owned by another agent): after Ctrl+Enter in the TOPIC ROOT editor the editor is torn
      // down by a socket-triggered reload. Recover as a person would: reload, press Edit, carry on. Counted.
      globalThis.__fsRootDestroyed = (globalThis.__fsRootDestroyed || 0) + 1;
      if (globalThis.__fsShotOnFail) await globalThis.__fsShotOnFail();
      await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(5500);
      await p.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click(); await sleep(2000);
      await li.click({ position: { x: 48, y: 8 }, timeout: 8000 });
    }
    await sleep(200);
  } else {
    for (let i = 0; i < nLines - 1 - lineIdx; i += 1) await p.keyboard.press('ArrowUp');
  }
  await p.keyboard.press('Home');
  for (let i = 0; i < offset; i += 1) await p.keyboard.press('ArrowRight');
  const f = await focusedBlipId(p);
  if (selfId && f !== selfId && globalThis.__fsTraceFocus) globalThis.__fsTraceFocus(`MISFOCUS want ${selfId.slice(-5)} got ${(f || '-').slice(-5)}`);
  if (globalThis.__fsTraceFocus) globalThis.__fsTraceFocus(`caret in blip ${(f || 'root').slice(-5)} (want ${(selfId || 'root').slice(-5)}) line ${lineIdx} offset ${offset}`);
}

/** Visible text of a line spec: `text`, or the concatenation of its `runs` ([text] or [text, shortcut]). */
export const lineText = (l) => (l.runs ? l.runs.map((r) => r[0]).join('') : l.text);

/** Type one line: plain text, or runs where a run with a shortcut is toggled on, typed, toggled off. */
export async function typeLine(p, line, delay = TYPE_DELAY) {
  if (!line.runs) { await p.keyboard.type(line.text, { delay }); return; }
  for (const [t, key] of line.runs) {
    if (key) await p.keyboard.press(key);
    await p.keyboard.type(t, { delay });
    if (key) await p.keyboard.press(key);
  }
}

/**
 * Build one blip whose editor already has the caret.
 * spec = { lines: [ { text | runs, hook?: async (p) => {}, anchors: [ { at: 'substring', child: spec } ] } ] }.
 * `at` is the exact substring AFTER which the inline child is anchored. A hook runs right after its line
 * is typed (caret at the end of the line). Returns the number of blips created (children included).
 */
export async function buildBlip(p, spec, log = () => {}, depth = 1, selfId = null) {
  let created = 0;
  const lines = spec.lines;
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) await p.keyboard.press('Enter');
    await typeLine(p, lines[i]);
    if (lines[i].hook) { await lines[i].hook(p, { depth, log }); }
  }
  await sleep(300);
  // anchors right-to-left, bottom line first
  let firstAnchor = true;
  for (let li = lines.length - 1; li >= 0; li -= 1) {
    const txt = lineText(lines[li]);
    const anchors = [...(lines[li].anchors || [])]
      .map((a) => ({ ...a, off: txt.indexOf(a.at) + a.at.length }))
      .sort((x, y) => y.off - x.off);
    for (const a of anchors) {
      if (a.off < a.at.length) throw new Error(`anchor "${a.at}" not in "${txt}"`);
      await refocusLine(p, selfId, li, a.off, lines.length, firstAnchor ? false : true);
      firstAnchor = false;
      const id = await ctrlEnterChild(p);
      if (!id) throw new Error(`Ctrl+Enter produced no child at depth ${depth} after "${a.at}"`);
      globalThis.__fsCreated = (globalThis.__fsCreated || 0) + 1;
      log(`${'  '.repeat(depth)}+ #${globalThis.__fsCreated} child ${id.slice(-5)} after "${a.at}"`);
      created += 1;
      created += await buildBlip(p, a.child, log, depth + 1, id);
      // finish the child (its own Done), as a person would, so the caret can come back to this blip
      const dn = p.locator(`[data-blip-id="${id}"] [data-testid="blip-menu-done"]`).last();
      if (await dn.isVisible().catch(() => false)) { await dn.click(); await sleep(900); }
    }
  }
  return created;
}
