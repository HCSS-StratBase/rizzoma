# Rizzoma — iOS Tester Handoff (2026-04-15)

Hello! Stephan is asking you to smoke-test the Rizzoma iOS build because
he doesn't have a Mac and cannot run Xcode himself. This doc is
self-contained — you shouldn't need to read anything else in the repo
unless something goes wrong.

## What Rizzoma is (30 seconds)

Rizzoma is a collaborative document + thread editor — think Google
Docs crossed with a threaded forum. The unit of content is a "topic"
containing one root document and many "blips" (threaded replies,
like inline comments that can grow into their own threads). Rizzoma
used to be a commercial product (rizzoma.com, now defunct) and
Stephan is rebuilding it as a modern TypeScript/React app with real
features like Google OAuth, PWA install, and the mobile apps you're
about to test.

The native mobile apps wrap the web bundle in a Capacitor WebView.
This means: the iOS app is the exact same React/Vite frontend the
web browser loads, just running inside an iOS WKWebView with a
native shell around it. If something breaks only on iOS and not in
Safari, it's most likely a WKWebView quirk or a Capacitor plugin
interaction.

## Why we need iOS testing today (2026-04-15)

Three production bugs shipped silently for several weeks and were
fixed today:

1. **Every feature flag was silently disabled in production builds.**
   `npm run build` did not set `FEAT_ALL=1`, so the bundle tree-shook
   collab, live cursors, follow-the-green, inline comments, and
   wave playback to `false`. The APK and web production builds ran
   with everything turned off.
2. **Real-time Y.js collaborative editing was broken in two ways.**
   The Collaboration tiptap extension was missing from the editor's
   initial plugin list (guard gated on `effectiveExpanded`, which
   is always false on first render of a nested blip), so typing
   never fired `blip:update` socket events. Separately, the Y.Doc
   seed race meant two tabs joining a fresh blip both seeded from
   HTML independently and ended up with divergent CRDT histories
   that couldn't merge — symptom was "tab A's cursor shows in
   tab B via awareness but tab A's typing never appears in tab B's
   editor."
3. **Sidebar green bar did not clear after marking blips read** until
   a hard reload or the 60-second poll eventually delivered a
   different byte-length response. HTTP weak-ETag 304 replay.

All three are fixed on desktop web browsers and verified end-to-end
via Playwright — Stephan drove two browser tabs through the full
sync scenarios today. What he cannot verify is that the same fixes
also work inside the iOS WKWebView with its own cookie jar,
networking stack, and lifecycle quirks. That's your job.

## Prerequisites

You need:

- A Mac running macOS 13+ (Ventura or newer; Sequoia / Sonoma
  preferred).
- **Xcode** 15.x+ from the App Store. ~15 GB download, ~30 min
  install. Accept the license when it first launches.
- **Node.js 20.x**. Recommended path: `brew install nvm` then
  `nvm install 20.19.0 && nvm use 20.19.0`. (Node 22 probably also
  works but the repo was last tested on 20.19.)
- **CocoaPods**: `brew install cocoapods`. ~2 min.
- **Git**.

You do NOT need:

- An Apple Developer Program subscription ($99/yr). A free Apple ID
  is enough for everything in this test — sideloading to a
  physical iPhone, running in the simulator, signing the debug
  build. The paid subscription is only required for TestFlight and
  App Store distribution.
- A physical iPhone. Xcode's built-in iOS Simulator is a full
  virtual iPhone that responds to mouse/trackpad as if they were
  taps, supports most of iOS's APIs, and is what most iOS devs use
  for day-to-day work. Running on a real iPhone is nice-to-have
  but not required for this smoke test.

## Path A — Build from source (30 min, first time)

### 1. Clone and install

```bash
git clone https://github.com/HCSS-StratBase/rizzoma.git
cd rizzoma
git checkout master  # should already be default

nvm use 20.19.0       # or your installed Node 20
npm ci                # ~3 min; grabs ~1.5 GB of node_modules
```

### 2. Sync Capacitor (builds the web bundle + copies it into iOS/Android shells)

```bash
npm run cap:sync
```

This runs `vite build` under the hood and copies the output into
both `ios/App/App/public/` and `android/app/src/main/assets/public/`.
You only need the iOS copy.

### 3. Install CocoaPods dependencies

```bash
cd ios/App
pod install
cd ../..
```

~1 min first time. `pod install` reads `ios/App/Podfile` and pulls
down Capacitor's iOS native libraries + plugin pods (browser,
splash screen, status bar, haptics, share, app, preferences).

### 4. Open the project in Xcode

```bash
open ios/App/App.xcworkspace
```

**IMPORTANT**: open `App.xcworkspace` (the CocoaPods workspace),
NOT `App.xcodeproj`. If you open the plain project file, Xcode
won't see the CocoaPods dependencies and the build will fail with
missing symbols.

### 5. Sign the app

1. In Xcode's project navigator (left sidebar), click **App**
   (the top-level project icon).
2. Under **Targets**, select **App**.
3. Click the **Signing & Capabilities** tab.
4. Check **Automatically manage signing**.
5. For **Team**, pick your personal Apple ID (`Your Name (Personal
   Team)`). If you've never signed anything with Xcode, you may be
   prompted to add your Apple ID — click `+`, sign in, done.
6. The Bundle Identifier is `work.hcss.rizzoma`. Xcode may complain
   that this is already in use if Stephan registered it somewhere;
   if so, change it to `work.hcss.rizzoma.yourname` or similar
   unique value. This only matters for sideloading to a physical
   device, not the simulator.

### 6. Pick a destination and run

1. Top toolbar, next to the Stop button, there's a destination
   dropdown that says something like "My Mac" or "Any iOS Device".
   Click it and pick **iPhone 15 Pro** (or any listed simulator —
   doesn't matter which one).
2. Press ⌘R (or the Play button top-left).
3. First build takes 3-5 minutes while Xcode compiles Capacitor +
   your app. Subsequent builds are under a minute.
4. Once built, the iOS Simulator launches and the Rizzoma app
   appears. You'll see a "Sign in to continue" screen.

## Path B — Use the pre-built CI artifact (no source build, 5 min)

If you don't want to run the build yourself, GitHub Actions has a
`iOS build` workflow that produces a simulator-ready `.app` bundle
on every push to master. To use it:

1. Go to https://github.com/HCSS-StratBase/rizzoma/actions
2. Click the latest successful `iOS build` run.
3. Scroll to the **Artifacts** section at the bottom. Download
   `Rizzoma-iOS-simulator`.
4. Unzip the download — you get `App.app` (a macOS bundle that's
   actually an iOS app).
5. Open Xcode → **Open Developer Tool** → **Simulator**. Pick
   any simulator device (iPhone 15 Pro is fine), wait for it to
   boot.
6. With the simulator running, drag `App.app` from Finder onto
   the simulator window. It installs as "Rizzoma" and appears on
   the home screen.
7. Tap the Rizzoma icon to launch.

The CI artifact is **unsigned and simulator-only**. It will NOT run
on a physical iPhone. For physical-device testing you need Path A
(sign with your own Apple ID in Xcode).

**Important**: if the CI workflow hasn't run for today's commits
yet, the artifact is out of date. Check the artifact timestamp
against the current master commit. If stale, use Path A.

## What to test

Stephan is logged in as his own Google account on the backend. The
app connects to his backend at
`https://stephan-office.tail4ee1d0.ts.net` (a Tailscale Funnel —
a public HTTPS tunnel to his home machine). You don't need to be
on any VPN; the Funnel URL is publicly reachable from any network.

You'll need your own account to test — either:

- **Sign in with Google** — the cleanest path. Tap the Google
  button, authenticate in Safari (iOS WKWebView will hand off to
  SFSafariViewController), come back to the app.
- **Sign up with email/password** — tap "Sign up" at the bottom of
  the login screen, pick any email + a 6+ char password.

### Test 1 — App launches and auth works

Expected: The app opens to a "Sign in to continue" screen within
5 seconds. Tapping **Sign in with Google** opens Safari, lets you
pick a Google account, comes back to Rizzoma, and you see the
Rizzoma main screen with a sidebar of topics on the left.

Bug to watch for: Google OAuth on iOS historically sometimes fails
with "disallowed_useragent" when the WebView presents itself with
the `wv` marker. `capacitor.config.ts` has an `overrideUserAgent`
for iOS that strips this. If you see a Google 403 "disallowed user
agent" error, report it.

### Test 2 — Topics sidebar + infinite scroll

Expected: The left sidebar shows a list of topics. You can scroll
down past the 20th topic and more load automatically (infinite
scroll via IntersectionObserver). No "scroll ceiling" at topic 20.

Bug to watch for: On 2026-04-14 the Android APK had a bug where
you couldn't scroll past the 20th topic because the API was
hardcoded to `limit=20` with no pagination. That was fixed and
should work on iOS too.

### Test 3 — Follow-the-Green (sidebar green bar)

Expected: Topics with unread blips should show a green bar along
their left margin in the sidebar. Tap one — the topic opens and
the blips inside should each have a small green indicator showing
unread state.

Tap the **Next ▶** button in the right tools panel (or the
"follow the green" button). It should jump the cursor to the first
unread blip in the topic and mark it read. Tap **Next** again to
go to the next unread blip. After you've read all of them, the
button should change to **Next Topic▶▶** and clicking it should
jump to the next topic with unread content.

**Critical**: the sidebar green bar on the topic you just finished
reading should clear immediately (not require a hard app reload).
This is the BUG #56 fix — if the bar stays green after you've
marked everything read, that's the regression we're testing for.

### Test 4 — Real-time collaborative editing (the big one)

This needs TWO devices — your iOS simulator AND Stephan's desktop
browser. Coordinate with Stephan:

1. Stephan opens the topic in his desktop browser at
   `https://stephan-office.tail4ee1d0.ts.net/?layout=rizzoma#/topic/<id>`
2. You open the same topic in the iOS app.
3. You both double-tap the same nested blip to enter edit mode.
4. Stephan starts typing. **You should see the characters appear
   in the blip's editor on iOS within about 500ms**, with a
   colored cursor label showing Stephan's name/identifier next to
   where his cursor is.
5. You type. Stephan should see your characters appear in his
   browser editor equally fast.
6. Both of you see each other's LIVE cursors (colored labels
   moving around as the other person clicks and types).

This is the BUG #57 fix. If:
- You see Stephan's cursor position updating (colored label moving)
  but NOT his typed characters → partial broken state, report it.
- You see nothing at all from Stephan → complete sync failure,
  report.
- You see everything Stephan types → full success, please confirm!

### Test 5 — Inline comment threads

Expected: Inside any blip editor, place the cursor somewhere and
press ⌘+Enter (Cmd+Enter) on the Mac keyboard while the simulator
is focused. A new inline comment thread should spawn at the cursor
position, showing a [+] marker and opening an editor for the
thread reply.

Bug to watch for: The inline comment blip is architecturally the
same as a regular nested blip — it uses the same
`CollaborativeProvider` path. If Test 4 works, this should too.
But it's worth confirming specifically that typing in an inline
comment thread syncs between your simulator and Stephan's desktop.

### Test 6 — Disconnect / reconnect resilience

Expected: Put the iOS simulator into Airplane Mode (Settings →
Airplane Mode, or press ⌘Y in the simulator). Ask Stephan to type
a few characters into the same blip on his desktop browser.
Nothing happens on your end (you're offline). Turn Airplane Mode
off. Within a few seconds, your iOS editor should catch up to
Stephan's changes automatically — the missing characters should
appear.

This is the Y.js reconnect-with-state-vector flow. Stephan verified
this works on desktop (tab 1 disconnected, tab 0 typed, tab 1
reconnected and caught up). Mobile is inferred to work because
it's the same web bundle, but iOS lifecycle events might interact
weirdly with the socket reconnect — worth confirming.

## What to report back

For each test, send Stephan:

1. **PASS / FAIL** — one word per test
2. **Screenshot** if anything looked weird. iOS Simulator:
   File → New Screen Shot (or ⌘S). Physical iPhone: side button +
   volume up simultaneously. Screenshots land in your Desktop
   folder by default on the simulator.
3. **Console logs if FAIL** — in Xcode, the bottom pane shows the
   app's JavaScript console (you may need to press ⌘⇧Y to reveal
   it). Copy-paste any errors or warnings.
4. **Network info** — were you on WiFi? LTE? Tailscale? The
   backend is a Tailscale Funnel URL so any network should work,
   but report the context.

Preferred channel: Slack or email to Stephan directly. If something
is subtle, a 30-second screen recording (File → Record Screen in
the simulator) is more valuable than text.

## Troubleshooting

### Pod install fails

```
[!] CocoaPods could not find compatible versions for pod...
```

Try: `pod repo update && pod install`. If still broken, delete
`ios/App/Podfile.lock` and `ios/App/Pods/` and re-run. Worst case,
ping Stephan — pod resolution errors usually mean the
`@capacitor/ios` version in `package.json` and the Podfile's pod
version diverged.

### Xcode says "Signing for 'App' requires a development team"

You skipped step 5.5 in Path A. Go back to **Signing & Capabilities**
and pick your Apple ID as the Team. Free personal team works.

### Build fails with "No such module 'Capacitor'" or similar

You opened `App.xcodeproj` instead of `App.xcworkspace`. Close
Xcode, reopen with `open ios/App/App.xcworkspace`.

### Simulator launches but Rizzoma shows a blank white screen

Open Xcode's bottom console pane (⌘⇧Y) and look for JavaScript
errors. Most likely: the backend at
`stephan-office.tail4ee1d0.ts.net` is not reachable from your
network (shouldn't happen — it's a public Tailscale Funnel, but
corporate firewalls sometimes block Tailscale). Test with
`curl -I https://stephan-office.tail4ee1d0.ts.net/api/health`
from the Mac terminal. If that fails, report to Stephan — the
backend might be down.

### Google OAuth bounces back without signing in

The app's WebView might not be passing cookies correctly, or the
OAuth callback URL isn't routing back properly. Screenshot
whatever error Google shows you and report. Stephan has spent a
lot of time on this specific flow for Android and may have missed
an iOS-specific quirk.

### The app launches but looks nothing like what I expected

Verify you're on the latest commit: `git log -1 --oneline` should
show a commit from 2026-04-15 (look for hashes starting with
`1d4dcc6f` or `ff4423bd`). If you cloned days ago, `git pull` and
rebuild.

## Who to contact

Stephan De Spiegeleire — he's the only Rizzoma dev. Reach him on
whatever channel you usually use. When reporting bugs, please
include:

- Which test (1-6)
- Xcode version + simulator device used
- Screenshot or screen recording
- Console log excerpt if relevant
- Any deviation from these instructions (e.g. "I used Node 22
  instead of 20", "I had to change the bundle ID because mine
  was taken")

## The 30-second summary of what Stephan wants to know

**Does real-time collaborative typing work from iOS to desktop and
back?** That's Test 4. Everything else is nice-to-have. If Test 4
passes, the rest is almost certainly fine. If Test 4 fails, every
other test result is contextual data for debugging Test 4.

Thanks for helping — this unblocks the whole mobile delivery path.
