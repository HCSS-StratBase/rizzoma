# Rizzoma — Native mobile apps via Capacitor

Rizzoma ships as a PWA (responsive, installable, offline-capable) AND as
**Capacitor-wrapped native apps** for Android and iOS that package the
same build inside a platform-specific shell. Both wrappers load
`dist/client` — the production Vite bundle — so features reach the
native app the moment you run `npm run cap:sync`.

## What you get

- **Android**: Gradle project at `./android/`. Opens in Android Studio.
  Builds APK / AAB for sideloading or Play Store distribution.
- **iOS**: Xcode project at `./ios/`. Opens in Xcode. Builds IPA for
  TestFlight / App Store. Requires macOS to build.
- **Shared WebView**: Android uses system WebView (Chrome-based), iOS
  uses WKWebView. The app's existing service worker, IndexedDB, and
  localStorage persistence all work inside the shell.

Bundle identifier: `work.hcss.rizzoma` (change in `capacitor.config.ts`
if you need a different one for the stores).

## Scripts

Added in `package.json`:

| Command | What it does |
|---|---|
| `npm run cap:sync` | `npm run build` + copy `dist/client` → `android/app/src/main/assets/public` and `ios/App/App/public`. Run this after any code change before rebuilding the native shells. |
| `npm run cap:open:android` | Opens the Android project in Android Studio. |
| `npm run cap:open:ios` | Opens the iOS project in Xcode (macOS only). |
| `npm run cap:run:android` | Builds + installs + launches on a connected Android device or emulator. |
| `npm run cap:run:ios` | Same for iOS. |

## Dev-mode vs. production-mode

The `capacitor.config.ts` honors a `CAP_SERVER_URL` environment variable:

- **With `CAP_SERVER_URL` set** (dev mode): the Capacitor WebView loads
  the URL you pass instead of the bundled `dist/client`. Useful for
  live-iterating against the desktop's dev server through the Tailscale
  Funnel without rebuilding the APK every time.

  ```bash
  CAP_SERVER_URL=https://stephan-office.tail4ee1d0.ts.net npm run cap:run:android
  ```

- **Without `CAP_SERVER_URL`** (production mode): Capacitor serves the
  files it copied during `cap:sync`. This is what you ship to the
  stores.

## First-time Android setup

You have **two paths** — full Android Studio for an IDE experience, or
cmdline-tools-only for a lean WSL/CI build. The Rizzoma build was
verified end-to-end on the cmdline-tools-only path on 2026-04-14 and
produced a working 6.8 MB debug APK in ~45 seconds.

### Path A — cmdline-tools only (lean, WSL-friendly, ~200 MB disk)

Prerequisites:

- **OpenJDK 21 JDK** (headless is fine):
  - Ubuntu/WSL2: `sudo apt-get install -y openjdk-21-jdk-headless`
  - macOS: `brew install openjdk@21`
  - Windows native: [Adoptium Temurin 21](https://adoptium.net/)

One-time SDK install:

```bash
# Download command-line tools
curl -L -o /tmp/cmdline-tools.zip \
  https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip

# Extract into the standard layout Gradle expects
mkdir -p $HOME/android-sdk/cmdline-tools
cd $HOME/android-sdk/cmdline-tools
unzip -q /tmp/cmdline-tools.zip
mv cmdline-tools latest

# Add to PATH + set ANDROID_HOME
export ANDROID_HOME=$HOME/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

# Accept licenses + install SDK packages
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "platforms;android-35" "build-tools;34.0.0"
```

Then point the Android project at the SDK (one-time, creates a
.gitignored file):

```bash
echo "sdk.dir=$HOME/android-sdk" > android/local.properties
```

Build:

```bash
npm run cap:sync                     # rebuild web + copy into android/
cd android && ./gradlew assembleDebug
# APK appears at android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a connected device (`adb devices` to check):

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Or sideload via the `dist/apk/rizzoma-debug.apk` copy the build script
drops alongside the `dist/client/` web bundle.

### Path B — full Android Studio (4 GB, richer debugging)

- **Android Studio** any recent version — <https://developer.android.com/studio>
- **JDK 17+** — Android Studio ships one; setting `org.gradle.java.home`
  in `android/gradle.properties` is optional when the bundled JDK is used.
- **Android SDK** — installed via Android Studio's SDK manager. Needs
  platform 34+, build-tools 34.0.0+, platform-tools.
- **Device or emulator** — an AVD created in Android Studio, or a
  physical phone with USB debugging enabled.

```bash
npm run cap:sync
npm run cap:open:android
# Android Studio opens. Let it sync Gradle (first time: 5-10 min).
# Pick Run → Run 'app' → your device/emulator.
```

## First-time iOS setup

Prerequisites (macOS only):

- **Xcode** (from the App Store) — any recent version.
- **CocoaPods** — `sudo gem install cocoapods` or `brew install cocoapods`.
- **Apple Developer account** — free tier works for device testing; paid
  ($99/yr) required for TestFlight / App Store.

Sequence:

```bash
npm run cap:sync
cd ios/App && pod install && cd -
npm run cap:open:ios
# Xcode opens. Sign the app with your team identity in Signing &
# Capabilities. Pick a device or simulator. Product → Run.
```

## Auth flow caveat

The app's Google OAuth flow redirects through
`/api/auth/google/callback`. Inside a Capacitor WebView on either
platform, this works as long as **`capacitor.config.ts → server.url`
and the registered Google OAuth redirect URI point at the same origin**.
Right now that's the Tailscale Funnel
(`https://stephan-office.tail4ee1d0.ts.net`). See
`docs/HANDOFF.md → "Remote access (Tailscale Funnel)"` for the
registration steps.

If you want local email/password auth to work inside the WebView
without round-tripping through Google, just sign in with a local
account — no additional Capacitor plumbing needed.

## Rebuild loop

After editing web code:

```bash
npm run cap:sync          # rebuild + copy into native shells
npm run cap:run:android   # or :ios
```

If you're only iterating on the web side and the Funnel URL is set as
`CAP_SERVER_URL`, you don't need `cap:sync` at all — the WebView reloads
the live dev server. Just `FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev`
on the desktop and reload the app on the phone.

## Gotchas

- **Service worker inside Capacitor**: Capacitor's WebView supports
  service workers on Android (API 24+) and iOS 14+. The PWA offline
  queue and manifest both work. If you see "SW registration failed" on
  a very old device, disable the SW for that platform in
  `src/client/hooks/useServiceWorker.ts`.
- **App Store review**: Apple has historically scrutinized "webview
  wrapper" apps. Make sure the native shell adds SOMETHING — push
  notifications via `@capacitor/push-notifications`, native sharing via
  `@capacitor/share`, or at minimum document that the app has offline
  functionality.
- **Bundle size**: the current production build is ~1.6 MB gzipped
  (2.2 MB uncompressed). That's fine for Capacitor but will be the
  majority of the IPA/APK size.
