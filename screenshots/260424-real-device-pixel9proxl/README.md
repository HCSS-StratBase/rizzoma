# Pixel 9 Pro XL Real-Device Mobile Check

- Date: 2026-04-24
- Branch: `feature/rizzoma-core-features`
- Device: Pixel 9 Pro XL (`komodo`)
- Browser: Chrome Android `147.0.7727.102`
- Connection: ADB wireless debugging at `192.168.86.250:33119`
- Route tested: `http://127.0.0.1:3000/?layout=rizzoma` through `adb reverse tcp:3000 tcp:3000`

## Verdict

- `VF-108` is green for the active branch: the physical Pixel rendered the current mobile auth layout with Google/Facebook/Microsoft/X-Twitter buttons and email sign-in controls.
- The authenticated phone pass registered through the real API, created topics/blips, and caught a mobile toolbar overlap that was fixed in this batch.
- Final accepted mobile toolbar evidence is `015-cdp-android-toolbar-compact-final.png`: Pixel Chrome reports `.mobile-blip-menu-container`, `position: relative`, and `overlaps: false`.
- The first capture against `https://138-201-62-161.nip.io` showed a stale public deployment without the latest auth UI, so public VPS parity still needs redeploy + smoke before being claimed current.
- iPhone Safari remains an untested cross-browser/device risk outside this Android-device closure.

## Artifacts

- `001-rizzoma-chrome-initial.png` - physical Chrome against public VPS; stale auth UI.
- `002-local-branch-auth-panel.png` - first local-branch render through ADB reverse while loading.
- `003-local-branch-after-wait.png` - physical Chrome showing current-branch mobile auth UI.
- `004-local-branch-after-login-tap.png` - failed/black capture after the phone moved toward lock state.
- `005-after-wake.png` - lock screen evidence confirming the black capture was device sleep/lock, not an app UI failure.
- `006-cdp-android-auth.png` - Chrome DevTools over ADB capture of the current-branch auth UI with text extraction confirmation.
- `007-cdp-android-authenticated-home.png` - authenticated mobile topic-list/home evidence.
- `008-cdp-android-topic-collapsed.png` - authenticated topic and seeded mobile blip before toolbar activation.
- `009-cdp-android-topic-expanded.png` - first expanded pass; exposed toolbar/content overlap on mobile.
- `014-cdp-android-toolbar-no-overlap-final.png` - first fixed layout with toolbar in flow.
- `015-cdp-android-toolbar-compact-final.png` - final accepted compact mobile toolbar screenshot; no content overlap.

## Commands

```bash
adb pair 192.168.86.250:39391
adb connect 192.168.86.250:33119
adb reverse tcp:3000 tcp:3000
adb shell am start -a android.intent.action.VIEW -d 'http://127.0.0.1:3000/?layout=rizzoma' com.android.chrome
adb forward tcp:9222 localabstract:chrome_devtools_remote
adb shell svc power stayon true
adb shell settings put global stay_on_while_plugged_in 7
adb shell settings put system screen_off_timeout 2147483647
```
