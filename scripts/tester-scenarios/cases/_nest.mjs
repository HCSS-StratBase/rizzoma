// Helpers shared by the nesting / persistence cases.
import { plain, sleep } from '../lib.mjs';

/** Level-1 blip from the topic reply box, then open it and put the caret in its editor. */
export async function startL1(c, text) {
  await c.replyAtTopic(text);
  await c.expandRow(text);
  await c.enterEditByClick(text);
}

/** Stored-text lookup. Returns { byText, list }. */
export async function stored(c, topicId) {
  const list = await c.blips(topicId);
  return { list, byText: (t) => list.find((b) => plain(b.content) === t) };
}

/**
 * Assert every expected {text, parent} sits in its own blip under the right parent, and that each
 * parent's body carries an inline marker for each child (so nothing is orphaned).
 */
export async function expectTree(ctx, c, topicId, expected, label) {
  const { list, byText } = await stored(c, topicId);
  const texts = list.map((b) => JSON.stringify(plain(b.content))).join(' ');
  for (const e of expected) {
    const b = byText(e.text);
    ctx.ok(!!b, `${label}: "${e.text}" is stored in a blip of its own`, `stored: ${texts}`);
    if (!b) continue;
    if (e.parent) {
      const p = byText(e.parent);
      ctx.ok(!!p && b.parentId === p.id, `${label}: "${e.text}" is a child of "${e.parent}"`, `parent=${String(b.parentId || '-').slice(-6)} want=${String(p?.id || '?').slice(-6)}`);
      if (p && e.inline !== false) ctx.ok(String(p.content).includes(b.id), `${label}: "${e.parent}" keeps an inline marker for "${e.text}"`);
    }
  }
  ctx.ok(list.every((b) => !b.parentId || list.some((p) => p.id === b.parentId)), `${label}: no blip points at a missing parent`);
  return list;
}

/** Same expectation from a second signed-in client (the other user). */
export async function expectSecondClient(ctx, other, topicId, expected, label) {
  const list = await other.blips(topicId);
  const texts = list.map((b) => plain(b.content));
  for (const e of expected) ctx.ok(texts.includes(e.text), `${label}: second client sees "${e.text}"`, texts.join(','));
}

export { plain, sleep };
