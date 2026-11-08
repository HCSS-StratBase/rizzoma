# Offline/auth isolation candidate — 2026-07-12

Branch: `codex/offline-auth-isolation`, based on PR #65 source checkpoint
`5a376119`. This is an isolated integration candidate, not a deployment claim.

## Outcome

- Production mutations are online-only. Durable replay stays disabled behind
  `VITE_OFFLINE_MUTATION_QUEUE=1` **and** an intentionally empty endpoint
  allowlist; callers cannot opt secret redemption or access-control payloads
  into persistence.
- The dormant queue engine is user-partitioned, loads only after auth
  bootstrap, preflights the exact server user, uses fresh CSRF and credentials,
  serializes replay under a Web Lock, retains conflicts/failures for explicit
  recovery, and quarantines unsafe legacy or malformed records.
- Authentication is now visible in the modern shell: guests get one Sign in
  action and accessible modal; signed-in users get one identity/Logout surface.
  Login/register/mobile-ticket and logout announce a credential-free auth epoch
  so other tabs rebootstrap; ordinary page bootstrap does not create a false
  auth transition.
- Every local or cross-tab auth transition disconnects the active Socket.IO
  transport, clears queued inbound/outbound packets, applies the new identity,
  and only then reconnects with fresh credentials. Collaboration and room-based
  subscriptions rejoin on the fresh connection; old-owner cleanup cannot be
  buffered into the next account.
- Offline UI is explicitly read-only. Existing editors freeze without a REST
  write, mutation controls close/disable, New is blocked, and one reserved
  status strip replaces the former overlapping banner/toast combination.
- Yjs documents and pending acknowledgements are keyed by authenticated owner
  and blip. Logout, account switch, and editor unmount destroy live documents;
  unresolved state is retained only in an owner-keyed in-memory quarantine and
  can never attach to another user. A server-session/user mismatch fails closed
  and triggers auth rebootstrap.
- Every literal state-changing client `fetch` was removed. Blip autosave,
  create/reply/duplicate/paste/cut, task widget writes, and mobile ticket
  redemption now pass through the shared API boundary; the production paths
  converted in this slice explicitly set `queueable: false`.
- Service-worker v2 keeps `/api/*`, `/socket.io/*`, and `/uploads/*` strictly
  network-only and activation removes the former v1 dynamic cache.
  Authenticated GET/file responses can therefore no longer survive logout as
  URL-keyed CacheStorage entries.

## Verification

- Targeted auth/offline/collaboration/mobile/transport suite: **7 files / 60
  passed / 0 failed**.
- Full Vitest: **70 files / 343 passed / 3 skipped / 0 failed**.
- Typecheck: passed.
- Production build: passed, **3,306 modules transformed**.
- ESLint: **0 errors / 6,561 warnings** (the warnings are the measured inherited
  maintenance backlog).
- Playwright: **24 viewport PNGs**, covering guest, sign-in, signed-in, and
  authenticated-offline states at 1280, 1366, 1440, 1600, 390×844, and
  412×915. Unexpected console errors: **0**. Evidence and the capture method are
  in the [offline/auth screenshot archive](../screenshots/260712-1348-offline-auth-isolation/README.md).
- The first offline capture exposed three colliding indicators. It was rejected,
  consolidated to one reserved strip, recaptured, pixel-sampled, and visually
  re-inspected at original resolution.

## Integration boundary

- This branch adds client-side acknowledgement semantics. The combined release
  must preserve PR #66's authoritative Socket.IO session middleware, per-blip
  authorization, server-returned `user.id` in `blip:sync`, awareness checks,
  revocation, and logout disconnect **together with** this branch's
  `ack({ok})` handling. Either half alone is insufficient.
- Preserve PR #66's network-only `/api`/`socket.io`/`uploads` service-worker
  contract and this branch's v2 legacy-cache purge when resolving integration
  conflicts.
- The production replay allowlist remains empty by design. No endpoint should be
  enabled until the server has idempotency and the caller handles queued 202,
  conflict recovery, authorization revalidation, and visible recovery/discard.
- The Yjs quarantine is deliberately memory-only; an unload warning remains
  until the owning account reconnects and receives a server acknowledgement.
  It is isolated recovery state, not a promise of offline durability.
- No VPS write, deployment, public smoke, or two-real-user collaboration run was
  performed from this isolated worktree. Those gates belong to the combined
  integration head.
