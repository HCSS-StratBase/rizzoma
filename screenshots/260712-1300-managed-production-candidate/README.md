# Managed production candidate evidence

Measured on the VPS on 2026-07-12 before any nginx cutover.

## Exact candidate

- PR #64 merged to `master` as
  `2595d2de1182279c3245758e4605a94ac90e9793` after every required CI job
  passed.
- The immutable release and blue lane report that exact full SHA.
- `rizzoma@blue.service` is active on host loopback `127.0.0.1:8101` and serves
  compiled hashed assets with zero `/@vite/client` references.
- Direct health returned `status=ok`, CouchDB in 4 ms, and Redis sessions in
  1 ms. Candidate journal inspection found zero 5xx responses.

## Security and restart evidence

- Redis and CouchDB were recreated against their existing named volumes with
  host bindings restricted to `127.0.0.1:6379` and `127.0.0.1:5984`.
- A real session created on the old public secret returned HTTP 401 and no
  identity against the candidate's fresh secret.
- With the candidate stopped and both dependencies stopped, one
  `systemctl start rizzoma@blue` started Redis/CouchDB, passed the bounded
  dependency wait, and reached candidate health in **5,197 ms**.
- The service required zero automatic restarts, logged zero dependency-wait or
  shutdown errors, and public old-lane health recovered green.
- A root-only rollback bundle preserves both old process environments,
  commands, checkout SHA, and nginx vhosts without printing secrets.

## Deploy-helper correction

The first candidate invocation stopped before building because the helper
required `.git` to be a directory. The VPS source is a valid linked Git
worktree whose `.git` is a file. The guard now uses
`git -C <source> rev-parse --git-dir`; the corrected invocation built and
started the exact merged candidate successfully.

## Boundary

Public nginx still targets the old Vite `:3100` / API `:8100` lane. No write
traffic has reached the candidate. Full functionality claims require the
zero-overlap maintenance drain, both-vhost cutover, real session/Yjs restart
test, collaboration/unread smokes, and inspected viewport PNGs.
