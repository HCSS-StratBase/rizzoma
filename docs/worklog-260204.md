# Worklog 2026-02-04

- Branch: `feature/rizzoma-core-features`
- BLB toolbar visibility now tied to expanded state (collapsed rows never render toolbars).
- Playwright BLB snapshot harness rerun: `node test-blb-snapshots.mjs` (new set `snapshots/blb/1770164188794-*`).
- Updated `CHANGELOG.md` for the toolbar visibility fix and snapshot refresh.
- Updated `docs/HANDOFF.md` current state and reran `npm run lint:branch-context`.
- Removed yellow unread background from collapsed child blips (use green [+] only).
- Re-ran BLB snapshot harness: `node test-blb-snapshots.mjs` -> `snapshots/blb/1770165748162-*`.
- Updated `docs/HANDOFF.md` for new BLB snapshot set and reran `npm run lint:branch-context`.
- Updated PR #37 body with new BLB toolbar/unread changes and snapshot set `1770165748162-*`.
