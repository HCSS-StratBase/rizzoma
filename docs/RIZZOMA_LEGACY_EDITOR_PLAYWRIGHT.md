# Scripting the legacy rizzoma.com editor via Playwright

**Audience:** Claude Code / Codex / Gemini agents driving `https://rizzoma.com` (the 2013-vintage Wave-derived production platform, NOT this repository's modernized fork) headlessly to add or edit BLB-shaped content.

**Companion docs (READ THESE FIRST):**
- **[BLB_LOGIC_AND_PHILOSOPHY.md](https://github.com/HCSS-StratBase/rizzoma/blob/master/docs/BLB_LOGIC_AND_PHILOSOPHY.md)** — the philosophical + structural spec for BLB. Sections 1–18 plus the §19 pre-commit checklist (added 2026-04-23). This document is the *operational mechanics* for satisfying that spec via headless browser automation. Read the philosophy first; then come here for the buttons-and-selectors. (Repo-relative, since you're reading this inside the same repo: [BLB_LOGIC_AND_PHILOSOPHY.md](BLB_LOGIC_AND_PHILOSOPHY.md))
- **[VPS_DEPLOYMENT.md](https://github.com/HCSS-StratBase/rizzoma/blob/master/docs/VPS_DEPLOYMENT.md)** — for the *modernized* Rizzoma fork on the HCSS VPS. Different editor stack (TipTap vs CKEditor); these mechanics do not apply there. (Repo-relative: [VPS_DEPLOYMENT.md](VPS_DEPLOYMENT.md))

**Project-instruction cross-reference:** [CLAUDE.md](https://github.com/HCSS-StratBase/rizzoma/blob/master/CLAUDE.md) "BLB structure" block summarizes this for every Rizzoma session; [SYSTEM_INSTRUCTIONS.md](https://drive.google.com/file/d/1e8x0pcGcQynD4t7kDaKPi2fvpXKXYO8U/view?usp=drivesdk) summarizes it system-wide for all three CLI tools (Claude / Codex / Gemini). Auto-memory (local-only, no public URL): `~/.claude/projects/-mnt-c-Rizzoma/memory/feedback_blb_fractal_bullets_required.md`.

---

## TL;DR — six rules learned the hard way

Each rule is a thing I got wrong on 2026-04-23 trying to add 5 BLB-correct sibling bullets under the Hetzner blip in the *HTU licenses/creds/passwords* topic. Each rule is the diff between failure and success.

1. **Toolbar buttons need real Playwright `page.locator(...).click()`.** Never `btn.click()` from inside `page.evaluate(...)`. JS-synthetic clicks fire the click event but skip the full mousedown / mouseup / focus / blur chain. The `≡` Bulleted-list toggle visually changes the DOM when JS-clicked, but the change DOES NOT SURVIVE save — the editor persists as `<ul>` containing `<div>` children (an invalid hybrid). Real Playwright clicks make the toggle actually take effect.
2. **`page.keyboard.type()` triggers Rizzoma's inline-widget autocomplete for `#`/`@`/`~`** (per BLB §18f — these are widget triggers for #tag, @mention, ~task). Typing them via `keyboard.type()` opens the autocomplete popup, transforms the typed text into a widget span (`<span class="blip-tag">#wsMMV3d9rH</span>` — note the `+` got stripped), AND consumes the next Enter keypress so the following bullet jams onto the same line. **Workaround:** `page.keyboard.insertText()` for any text containing `#@~$*<>`. (`$` and `*` get dropped by `keyboard.type()` independent of widgets — same fix.)
3. **Disambiguate `.js-change-mode` buttons.** Edit and Done share that class. Use `button[title^="Done"]` for Done in the active edit-mode subblip, `button[title^="To edit"]` for Edit in the active view-mode blip. Otherwise `.first()` picks the wrong one and you click the parent's Edit button instead of the subblip's Done.
4. **Wait ≥3.5s after clicking Hide before navigating away.** Otherwise you trip a `beforeunload` dialog mid-autosave and the latest bullet's content gets lost. The autosave cycle on legacy Rizzoma is ~2-3s.
5. **Ctrl+Enter URL doesn't update synchronously.** The subblip IS created and the editor IS in edit mode, but `page.url()` keeps returning the parent URL for several seconds. Detect the new subblip via DOM (`.blip-container.active.edit-mode` with a fresh `<div><br></div>` editor), not URL polling.
6. **JS-set selection works AFTER real Playwright click establishes focus.** The pattern: `page.locator(...).click()` to focus the editor (real events fire), then `page.evaluate(() => { sel.removeAllRanges(); sel.addRange(range); })` to position the cursor precisely. Just `page.evaluate` for both leaves the editor un-focused as far as Rizzoma's input handlers are concerned.

---

## Verified-working selectors (legacy rizzoma.com, 2026-04-23)

| Element | Selector |
|---|---|
| Edit button (in view mode of active blip) | `.blip-container.active button[title^="To edit"]` |
| Done button (in edit mode of active subblip) | `.blip-container.active.edit-mode button[title^="Done"]` |
| Hide / collapse button (in view mode) | `.blip-container.active button.js-is-folded-by-default` |
| Bulleted list toggle (in edit mode) | `.blip-container.active.edit-mode button[title="Bulleted list"]` |
| Numbered list toggle (in edit mode) | `.blip-container.active.edit-mode button[title="Numbered list"]` |
| Active editor (contenteditable) | `.blip-container.active.edit-mode .js-editor.editor` |
| Existing list items in editor | editor `:scope > li` |
| `[+]` subblip marker (rendered in view mode) | `span.blip-thread.folded` |
| `[+]` fold-button container | `div.fold-button-container` |
| Insert reply (sidebar) — same as Ctrl+Enter | `.active-blip-control.insert-reply.js-insert-reply` (NOTE: clicking via Playwright is intercepted by overlapping `<li>` — use Ctrl+Enter instead) |

---

## Reference flow — adding one BLB-correct sibling bullet under an expanded parent blip

This is the worked-example mechanic for "add one new label-with-bulleted-body subblip" — repeated as a unit for each new sibling.

```javascript
// Pre-condition: parent blip is the active.expanded blip on the page.
// Auto-dismiss any beforeunload dialogs that interrupt mid-save.
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });

// Step 1. Click Edit on the parent blip — REAL Playwright click.
await page.locator('.blip-container.active button[title^="To edit"]').first().click();
await page.waitForTimeout(800);

// Step 2. Position cursor at end of the last existing bullet (so Enter creates a new sibling, not a child).
await page.evaluate(() => {
  const editor = document.querySelector('.blip-container.active.edit-mode .js-editor.editor');
  const items = Array.from(editor.querySelectorAll(':scope > li'));
  const last = items[items.length - 1];
  const sel = window.getSelection();
  const range = document.createRange();
  let lastTextNode = null;
  const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) lastTextNode = walker.currentNode;
  range.setStart(lastTextNode, lastTextNode.nodeValue.length);
  range.setEnd(lastTextNode, lastTextNode.nodeValue.length);
  sel.removeAllRanges();
  sel.addRange(range);
});

// Step 3. End → Enter → type ATOMIC label (2-5 words, no parens/em-dashes joining ideas).
await page.keyboard.press('End');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
await page.keyboard.type('Robot webservice');   // atomic label per BLB §19 row 2

// Step 4. Ctrl+Enter to create the [+] subblip (cursor now lands inside the new empty subblip's editor).
await page.keyboard.press('Control+Enter');
await page.waitForTimeout(2000);   // wait for new subblip to mount; URL may NOT have updated yet

// Step 5. CRITICAL — REAL Playwright click on the Bulleted list toolbar button BEFORE typing body.
//         This converts the empty <div><br></div> into <ul><li><br></li></ul>.
await page.locator('.blip-container.active.edit-mode button[title="Bulleted list"]').first().click();
await page.waitForTimeout(500);

// Step 6. Refocus selection inside the new <li>.
await page.evaluate(() => {
  const editor = document.querySelector('.blip-container.active.edit-mode .js-editor.editor');
  editor.focus();
  const firstLi = editor.querySelector(':scope > li');
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(firstLi);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
});

// Step 7. Type body bullets — keyboard.type() for plain text; insertText() for any line with #@~$*<>.
async function typeMixed(text) {
  if (/[#@~$*<>]/.test(text)) {
    await page.keyboard.insertText(text);
  } else {
    await page.keyboard.type(text);
  }
}
const bullets = [
  'User #ws+MMV3d9rH',                                  // # → insertText
  'Password 5Js4m@rMKuEAWG7',                           // @ → insertText
  'URL https://robot-ws.your-server.de',                // plain → type
  'Verified 2026-04-23',                                // plain → type
  'Endpoints: /server, /boot/<ip>/rescue, /reset/<ip>', // < → insertText
];
for (let i = 0; i < bullets.length; i++) {
  await typeMixed(bullets[i]);
  if (i < bullets.length - 1) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
  }
}
await page.waitForTimeout(500);

// Step 8. Verify HTML structure BEFORE clicking Done — pre-commit BLB check (BLB §19 row 1).
const verify = await page.evaluate(() => {
  const editor = document.querySelector('.blip-container.active.edit-mode .js-editor.editor');
  const items = Array.from(editor?.querySelectorAll(':scope > li') || []);
  return { tag: editor?.tagName, itemCount: items.length };
});
if (verify.tag !== 'UL' || verify.itemCount !== bullets.length) {
  throw new Error(`BLB structure check failed: ${JSON.stringify(verify)}`);
}

// Step 9. Done — disambiguate via title^="Done" because .js-change-mode is shared with Edit.
await page.locator('.blip-container.active.edit-mode button[title^="Done"]').first().click();
await page.waitForTimeout(1500);

// Step 10. Hide — collapses the subblip back to a [+] marker on the parent's bullet.
await page.locator('.blip-container.active button.js-is-folded-by-default').first().click();

// Step 11. CRITICAL — wait for autosave to commit BEFORE navigating away (otherwise beforeunload trips and content is lost).
await page.waitForTimeout(3500);
```

To recurse into a deeper level (a body bullet that itself needs a [+] subblip with further children), repeat steps 4–10 from the new `<li>`'s end position.

---

## Things I tried that did NOT work

| Attempt | What broke |
|---|---|
| `btn.click()` from inside `page.evaluate(() => …)` for the bullet-list toggle | Visual DOM change happened, but didn't survive save — editor persisted as `<ul>` with `<div>` children. Use real `page.locator(...).click()`. |
| `page.locator('.active-blip-control.insert-reply.js-insert-reply').click()` for the sidebar Insert-reply button (alternative to Ctrl+Enter) | Click intercepted by overlapping `<li>` element — Playwright timed out at 30s. Use `page.keyboard.press('Control+Enter')` instead. |
| `page.keyboard.type('User #ws+MMV3d9rH')` | Triggered Rizzoma's `#tag` autocomplete; transformed text into a `<span class="blip-tag">#wsMMV3d9rH</span>` widget (the `+` was stripped) and ate the next Enter keypress, jamming the following bullet onto the same line. Use `insertText()` for `#@~`. |
| `page.keyboard.type('S#$k5dZ*JEbb7GJ')` for a password with `$` and `*` | Both special chars dropped; got `S#k5dZJEbb7GJ`. Use `insertText()` for `$*`. |
| URL polling after Ctrl+Enter to detect navigation into new subblip | URL doesn't update synchronously; polling timed out even though the new subblip WAS created and active. Detect via DOM (`.blip-container.active.edit-mode` with a fresh empty editor) instead. |
| Calling Done + Hide + immediate `page.goto(parent)` | Tripped `beforeunload` mid-autosave. Most-recently-typed content was lost. Wait ≥3.5s between Hide and navigation. |
| Selecting all + Delete via `page.evaluate` with selection ranges, no real click on the editor first | Selection was technically set but Rizzoma's keydown handler didn't see the editor as the focused element. Real `page.locator(editor-or-button).click()` first, THEN evaluate-set selection works. |

---

## What this doc does NOT cover

- The modernized Rizzoma fork in `/mnt/c/Rizzoma/src/` — that uses TipTap with `BlipThreadNode`, different selectors entirely. See `BLB_LOGIC_AND_PHILOSOPHY.md` §17 (BlipThread Implementation) for the modern stack.
- Adding gadgets (YouTube embeds, polls, code blocks) — different code path; see BLB doc §18g.
- Inline @mention / ~task widgets when you actually WANT them — type `@`/`~` via `keyboard.type` (NOT insertText) so the autocomplete fires; pick from the dropdown via `keyboard.press('Enter')` to confirm.
- Multi-user collab considerations (presence, cursors) — the legacy editor's CRDT-equivalent operates fine under Playwright but can race with other simultaneous editors.

---

**Last updated:** 2026-04-23 (created during the Hetzner-blip BLB rebuild that codified all six rules above).
