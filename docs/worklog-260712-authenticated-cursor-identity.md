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
- Connected the shell-owned `/api/auth/me` user to a controlled `AuthProvider`
  in both client entry points. The prior implementation consumed `useAuth()`
  without any production provider and therefore always resolved `null`.
- Seeded the identity synchronously for the topic-root editor, nested blips, and
  the generic `BlipEditor`, so TipTap never starts with a fabricated `User N`
  identity while auth is available.
- Made cursor decorations and typing indicators prefer the canonical awareness
  user, preventing two identity sources from drifting.
- Kept post-mount auth updates in place without rejoining the room; unchanged
  updates are idempotent.
- Treats `blip:sync` as the authorized room-join acknowledgement. Initial and
  reconnect awareness/Yjs writes remain gated until that response; offline
  edits are diffed after admission and the authenticated identity is then
  re-announced. Provider destruction still broadcasts awareness removal before
  leaving when the room is active.
- Retained an explicit `Anonymous` fallback for test/harness or unauthenticated
  surfaces instead of inventing a numbered collaborator.

## Measured verification

- Focused identity/provider/component-boundary coverage: **4 files / 23 passed
  / 0 failed**. The boundary test renders the actual `RizzomaTopicDetail`,
  nested `RizzomaBlip`, and generic `BlipEditor` and captures the authenticated
  identity each passes to `useCollaboration`.
- Concurrent full Vitest regression run: **64 files passed / 307 tests passed /
  3 skipped**, with one unrelated OAuth-status test hitting its 15-second
  timeout under concurrent build load. That complete OAuth file then passed
  serially **3/3** in 3.817 seconds.
- Typecheck: passed.
- Production build: passed; Vite transformed **3,300 modules**.
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

PR #66 must additionally bind relayed awareness identity to the authenticated
Socket.IO session and broadcast server-generated awareness removal on live
demotion. Client-supplied awareness bytes are not, by themselves, proof of
identity; this branch's join barrier is compatible with that server hardening.
