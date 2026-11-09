# Parity audit, 9 November 2026 (night)

Verdict: **FAIL. Not deployable.** The current `feature/native-fractal-port` branch (7fee6d4e plus uncommitted layout fixes in `InlineHtmlRenderer.tsx` and `RizzomaBlip.css`) regresses core behaviour that this morning's live code had. The live app is back on this morning's code (rolled back 21:50).

Everything below ran on the local dev stack (`FEAT_ALL=1`), with nothing written to live. The two builds compared:
- **branch:** `~/rizzoma-ci`, the state described above;
- **morning:** this morning's live code rebuilt in `~/rizzoma-morning`, i.e. commit c492be39 plus the 23 uncommitted server edits (`wip.patch`) plus the untracked files. Two packages had to be added locally for it to build (`@tiptap/suggestion` 2.27.2, `y-prosemirror` 1.3.7); live already had them.

Comparison sheets: this folder, built from the pair list in `scripts/build_parity_comparisons.py`, with the current file matched by name.

## Measured counts

| Check | morning | branch |
|---|---|---|
| Behavioural gate `scripts/handbuild_acceptance.mjs` (depth 10) | **23 of 27 pass** | **4 of 10 pass** |
| Ctrl+Enter opens an editable, focused child | L2 to L10 all pass | L2 pass, **L3 fails** (`editable=0 focused=false`), so the rest of the tree is never built |
| Tree collapsed after reload | pass | pass, but trivially: the deep levels were never created |
| Every authored label persists after reload | fails only for the L1 label | 9 labels missing |
| Second client sees the whole tree | fails only for the L1 label | 9 labels missing |
| Every blip body is `<ul><li>` | pass | fail |
| Root Edit button exists; root accepts typing | fail | fail (same on both builds, so probably the gate's selector; not verified) |
| Visual sweep (element-count gates) | 14 captures, then stopped (the sweep script is newer than this code) | 44 of 44 "pass" |
| Legacy/current comparison sheets | not built | 22 built, 16 looked at by eye |

The sweep's 44/44 measures only that elements exist. The behavioural gate shows the branch cannot build a tree past depth 2.

## Severe failures

1. **Ctrl+Enter breaks at depth 3** (behavioural gate, branch only). A regression from this morning; cause not yet traced.
2. **Deep nesting layout collapses** (sheet `fractal_deep_vs_depth10`). From depth about 6, the boxes stop short of the right edge, avatars jump left over the text, and the column narrows. Legacy keeps every level full width with the avatar at the right.
3. **Mind map is not drawn** (sheet `mindmap_vs_mindmap`). Selecting Mind map leaves the text tree; the screenshot is identical to the text view. Legacy shows a horizontal mind map. The sweep passed only because the button became active.
4. **Search shows "Loading…" with no results** (sheet `search_vs_search`). Legacy lists the matches.
5. **Live findings from SDS (this evening's deploy, not re-tested here):** expand/collapse all, the Next button, collapsed-by-default and Send failed. SDS also could not edit: on live, SDS's real account owns 2 of 130 topics and is a participant in none, and master's sharing rules then deny editing.

## Other differences seen by eye

- **Topic card (all topic sheets):** a rounded, shadowed white card and a yellow "Google Calendar" banner on every screen. Legacy shows the banner only as a dismissible tip inside the topic, and draws the topic flat.
- **Active blip (`blip_menu_vs_read_toolbar`, `fractal1_vs_fractal`):** our active blip gets a blue frame and a full-width toolbar. Legacy shows a compact menu floating at the blip's first line.
- **Gear menu (`gear_vs_gear`):** ours has 8 items (Copy comment, Paste as reply, Duplicate blip, Cut blip, Send, Copy link, Playback, Delete blip). Legacy has 3 (Copy comment, Copy link, Playback).
- **Invite (`invite_vs_invite`):** ours lists the owner as "Participant <email>". Legacy shows the name, email and "Owner".
- **Share (`share_vs_share`):** ours is a centred modal with Cancel/Save. Legacy is a popover under the Share button that applies immediately.
- **Playback (`playback_vs_playback`):** ours captures a per-blip version modal. Legacy replaces the topic in place with a playback bar (date, step buttons, Copy, Paste as reply).
- **Mobile (`mobile_vs_mobile`):** a dark "Topic" bar, heavy padding and a floating Next. Legacy has a teal toolbar with Edit and icons, and nested boxes running edge to edge.
- **Tag row (topic "Russian Red Lines - 2026", legacy 240):** the tag got a bullet and the bullets were indented. Fixed locally (uncommitted, looked at). Legacy `010-topics-list-default` shows the same pattern for `#MetaTopic` and confirms the intended look.

## Legacy/current comparisons

- **Built:** 22 sheets in this folder. `signup_vs_signup` is missing, because the sweep has no sign-up capture.
- **Looked at (16):**
  - topic_view, fractal1, fractal_deep, folded_toc;
  - blip_menu, edit_ribbon, gear, link_popup;
  - topics_list, search, playback, share, invite;
  - mobile, mindmap, textview.
- **Not looked at yet (6):** signin, mentions, tasks, publics, store, teams.
- **Baseline problems found:**
  - the legacy references `030-topic-view-default`, `051-fractal-unfold-level-1`, `055-fractal-unfold-level-5` and `059-fractal-refolded` all show the same fully expanded depth-10 tree, so their notes do not match their images;
  - `link_popup` pairs legacy's Insert-link dialog with our overflow menu, so link insertion is not captured at all.

## What must happen before any deploy

- Trace and fix the depth-3 Ctrl+Enter regression; the behavioural gate must reach at least the morning's 23 of 27.
- Fix the deep-nesting layout, the mind map and search.
- Bring Gemini's 23 server edits into the branch as commits. Check behaviour feature by feature against this morning's live: expand/collapse all, Next, collapsed-by-default, Send, editing as a non-owner.
- Re-build these sheets, look at all of them, and show them to SDS. Deploy only with SDS's go.
