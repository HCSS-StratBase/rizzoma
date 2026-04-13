# Parity Gap Report (2026-04-13)

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

### 1. Per-blip author avatars + dates — **the largest gap**

**Legacy:** every section in the topic (Oneliner, "This is the 'landing page'", "Unless we see a reason for it", "What is Rizzoma", "First steps", each numbered step 1-4) has an avatar circle on the right of the content row with a date label (Feb 2020, Dec 2017). These are author/contributor markers on each content block.

**Current:** zero `.blip-author-date` elements. Zero `.blip-contributors-info` elements. Even with 4 real reply blips seeded via `/api/blips` the audit shows `blipAuthorDates: 0` and `blipContributorsInfo: 0`. The React render path for the contributor column is not producing output.

**Likely cause:** in `src/client/components/blip/RizzomaBlip.tsx` the `.blip-contributors-info` div is rendered inside the `.blip-view-mode > .blip-content-row > .blip-main-content` tree, which only appears when the blip is EXPANDED. Collapsed replies use `.blip-collapsed-row` which doesn't include author metadata. And the topic-root render path goes through a different branch that skips the contributor column entirely (`{!isTopicRoot && (<div className="blip-contributors-info">...}`). The legacy rendering showed author markers for every content section regardless of collapsed/expanded state — meaning the data path needs to flow to the collapsed-row render AND the topic-root render too, or the topic meta-blip needs to render author markers per content paragraph (closer to a Y.js awareness + authorship feature).

**Fix scope:** non-trivial. Not a CSS tweak. Needs:
- A decision on whether the author markers attach to collapsed rows, to topic-root paragraphs, or both.
- The `contributors` array on `BlipData` populated from real edit history (it's typed but may never be written).
- The `BlipContributorsStack` component wired into the collapsed-row JSX and/or the topic-content-view's paragraph rendering.
- CSS for a 24-32px avatar column on the right edge of each row.

### 2. "Rizzoma" branding + "Follow" button (bottom-left)

**Legacy:** bottom-left corner of the topics list column has a "Rizzoma" logo + a "Follow" button + keyboard-shortcut legend ("Ctrl+Enter", "Ctrl+F", etc.) + Help button.

**Current:** nothing in that area. The topics list ends and there's empty space below it.

**Fix scope:** small. Add a `.nav-footer` with the Rizzoma logo and a few keyboard-shortcut hints to `NavigationPanel.tsx`. The logo asset is in `public/icons/` (need to confirm). This is 10-20 lines of JSX + CSS.

### 3. Topics list content is test-seed garbage

**Legacy:** list shows 15 real workspace topics with Russian/Cyrillic project names, unread counts, last-editor avatars, and dates.

**Current:** list shows 20 "App gadget smoke …", "Inline comment audit …", "BLB asymmetric audit …" topics from today's verifier runs.

**Fix scope:** data issue, not a UI issue. To get a fair capture the verifier should either (a) seed a realistic workspace with 10+ named topics before capturing, or (b) clean up test topics at the end of each run. Does not affect the rendered UI contract — the topics list component works correctly; it's just showing the only data available.

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
