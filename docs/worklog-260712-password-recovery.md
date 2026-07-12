# Password recovery worklog — 2026-07-12

## Scope and branch

- Built in isolated worktree `/home/stephan/rizzoma-password-recovery` on
  branch `codex/password-recovery` from exact integration checkpoint
  `c00e1711`.
- The canonical `/mnt/c/Rizzoma` checkout, remote branches, production
  services, and production data were not modified.
- Production inventory motivating the slice: 44 of 45 audited live users have
  password hashes, while the application previously had no password-recovery
  path.

## Implemented contract

- Added `POST /api/auth/password-reset/request` with CSRF and a 5-per-15-minute
  IP limit. Valid, unknown, OAuth-only, and malformed addresses receive the
  same HTTP 202 outcome/message; database lookup and mail delivery continue
  after the response so SMTP latency is not an account-enumeration oracle.
- Generates a cryptographically random 32-byte one-time bearer. Only its
  SHA-256 hash is stored on the user document, with a 30-minute expiry and
  delivery state. Each newer request atomically supersedes the prior token.
- Sends a sanitized SMTP email through the existing notification service. The
  reset bearer exists only in the URL fragment (`#/?passwordReset=...`), so it
  is absent from HTTP request targets and access logs; reset URLs/tokens are
  never written to application logs.
- Added `POST /api/auth/password-reset/complete` with CSRF, a 10-per-15-minute
  IP limit, the existing production bcrypt cost, and the 12–200-character new-
  credential policy. Password hash replacement, token removal, and credential-
  generation increment happen in one CouchDB revision-checked user-document
  write. Concurrent submissions therefore have exactly one winner.
- Every authenticated non-auth HTTP route and every periodically revalidated
  Socket.IO session now compares its session generation with the current user
  document. A reset fails all older sessions closed even if eager store cleanup
  is unavailable. Completion also disconnects current-process user sockets and
  scans Redis/MemoryStore to delete all matching sessions immediately.
- Added a client request/complete flow with explicit loading/error states and
  `finally` cleanup. Password-reset fragments are scrubbed into expiring tab-
  scoped session storage before React/auth bootstrap; a reset link therefore
  forces the reset form even when the browser already has a valid signed-in
  session, rather than leaving the bearer in history or opening the topic UI.

## Verification

- Focused security/auth/offline/socket regression command: 11 files / 79 tests
  passed / 0 failed. Coverage includes generic request responses, hashed-only
  storage, fragment-only links, expiry/delivery failure, single-use and
  concurrent consumption, password policy, eager store cleanup, HTTP
  generation rejection, live Socket.IO generation invalidation, signed-in
  reset-link boot routing, client recovery UX, registration/ticket/session
  regressions, and offline/socket auth isolation.
- TypeScript no-emit check passed.
- Touched-file ESLint `--quiet` passed with zero errors. The pre-existing email
  control-character sanitizer was updated to the integration branch's code-
  point filter so this slice does not inherit the repository's former sole
  hard lint error.
- Production build passed: server compile/alias plus Vite client build with
  3,309 transformed modules.
- Playwright captured both recovery surfaces at desktop widths 1280, 1366,
  1440, and 1600 × 900 plus mobile 390 × 844. All ten final PNGs were visually
  inspected; the first mobile pass exposed edge-touching controls, responsive
  padding was added, and the entire matrix was rerun with zero unexpected
  console errors. Evidence: [password recovery UI archive](../screenshots/260712-1723-password-recovery-ui/README.md).

## Honest boundary

- This is a committed local candidate, not a deployment or live-SMTP claim.
  It still requires integration onto the final combined sharing/offline/upload
  head, its normal full-suite/CI gates, and an isolated staging request → real
  mailbox → consume → old-session rejection acceptance run.
- The generic request response intentionally uses an in-process asynchronous
  delivery job because the repository has no durable secret-safe mail queue.
  A process crash in the short pre-delivery window can lose that request; the
  user can safely request another link. A future durable queue must keep the
  bearer out of persisted plaintext while preserving account-enumeration
  resistance.
- Credential-generation validation adds one user-document read to each
  authenticated HTTP request and each five-second Socket.IO revalidation.
  This is a deliberate fail-closed correctness tradeoff for the current 45-user
  deployment; a shared Redis generation cache can be measured and introduced
  later if request-volume evidence justifies it.
