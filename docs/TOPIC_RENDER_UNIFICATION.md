# Topic Render Unification Plan

Branch: `feature/rizzoma-core-features`  
Date: 2026-02-03

## Goal
Unify topic meta‑blip rendering with the `RizzomaBlip` component so the topic uses the same rendering path as any other blip (toolbar, content, children, reply input), while keeping the topic‑level toolbar and metadata.

## Current State
- `RizzomaTopicDetail.tsx` renders a custom meta‑blip container (`topic-meta-blip`) with its own toolbar and content view.
- Subblip view already uses `RizzomaBlip`.
- Inline comments and `[+]` markers are handled via TipTap + `anchorPosition`.

## Proposed Approach
1. **Introduce a `renderMode` or `layout` prop in `RizzomaBlip`**:
   - `renderMode: 'default' | 'topic-root'`
   - `topic-root` hides the inline toolbar and reply footer (topic uses its own toolbar), but keeps content + child blips rendering identical.
2. **Create a synthetic topic blip object** from `topic`:
   - `id`: topic id
   - `content`: topic content (title as first line)
   - `permissions`: map from topic permissions
   - `childBlips`: reuse `listBlips` (root‑level children without `anchorPosition`)
3. **Render `RizzomaBlip` for the meta‑blip body** inside `RizzomaTopicDetail`:
   - `forceExpanded={true}`
   - `renderMode="topic-root"`
4. **Preserve the top topic toolbar** and edit mode handling in `RizzomaTopicDetail`.
5. **Playwright verification**:
   - Re-run `npm run test:toolbar-inline`
   - Re-run `node test-blb-snapshots.mjs`

## Risks
- Duplicate toolbars if `renderMode` is not respected.
- Reply placement regressions for root vs child blips.
- Topic content editing flow relies on `topicEditor`; integration must not regress auto‑save or title sync.

## Exit Criteria
- Topic meta‑blip uses the same rendering tree as any other blip.
- Existing BLB snapshots + toolbar smokes remain green.
