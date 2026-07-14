# BLB — the Bullet-Label-Blip specification

**Status:** AUTHORITATIVE. Supersedes `deprecated/BLB_LOGIC_AND_PHILOSOPHY.md`,
`deprecated/BLB_PARITY_CHECKLIST.md`, `deprecated/INLINE_COMMENTS_VS_REPLIES.md`.
**Last reviewed:** 2026-07-14.

> **Every rule below is labelled.** This is the whole point of this document.
> The old rizzoma.com and our new app are NOT the same product, and conflating
> them is what produced the 2026-07-14 bug where nested blips persisted as bare
> `<p>` while one doc said bullets were mandatory and another said a blip was a
> "blank sheet".
>
> | Label | Meaning |
> |---|---|
> | **[BOTH]** | True of old rizzoma.com AND our app. Do not diverge. |
> | **[OLD]** | True of old rizzoma.com only. Descriptive — do NOT implement. |
> | **[NEW]** | A deliberate decision for OUR app. Implement and gate. |

---

## 1. The idea [BOTH]

Rizzoma is not a chat app and not a document editor. It is a **fractal outliner**.

- **Bullet** — the visual marker of a line.
- **Label** — the first line of a blip; it is a table-of-contents entry, not a sentence.
- **Blip** — the body, visible only when you drill into it.

One thought = one blip. Detail goes **deeper** (a child blip), never **wider** (a longer
paragraph). Top-level blips are structured; their children are structured; recursively.

**Why:** you can link to a *thought*, not a text block; readers scan labels and ignore the
rest; the structure is the same at every zoom level.

## 2. Topic = meta-blip [BOTH]

A topic IS a blip — the root. Its **title is simply the first line** of that blip's content
(styled H1 by default, editable like any text). Everything below is the same recursion:
body content, inline `[+]` children at anchor positions, reply blips at the bottom.
It's blips all the way down.

## 3. Collapse-by-default [BOTH]

Blips render **COLLAPSED**. The reader sees only labels + a `[+]` affordance, i.e. a clean
table of contents, and drills into the branches they care about. Expanding a parent does
**not** expand its children — you traverse one level at a time.

*Gate:* `handbuild_acceptance.mjs` asserts that after a reload, deep labels are NOT visible
and a `[+]`/folded-thread affordance exists.

## 4. Two ways to create a child blip [BOTH]

| | **Inline comment** | **Reply** |
|---|---|---|
| Created by | **Ctrl+Enter** at the cursor, while editing | the "Write a reply…" box at the bottom |
| Anchored to | **that exact point** in the parent's content | the parent blip **as a whole** |
| Renders | **inline**, at the cursor position | at the **end** of the parent's content |
| Use for | annotating/expanding a specific phrase | responding to the overall thought |

Both are **complete blips**: own content, author, timestamp, children, toolbar. Recursive.

## 5. 🟥 Body structure — WHERE OLD AND NEW DIVERGE

**[OLD] rizzoma.com:** a new blip is a *blank sheet*. The user decides: a bulleted list, or
plain unbulleted prose, or a heading. The collapsed label shows the first line of whatever
was written — **not necessarily bulleted**.

**[NEW] our app: BULLETS ARE IMPOSED. Every blip body IS a bulleted list.**
This is a deliberate product decision by SDS (re-confirmed 2026-07-14: *"I DO want a
bulleted list by default in every blip! That's one of the changes I wanted to make"*). It is
not a description of the old app — it is a divergence from it, on purpose, because
BLB structure decays the moment prose is allowed to creep in.

Concretely, in **our** app:

1. A newly created child blip is seeded `<ul><li><p></p></li></ul>` server-side.
2. The editor must NEVER initialise an empty body as a bare `<p>` — `ensureBulletedBody()`
   in `RizzomaBlip.tsx` guards **all three** content-injection sites (including the
   enter-edit *listener* path, which does not go through `handleStartEdit` — that omission
   is exactly why the first fix attempt did nothing).
3. A persisted blip body whose HTML has no `<li>` is a **BUG**, not a user choice.

*Gates:* `rizzoma_sanity_sweep.mjs` check #7 ("new Ctrl+Enter blip starts bulleted");
`handbuild_acceptance.mjs` ("EVERY authored blip body is `<ul><li>`, not `<p>`/`<div>`").

*(The user may still apply headings/formatting inside a bullet. What is forbidden is a body
with no list structure at all.)*

## 6. Pre-commit BLB checklist [BOTH] — run at every level before saying "done"

| # | Check | Concrete test |
|---|---|---|
| 1 | **Bullet structure exists** | Dump `editor.innerHTML` before Done: any `<div>`/`<p>` body block instead of `<li>` = **FAIL**. |
| 2 | **Labels are atomic** | First line is 2–5 words, one thought, scannable as a ToC entry. No parentheses, em-dashes or commas joining ideas. Read it aloud: ToC entry, or sentence? Sentence = FAIL. |
| 3 | **No prose body** | If a line would have a period in the middle, it is at least two bullets. |
| 4 | **Detail goes deeper, not wider** | Any bullet with ≥2 sub-thoughts gets its own `[+]` child. Trigger words: commas joining siblings, slashes joining options, `and/also/which/because`, a colon followed by a list. |
| 5 | **Parent renders as a clean ToC** | Collapse all → only labels-with-`[+]` visible. Prose visible in collapsed view = restructure. |

## 7. Visual mandates [BOTH]

- Collapsed child → `[+]`; expanded → `[−]`. (Historic docs mentioning a `□` icon are wrong.)
- A child renders **inside** its parent's box (contained boxed nesting), not as a diagonal
  ladder marching off to the right. Per-level indent ≈ the LI's own step (~22px in the
  original; ours is ~34px — see `ARCHITECTURE.md` for the residual).
- Fold/unfold **never destroys the subtree** — draft text, scroll and focus survive a
  collapse/expand cycle.

## 8. Acceptance [NEW]

No BLB/fractal claim is admissible without a **hand-build through the real UI**:
`scripts/handbuild_acceptance.mjs` — real clicks, real Ctrl+Enter, real typing, a PNG after
**every** atomic action (each one eyeballed), branching as well as descending, fold-by-default
asserted on reload, a second client, and a structural probe that every level is `<ul><li>`.

Fixture-expansion, sweep-gate counts and pixel measurements are **not** acceptance: on
2026-07-14 all of them passed green while the fractal was dying at depth 3 and every nested
blip was an unbulleted paragraph. Enforced by `check-rizzoma-parity-gate.mjs`.

## 9. Where the details live

- The original's content model (flat `LINE`/`TEXT`/`BLIP` array, one linear walk) and why our
  React/TipTap hybrid keeps cracking against it → **`ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md`**.
- The prescribed fix (the native port) → **`NATIVE_RENDER_PORT_PLAN.md`**; its true state → **`../STATUS.md`**.
- Historical BLB study notes, screenshots and the superseded philosophy doc → **`deprecated/`**.
