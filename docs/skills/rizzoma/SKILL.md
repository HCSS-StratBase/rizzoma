---
name: rizzoma
description: Read from or post/reply to a rizzoma.com topic or blip (the HCSS legacy Rizzoma collaboration tool). Use WHENEVER the user asks to read, check, extract, find feedback on, open, reply to, or post to anything on rizzoma.com — or gives a rizzoma.com/topic/... URL. Rizzoma's legacy editor has quirks that make naive Playwright fail; this skill encapsulates the documented, working procedure AND the house content style. NEVER improvise raw Playwright against rizzoma.com — use this.
---

# Rizzoma read / post

**Golden rule:** rizzoma.com is a *documented-procedure* system. Do NOT hand-roll Playwright. Use the bundled script for reading; follow the canonical docs for posting. Reading "worked" once with ad-hoc Playwright but silently missed folded content — that's the trap this skill exists to prevent.

**Second golden rule (added 2026-06-12 after the "verdict 260612" failure):** mechanics passing is NOT the bar. A post can be structurally perfect (UL/LI, folded, atomic, gate-green) and still be **communicatively dead**. The CONTENT STYLE section below is binding — a post that violates it gets rejected by the user even if every selector worked.

## Auth (already set up)
Authenticated session state lives at `/mnt/c/Rizzoma/scripts/rizzoma-session-state.json`. Every Playwright run loads it headlessly:
`ctx = browser.new_context(storage_state="/mnt/c/Rizzoma/scripts/rizzoma-session-state.json")`.
If it has expired (rare; Google SSO lasts weeks): re-create by running `/mnt/c/Rizzoma/scripts/rizzoma_export_via_cdp_simple.bat` Windows-side (complete the SSO, it rewrites the json).

## READING — use the bundled script
```
python3 ~/.claude/skills/rizzoma/rizzoma_read.py "<topic-or-blip-URL>" ["optional label to focus, e.g. feedback"]
```
It loads the session, navigates, focuses the smallest blip-thread containing the label, unfolds everything, and prints the readable text (+ saves `/tmp/rizzoma_read_out.txt` and the link map).

**Caveat (2026-06-12):** the script's flat text dump loses the anchor→href mapping and the per-blip tree structure. When you need to know WHERE something lives (which LI, which [+], what links to what), run a structural probe: walk `.blip-container`s, extract per-LI `directText` (text up to the first `.blip-thread` child), `[+]` presence/folded state, and `a[href]` pairs. External artifacts are referenced as **hyperlink-wrapped labels** (e.g. "sample", "responses", "file" → Google Sheets/Drive) — check `a[href]` FIRST before hypothesizing hidden subblips.

**Why naive Playwright fails (the gotchas the script handles):**
- **`.click()` / `click(force=True)` SILENTLY FAIL on Rizzoma's CSS-hidden buttons.** Use a native in-page click via `page.evaluate("el => el.click()")` or `locator.dispatch_event('click')`. (Documented 2026-05-02.)
- Content is **folded by default**; you must unfold (`.js-fold-button.fold-button` / `.folded`, native-clicked, looped) or you read empty labels.
- **Find the SMALLEST `.blip-thread` whose `innerText` contains your target label** — parent threads include children's text recursively, so the smallest is the label-owner.
- Blip content is also embedded as JSON `{"t":"…"}` runs in the page HTML — the script mines these as a fallback for content that won't unfold.
- A URL fragment `…/<topic>/<blip-id>/` can resolve to a *different* blip after Playback restorations — prefer focusing by label.

## CONTENT STYLE — the house register (BINDING; codified 2026-06-12 from a deep survey of real threads)

The fractal-bullet docs govern STRUCTURE. They do NOT mean telegraphic stub-trees. Survey of the live HCSS topics (LLM Benchmarks, keyphrase-pipeline, CLAS RuBase) established the actual register:

1. **Write full, readable sentences.** Real bullets: *"Overall: mee and Fable agree on 48 out of 60 chunks (80%)."* / *"Relevant chunks prioritised by lowest confidence + most TEs (hardest cases first)"*. NOT compressed fragments like "8 splits her-no GT-yes". The §19 "atomic label" rule applies ONLY to labels that anchor `[+]` subblips (TOC entries) — body/leaf bullets are complete statements with parentheticals and interpretation.
2. **Write for the OTHER reader.** Gloss every internal term inline: *"(proportional to the 115/85 GT split)"*. Never assume the reader knows your session's jargon, file names, rule codes, or chunk IDs. If you must use a code (":29697"), say what it is in the same sentence.
3. **Claims carry evidence behind `[+]`.** House pattern: *"example 1 [+]"* opens the FULL verbatim source text; *"Claude reasoning [+]"* opens the model's actual justification. A number or claim with nothing behind it is a dead end — either hang the evidence on a `[+]` or link the artifact.
4. **Numbers come with their meaning** (*"✓ = full agreement"*, *"— the single most common score"*), and key numbers get **bold** (S7 mechanics) or CAPS emphasis in conversational replies (*"we HAVE"*, *"does NOT pass"*).
5. **Long bodies = bold inline section headers + bullets** (*"Comparison to FABLE:"*, *"My general assessment:"*), NOT everything fragmented into separate `[+]` stubs. Use `[+]` for evidence and dialogue, not as a paragraph substitute.
6. **It's a DIALOGUE.** Respond WHERE the conversation lives: inline `[+]` anchored at the exact line being answered (mid-sentence anchors are normal), or a reply under the blip. NEVER edit someone's list to bolt your row in; never broadcast a monolith blip that answers things said elsewhere.
7. **The proven register for substantive analysis** is structured prose with bold lead-ins and numbered points + `[+]` evidence anchors (this earned "I agree! Great job (again)" in the LLM-Benchmarks topic). Use it for analytic responses.
8. **Link EVERY mention that has a home — exhaustively, not just the obvious artifacts.** Files, sheets, folders ("file", "sample", "responses"), but ALSO: other blips/topics referenced ("the human-smelltest blip", "this topic" when cross-topic), repos/docs, and concept-mentions whose evidence lives at a URL ("fractal blips" → the blip where they live). Hyperlink-wrapped labels, never bare URLs. Audit question before Done: "is there ANY phrase here a reader would want to click?" — if yes and it has a URL, wrap it. (2026-06-12: SDS flagged an entry where only 2 of ~6 linkable mentions were wrapped.)
9. **Labels are natural phrases** ("Liliia's list", "part 1: extracting first-order keyphrases", a bracketed status line with inline [+]). Bare `YYMMDD` labels belong ONLY in Progress blips (S0); do not import that convention elsewhere.
10. **Replies must be FRACTAL too — depth is not optional.** A flat 10-bullet reply is wrong even when every sentence is good: any line carrying >=2 sub-thoughts (a breakdown, a list of examples, a multi-part rationale, a next-steps block) becomes a short readable label-line with its own `[+]` holding the detail (M11 applies to replies, not just reference blips). The collapsed reply should scan as 4-7 label-lines; the substance lives one click down. THAT is the whole point of Rizzoma.
11. **Exemplar to imitate:** topic `22e5039608c984fff50bffcac157292b` blip `0_b_cj78_cngln` — narrative summary line up top (with inline links + [+]), descriptive section labels with [+], explanatory walkthrough bullets ("how it would/should work: …"), worked examples inline ("to illustrate: negotiate / negotiation / talk → 'negotiation'"), conversational [+] exchanges at every depth.

12. **Voice = first-person-as-Claude, with explicit attribution (team feedback, 2026-06-12).** Posts go out from Stephan's account, so third-person narration about Stephan ("Stephan ruled on the boundary") reads uncanny, and pure unmarked first person = impersonation. The fix: identify as Claude once (an attribution line or opening marker), then write first person ("I scored these 35..."), addressing Stephan by name/second person naturally. Liliia: "I did not really figure out that it was written by Claude" — transparency beats mimicry.
13. **Be terser — point-first, no recaps (team feedback).** "You wouldn't write such a long summary of what we did and would instead get straight to the point." The thread already holds the context; don't re-summarize it. Lead with the new fact/verdict; background goes behind a [+] if needed at all.
14. **Mix in-body hierarchy with subblips (team feedback).** The most "rizzomatic" texture is bullets + Tab-indented SUB-bullets inside one blip body for short detail, with [+] subblips reserved for detail that gets LONG ("no hard rule" — their words; hierarchical lists are easier to follow until length forces a split). Mechanics: the Tab-demote pattern works in subblip editors (NOT the root meta-blip, where Tab is absorbed). My 2026-06-12 builds used only flat-LIs+subblips — under-using in-body depth was the gap they flagged.
15. **CAPS emphasis works but is Stephan's fingerprint** — keep using it (it read perfectly), but only together with rule 12's attribution, otherwise it actively misleads readers about authorship.

**Pre-post content check (run BEFORE the mechanical gate):** (a) would the named recipient understand every line without your session context? (b) does every claim/number have its evidence behind a [+] or a link? (c) is it anchored where the conversation lives? (d) read it aloud — does it sound like a colleague talking, or like log output? Log output = rewrite.

## POSTING — read the docs FIRST, then follow them exactly
Posting is BLB-structured (fractal bullets, mandatory) and has its own hard procedure. Before posting, read, in order:
1. `BLB_LOGIC_AND_PHILOSOPHY.md` (HCSS-StratBase/rizzoma GitHub) — the fractal-bullet philosophy + §19 pre-commit checklist. NOTE: the local `/mnt/c/Rizzoma/docs/` copy LACKS §19 — fetch the GitHub copy for it.
2. `RIZZOMA_LEGACY_EDITOR_PLAYWRIGHT.md` (GitHub only, not in the local clone) — 7 operational rules (real `dispatch_event` clicks, `insertText` for `#@~$*<>`, ≥3.5s autosave, the `type('x')+Backspace+Ctrl+Enter` unblock trick).
3. `/mnt/g/My Drive/Tana/RIZZOMA_BLIP_EDITING_PROCEDURE.md` — selectors + the smallest-blip-thread recipe + cursor positioning + S0–S12 (incl. S4 nested-subblip edit-mode Ctrl+Enter, S10 attended cadence, S11 hyperlink recipe).
4. The **M1–M11 BLB construction mechanics** + the 11-check verification gate in the user's global `CLAUDE.md`.
Key posting facts: BLB = every blip body is itself bulleted (`<ul><li>`, never `<div>`); `dispatch_event('click')` for the bullet toggle; `Ctrl+Enter` works from a NESTED subblip's edit-mode (S4) and from VIEW state elsewhere; hide-by-default via `button.js-is-folded-by-default`; full re-nav per subblip iteration; deletes are their own isolated run (never paired with a rebuild); run the 11-check gate AND the content-style check before declaring done.

## Canonical references
- Procedure: `/mnt/g/My Drive/Tana/RIZZOMA_BLIP_EDITING_PROCEDURE.md`
- Session/export scripts: `/mnt/c/Rizzoma/scripts/` (`rizzoma_export_via_cdp.py`, `rizzoma_headful.py`)
- Project: `/mnt/c/Rizzoma/CLAUDE.md`
- Style exemplars: blip `0_b_cj78_cngln` (keyphrase pipeline) and Liliia's assessment blips in the same topic
