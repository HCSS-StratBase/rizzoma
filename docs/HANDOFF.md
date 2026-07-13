## Handoff Summary — Rizzoma Modernization

Last Updated: 2026-07-13 (`fix/blb-ensure-inline-expand`; deployed base
`5e1bc271e81613768e811cfc306c0c691e71d77b`). PR
[#72](https://github.com/HCSS-StratBase/rizzoma/pull/72) merged the read-marker
repair and that exact tree is public on managed blue `:8101`. Public phase 2
passed **49/49**, but the first real BLB authoring attempt exposed the primary
product invariant as broken: an intended 18-node bulleted structure persisted
as **18 P / 0 UL / 0 LI**. Public production is therefore deployed but not
accepted.

PR [#73](https://github.com/HCSS-StratBase/rizzoma/pull/73) merged the first
always-bulleted repair as exact master `7581d036`. Every GitHub check passed,
but private green acceptance correctly stopped release: four bullets initially
rendered, then a blank pre-sync TipTap root merged with the authoritative Yjs
snapshot. The resulting duplicate H1+UL history produced repeated 409s and,
after restart, HTTP 400 `invalid_blb_structure`. Green was stopped and public
blue was never changed.

PR [#74](https://github.com/HCSS-StratBase/rizzoma/pull/74) merged the revision-
race repair as exact `d2f200c8`; all seven checks passed and that exact tree is
healthy on private green. Its real-control gate proved topic bullets and the
durable child/marker survive, but stopped because the automatic Ctrl+Enter
handoff collapsed the child while its portal moved from topic edit mode to view
mode. Public blue was gracefully stopped for writer isolation and remains
stopped during repair; nginx has not been cut over.

PR [#75](https://github.com/HCSS-StratBase/rizzoma/pull/75) merged the first
handoff repair as exact `cb209dbd` after all seven checks passed. Exact
`cb209dbd` is healthy on private green, but its real-control gate still failed:
the root topic and child persisted as canonical bullets with a `[+]` marker,
yet the child container never rendered after the topic editor remounted because
the root blip's local expanded-child state was lost.

Branch `fix/blb-ensure-inline-expand` changes programmatic child creation from
toggle to idempotent ensure-expanded. Creation retries now reassert expansion
without ever inverting it; user marker clicks still toggle.
The underlying PR #74 repair ensures collaborative
topic and child editors start without local content, the elected seeder imports
one canonical document directly into the empty Y.XmlFragment, and every editor,
toolbar, Ctrl+Enter, paste, upload, and async child-creation mutation stays
frozen until the exact provider has authoritative sync plus server-granted edit
permission. Disconnects and every rejected Yjs update revoke that capability;
the local pending document is preserved for explicit recovery. Invalid durable
snapshots likewise fail closed and remain preserved rather than being silently
deleted. Final local gates pass at **113 files / 686 passed / 3 skipped / 0
failed**, touched-file ESLint, branch-context lint, and a **3,319-module**
production build; final CI remains before redeployment.

**Deployment boundary:** nginx still targets blue `:8101`, but blue is stopped
for the zero-overlap maintenance window. Green `:8102` runs exact PR #75
`cb209dbd` privately and is rejected by real-control acceptance. The ensure-
expanded follow-up needs PR/CI/merge and exact green
redeployment; private two-client,
reload, restart, and responsive visual acceptance must pass before a
zero-overlap cutover. The known public failure topic then needs an explicit
verified generation migration and in-app repair; no snapshot may be silently
discarded. Native rendering remains disabled; production uses the React/TipTap
parity path.

Last Updated: 2026-04-23 03:50am (`master` @ `20dbd289`+docs, **Google OAuth WORKS end-to-end** at [https://138-201-62-161.nip.io/](https://138-201-62-161.nip.io/) — Playwright sign-in lands as `sdspieg@gmail.com` "Stephan De Spiegeleire" with Google avatar. Tasks #140 + #143 both closed. Required two Hetzner Robot firewall passes: (1) opened port 80 for Let's Encrypt; (2) consolidated `apps` (8000-9999) → `apps-and-ephemeral` (8000-65535) to allow return traffic from MASQUERADE'd outbound — without that, server couldn't reach `oauth2.googleapis.com/token`. Diagnosed via tcpdump (SYN egressed, no SYN-ACK returned). Same fix unblocks SMTP / S3 / any container-outbound feature.)

Last Updated (prior): 2026-04-23 03:30am (`master` @ `60d84a67`+docs, **HTTPS LIVE on the VPS** at [https://138-201-62-161.nip.io/](https://138-201-62-161.nip.io/). The 24+ hour blocker turned out to be the Hetzner **Robot** (NOT Cloud) host firewall in whitelist mode missing port 80 — fixed in 15 minutes via Robot API: queried `/firewall/<ip>`, added `http(80)` rule preserving the full ruleset, ran certbot webroot challenge, swapped nginx to HTTPS proxy (port 80 → 301 to HTTPS; 443 → proxy `localhost:8200` with WebSocket support + 20M client_max_body_size), updated docker-compose env to use the HTTPS URL. End-to-end verified: `/api/health` 200, SPA loads, OAuth start redirects to Google with the HTTPS callback. Task #140 closed. Pending USER action: add `https://138-201-62-161.nip.io/api/auth/google/callback` to Google Cloud Console for OAuth client `46844340633-...` (currently Google rejects with `redirect_uri_mismatch`); same for Facebook + Microsoft.)

Last Updated (prior): 2026-04-23 late-night (`master` @ `60d84a67`, **BLB doc ecosystem hardened + Hetzner blip on rizzoma.com fully fractally BLB-correct to depth 3**. Three commits today landed: `7cfff90b` codified the BLB fractal-bullets rule via §3 tightening + new §19 Pre-Commit BLB Checklist + new `docs/RIZZOMA_LEGACY_EDITOR_PLAYWRIGHT.md` (six initial rules for scripting the legacy editor); `cb3dd4bc` retrofitted all cross-refs to proper markdown hyperlinks (GDrive cloud URLs, never `/mnt/g` WSL paths) per new "Hyperlink convention" rule in SYSTEM_INSTRUCTIONS.md; `60d84a67` added Playwright Rule 7 — `type('x') + Backspace + press('Control+Enter')` unblocks Ctrl+Enter when it silently refuses (discovered while recursing fail2ban's "Bad settings" bullet to depth 3). Hetzner blip in HTU topic now has 7 sibling labels at depth 1, 5 of which have bulleted depth-2 bodies, 5 of THOSE bullets going to depth 3 with their own bulleted [+] subblips — all 12+ markers folded. Four Tana entries posted on 2026-04-23 day node (doc-sweep morning + BLB rule + hyperlinks + depth-3 completion). Bundle on GDrive: `rizzoma-260423-depth3-fractal.bundle` + `rizzoma.bundle` pointer.)

Last Updated (prior): 2026-04-22 late-night (`master` @ `87c5e988`, **production build path now green on VPS**. `app-prod` service healthy on `:8201` alongside dev `:8200`. Fixed 3 Dockerfile bugs (CMD path, missing parse5 runtime dep, /app/logs + /app/data/uploads write permission). All OAuth creds + new SESSION_SECRET wired. CI gates tightened: typecheck + vitest now hard gates, install step no longer `continue-on-error` (#147). HTTPS still blocked on Hetzner Cloud firewall (port 80 inbound). vitest 186/193, tsc 0 errors.)

Last Updated (prior): 2026-04-22 02:30am (`master` @ `37241169`, deployed to VPS. Final cleanup batch landed: both today's fixes UI-verified empirically (gadget routing → CouchDB shows YouTube only in active blip not topic root; Vite uploads proxy → green PNG renders inline with PNG magic bytes); pre-existing inline-comments mock bug fixed (vitest 184/193 now); pre-existing 37 TS errors all cleaned (`tsc --noEmit` now 0 errors — root cause was a harmful `tiptap.d.ts` module override); Playwright follow-the-green smoke PASSED against VPS; GitHub issues 0 open; project root cleaned 8.4GB. Bundle on GDrive.)

Last Updated (prior): 2026-04-22 late-night (`master` @ `a2e9e91c`, **two cleanup fixes deployed to VPS**: (1) Vite dev-server now proxies `/uploads/*` to Express — uploaded images now display on the VPS instead of returning SPA HTML (`content-type: image/png` verified post-deploy); (2) gadget palette no longer inserts into multiple editors at once — uses `globalActiveBlipId` to scope. Plus: tests still 183/193 (3 pre-existing only); cascade-cleaned the LLMs test topic on VPS; GitHub issue #43 closing summary posted; bundle on GDrive. See `docs/worklog-260422.md`.)

Last Updated (prior): 2026-04-22 late-evening (master @ HEAD, **depth-10 reply chain exhaustively verified**: built D1→...→D10 chain on the live VPS, then click-tested every editor feature at D10 — bold/italic/emoji/@mention/#tag/~task/code block/YouTube gadget/image upload/Delete all work identically to D3. No depth-related limit anywhere. Same React component renders at every level. Discovered Rizzoma's "subblip drill-down" UX: full topic view doesn't render the entire chain inline (smart UX), but every blip is deep-linkable at any depth via `/#/topic/:waveId/:blipPathSuffix`. See `screenshots/260422-depth10-test/` + `docs/worklog-260422.md`. Process improvement: codified Tana project-tag requirement in CLAUDE.md (`#Rizzoma` + `#Rizzoma_modernization` must accompany every entry).)

Last Updated (prior): 2026-04-22 evening (`master` @ `48d5608a`, comprehensive depth-feature audit complete. Every Hryhorii-reported symptom verified via Playwright + every rich editor feature (mention/tag/task/emoji/code/gadget/image upload) verified working at DEPTH-3 great-grandchild blips. **No depth-specific gating in any code path.** 4 new commits today are test-only (screenshots + READMEs); VPS at `c4844c73` doesn't need re-deploy. See `docs/worklog-260422.md`. Side findings (non-depth, worth fixing): gadget palette routing too greedy, Vite dev-proxy doesn't forward `/uploads/*`, topic-root toolbar shortcuts can leak past active deep editor.)

Last Updated (prior): 2026-04-22 morning (`master` @ `c4844c73`, BUG #43 fix deployed + verified live on VPS. VPS_DEPLOYMENT.md refreshed with current container state, env vars, deployment path. Issues #42 and #43 both closed on GitHub. No regressions. This is a docs-only refresh; the actual code/VPS work landed 2026-04-21.)

Last Updated (prior): 2026-04-21 (BUG #43 — gear-menu "Delete blip" silently 404s. Root cause: `linksRouter` mounted at `/api` defined `DELETE /:from/:to` which shadowed every two-segment DELETE under `/api/`, including `/api/blips/<id>`. The links handler never called `next()` so every blip-delete 404'd with `{"error":"not_found"}` — which matches blipsRouter's own not-found payload and hid the shadow. Fix: mount linksRouter at `/api/links`, move `GET /:id/links` into blipsRouter. Also: Hryhorii's issue #42 (missing Dockerfile.sphinx) fixed by moving sphinx behind `profiles: ["search"]`. Also: added `FEAT_ALL: "1"` to docker-compose's `app` and `app-prod` services — the VPS was running `npm run dev` with FEAT_ALL unset, tree-shaking every Track-A..E feature to false. See `docs/BUG_DELETE_BLIP_SHADOW.md`.)

Last Updated (prior): 2026-04-18 (BUG #41 CSS gap fix — nested reply blips stripped of card styling (border/shadow/background/padding) so they render as flat indented rows like the original Rizzoma. Commit `5bb75bb6`. Also: VPS deployment discovered at `138.201.62.161:8200` — see `docs/VPS_DEPLOYMENT.md`. Hryhorii's screenshots confirmed BUG #40 root cause.)

Last Updated (prior): 2026-04-17 (BUG #40 sub-blip nesting fix — `load(true, true)` → `load(true, false)` in rizzoma:refresh-topics handler. The 10s SOCKET_COOLDOWN_MS silently skipped topic reloads after grandchild creation, leaving the [+] marker dead. Depth 1 was immune because it used `onAddReply` → `load(true)` without `fromSocket`. Fix: commit `222efc97`. Verified at 4 depth levels. Issue: HCSS-StratBase/rizzoma#40. Also: 84/84 feature sweep at 80/84 real evidence (95%), Firefox 10/10 cross-browser, fresh APK on GDrive. See `docs/BUG_SUBBLIP_NESTING.md`.)

Last Updated (prior): 2026-04-16 (8-pass feature flow sweep — systematic Playwright capture harness against 84 documented features from `RIZZOMA_FEATURES_STATUS.md`. Final honest state: 41 CAPTURE-verified + 15 TEST-verified = 52/84 (62%) with real end-to-end evidence; 30 features remain SOURCE-only with concrete code refs but no automated proof. Pass 8 discovery unlocked the blip gear menu from headless captures: real `page.locator().click()` triggers React's active-state transition whereas JS `element.click()` via `evaluate()` doesn't. Reusable drivers at `scripts/capture-feature-flows-pass{1..8}.mjs`. Test-harness bug fixed: 4 test files had mock `res` missing `setHeader()` which `noStore` middleware depends on; Vitest now 180/189 pass (from 175/189) — the 2 remaining are pre-existing inline-comments view-mock bugs. `test-collab-smoke.mjs` 8/8 PASS. See `docs/worklog-260416.md` + `screenshots/260415-feature-flows/ANALYSIS-260416-pass8.md`.)

Last Updated (prior): 2026-04-15 (FtG + collab hardening sweep — three independent bugs shipped silently for weeks, now fixed and verified end-to-end via Playwright. Short version: production builds were silently shipping with every feature flag disabled (`FEAT_ALL` unset in the build pipeline); Y.js cross-tab doc sync was broken by a missing `Collaboration` extension on first editor render plus a Y.Doc seed race; sidebar green bar was stale after mark-read because of an Express weak-ETag 304 replay. All fixed. Also wired `Ctrl+Space` → Next Topic, removed vaporware `Ctrl+F` / `Ctrl+1,2,3` legend entries, and documented the topic-root collab split (reply blips use Y.js, topic-root uses event refetch via `topic:updated`). New APK `2026.04.15.0231` on GDrive ready for mobile smoke testing.)

Last Updated (prior): 2026-03-31 (cross-session gadget preference lifecycle accepted on fresh client; runtime/store verification archived under screenshots/260331-*/)

Branch context guardrails:
- Active development branch: `fix/blb-topic-revision-race` (2026-07-13), based
  on merged master `7581d036`; public remains exact `5e1bc271` on blue. The
  follow-up remains private until final audit, green CI, exact inactive-lane
  deployment, and two-client/reload/restart/responsive real-control acceptance.
  Always include branch name + date when summarizing status.
- The "Current State" section below is refreshed for the deployed parity release; older dated entries and “native release” labels are historical until the native renderer is write-capable and actually enabled.

Branching mode (private repo):
- Direct development on `master` is acceptable in this private/solo setup.
- Preserve `master-archive-2026-02-24` as rollback anchor when master pointer changes are performed.
- Use feature branches when isolation is needed for risky or long-running work.

### Drift warnings (actively curating)
- Some onboarding/status docs (`README*.md`, `README_MODERNIZATION.md`, `MODERNIZATION_STRATEGY.md`, `PARALLEL_DEVELOPMENT_PLAN.md`) still talk about demo-mode shortcuts, “all core features green,” or aggressive auto-merge flows that predate the unread/perf backlog. Treat them as historical until we rewrite them with the current perf harness + CI gating expectations.
- Phase language (e.g., `modernization/phase1` or “Phase 1 complete”) in README/modernization strategy docs is historical only; rely on the 2026-07-12 checkpoints in `RIZZOMA_FEATURES_STATUS.md` and `TESTING_STATUS.md` for the merged release.
- Status summaries record final-head CI evidence, but production claims still require a post-deployment Playwright run against the deployed URL.
- If link management guidance is still needed, `docs/LINKS_REPARENT.md` was removed; restore or replace before directing contributors to it.
- Demo-mode login references are stale: the Rizzoma layout routes sign-in through the real `AuthPanel`, so contributors must use authenticated sessions rather than `?demo=true` fallbacks.
- Playwright smokes are required for merges: `browser-smokes` runs toolbar-inline, Follow-the-Green desktop/mobile, and the two-process collaboration smoke, then uploads `snapshots/<feature>/` artifacts. Pull them locally via `npm run snapshots:pull` if needed.

## CI gates (Hard Gap #19, 2026-04-13)
- `.github/workflows/ci.yml` defines five jobs: `build`, `browser-smokes`, `perf-budgets`, `health-checks`, and `ci-gate` (the aggregator).
  - `build` — typecheck, lint (non-blocking), full Vitest, production build, Docker image build (push-only).
  - `browser-smokes` — runs `test:toolbar-inline`, `test:follow-green` (desktop + mobile), and `test:collab` on the dev stack with `FEAT_ALL=1 EDITOR_ENABLE=1`, then uploads snapshots. Runs `if: always()`.
  - `perf-budgets` — runs the 120-blip full-render harness with `RIZZOMA_PERF_ENFORCE_BUDGETS=1`; exact render counts, the `>100` lazy-slot branch, no timeout, a 3-second stage-duration ceiling, and a 100 MB heap ceiling are release-blocking.
  - `health-checks` — runs `npm run test:health` (which exercises `server.health.test.ts` + `routes.comments.inlineHealth.test.ts` + `routes.uploads.edgecases.test.ts`). Runs `if: always()` so health regressions surface independently of build/typecheck.
  - `ci-gate` — single aggregator that depends on all four jobs above and fails if ANY of them failed or were cancelled. **This is the job to require in branch protection** (Settings → Branches → master → Require status checks → check `ci-gate`). With that one box checked, no merge can land if build, browser-smokes, perf-budgets, or health-checks regressed.
- `README_MODERNIZATION.md` still positions Phase 1 as largely complete and omits the current perf/getUserMedia/health/backups backlog; rewrite before citing it for the active branch.
- `docs/EDITOR_REALTIME.md` "Next steps" still lists presence/recovery/search as pending even though they shipped; update the roadmap to match the current perf/resilience focus.
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` include the 2026-07-12 merged-release checkpoint; older sections within them remain historical.
- Remaining historical docs still promote `npm run start:all` or demo-mode flows; use the branch-specific guidance in `docs/RESTART.md` + `docs/HANDOFF.md` instead.
- Operational scripts (`scripts/deploy-updates.sh`, `scripts/create-bundle.sh`) still reference demo-mode URLs; treat those references as historical and update if the scripts are used again.
- Landing view parity: topic landing page must match `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-main.png` — only root labels visible, no children/body/editor until user clicks “+”. Perf harness landing metric should measure this collapsed state; expansion metrics can be separate.

PR Ops (CLI)
- CLI‑only: `gh pr create|edit|merge`; resolve conflicts locally; squash‑merge and auto‑delete branch.
- After merges, refresh the GDrive bundle (commands below).

Current State (`fix/blb-ensure-inline-expand` @ 2026-07-13; PR #72 still configured public; PR #75 exact `cb209dbd` private green failed child expansion state)
- PR [#72](https://github.com/HCSS-StratBase/rizzoma/pull/72) passed all required
  checks and squash-merged as exact master `5e1bc271`. That exact immutable
  release is public on managed blue `:8101`; all **994** lockfile-required
  production packages are present. Green `:8102` was drained for 38 seconds
  without live connections or snapshot/flush errors, then stopped/disabled;
  both nginx vhosts now target blue.
- The deterministic read-marker repair is live. Local gates remain **8/8**
  focused and **651 passed / 3 skipped / 0 failed** full-suite, with typecheck,
  full-source lint, build, and independent audit green. Public phase 2 passed
  **49/49** checks with zero unexpected browser errors and real Follow-the-Green
  **2 -> 1 -> 0**.
- Overall acceptance is withdrawn. SDS's first manual use showed that new topic,
  reply, and/or inline-child bodies are not guaranteed to be bullet lists. A
  flat paragraph cannot provide the recursive label-to-`[+]` BLB structure, so
  the product's core paradigm is not yet functional even though the service is
  healthy.
- The real public demonstration is now captured: an intended 18-node, depth-1
  spec became **18 P / 0 UL / 0 LI** and remained flat after reload, with zero
  browser errors. The inspected evidence and full URL are in
  `screenshots/260713-0130-public-blb-creation-failure/`.
- PR [#73](https://github.com/HCSS-StratBase/rizzoma/pull/73) merged the first
  repair as exact `7581d036`, but its private-green real-control gate failed:
  four proper bullets appeared initially, then immediate Ctrl+Enter produced a
  blank duplicate topic document and repeated 409s. After restart the server
  correctly rejected the duplicate H1+UL history as `invalid_blb_structure`.
  Green was stopped; public blue never changed. Failure evidence is under
  `screenshots/260713-0258-private-green-blb-acceptance/`.
- The follow-up repair now centralizes topic/reply/inline BLB seeds, blocks invalid
  local transactions before Yjs emission, rejects flat CRDT state before cache
  mutation/relay, guards toolbar/keyboard escape routes, normalizes API and
  duplicate writes, repairs legacy content, and fixes the root Ctrl+Enter
  response-envelope bug. The final audit also closed Yjs undo-history
  split-brain, topic-H1 child creation, reserved-root poisoning, durable
  projection for existing-flat seeds, stale-prop replay, malformed HTML, and
  task-list-root bypasses. It additionally prevents a blank local ProseMirror
  history before server sync, gates all mutation surfaces on authoritative
  provider edit readiness, rechecks after async child/upload work, freezes on
  every rejected update, and preserves invalid snapshots plus pending local
  state for explicit recovery. An independent final audit returned **GO**.
- PR [#74](https://github.com/HCSS-StratBase/rizzoma/pull/74) merged as exact
  `d2f200c8` after all seven checks passed. Private green preserved the four
  typed topic bullets and durably created a canonical child plus `[+]`, but the
  retry loop toggled the retained expanded state again while the portal moved
  from topic edit mode to view mode, collapsing the child before it became
  editable. The release gate stopped.
- PR [#75](https://github.com/HCSS-StratBase/rizzoma/pull/75) merged as exact
  `cb209dbd` after seven green checks and deployed to private green. It removed
  the second toggle, but the acceptance gate still failed because the root
  blip's local expansion state was lost on topic-editor remount; the child
  persisted but never rendered as an editable container.
- Branch `fix/blb-ensure-inline-expand` adds an idempotent
  `rizzoma:ensure-inline-blip-expanded` path. Programmatic creation/retry uses
  add-only expansion; user marker clicks remain toggle-based.
- Full local gates pass: **113 files / 686 passed / 3 skipped / 0 failed**,
  touched-file ESLint, branch-context lint, and a **3,319-module** production
  build. Public production still runs the broken PR #72 tree when blue is
  active; currently blue is stopped and nginx still points at it.
- Next: publish this ensure-expanded follow-up as a new PR and require green CI, merge it, then
  privately deploy its exact merge SHA to inactive green. Prove two-client
  collaboration plus topic/root-reply/nested-reply/Ctrl+Enter recursion across
  reload and managed restart, inspect 1280/1366/1440/1600/mobile PNGs, then
  perform the exact public cutover and repair the measured failure topic.
- The full application stack is merged on `master` through PR #66: private/link/public
  sharing, viewer/commenter/editor/owner enforcement, server-session Socket.IO
  identity, live demotion, owner-partitioned offline/Yjs state, ACL-backed
  uploads, mandatory ClamAV readiness, hardened OAuth/registration/logout,
  password recovery, structural realtime, recursive export, mentions, and
  durable Tasks.
- Exact gates passed: **107/107 test files, 588 passed, 3 skipped, 0 failed**;
  typecheck; full-source ESLint `--quiet`; and a **3,314-module** production
  build. The focused combined matrix passed **120/120** and the independent
  final audit returned GO. On exact PR head `b8c9d110`, GitHub build, iOS,
  browser smokes, performance budgets, health checks, aggregate CI gate, and
  branch-update checks all passed before squash merge `bacb8a50`.
- Account changes remount the complete shell/topic/editor tree by owner and
  denied loads scrub private state. Task state is server-authoritative in view
  and edit modes, fails closed on denied refreshes, preserves generation order,
  and recovers on reconnect/access change.
- Final local UI evidence contains **20 Task PNGs** and **8 Share/Invite PNGs**
  across the required desktop widths plus 390 mobile. The Task manifest has
  zero unexpected console errors and every sharing modal remains within its
  viewport.
- Remaining release gates: publish/merge only after green CI, deploy the exact
  merge to the inactive managed lane, switch with zero writer overlap, then
  resume the same acceptance topic through Task/mention survival, password
  reset, restart durability, Google OAuth, responsive/mobile screenshots, and
  final journal/health inspection.
- The managed compiled blue lane is public on `:8101`; the inactive green lane
  remains the private coherence-fix target. Graceful shutdown flushes dirty Yjs
  documents, production refuses the development session secret, and
  `/api/health` includes Redis and ClamAV readiness.
- A live security preflight proved CouchDB `5984` and unauthenticated Redis `6379` were externally reachable. Redis showed active attacker replication/config activity and an SSH-key payload. Root-only evidence was preserved; all 54 untrusted keys/sessions were flushed; Redis was recreated clean. Persistent dual-stack rules now close both dependencies and every direct Rizzoma internal port while public HTTPS health remains 200. The managed cutover must use a fresh secret with no previous verifier, intentionally forcing one re-login. See `screenshots/260712-1218-redis-incident-response/`.
- Public nginx targets the compiled managed blue service on `:8101`; old Vite
  and API listeners are stopped. An independent post-cutover audit measured
  exact SHA provenance, zero critical journal entries, and only ports
  22/80/443 externally reachable.
- `/mnt/c/Rizzoma` is not the release checkout: it remains on `feature/native-fractal-port` at `6e988cc` with one tracked modification and 134 untracked entries. Preserve those user-owned changes; use the clean release checkout for release work until reconciled.
- FEAT_ALL required: start both server (:8788, the reserved Rizzoma backend port — see CLAUDE.md "Reserved Ports") and Vite (:3000) with `FEAT_ALL=1` plus `SESSION_STORE=memory REDIS_URL=memory://` for local smokes; CouchDB/Redis via Docker.
- Docker Desktop WSL integration was re-enabled on 2026-03-29; `docker compose up -d couchdb redis` works again from WSL for local live-app verification.
- Express 5 SPA fallback: `src/server/app.ts` uses `app.get('/{*path}', ...)`, the canonical path-to-regexp v8 syntax under Express 5. The access-controlled `/uploads/:id` router is mounted before that catch-all so missing attachment metadata returns a real 404 rather than SPA HTML; the storage directory is never mounted statically.
- Latest live-app artifacts (2026-03-29):
  - `screenshots/260329-live/topic-c7febb62dc333aa08f4a50aea8004efc.png`
  - `screenshots/260329-live/blb-study-expanded.png`
  - `screenshots/260329-live/blb-study-topic-root.png`
- Latest accepted live-shell artifacts (2026-03-30):
  - `screenshots/260330-live-ui/blb-topic-v5.png`
  - `screenshots/260330-live-ui/blb-topic-v5.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4175` because older long-lived `:3000` / `:4174` processes were serving stale UI during early captures.
- Latest accepted BLB topic-root parity artifacts (2026-03-31):
  - `screenshots/260331-blb-parity/blb-probe-v1.png`
  - `screenshots/260331-blb-parity/blb-probe-v1.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_probe.cjs` with a denser BLB-style root-topic probe.
- Latest accepted BLB inline-thread parity artifacts (2026-03-31):
  - `screenshots/260331-blb-inline/blb-inline-probe-v1.png`
  - `screenshots/260331-blb-inline/blb-inline-probe-v1.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_probe.cjs ... inline` to create and expand a root inline child plus a nested inline child before capture.
- Latest accepted BLB mixed-thread parity artifacts (2026-03-31):
  - `screenshots/260331-blb-mixed/blb-mixed-probe-v1.png`
  - `screenshots/260331-blb-mixed/blb-mixed-probe-v1.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_probe.cjs ... mixed` to combine inline-thread expansion with a separate list-thread reply on the same live topic surface.
- Latest accepted BLB unread-thread parity artifacts (2026-03-31):
  - `screenshots/260331-blb-unread/blb-unread-probe-v1.png`
  - `screenshots/260331-blb-unread/blb-unread-probe-v1.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_probe.cjs ... unread` plus the real `POST /api/waves/:waveId/blips/:blipId/read` route to create a believable mix of green unread markers, gray read markers, an active inline-expanded unread thread with toolbar, and a collapsed list-thread row that stays unread because of a nested child.
- Latest accepted BLB toolbar-state parity artifacts (2026-03-31):
  - `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.png`
  - `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_probe.cjs ... toolbar` to prove the expanded-vs-collapsed toolbar contract in the live topic shell after hardening collapsed-row expansion in `src/client/components/blip/RizzomaBlip.tsx` and flattening the per-blip toolbar in `src/client/components/blip/BlipMenu.css` toward the legacy utility-strip texture.
- Latest accepted dense live BLB scenario artifacts (2026-03-31):
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v2.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v2.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_live_scenario.cjs` to seed and capture a denser authenticated business-topic shell with mixed inline/list unread states, two expanded list replies, and a collapsed unread comparison reply.
  - The same verifier now records DOM-state counts and passed with `expandedReplyCount = 2`, `visibleToolbarCount = 1`, and `primaryExpandedIsActive = true`, so the multi-reply toolbar-focus contract is now covered in the richer live scenario instead of only the stripped-down probes.
  - Follow-up note from the next batch: non-root blip activation has since been centralized through a shared active-blip path in `src/client/components/blip/RizzomaBlip.tsx`, and the accepted single-toolbar probe still passes after that refactor. The richer multi-reply live scenario remains open again because the latest attempt exposed a toolbar-focus leak that still needs a clean accepted closeout.
- Latest accepted live gadget artifacts (2026-03-30):
  - `screenshots/260330-live-poll/live-topic-poll-v15.png`
  - `screenshots/260330-live-poll/live-topic-poll-v15.html`
  - `screenshots/260330-live-poll/live-topic-palette-v8.png`
  - `screenshots/260330-live-poll/live-topic-palette-v8.html`
  - Source of truth for the final poll/palette verification is the fresh feature-flagged Vite client on `http://127.0.0.1:4179`.
- Latest accepted trusted-embed artifacts (2026-03-30):
  - `screenshots/260330-embed-adapters/live-topic-youtube-v4.png`
  - `screenshots/260330-embed-adapters/live-topic-youtube-v4.html`
  - `screenshots/260330-embed-adapters/live-topic-youtube-error-v4.png`
  - `screenshots/260330-embed-adapters/live-topic-youtube-error-v4.html`
  - `screenshots/260330-embed-adapters/live-topic-sheet-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-sheet-v1.html`
  - `screenshots/260330-embed-adapters/live-topic-iframe-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-iframe-v1.html`
  - `screenshots/260330-embed-adapters/live-topic-image-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-image-v1.html`
  - Source of truth for the trusted-embed verification is the fresh feature-flagged Vite client on `http://127.0.0.1:4180`.
- Latest accepted app-runtime/store artifact (2026-03-30):
  - `screenshots/260330-app-runtime/live-store-panel-v2.png`
  - `screenshots/260330-app-runtime/live-store-panel-v2.html`
  - Source of truth for the app-runtime/store verification is the forced fresh Vite client on `http://127.0.0.1:4181`.
- Latest accepted in-topic sandboxed app artifact (2026-03-30):
  - `screenshots/260330-app-runtime/live-topic-kanban-v3.png`
  - `screenshots/260330-app-runtime/live-topic-kanban-v3.html`
  - Source of truth for the first app-preview verification is the forced fresh Vite client on `http://127.0.0.1:4182`.
- Latest accepted sandboxed app persistence artifacts (2026-03-30):
  - `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.png`
  - `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.html`
  - `screenshots/260330-app-runtime/live-topic-planner-debug-saved-topic.json`
  - `screenshots/260330-app-runtime/live-topic-planner-debug-mutation-traffic.json`
  - `screenshots/260330-app-runtime/topic-patch-log.ndjson`
  - Source of truth for the fixed planner persistence verification is the fresh feature-flagged Vite client on `http://127.0.0.1:4192` with the live backend server restart that includes the route logging/debug hardening.
  - Human-readable architecture/debug explainer: `docs/APP_RUNTIME_PERSISTENCE_EXPLAINED.md`
- Latest accepted generalized runtime-harness artifacts (2026-03-30):
  - `screenshots/260330-app-runtime/runtime-harness-planner-v1.png`
  - `screenshots/260330-app-runtime/runtime-harness-planner-v1.html`
  - `screenshots/260330-app-runtime/runtime-harness-focus-v1.png`
  - `screenshots/260330-app-runtime/runtime-harness-focus-v1.html`
  - Source of truth for the shared-shell refactor is the harness page `src/client/test-app-runtime.html`, captured through `scripts/capture_live_topic_app.cjs` on `http://localhost:3001/test-app-runtime.html`.
- Dirty gadget/editor batch status:
  - `PollGadget` parse/render compatibility is restored in `src/client/components/editor/extensions/GadgetNodes.ts`.
  - `npm test -- --run src/tests/client.editor.GadgetNodes.test.ts` passes again, now including a real `editor.getHTML()` serializer assertion.
  - Fresh Playwright poll artifacts from a clean feature-flagged client live under `screenshots/260330-poll-fix/`:
    - `test-editor-poll-4174.png`
    - `test-editor-poll-4174.html`
  - The isolated poll test page is visually acceptable (`screenshots/260330-poll-fix/test-editor-poll-4174-v4.png`), the live BLB topic shell is acceptable (`screenshots/260330-live-ui/blb-topic-v5.png`), and the registry-backed live topic editor now inserts/render polls acceptably in-context on a fresh client (`screenshots/260330-live-poll/live-topic-poll-v15.png`).
  - Gadget insertion now flows through the shared helper in `src/client/gadgets/insert.ts`, and the live picker is driven by `src/client/gadgets/registry.ts` instead of per-component switch statements.
  - Trusted URL gadgets now resolve through `src/client/gadgets/embedAdapters/` and render via the native `embedFrameGadget` node or the real image node instead of leaking escaped iframe markup into topic content.
  - The Store now reflects the actual runtime boundary (`built-in`, `trusted`, `preview`, `planned`) instead of fake install toggles, and the first app-manifest/host-API scaffolding lives under `src/client/gadgets/apps/`.
  - The first real sandboxed app preview now mounts inside a topic through `AppFrameGadget` + `SandboxAppGadgetView` + `public/gadgets/apps/kanban-board/index.html`, with a minimal live host bridge over `postMessage`.
  - The first persistence-critical app bug is now fixed: topic-root planner edits survive `Done`, and the stale overwrite path from rogue `PUT /api/blips/:topicId` traffic has been removed/hardened.
  - The shared app shell is now generalized and verified in the dedicated runtime harness for Planner + Focus.
  - Remaining work now moves into cleaning up the live authenticated topic-app verifier, then extending the generalized shell to additional preview apps and broader host-API/store behavior.
- Screenshot/parity archive refreshed on 2026-02-25:
  - Canonical archive root: `screenshots/260225/`
  - Exhaustive run: `screenshots/260225/ui-exhaustive-1771981300160/` (175 screenshots + 175 notes)
  - Run analysis: `screenshots/260225/TODAY_RUN_EXHAUSTIVE_ANALYSIS_260225.md`
  - Consolidated parity rollup: `screenshots/260225/COMPARISON_EXHAUSTIVE_260225.md`
  - UI element inventory: `docs/UI_ELEMENTS_EXHAUSTIVE.md`
  - Confirmed parity gaps from live-reference set remain: `rizzoma-gear-menu`, `rizzoma-share`, `rizzoma-share-modal`, `rizzoma-search-overlay`, `rizzoma-unread`
- Tests last run (2026-02-04): `node test-blb-snapshots.mjs` pass with snapshots under `snapshots/blb/1770165748162-*`. Earlier 2026-02-03 runs: Playwright `npm run test:toolbar-inline` pass (assertions active; snapshots under `snapshots/toolbar-inline/1770080797945-*-final.png`). Playwright `npm run test:follow-green` pass (desktop+mobile) with snapshots under `snapshots/follow-the-green/1770081675832-*` and `snapshots/follow-the-green/1770081713734-*`. Earlier 2026-02-03 runs: `npm run test:health` pass; `npm test -- --run src/tests/client.BlipMenu.test.tsx` pass; perf harness 1000 blips pass with metrics under `snapshots/perf/metrics-1770076098998-*.json` and renders under `snapshots/perf/render-1770076098998-*.png`. Prior runs: `npm test -- --run src/tests/routes.topics.follow.test.ts` pass (2026-02-02). Historical BLB snapshot runs remain below; re-run before merges.
- BLB inline `[+]` markers now navigate into subblip documents; Ctrl+Enter inserts marker and navigates into the new subblip (topic + blip editors).
- Topic meta-blip now renders via `RizzomaBlip` in normal mode (topic root renderMode) while keeping the topic toolbar + editor override; root-level blips still render as standard `RizzomaBlip` instances inside the unified container.
- Read-only blip toolbar now includes Collapse/Expand buttons for legacy parity; toolbar renders only for expanded blips; collapsed child rows rely on green `[+]` for unread.
- Topics list enrichment: `/api/topics` now emits author name/avatar, snippets, unread totals, and follow state for signed-in users; follow/unfollow endpoints persist `topic_follow` docs with tests in `src/tests/routes.topics.follow.test.ts`.
- Perf: `perf-harness.mjs` 200-blip run PASS (TTF 2173.8ms, FCP 260ms, rendered 101/200); 1000-blip runs now PASS in `perfRender=lite` mode — latest 2026-02-02 run (1000 blips) reported stage duration ~1.5s landing and ~0.5s expanded, memory 23MB, labels rendered 1000/1000 (`snapshots/perf/metrics-1770042725851-*.json`). Windowed 200-label time ~2.6–2.9s. `perfLimit` raises `/api/blips` limits in perf mode; `x-rizzoma-perf=1` skips blip history writes during perf seeding, `perf=full` skips unread/sidebar fetches, and benchmarks now use per-stage duration. Keep working on full-render perf beyond lite mode.
- Follow-the-Green: socket host fix restores `wave:unread` delivery; CTA clears without API fallback. Snapshots under `snapshots/follow-the-green/` (desktop+mobile). RightToolsPanel uses unread sockets/refresh and logs debug when `rizzoma:debug:unread=1`.
- Toolbar/inline comments: inline toolbar parity smoke green; inline comment nav remains optional in smoke but UI renders toolbars. Snapshots under `snapshots/toolbar-inline/`.
- Health/Uploads: `/api/health` + inline comment/upload health tests are green locally. Local uploads retain MIME/ClamAV checks and now use wave-bound metadata plus per-request read ACLs; S3/MinIO is deliberately fail-closed until its bytes can be proxied through the same revocable authorization path.
- Perf/monitoring: `scripts/perf-budget.mjs` added; `src/client/lib/performance.d.ts` supports perf monitor consumers; perf snapshots stored under `snapshots/perf/`.
- Dependency upgrades: audit captured in `docs/DEPENDENCY_UPGRADE_AUDIT.md`; minor/patch batch applied (Playwright/Vitest/Prettier, AWS SDK, session/email libs). Major editor/tooling/server upgrades remain deferred.

Current Next Work
1. Publish audited application checkpoint `b3cd054f` plus the current docs and
   evidence to PR #66; require every GitHub CI gate before merge.
2. Rebase the tested deploy-helper commits onto the new merged `master`, update
   PR #67, require CI, and install the exact merged helper assets.
3. Deploy the exact application merge SHA to the inactive managed lane, verify
   direct health/assets/journal/scanner, then execute the documented
   zero-overlap old-Vite/old-API drain and atomic both-vhost cutover.
4. Run full public acceptance: login and restart continuity, immediate-edit
   persistence, OAuth, two-account collaboration, Follow-the-Green `2 → 1 → 0`,
   role/demotion/invitation, Task/mention/export/password reset, clean upload,
   EICAR rejection, mail delivery, and inspected desktop/mobile PNGs.
5. Record the exact production result in project docs, global `HANDOFF.md`, and
   existing HCSS Tana node `8mGAbLRiBnne`; refresh the Git bundle only after the
   final merged documentation checkpoint.
6. After release, keep native rendering disabled; then address 500/1,000-blip
   full-render sweeps, physical iPhone Safari, staging/production CouchDB
   separation, synthetic-data cleanup, and the historical lint/dependency debt.

Historical Next Work (pre-merge; superseded)
- Branch focus (current batch): keep changes small/flagged; land perf/resilience sweeps and adapter/health/backup work in slices.
  - Immediate fix: continue BLB parity cleanup from the accepted dense live BLB scenario baseline plus the unread/toolbar probes, now that the richer multi-reply toolbar-focus leak is fixed on the clean `:4197` client (`screenshots/260331-blb-live-scenario/blb-live-scenario-v3.{png,html}`), the scenario reads with less synthetic business-thread copy, and the unread mix is less evenly seeded across grandchildren. Next target is less scripted live-topic distribution beyond the current scenario and then mobile/perf consequences.
  - Mobile consequence check is now accepted too: `scripts/capture_blb_live_scenario_mobile.cjs` passes on the clean `:4197` client with `screenshots/260331-blb-live-scenario-mobile/blb-live-scenario-mobile-v1.{png,html}` after tightening the small-screen toolbar/header footprint. Next target remains broader, less-seeded live-topic distributions and then perf pressure on the denser shell.
  - Perf-pressure instrumentation is now started on the same dense live scenario: `scripts/capture_blb_live_scenario.cjs` emits `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.metrics.json` with step timings + DOM counts. Treat this as a coarse baseline only; the next target is reducing fixed waits so the numbers become useful for regression pressure.
  - That dense-live perf probe is now tightened too: fixed sleeps were replaced with thread-state waits, and the accepted `blb-live-scenario-v3.metrics.json` baseline on the clean `:4197` client now reads `totalScenarioMs = 4227` with the same one-toolbar/unread contract. Next target is to broaden beyond the seeded distribution while keeping this probe green.
  - The dense-live scenario is now broadened one step further too: an extra neutral collapsed follow-up thread is present in the accepted `blb-live-scenario-v3.{png,html,metrics.json}` artifact, taking `domBlipCount` to `6` while preserving `visibleToolbarCount = 1`. Next target is to keep reducing how hand-seeded the live distribution feels without losing the current single-toolbar contract.
  - That same dense-live scenario is now less mechanically regular too: paragraph density and child ordering vary more across the expanded/collapsed replies, while the accepted `blb-live-scenario-v3.{png,html,metrics.json}` artifact still holds `visibleToolbarCount = 1` and `collapsedUnreadHasUnreadIcon = true`. Next target is to move beyond this still-seeded business-thread fixture into messier live-topic distributions.
  - The top-level ordering is now messier too: a neutral collapsed middle row sits between the two expanded replies in the accepted `blb-live-scenario-v3.{png,html,metrics.json}` artifact, taking `domBlipCount` to `7` while preserving `visibleToolbarCount = 1`. Next target is to shift this same contract into a less-scripted real-topic distribution instead of only enriching the seeded fixture.
  - Gadget platform continuation: the cleaned `:4193` topic-app path is accepted for Planner, Focus, and Kanban (`screenshots/260331-app-runtime/` plus `live-topic-planner-vfinal.{png,html}`); the Store/install lifecycle is accepted on the clean `:4196` client (`screenshots/260331-store-lifecycle/`); the same lifecycle is accepted through the authenticated `/api/gadgets/preferences` path (`screenshots/260331-store-lifecycle-server/`); and the fresh-login lifecycle now also passes with explicit user-scoped defaults/reset behavior (`screenshots/260331-store-lifecycle-session7/`). Next move is to carry this stable runtime/store baseline back into BLB/live parity work.
  - Perf/resilience sweeps: address 1k-blip perf harness failure (TTF + render count), add budgets/docs, and schedule runs.
  - Keep Playwright smokes/browser artifacts green; monitor follow-green socket delivery and toolbar parity as code changes land.
  - Health checks + CI gating: `/api/health` + inline comments/upload health tests pass locally; ensure CI coverage and alerting remain intact.
  - Backups: automate bundle + GDrive copy after merges and document cadence.
- Legacy cleanup: finish CoffeeScript/legacy asset disposition and dependency upgrades; rewrite onboarding/status docs to remove demo/start-all claims.
  - Audit (2026-02-02): `.coffee` files remain only in `original-rizzoma-src/` reference tree; none in active `src/`.

Restart Checklist (any machine)
- Node 20.19.0; `npm ci` (or `npm install`)
- Services: `docker compose up -d couchdb redis` (add `clamav` if `CLAMAV_HOST`/`CLAMAV_PORT` are set for upload scanning)
- Legacy views: `npm run prep:views && npm run deploy:views`
- Dev: `npm run dev` (server :8788, client :3000) — 8788 is the reserved Rizzoma backend port (avoids :8000 collision with `google_workspace_mcp`); see CLAUDE.md "Reserved Ports".
- Flag: set `EDITOR_ENABLE=1`
- Verify: `npm run typecheck && npm test && npm run build`

CI Notes
- PRs run typecheck, non-blocking lint, full Vitest, and the production build; Docker image build remains push-only.
- `browser-smokes` runs toolbar-inline, Follow-the-Green desktop/mobile, and the two-process collaboration smoke. `perf-budgets` is a blocking 120-blip full-render/lazy-path gate. Keep both green before merging.

Backup (GDrive)
- Script: `scripts/backup-bundle.sh` (runs bundle + PowerShell copy; honors `RIZZOMA_BUNDLE_PATH` + `RIZZOMA_GDRIVE_DIR` overrides).
- Bundle (manual): `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
- Copy (manual PowerShell):
  `powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'G:\\My Drive\\Rizzoma-backup' | Out-Null; Copy-Item -LiteralPath 'C:\\Rizzoma\\rizzoma.bundle' -Destination 'G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle' -Force'"`
- Last run: 2026-07-12. `/mnt/c/Rizzoma/rizzoma.bundle` was rebuilt, `git bundle verify` reported complete history, and both GDrive copies (`rizzoma.bundle` plus `rizzoma-260712-pr57-native-fractal-release.bundle`) matched SHA-256 `c0cb22744d190426c984217943ff1785983f48f1bdffd4b6705749108a58f327` at 630 MB.

Remote access (Tailscale Funnel — 2026-04-14)
- **Public URL (one for everyone)**: `https://stephan-office.tail4ee1d0.ts.net/`
- Works from: desktop, phone on WiFi, phone on cellular, any colleague on the public internet. Same URL everywhere. Automatic Let's Encrypt TLS.
- Enable: `tailscale funnel --bg --https=443 http://127.0.0.1:3000` (run from Windows PowerShell; WSL can also invoke via `/mnt/c/Program\ Files/Tailscale/tailscale.exe`).
- Disable: `tailscale funnel reset` or `tailscale funnel --https=443 off`.
- Check state: `tailscale funnel status`. First-time activation may require visiting `https://login.tailscale.com/f/funnel?node=<nodeId>` once to enable Funnel on the tailnet.
- **Backend env**: `APP_URL=https://stephan-office.tail4ee1d0.ts.net` must be set when launching the backend so OAuth callback URLs are generated against the Funnel hostname (not the internal proxy target). The server honors `X-Forwarded-Host` via `src/server/routes/auth.ts:getBaseUrl()` but `APP_URL` overrides everything and is the most reliable path.
- **Google OAuth redirect URI** registered in Google Cloud Console: `https://stephan-office.tail4ee1d0.ts.net/api/auth/google/callback`. IP-addressed redirect URIs are rejected by Google; LAN hostnames must end in a public TLD (`.ts.net`, `.duckdns.org`, etc.).
- **Known issue (2026-04-14) — Funnel → WSL2 MTU bug**: Tailscale Funnel on Windows forwarding to a WSL2-hosted service returns intermittent 502s on medium/large responses (e.g. Vite dev server modules). Root cause is TCP fragmentation on the WireGuard tunnel when the Tailscale interface MTU matches or exceeds `eth0` inside WSL2. Tracked in upstream issues [tailscale#9228](https://github.com/tailscale/tailscale/issues/9228) (WSL2-specific, open since 2023) and [tailscale#17892](https://github.com/tailscale/tailscale/issues/17892) (general random-502 complaints). Workaround on Windows PowerShell (Admin): `netsh interface ipv4 set interface Tailscale mtu=1164`. Verified: dropped 502 rate from ~7/page-load to ~1-2/page-load on Playwright against the dev server.
- **Belt-and-suspenders fix — production-build serve**: even with MTU fixed, Vite dev's large module graph (~40-60 requests per page load) exposes any residual concurrency limit in Tailscale's Funnel proxy. For rock-solid public exposure, serve a production build instead of the dev server: `FEAT_ALL=1 EDITOR_ENABLE=1 npm run build && npm run preview -- --host --port 3001`. Then repoint Funnel at 3001: `tailscale funnel reset; tailscale funnel --bg --https=443 http://127.0.0.1:3001`. Production bundle is ~5 files, no concurrency stress, no HMR on the tunneled path (HMR still works locally on 3000 for your own iteration).
- **Logging**: winston with rotating file transport at `logs/rizzoma.log` (10 MB × 5 gens). `trust proxy` is on so real client IPs are captured from `X-Forwarded-For`. `logAuthEvent()` in `src/server/lib/logger.ts` logs OAuth success/failure with `provider`, `email`, `ip`, `ua`, `reason`. Essential once the Funnel is open to the public internet — scanners start probing `/proc/self/environ`, `/api/graphql`, etc. within minutes.

PR Log
- 2025‑11‑06: #23 merged (B Part 1: snapshots)
- 2025‑11‑11: #30 merged (B+: realtime incremental updates)
- 2025‑11‑11: #32 merged (B+: rooms/presence)
- 2025‑11‑11: #34 merged (B+: presence identity + UI badge)

Latest BLB dense-live note (2026-03-31)
- `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.{png,html}` was regenerated on `master` against `http://127.0.0.1:4198` after correcting the seeded scenario to match the documented topic = meta-blip model and then restoring single-toolbar ownership on that corrected tree.
- Current accepted truth for that artifact:
  - topic body remains the root/meta-blip
  - one real top-level discussion thread contains the nested business replies
  - one separate root-level follow-up remains as a sibling
  - `expandedReplyCount = 3`
  - `visibleToolbarCount = 1`

Latest live workflow sanity note (2026-03-31)
- `screenshots/260331-workflow-exploration/workflow-v1.{png,html,json}` captures a fresh live topic run on `master` against `http://127.0.0.1:4198`.
- Verified normal path:
  - root reply create
  - root reply expand
  - nested reply form open
  - nested reply submit
  - topic edit mode enter
  - gadget palette open
- Interpretation:
  - the basic “create a blip and use gadgets from edit mode” workflow still works
  - the remaining problem is confusing structural/affordance consistency, not total failure of the core path

Latest complex workflow audit note (2026-03-31)
- `screenshots/260331-complex-workflow/` contains an 11-step live workflow pack captured on `master` against `http://127.0.0.1:4198`, plus `summary.json`, `final.html`, and `ANALYSIS.md`.
- Workflow covered:
  - topic load
  - two root replies
  - root reply expansion
  - nested reply form + nested reply submit
  - topic edit mode
  - gadget palette open
  - poll insert
  - done-mode return
- Comparison result:
  - workflow actions still succeed
  - the UI remains materially worse than the original screenshots in topic-pane hierarchy, nested-thread legibility, toolbar obviousness, and gadget-entry feel

Latest complex workflow repair note (2026-03-31)
- `screenshots/260331-complex-workflow-pass14/` is the fresh rebuilt verification pack captured on `master` against `http://127.0.0.1:4197`.
- Key accepted corrections:
  - topic edit mode no longer collapses to a blank placeholder paragraph
  - the topic body remains visible in steps 8-10 while the gadget palette opens and a poll is inserted
  - done mode persists the poll without erasing the original topic body
- Most important implementation note:
  - `src/client/components/RizzomaTopicDetail.tsx` now seeds topic editing from the visible read-mode topic body when available and avoids the unstable topic-root collaboration bootstrap path
- Remaining honest gap:
  - the UI is still not visually equal to the legacy Rizzoma screenshots, but the catastrophic root-topic edit/body-loss regression from the earlier audit is fixed

Latest complex workflow polish note (2026-03-31)
- `screenshots/260331-complex-workflow-pass15/` is the follow-up acceptance pack on `master` against `http://127.0.0.1:4197`.
- Accepted correction:
  - the right-rail gadget palette reads more like an anchored utility flyout
  - the topic toolbar strip is more legible and less visually lost
  - the repaired root-topic body preservation still holds through poll insertion + done mode

Latest complex workflow nested-readability note (2026-03-31)
- `screenshots/260331-complex-workflow-pass19/` is the latest accepted pack on `master` against a fresh forced client at `http://127.0.0.1:4198`.
- Accepted correction:
  - nested reply cards are denser and less washed out
  - the inline-comments degraded-state banner is smaller and less dominant
  - the poll gadget is more compact inside nested replies
  - the repaired root-topic workflow still holds end to end on the fresh client
- Honest boundary:
  - this is better than `pass15`, not final legacy parity
  - the warning banner still exists and the thread surface is still cleaner in the original screenshots

Latest hard structural gap note (2026-03-31)
- `docs/RIZZOMA_HARD_GAP_LIST_260331.md` replaces the “just keep polishing” mindset for this area.
- Current judgment:
  - the remaining failures are structural violations of the documented/original Rizzoma model, not ordinary visual debt
- Immediate next priorities from that gap list:
  - remove detached title/body behavior
  - remove the alien inline-comments nav/filter surface
  - reimplement anchored inline comments as a first-class interaction again

Latest hard-gap execution note (2026-03-31)
- `screenshots/260331-complex-workflow-pass23/` is the first trusted execution batch from the hard-gap list on `master`, captured on a fresh client at `http://127.0.0.1:4199`.
- Accepted correction:
  - the alien inline-comments side panel is gone from the live workflow surface
  - the edit/poll workflow is visibly cleaner because the `Inline comments / All / Open / Resolved` product detour no longer renders inside the thread area
- Important boundary:
  - this does **not** mean inline comments are fixed
  - it means the wrong non-Rizzoma inline-comments surface was successfully removed
  - the next required step is to restore real anchored inline-comment behavior

Latest anchored inline-comment note (2026-03-31)
- `screenshots/260331-inline-comment-audit-pass3/` is the trusted focused audit on `master`, captured on a fresh client at `http://127.0.0.1:4200`.
- Accepted correction:
  - `Ctrl+Enter` inserts a real `[+]` marker into topic content
  - `Done` preserves that marker in topic view
  - clicking `[+]` now changes the URL into the anchored subblip path
- Matching broad workflow regression pack:
  - `screenshots/260331-complex-workflow-pass24/`
- Important boundary:
  - the resulting subblip page is still visually underpowered
  - but the live inline-comment interaction is now back on the anchored subblip model rather than the removed annotation/filter product

Latest inline-comment round-trip note (2026-04-01)
- `screenshots/260401-inline-comment-audit-pass25/` is the current trusted focused audit on `master`, captured on a fresh client at `http://127.0.0.1:4201`.
- Accepted correction:
  - `Ctrl+Enter` inserts the anchored marker
  - the subblip opens on its own route
  - `Done` reaches subblip read mode
  - `Hide` returns to the parent topic with the marker still present
  - clicking that parent marker reopens the subblip route
- Important boundary:
  - the parent topic currently returns in topic edit mode after `Hide`
  - the round trip is structurally correct again, but still visually weaker than legacy Rizzoma

Latest inline-comment parent-return note (2026-04-01)
- `screenshots/260401-inline-comment-audit-pass40/` is the current trusted focused audit on `master`, captured on a fresh client at `http://127.0.0.1:4202`.
- Accepted correction:
  - after `Hide`, the parent topic now returns in read mode
  - the root toolbar shows `Edit`, not `Done`
  - the anchored `[+]` marker is visible in topic view
  - clicking that marker reopens the subblip route
- Important boundary:
  - the remaining hard gap is now the weak visual treatment of the subblip page itself
  - the parent-return shell is no longer the blocker

Latest inline-comment typed-round-trip note (2026-04-01)
- `screenshots/260401-inline-comment-audit-pass44/` is the current trusted focused audit on `master`, captured on a fresh client at `http://127.0.0.1:4203`.
- Accepted correction:
  - typed subblip content survives into subblip read mode after `Done`
  - `Hide` still returns to the parent topic in read mode
  - one anchored `[+]` marker remains visible in topic view
  - clicking that marker still reopens the subblip route
- Important boundary:
  - the remaining hard gap is now mostly visual parity of the subblip page itself
  - the structural inline-comment route cycle is holding again
