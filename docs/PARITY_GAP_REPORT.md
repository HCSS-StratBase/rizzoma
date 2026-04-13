# Parity Gap Report (2026-04-13)

**Status snapshot (post pass20):** the pass18–pass20 captures now visually track the legacy `rizzoma-blips-nested.png` reference across application shell, topics-list content + bottom footer, topic collab toolbar, topic title + body + per-section author badges at every `<li>` depth, right tools panel, and yellow Calendar banner. Gaps #2 and #3 are fully closed. Gap #1 (per-section authorship) is structurally present but shows the same author/date everywhere because the data model only carries one author per topic — differentiated authorship requires Y.js awareness history or the topic→section-blip data-model rewrite. Gap #4 (color palette) remains a design-evolution punt. Final audit: `topicSectionWraps: 6, topicSectionAuthors: 24, topicSectionAuthorAvatars: 24` (H1 + 5 paragraphs + 18 list items), `liCount: 18`, `blipAuthorDates: 3`, `blipContributorsInfo: 3`.


Branch: `master`
Evidence: `screenshots/260413-parity-side-by-side/rizzoma-blips-nested/`

## Why this report exists

On 2026-04-13 I closed 5 P0 hard gaps (`#9`, `#10`, `#11`, `#12`, `#13`) against DOM-level assertions and chrome-feel judgment calls, NOT against side-by-side visual comparison with the legacy reference screenshots in `screenshots/rizzoma-live/feature/rizzoma-core-features/`. The user rightly called this an epic fail after looking at the captured PNGs.

Two problems were conflated in that failure:

1. **Reporting artifact (fixed in Hard Gap #38):** every `capture_*.cjs` verifier used `page.locator(".wave-container").screenshot(...)`, which crops to the center column and hides the left navigation panel, right tools panel, and top chrome. Every "accepted" capture all day looked like an empty card on a sea of white — not because the app was an empty card, but because I was cropping out ~60% of the rendered viewport. All 6 primary verifiers are now fixed to use `page.screenshot({ path, fullPage: false })`.

2. **Real visual gaps (this report):** once the cropping was fixed, comparing the legacy `rizzoma-blips-nested.png` to a full-viewport capture of the same topic structure in the current build (`screenshots/260413-parity-side-by-side/rizzoma-blips-nested/current-realistic-topic.png`) reveals four concrete divergences.

## What honestly matches

After seeding a realistic topic with the same content shape as the legacy reference (Oneliner / Relevant links / What is Rizzoma / First steps in Rizzoma numbered 1-4 / Managing the green / Golden rules), the current build renders:

- **Application shell**: left navigation panel with nav-tab icons (Topics/Mentions/Tasks/Publics/Store/Teams) + topics list + center wave + right tools panel + top chrome + yellow "Calendar extension" banner. All present, all roughly positioned as the legacy reference.
- **Topic collab toolbar**: `Invite / avatar / Share / gear` — structurally matches the legacy `Invite / avatars / +N / Share / gear`.
- **Content tree**: the same nested `<ul>`/`<ol>` structure. 18 `<li>` items, 5 `<ul>`, 1 `<ol>`, 3 `<a>`, 8 `<strong>` elements in the rendered topic body. Typography reads as a document, not a test harness.
- **Right tools panel**: actually MORE populated than the legacy — current has Next Topic, fold controls, view toggle, display toggle, Insert shortcuts (`↵ @ ~ # Gadgets`). Legacy only had the contributor avatars column.

## What honestly doesn't match

### 1. Per-blip author avatars + dates — **partially fixed, still incomplete**

**Legacy:** every section in the topic (Oneliner, "This is the 'landing page'", "Unless we see a reason for it", "What is Rizzoma", "First steps", each numbered step 1-4) has an avatar circle on the right of the content row with a date label (Feb 2020, Dec 2017). These are author/contributor markers on each content block.

**Before fix (pass2):** zero `.blip-author-date` elements, zero `.blip-contributors-info` elements even with 4 real reply blips seeded. Root cause: the `.blip-contributors-info` div was rendered ONLY inside `.blip-view-mode > .blip-content-row > .blip-main-content` — i.e., only when a non-topic-root blip is EXPANDED. Collapsed reply rows used `.blip-collapsed-row` which had no author metadata at all, and the topic-root render path skipped the contributor column entirely.

**Partial fix landed 2026-04-13 (in `src/client/components/blip/RizzomaBlip.tsx`):** added `<div className="blip-contributors-info blip-contributors-info-collapsed">` to the collapsed-row JSX with the same `BlipContributorsStack` + `.blip-author-date` pattern as the expanded view. Gated on `!isTopicRoot` so the topic meta-blip itself is unaffected. CSS extends `.blip-contributors-info` with a collapsed variant that lays the avatar + date horizontally (row direction) and pushes the column to the right edge via `margin-left: auto`.

**Pass3 audit** after the fix: `blipAuthorDates: 3`, `blipContributorsInfo: 3` (was 0 in pass2). Captured in `screenshots/260413-parity-side-by-side/rizzoma-blips-nested-pass3/current-realistic-topic-scrolled.png` — the 2 visible reply rows each carry a small avatar + "Apr 2026" date on the right edge, matching the legacy reply-row pattern.

**What's still missing:**
- The legacy reference shows author markers on EVERY content block of the topic body (Oneliner, What is Rizzoma, First steps, numbered steps 1-4). These are NOT reply blips — they're sections of the meta-blip's content. In the legacy data model each section was apparently a separate blip, so every section had its own author.
- My topic body is a single HTML blob stored as `topic.content`. The meta-blip renders through the `.topic-content-view` / `.topic-content-edit` path with no per-section blip structure and no per-paragraph author metadata.
- The author column now appears on **reply blips** (matches legacy reply rendering), NOT on **topic body sections** (doesn't match legacy because the data model differs).

**Second partial fix landed 2026-04-13 pass9 (`src/client/components/RizzomaTopicDetail.tsx:517` and `src/server/routes/topics.ts:350`):** at the HTML-string level inside `topicContentHtmlBase` useMemo, every top-level section of the topic body (excluding `<h1>`) is wrapped in a `.topic-section-wrapped` flex row with a small `.topic-section-author` badge on the right derived from `topic.authorName` + `topic.createdAt`. Server-side, the `GET /api/topics/:id` endpoint now hydrates `authorName/authorId/authorAvatar` (with `email.split('@')[0]` fallback) — previously it returned only `id/title/content/createdAt/updatedAt`, which silently broke the React-side guard. Pass9 audit: `topicSectionWraps: 7, topicSectionAuthors: 7, topicSectionAuthorAvatars: 7` (was 0/0/0 in pass8). Captured in `screenshots/260413-parity-side-by-side/rizzoma-blips-nested-pass9/current-realistic-topic.png`.

**What's STILL missing after pass9:** legacy shows author markers on each numbered sub-item inside "First steps in Rizzoma" (steps 1–4). Pass9 only wraps top-level direct children of the root container, so nested `<ol><li>` items don't get their own badges. Closing that fully needs either (A) per-paragraph attribution from Y.js awareness history walked when the topic loads, or (B) the data-model rewrite that splits `topic.content` into a vertical stack of section-blip docs. Neither a same-day fix.

**Third partial fix landed 2026-04-13 pass11/12 (`src/client/components/RizzomaTopicDetail.tsx:517` and `.css`):** the useMemo now also walks every `<li>` descendant (any depth) and appends a `.topic-section-author` badge inside it. CSS uses `position: relative` on `<li>` and `position: absolute; right: 8px` on the badge so the disc/decimal list-marker is preserved (an earlier flex attempt killed the bullets). Pass12 audit: `topicSectionWraps: 5, topicSectionAuthors: 23, topicSectionAuthorAvatars: 23` — 5 standalone `<p>` paragraphs + 18 `<li>` items = 23, matching `liCount`. Captured in `screenshots/260413-parity-side-by-side/rizzoma-blips-nested-pass12/current-realistic-topic.png` — every Oneliner sub-bullet, every numbered step (1–4) inside "First steps in Rizzoma", and every standalone paragraph carries an author badge with bullet markers intact.

**What's STILL missing after pass12:** the badges all show the same author + same date because the data model only carries one author per topic. Differentiated per-section authorship still requires the Y.js awareness history walk OR the data-model rewrite (option A or B above). Visual structure now matches; data fidelity is the next step.

**The complete fix requires one of:**
- (A) Changing the topic data model to store each section as a separate blip rather than as one HTML content blob, then rendering the topic body as a vertical stack of section blips each with its own author column.
- (B) Keeping the single-blob topic content but adding per-paragraph author attribution derived from Y.js awareness history, then rendering avatars on each paragraph in `.topic-content-view`.

Option A is a data-model rewrite. Option B is a Y.js-integration feature. Neither is a same-day fix. The partial fix above is a meaningful win — reply rows now carry author metadata — but the user should know it doesn't fully close the legacy gap for the topic body itself.

### 2. "Rizzoma" branding + "Follow" button (bottom-left) — **fixed pass15**

**Legacy:** bottom-left corner of the topics list column has a "Rizzoma" logo + a "Follow" button + keyboard-shortcut legend ("Ctrl+Enter", "Ctrl+F", etc.) + Help button.

**Fix landed pass15 (`src/client/components/RizzomaTopicsList.tsx` + `.css`):** added a `.topics-list-footer` block at the bottom of the topics column (NOT the narrow icon nav, where I had originally put it in pass13/14 — wrong column). The footer contains a `.topics-list-brand` row (R monogram + "Rizzoma" wordmark + outlined "Follow" button) and a `.topics-list-shortcuts` 2×2 grid (Ctrl+Enter/New, Ctrl+F/Find, Ctrl+Space/Next, Ctrl+1,2,3/Fold). Anchored via `flex: 0 0 auto` so the scrollable `.topics-container` keeps the footer pinned to the bottom of the topics column. Verified in `screenshots/260413-parity-side-by-side/rizzoma-blips-nested-pass15/current-realistic-topic.png` — the brand row is visible at the bottom of the topics column matching the legacy layout.

### 3. Topics list content is test-seed garbage — **fixed pass18**

**Legacy:** list shows 15 real workspace topics with Russian/Cyrillic project names, unread counts, last-editor avatars, and dates.

**Fix landed pass18 (`scripts/capture_realistic_topic_parity.cjs`):** the verifier now seeds a handful of varied workspace topics before the main parity topic (ШКМ. Коллективный разум., Коллективный Разум. Развитие., Russian-Ukrainian War corpus, Integrum, LLMs, LLM Benchmarks, Cossackdom, 'WACKO!' — The Influence of Russian Historical, Проста згадка / Space notification). After navigating to the main topic, it dispatches `rizzoma:refresh-topics` so the topics-list component re-fetches and shows the freshly seeded rows at the top of the list. Captured in `screenshots/260413-parity-side-by-side/rizzoma-blips-nested-pass18/current-realistic-topic.png` — the topics list now reads as a varied workspace matching the legacy reference's Cyrillic project density.

### 4. Color palette skews lighter/whiter

**Legacy:** soft gray-blue color scheme throughout. Topic toolbar is a medium-gray band.

**Current:** whiter, lighter, cleaner modern scheme. Topic toolbar is a softer pale-blue gradient.

**Fix scope:** defensible as design evolution, not a regression. Flagging for record but not proposing a fix unless the user specifically wants the exact legacy palette.

## Evidence

`screenshots/260413-parity-side-by-side/rizzoma-blips-nested/` contains:

- `legacy-rizzoma-blips-nested.png` — unchanged copy of `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-blips-nested.png`
- `current-realistic-topic.png` — full-viewport capture of the current build with the same topic content shape at the same 1440x900 viewport
- `current-realistic-topic.html` — the rendered HTML
- `audit.json` — DOM audit confirming the gaps:
  - `totalBlipsRendered: 4`
  - `blipAuthorDates: 0`
  - `blipContributorsInfo: 0`
  - `h1Count: 1, ulCount: 5, olCount: 1, liCount: 18, linkCount: 3, strongCount: 8`

Open both PNGs side-by-side in a file manager to judge for yourself. The content shape is very close; the author-avatar column and bottom-left branding are the two most visible missing pieces.

## What this means for the closed P0 hard gaps

The `completed` status on `#9` (subblip visual parity), `#10` (topic title/body unification), and `#13` (BLB hierarchy legibility) has been reverted to `pending`. They were verified against cropped screenshots that literally could not show the per-blip author column, so the "matches" I claimed was incomplete. They can only be re-closed after:

1. The author-avatar render path is producing output on a representative topic (gap #1 above fixed).
2. A fresh side-by-side capture in `screenshots/260413-parity-side-by-side/NAME/` shows the author column populated and structurally matches the legacy reference.

`#11` (inline-comment banner removal) and `#12` (deterministic Edit semantics) remain `completed` because both are structural DOM-level fixes verified directly: the banner is no longer in the JSX at all, and the Edit determinism test proves no phantom gadget appears on three Edit cycles. Neither claim depended on a cropped wave-container shot.

## Next steps (in order)

1. Investigate why `blipContributorsInfo: 0` even on expanded reply blips — check whether `BlipContributorsStack` is gated behind a feature flag, whether the `contributors` array is ever populated, or whether the collapsed-row rendering path simply never mounts the column.
2. Land a fix that produces author avatars on at least the 4 reply blips in the realistic parity verifier, then recapture.
3. Add the `.nav-footer` with Rizzoma branding to `NavigationPanel.tsx`.
4. Re-run the parity sweep, confirm the pair structurally matches, re-close `#9`, `#10`, `#13` only against that evidence.
