# Pixel 9 Pro XL Public VPS Cursor-Inline Check

- Date: 2026-04-24 23:47 CEST
- Branch: `feature/rizzoma-core-features`
- Deployed commit: `69d6a8a9`
- Public URL: `https://138-201-62-161.nip.io`
- Device: Pixel 9 Pro XL (`komodo`)
- Browser: Chrome Android `147.0.7727.102`
- Connection: ADB wireless debugging at `192.168.86.250:33119`, Chrome DevTools via `adb forward tcp:9222 localabstract:chrome_devtools_remote`

## Verdict

- Public VPS parity is verified for cursor-based BLB inline comments on Android Chrome.
- The public production bundle was rebuilt and served as `main-CRFVko80.js`; `/api/health` returned OK.
- Parent blip flow passed: place cursor in edit mode, open mobile `≡` bottom sheet, tap `Insert inline comment`, see `[+]` marker at the cursor.
- Nested subblip flow passed with the same cursor-to-`[+]` behavior.
- Boundary: iPhone Safari remains untested; this folder verifies public Android Chrome only.

## Artifacts

- `parent-blip-cursor-before-inline-insert.png` - parent blip in edit mode before insertion.
- `parent-blip-mobile-sheet-inline-action.png` - mobile bottom sheet exposing `Insert inline comment`.
- `parent-blip-cursor-inline-marker-created.png` - parent blip `[+]` marker inserted at the cursor.
- `nested-subblip-cursor-before-inline-insert.png` - nested subblip in edit mode before insertion.
- `nested-subblip-mobile-sheet-inline-action.png` - nested subblip bottom sheet exposing `Insert inline comment`.
- `nested-subblip-cursor-inline-marker-created.png` - nested subblip `[+]` marker inserted at the cursor.

## Command

```bash
RIZZOMA_BASE_URL=https://138-201-62-161.nip.io \
RIZZOMA_OUT_DIR=screenshots/260424-real-device-pixel9proxl-public \
node tmp/verify-physical-phone-cursor-inline-comment.mjs
```
