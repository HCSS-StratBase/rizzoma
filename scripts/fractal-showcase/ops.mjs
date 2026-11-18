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
}

/** Ctrl+Enter at the caret, then wait for a NEW blip to own the focus. Returns its id. */
export async function ctrlEnterChild(p, tries = 3) {
  const before = new Set(await blipIds(p));
  const parent = await focusedBlipId(p);
  for (let k = 0; k < tries; k += 1) {
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
 * Build one blip whose editor already has the caret. `spec` = { lines: [ {text, anchors:[{at:'word', child:spec}] } ] }.
 * `at` is the exact substring AFTER which the inline child is anchored.
 * Returns the number of blips created (children included).
 */
export async function buildBlip(p, spec, log = () => {}, depth = 1) {
  let created = 0;
  const lines = spec.lines;
  await typeLines(p, lines.map((l) => l.text));
  await sleep(300);
  // anchors right-to-left, bottom line first
  for (let li = lines.length - 1; li >= 0; li -= 1) {
    const anchors = [...(lines[li].anchors || [])]
      .map((a) => ({ ...a, off: lines[li].text.indexOf(a.at) + a.at.length }))
      .sort((x, y) => y.off - x.off);
    for (const a of anchors) {
      if (a.off < a.at.length) throw new Error(`anchor "${a.at}" not in "${lines[li].text}"`);
      await caretAt(p, lines[li].text.slice(0, 18), a.off);
      const id = await ctrlEnterChild(p);
      if (!id) throw new Error(`Ctrl+Enter produced no child at depth ${depth} after "${a.at}"`);
      log(`${'  '.repeat(depth)}+ child ${id.slice(-5)} after "${a.at}"`);
      created += 1;
      created += await buildBlip(p, a.child, log, depth + 1);
    }
  }
  return created;
}
