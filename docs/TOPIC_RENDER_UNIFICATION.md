# Topic Render Unification Plan

Branch: `feature/rizzoma-core-features`  
Date: 2026-02-03

## Goal
Unify topic meta‑blip rendering with the `RizzomaBlip` component so the topic uses the same rendering path as any other blip (toolbar, content, children, reply input), while keeping the topic‑level toolbar and metadata.

## Status
Implemented (2026-02-03). Topic meta‑blip now renders via `RizzomaBlip` in normal mode; edit flow still uses the topic editor override to preserve title extraction + autosave.

## Current State
- `RizzomaTopicDetail.tsx` renders the topic meta‑blip body through `RizzomaBlip` with `renderMode="topic-root"` and a topic editor override for edit mode.
- Root-level child blips are still rendered as `RizzomaBlip` instances (collapsed by default) inside the topic container, matching the legacy list behavior while sharing the unified tree.
- Subblip view already uses `RizzomaBlip`.
- Inline comments and `[+]` markers are handled via TipTap + `anchorPosition`.

## Implementation Notes
1. **`RizzomaBlip` gained `renderMode` + content hooks**:
   - `renderMode: 'default' | 'topic-root'` hides the inline toolbar, reply footer, bullet, and contributors for the topic root.
   - `contentContainerClassName`, `contentClassName`, `contentFooter`, and `childFooter` allow the topic detail view to preserve its padding and tag layout while sharing the unified blip tree.
2. **Synthetic topic blip**:
   - `id`: topic id
   - `content`: topic content (title as first line fallback)
   - `permissions`: derived from auth state
   - `childBlips`: `listBlips` (root‑level children without `anchorPosition`)
3. **Topic detail render**:
   - `RizzomaBlip` renders the meta‑blip body in non‑perf mode with `forceExpanded` + `renderMode="topic-root"`.
   - The topic editor is injected via `contentOverride` only while editing to preserve auto‑save/title sync.
4. **Playwright verification**:
   - `npm run test:toolbar-inline`
   - `node test-blb-snapshots.mjs`

## Risks
- Duplicate toolbars if `renderMode` is not respected.
- Reply placement regressions for root vs child blips.
- Topic content editing flow relies on `topicEditor`; integration must not regress auto‑save or title sync.

## Exit Criteria
- Topic meta‑blip uses the same rendering tree as any other blip.
- Existing BLB snapshots + toolbar smokes remain green.
