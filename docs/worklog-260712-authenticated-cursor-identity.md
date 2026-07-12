# Authenticated cursor identity worklog (2026-07-12)

## Scope

Replace random or numbered collaborator cursor labels with the authenticated
Rizzoma account identity. Keep this as a draft follow-on to merged PR #64 and
make no VPS or deployment mutation.

## Stack provenance

- Final PR base: `master` at PR #64 merge `2595d2de1182279c3245758e4605a94ac90e9793`.
- Original stack base before PR #64 merged: `dda4d1d5d15b0deb6436dcaa00d9414f9dffa557`.
- Source implementation commit: `55839d6208b5eb68f0a51c1423dbb962ea25833f`.
- Cherry-pick and rebase result: conflict-free; 11 implementation/test files changed.

## Implementation

- Added one collaboration identity helper that derives the displayed name from
  the authenticated account name with email fallback and hashes the stable user
  ID to the existing cursor palette.
- Seeded the identity synchronously for the topic-root editor, nested blips, and
  the generic `BlipEditor`, so TipTap never starts with a fabricated `User N`
  identity while auth is available.
- Made cursor decorations and typing indicators prefer the canonical awareness
  user, preventing two identity sources from drifting.
- Kept post-mount auth updates in place without rejoining the room; unchanged
  updates are idempotent.
- Re-announced awareness after Socket.IO reconnect and broadcast awareness
  removal before leaving on provider destruction.
- Retained an explicit `Anonymous` fallback for test/harness or unauthenticated
  surfaces instead of inventing a numbered collaborator.

## Measured verification

- Focused Vitest command covering identity, provider, and editor configuration:
  **3 files / 27 passed / 0 failed**.
- Full Vitest: **64 files / 306 passed / 3 skipped / 0 failed**.
- Typecheck: passed.
- Production build: passed; Vite transformed **3,299 modules**.
- Cherry-pick conflicts: **0**.
- VPS/deployment mutations: **0**.

## Acceptance boundary

The implementation is code- and unit-verified, not browser-verified. Before
merge into the production-hardening base or deployment, run Playwright with two
real signed-in users and save/inspect repo-local PNGs proving:

- both authenticated names and stable colors are visible;
- typing indicators identify the correct collaborator;
- disconnect/reconnect restores the same identity;
- leaving removes the remote cursor immediately;
- no `User N` label appears on topic-root, nested-blip, or generic editor paths.
