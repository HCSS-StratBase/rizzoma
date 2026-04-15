# Worklog — 2026-04-15

Branch: `master`

## Scope

Full verification sweep of Follow-the-Green + real-time collaborative
editing on Rizzoma's web browser + mobile APK paths. The user asked
for a direct audit after several weeks of assuming these features
"probably work" — the audit found three independent regressions that
had shipped silently, plus some latent UX gaps. All three bugs are
now fixed, verified end-to-end via Playwright, committed, pushed,
and compiled into a new mobile APK on Google Drive.

## Bug fixes

### BUG #58 — Production build missing FEAT_ALL (commit 7cd88d9c)

Symptom: collab, live cursors, follow-the-green, inline comments,
and wave playback were all silently disabled in every production
build and every APK shipped for weeks.

Root cause: `npm run build` (which `cap:sync` calls) never set
`FEAT_ALL=1`, so Vite's `define` block resolved
`import.meta.env.FEAT_ALL` as an empty string. Every feature guard
in `src/shared/featureFlags.ts` of the form
`env['FEAT_ALL'] === '1'` evaluated to `false` at runtime, and
every feature-gated code path was dead. Dev mode worked because
`CLAUDE.md` documents `FEAT_ALL=1 npm run dev` as the launch
command, but nothing pushed that into the build pipeline.

Fix: `vite.config.ts` uses the `defineConfig(({ command }) => …)`
callback form to detect production builds (`command === 'build'`)
and default `FEAT_ALL` to `'1'` for those. Dev mode still defaults
to `''` so `npm run dev` without `FEAT_ALL=1` reproduces the
no-features path. Also added `FEAT_WAVE_PLAYBACK`, `FEAT_TASKS`,
and `BUSINESS_ACCOUNT` to the define block — they had been missing
entirely from the env forwarding.

Verified: inspected the rebuilt `dist/client/assets/styles-*.js`
chunk and found the `FEAT_ALL:"1"` literal at the env shim, which
makes `kt.FEAT_ALL === "1"` evaluate to true at runtime.

### BUG #57 — Y.js cross-tab document sync silently broken (commit 47f24f9c)

Two independent root causes, both fixed in the same commit.

**(a) Missing Collaboration extension on first editor render.**
`RizzomaBlip.tsx`'s `collabEnabled` guard required
`effectiveExpanded` to be true, but every nested blip starts
collapsed on its first render. TipTap's `useEditor` creates the
ProseMirror view exactly once with the initial extensions list;
subsequent extension changes via `setOptions()` do NOT reinitialize
plugins. Result: the ySyncPlugin was never wired up, and typing
fired **zero** `blip:update` socket events. Cursors/awareness
still worked because `SocketIOProvider` handles them directly, and
HTTP PUT autosave still ran via tiptap's `onUpdate` → debounced
fetch, so the bug was invisible during normal use — data was
saved, it just didn't propagate live. Fix: drop `effectiveExpanded`
from the `collabEnabled` guard so every editable non-root blip
wires collab from first render. Cheap — the Y.Doc is an in-memory
CRDT data structure and the `blip:join` is a single socket emit.

**(b) Y.Doc seed race.** Two tabs joining a fresh blip both
received `state: []` from the server, both seeded from blip HTML
via `tiptap.commands.setContent()`, and produced divergent CRDT
histories that `Y.applyUpdate` could not merge cleanly. Symptom:
tab A's cursor rendered in tab B via awareness, but tab A's
typing never appeared in tab B's editor text. Fix: per-process
`seedAuthorityClaimed` Set in `src/server/lib/socket.ts` grants
`shouldSeed: true` to the first joiner on a fresh Y.Doc; every
subsequent joiner (or any joiner once the doc has non-empty state)
receives `shouldSeed: false`. `YjsDocCache.isEmpty()` exposes the
state check for the lock-release path — on `blip:leave` and
`disconnect`, if the Y.Doc is still empty, the seed lock is
released so a subsequent visit can re-seed.

Client changes: `SocketIOProvider` reads `shouldSeed` from the
`blip:sync:<blipId>` response and stores it as a public field;
`RizzomaBlip`'s `trySeed` effect checks
`collabProvider.shouldSeed` before calling `setContent`.

Verified end-to-end via Playwright: two tabs joined a fresh blip,
tab 0 typed real keystrokes (`X`, `Y`), three `blip:update`
outbound events fired (previously zero), tab 1 received three
inbound `blip:update:<blipId>` events, tab 1's editor visibly
rendered `"Seed test blip — fresh Y.DocXY"` with tab 0's
collaborative cursor label (`User 28`) inline. Screenshot:
`screenshots/260415-ftg-collab-audit/09-collab-fixed-tab1.png`.

### BUG #56 — Sidebar green bar stale after mark-read (commit a2b32294)

Symptom: after the user marked blips read, the sidebar's green
unread bar didn't clear until a hard page reload or until the
60-second polling fetch happened to return a response with a
different byte length.

Root cause: HTTP 304 Not Modified replay. Express sets a weak
ETag on JSON responses based on response body length + a cheap
content hash. When two back-to-back `/api/topics` responses for
the same URL happened to have identical byte length (unread count
went 1→0 but the JSON string shape didn't change in size), the
new response's ETag matched the old one. The browser sent
`If-None-Match` with the previous ETag, Express returned 304 with
no body, and the browser replayed the stale cached body. React
rendered the stale data.

The client-side wiring was all correct — `useWaveUnread` dispatched
`rizzoma:refresh-topics`, `RizzomaTopicsList` listened with a
250ms debounce, and console traces confirmed the fetch happened.
The bug was entirely at the HTTP cache layer.

Fix: `res.setHeader('Cache-Control', 'no-store')` on the
`/api/topics` route in `src/server/routes/topics.ts`. The route
embeds per-user dynamic `unreadCount` / `totalCount` fields that
are computed on-the-fly server-side; HTTP caching was always wrong
for it.

Verified via Playwright: `domBefore: {hasUnread: true, barHeight: "33.3333%"}`
→ POST mark-read + `rizzoma:refresh-topics` dispatch →
`domAfter: {hasUnread: false, barHeight: "0%"}` within 1.5s, no
hard reload needed.

## Additional verification (every ❓ row from the initial audit list)

- **Next Topic button navigation** — click Next Topic when in-topic
  drained → navigates to the next topic with unread. Hash changed
  `70074ab7` → `70074d2a`. PASS.
- **Topic-root editor collab** — code inspection confirmed
  intentional exclusion via `!isTopicRoot` guard at
  `RizzomaBlip.tsx:491`. Cross-tab sync still happens via the
  `topic:updated` socket event emitted from
  `src/server/routes/topics.ts:575` and received by
  `subscribeTopicDetail()` in `src/client/lib/socket.ts` — but at
  event granularity, not character-by-character. Deliberate
  tradeoff, documented in `CLAUDE.md`. Not a regression.
- **Disconnect/reconnect catchup** — tab 1 called `socket.disconnect()`,
  tab 0 typed `OK`, tab 1 called `socket.connect()`, tab 1's editor
  caught up to `"Reply 1OK"` automatically via
  `setupReconnect`'s `blip:sync:request` with the local state
  vector. PASS.
- **Simultaneous concurrent edits** — both tabs typed at end of
  the same blip. CRDT merged deterministically to
  `"Reply 1OKT1T0"` with no character loss. Both tabs converged to
  identical content. PASS.
- **Multi-user sequential** — tab 1 logged out as author, logged
  back in as `ftg-reader`, fetched `/api/blips` and saw the full
  `"<p>Reply 1OKT1T0</p>"` with `canEdit/canComment/canRead: true`.
  Permissions work end-to-end. PASS.
- **Inline comment blip collab** — architectural equivalence. Uses
  the same `RizzomaBlip` component with `isInlineChild=true`, the
  same `collabEnabled` guard, the same `CollaborativeProvider`.
  My fix applies identically. PASS by code-path equivalence.

## Close-out UX fixes (commit TBD in this batch)

- **Wired `Ctrl+Space` → Next** (task #67). Global keydown listener
  in `RizzomaLayout.tsx` matches `button.next-button` (covers both
  in-topic and next-topic modes) and calls its click handler.
  Guard bails on `INPUT`/`TEXTAREA` focus but deliberately NOT on
  ProseMirror focus because the topic-root editor is auto-focused
  on page load — bailing there would disable the shortcut for 100%
  of users, and `Ctrl+Space` has no meaningful role inside tiptap.
- **Removed `Ctrl+F` and `Ctrl+1,2,3` from the sidebar legend**
  (task #68). Both were shown but never implemented. `Ctrl+F`
  would collide with the browser's "find in page" anyway;
  `Ctrl+1,2,3` would need a three-level outline fold feature that
  doesn't exist in this codebase. Legend now honestly advertises
  only what's wired: `Ctrl+Enter` (new inline child blip) and
  `Ctrl+Space` (Next).
- **Documented the topic-root collab split in CLAUDE.md** (task #69)
  with the full rationale: reply blips use Y.js live sync, topic
  roots use event-triggered refetch via `topic:updated`. If the
  team ever wants live topic-root collab (two people renaming a
  topic simultaneously), that's a separate code path through
  `RizzomaTopicDetail`'s own `useEditor` call — not a trivial
  extension.
- **Verified `topic:updated` socket emit** already fires on topic
  PATCH at `src/server/routes/topics.ts:575`. No fix needed; the
  cross-tab refetch path for topic-root was always wired, just not
  the Y.js path.

## Mobile APK rebuild

Mobile APK `2026.04.15.0231` (versionName, 7.26 MB) built with all
three bug fixes compiled into the web bundle and pushed to
`G:\My Drive\Rizzoma-backup\rizzoma-debug.apk`. The Capacitor
WebView loads the same `dist/client/` bundle, so mobile inherits
every fix verbatim. Not yet driven end-to-end on physical hardware
because that requires the phone in hand; architectural inheritance
is the strongest claim I can make from WSL2.

The mobile APK from this commit's batch will ship separately under
a new `202604.15.xxxx` versionName with the close-out UX fixes
included.

## Known latent gaps (NOT regressions, NOT in scope)

- Topic-root character-level collab (see above — intentional design)
- `Ctrl+F` (search topics) — removed from legend because undefined scope
- `Ctrl+1,2,3` (three-level outline fold) — removed from legend,
  not in codebase
- Rapid-fire Next-click race — humans don't hit it, Playwright at
  Playwright-speed does (needs 300-600ms between clicks to drain)
- iOS verification — needs a Mac + Xcode; GitHub Actions workflow
  + handoff doc already shipped on 2026-04-14

## Commits / artifacts

- `7cd88d9c` — BUG #58 (FEAT_ALL default in production builds)
- `47f24f9c` — BUG #57 (Y.js sync + seed lock)
- `a2b32294` — BUG #56 (topics cache-control)
- Pending — Ctrl+Space wire + legend cleanup + CLAUDE.md doc
- APK on GDrive: `G:\My Drive\Rizzoma-backup\rizzoma-debug.apk`
  (versionName `2026.04.15.0231`, timestamp 2:32 AM)
- Verification screenshots: `screenshots/260415-ftg-collab-audit/`
- Pushed: `origin/master` through `a2b32294`; close-out commit
  pending this batch
