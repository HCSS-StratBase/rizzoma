# PWA Real-Device Test Protocol

Last refreshed: **2026-04-13** (Hard Gap #18 — protocol landed; execution still pending a physical device)

## Why this file exists

`RIZZOMA_FEATURES_STATUS.md` and `CLAUDE.md` list PWA real-device validation as P2 work. The agent cannot execute this task directly because it requires a physical iPhone (Safari) and a physical Android device (Chrome). What the agent CAN do is write the detailed step-by-step protocol that a human tester runs on those devices and fills in the results. This file is that protocol.

Runs against the **master** branch dev stack with `FEAT_ALL=1 EDITOR_ENABLE=1 PORT=8788` (the reserved Rizzoma backend port per `CLAUDE.md` "Reserved Ports" section). The Vite UI must be reachable from the device — usually via the WSL/host LAN IP, not `localhost`.

## Prerequisites

1. **Dev stack** running on the host machine with:
   ```bash
   docker compose up -d couchdb redis
   FEAT_ALL=1 EDITOR_ENABLE=1 PORT=8788 REDIS_URL=redis://localhost:6379 npm run dev
   ```
2. **LAN IP** visible from Vite output (e.g. `http://172.24.111.156:3000/`). Use this on the test device, not `localhost`.
3. **Test device 1**: iPhone running iOS 17+ with Safari. Mobile data OFF, Wi-Fi ON, same network as the host.
4. **Test device 2**: Android phone running Chrome (any recent version). Same network.
5. **Test account**: `codex-live+1774803822194@example.com` / `CodexLive!1` (or a fresh one from the auth panel).
6. **Screenshot naming**: `pwa-<device>-<test#>-<slug>_new-YYMMDD-hhmm.png`, save under `screenshots/260413-pwa-real-device/` or similar dated folder.

## Test matrix

Each test is run on BOTH iOS Safari AND Chrome Android unless noted. Record pass/fail + notes + screenshot path in the results table at the bottom.

### 1. First-load + manifest recognition

**Steps:**
1. Open Safari / Chrome, navigate to `http://<host-LAN-IP>:3000/`
2. Wait for the full page to render (should see the AuthPanel or topics list)
3. Inspect `Add to Home Screen` (iOS) / `Install app` prompt (Chrome)

**Expected:**
- Page loads without TLS errors, console errors, or layout shift
- iOS: `Add to Home Screen` should offer the Rizzoma icon + name (read from `public/manifest.json`)
- Chrome: either an `Install app` banner appears, or the ⋮ menu has an "Install app" entry
- Manifest icon should be the SVG from `public/icons/rizzoma-icon.svg` (NOT a default globe)

**What can break:**
- Manifest 404 → check `public/manifest.json` is served and `index.html` links to it
- Icon fallback → check the manifest shortcut icons are all `.svg` (Hard Gap fix 926b6562 — shortcut was `.png`, should be `.svg`)
- CSP error → check `src/server/app.ts` allowedOrigins includes the LAN IP

### 2. Install to home screen + launch

**Steps:**
1. From test 1, accept the install prompt
2. Wait for the install animation to complete
3. Close the browser entirely (not just background — actually quit)
4. Tap the Rizzoma icon on the home screen

**Expected:**
- Home screen icon is the Rizzoma SVG icon at correct resolution (not blurry, not stretched)
- Launching opens a standalone window (no Safari/Chrome URL bar)
- The app boots to the last-visited route (or the AuthPanel if session expired)
- Title bar shows "Rizzoma" (or the `short_name` from the manifest)

**What can break:**
- Icon blurry → missing high-density variants; check `public/icons/rizzoma-icon-*.svg`
- Browser chrome still visible → manifest `display` is not `standalone`; check `public/manifest.json`
- White blank screen on cold launch → service worker caching a stale index.html; check `useServiceWorker.ts` skip-in-dev behavior

### 3. Offline queue (mutation buffering)

**Steps:**
1. Log in to the Rizzoma app on the device
2. Open an existing topic with at least one blip
3. Enable airplane mode (disconnect Wi-Fi + cellular)
4. Type a reply and tap Send / press Enter
5. Observe the UI state
6. Re-enable Wi-Fi
7. Wait 2-3 seconds
8. Verify the reply appears in the topic

**Expected:**
- Step 4: the reply shows a "queued" or "offline" indicator (e.g., faded, spinner, "pending" badge)
- Step 5: the offline indicator is visible in the right tools panel or the global app chrome
- Step 7: the reply posts automatically without user intervention
- The reply text is persisted correctly (not truncated, not duplicated)

**What can break:**
- Reply silently dropped → offline queue not intercepting the mutation; check `src/client/lib/api.ts` offline queue wiring
- Reply duplicates on reconnect → queue doesn't dedupe; check the retry logic
- Reply never posts → `navigator.onLine` event not firing; check the flush-on-online listener

### 4. Pull-to-refresh (topic list)

**Steps:**
1. Open the topics list
2. Pull the list down past the refresh threshold
3. Release
4. Observe the refresh indicator + whether the list actually reloads

**Expected:**
- Pull triggers a visible spinner at the top
- Release triggers an API call to `/api/topics` (visible in the network tab if you can open dev tools on the device)
- The list re-renders with any new data
- The spinner disappears only AFTER the API call completes, not on a fixed timer

**What can break:**
- Spinner disappears before reload finishes → pull-to-refresh was using `setTimeout`, should wait for the actual reload (Hard Gap fix from mobile hardening commit fbe0315a)
- Pull is captured by the browser's native refresh → add `overscroll-behavior: contain` to the scroll container

### 5. Touch targets (tap density + hit area)

**Steps:**
1. Open a topic with multiple nested blips
2. Tap the Edit button on a blip
3. Tap Collapse / Expand
4. Tap an inline `[+]` marker
5. Tap Hide from the subblip nav bar
6. Tap each button in the right tools panel (Text view, Mind map, fold, insert)

**Expected:**
- Every button hits reliably on first tap (no "finger on button, nothing happens")
- No accidental double-hit (both button + surrounding content registering)
- All buttons are ≥44x44 px per Apple HIG / Material touch target guidelines (mobile hardening commit added this — check `src/client/components/blip/BlipMenu.css` + 11 other CSS files)

**What can break:**
- Tap targets smaller than 44px → add `min-height: 44px; min-width: 44px` to the button class
- Tap registers on adjacent blip → indent rail margin is too tight; check `.blip-collapsed-row` padding

### 6. iOS-specific: viewport + address bar

**Steps (iOS only):**
1. Open a topic in the installed PWA (not Safari)
2. Scroll to the bottom of a long topic
3. Observe where the bottom edge of content lands

**Expected:**
- Content fills the full screen including the area under the notch AND the area where Safari's address bar WOULD be
- No white strip at the bottom
- Scroll does NOT get cut off by the home indicator

**What can break:**
- Content ends before the home indicator → height is `100vh` instead of `100dvh`; check the mobile hardening fix (commit fbe0315a)

### 7. iOS-specific: input focus zoom

**Steps (iOS only):**
1. Open the AuthPanel (logged out) or tap any text input in the app
2. Observe whether Safari zooms in when the input gains focus

**Expected:**
- NO zoom on focus (inputs have `font-size: 16px` or larger, which is Safari's zoom-prevent threshold)

**What can break:**
- Zoom fires → some input style has `font-size: 14px` or smaller; grep for `font-size` on `input` / `textarea` selectors

### 8. Service worker behavior (both browsers)

**Steps:**
1. Open the installed PWA
2. Open dev tools (Chrome: via desktop Chrome remote inspect; iOS: Safari Web Inspector via macOS)
3. Go to Application / Storage → Service Workers
4. Verify a service worker is registered and `activated`
5. Trigger an update: make a small change in the source, rebuild, reload
6. Verify the new SW takes over on next reload

**Expected:**
- SW is registered at `/sw.js` (or whatever `useServiceWorker.ts` points to)
- SW status: `activated` (not `redundant`)
- Reload after source change picks up the new bundle

**What can break:**
- SW cached stale dev bundle → check `import.meta.env.DEV` skip in `useServiceWorker.ts` (MEMORY.md documents this gotcha)
- SW never activates → check `public/sw.js` exists and is referenced from `main.tsx`

### 9. Notification permission opt-in

**Steps:**
1. Open the installed PWA
2. Navigate to a topic, then trigger a notification opt-in from the UI (if exposed) OR from the browser menu
3. Accept the permission prompt
4. Have another user (or a second tab on desktop) reply in the same topic
5. Observe whether a push notification fires on the device

**Expected (best effort):**
- Permission prompt appears with the Rizzoma app name and icon
- Accept → `Notification.permission === 'granted'`
- Reply-from-other-user → local notification fires (if the notifications feature is wired end-to-end)

**Honest note:** push notifications require a push service (FCM/APNs) and a VAPID key. The Rizzoma build has NOT wired remote push — this test only exercises the local/foreground Notification API. Record as "local only" in the results.

### 10. Multi-tab + collab on mobile

**Steps:**
1. Open the installed PWA on iOS
2. Open a different browser (e.g., Safari in a new tab) and navigate to the same topic URL on the LAN
3. Edit the topic in one tab
4. Observe whether the edit appears in the other tab

**Expected:**
- The Y.js + TipTap + Socket.IO collab pipeline syncs the edit across tabs
- Cursor presence (live cursors) should also be visible if `FEAT_LIVE_CURSORS=1`

**What can break:**
- Socket.IO fails over LAN → check CORS allowlist in `src/server/app.ts`, should include the LAN-IP origin
- Y.Doc sync drops → check `REALTIME_COLLAB` feature flag, `useCollaboration` provider state

## Results log (fill in during execution)

| # | Device | Pass/Fail | Notes | Screenshot |
|---|---|---|---|---|
| 1 | iOS Safari | ⬜ | | |
| 1 | Android Chrome | ⬜ | | |
| 2 | iOS Safari | ⬜ | | |
| 2 | Android Chrome | ⬜ | | |
| 3 | iOS Safari | ⬜ | | |
| 3 | Android Chrome | ⬜ | | |
| 4 | iOS Safari | ⬜ | | |
| 4 | Android Chrome | ⬜ | | |
| 5 | iOS Safari | ⬜ | | |
| 5 | Android Chrome | ⬜ | | |
| 6 | iOS Safari | ⬜ | | |
| 7 | iOS Safari | ⬜ | | |
| 8 | iOS Safari | ⬜ | | |
| 8 | Android Chrome | ⬜ | | |
| 9 | iOS Safari | ⬜ | | |
| 9 | Android Chrome | ⬜ | | |
| 10 | iOS Safari | ⬜ | | |

## After execution

1. Save all screenshots to `screenshots/YYMMDD-pwa-real-device/` following the naming convention.
2. Fill in the results table above and commit this file with the filled-in results.
3. Update `RIZZOMA_FEATURES_STATUS.md` to mark PWA real-device validation as verified (with date + result summary).
4. Post a Tana entry in the HCSS workspace day node referencing the verified results.
5. Mark task #18 complete only after steps 1-4 are done.
