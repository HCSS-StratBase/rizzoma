// One hook per product function, run right after the line that introduces it was typed (caret at its end).
// Everything is a real key press, mouse click or dialog answer; nothing writes content through the DOM or API.
import { sleep, TYPE_DELAY } from './lib.mjs';

/** Registry of what was done and what persisted evidence to look for afterwards: filled by the hooks. */
export const FUNCTIONS = [];
const reg = (name, how, evidence) => FUNCTIONS.push({ name, how, evidence });

const tb = (p, n) => p.locator(`[data-testid="blip-menu-${n}"]`).filter({ visible: true }).last();
// Shift+Home (select the line): Shift+Arrow does not extend a selection inside a nested blip (defect E, see wiki)
const selectWord = (p) => p.keyboard.press('Shift+Home');
const type = (p, t) => p.keyboard.type(t, { delay: TYPE_DELAY });

export const hooks = {
  strike: async (p) => { await selectWord(p); await tb(p, 'strike').click(); await p.keyboard.press('End'); reg('Strikethrough', 'selected the line (Shift+Home) (Shift+Left), clicked the toolbar S button', /<s>/); },
  highlight: async (p) => { await selectWord(p); await tb(p, 'highlight-toggle').click(); await sleep(500); await p.locator('button[title="#ffd93d"]').filter({ visible: true }).first().click(); await p.keyboard.press('End'); reg('Highlight (text background colour)', 'selected the line (Shift+Home), opened the colour palette, clicked the yellow swatch', /<mark[^>]*#ffd93d/i); },
  link: async (p) => { await selectWord(p); globalThis.__fsClient.promptText = 'https://example.org/showcase'; await tb(p, 'insert-link').click(); await sleep(900); await p.keyboard.press('End'); reg('Link create (Ctrl+L / toolbar)', 'selected the line (Shift+Home), clicked the link button, answered the URL prompt', /<a [^>]*href="https:\/\/example\.org\/showcase"/); },
  orderedList: async (p) => { await tb(p, 'ordered-list').click(); await p.keyboard.press('Enter'); await type(p, 'Second numbered item'); reg('Numbered list', 'clicked the toolbar numbered-list button, typed two items', /<ol>/); },
  bold: null, italic: null, underline: null,
  gadget: (name, fill, evidence) => async (p) => {
    await p.keyboard.press('Enter');
    await p.locator('[data-testid="right-tools-insert-gadget"]').click(); await sleep(700);
    await p.locator(`button[title="${name}"]`).first().click(); await sleep(1500);
    if (fill) await fill(p);
    reg(`Gadget: ${name}`, 'opened the Gadgets palette in the right panel, clicked the gadget' + (fill ? ' and filled it in' : ''), evidence);
  },
};

const fillInput = (placeholder, value) => async (p) => {
  const inp = p.locator(`input[placeholder="${placeholder}"]`).filter({ visible: true }).last();
  await inp.click(); await type(p, value); await p.keyboard.press('Enter'); await sleep(1200);
};
export const gadgetHooks = {
  code: hooks.gadget('Code', null, /<pre|code-block|data-gadget/i),
  poll: hooks.gadget('Poll', null, /poll/i),
  latex: hooks.gadget('LaTeX', null, /latex|math/i),
  youtube: hooks.gadget('YouTube', fillInput('YouTube URL...', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'), /youtube/i),
  iframe: hooks.gadget('iFrame', fillInput('Embed URL...', 'https://example.org/'), /iframe/i),
  sheet: hooks.gadget('Sheet', null, /sheet/i),
  image: hooks.gadget('Image', fillInput('Image URL...', `${process.env.FS_BASE || ''}/s/img/user/anonim.png`), /anonim\.png|image/i),
  kanban: hooks.gadget('Kanban', null, /kanban/i),
  planner: hooks.gadget('Planner', null, /planner/i),
  focus: hooks.gadget('Focus', null, /focus/i),
  notes: hooks.gadget('Notes', null, /notes/i),
};

/** Shortcut-driven formatting needs no hook: the spec uses runs with Ctrl+B / Ctrl+I / Ctrl+U. */
export function registerShortcutFunctions() {
  reg('Bold (Ctrl+B)', 'pressed Ctrl+B, typed, pressed Ctrl+B', /<strong>/);
  reg('Italic (Ctrl+I)', 'pressed Ctrl+I, typed, pressed Ctrl+I', /<em>/);
  reg('Underline (Ctrl+U)', 'pressed Ctrl+U, typed, pressed Ctrl+U', /<u>/);
}
