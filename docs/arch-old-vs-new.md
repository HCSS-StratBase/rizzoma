# Rizzoma: Legacy (CoffeeScript) vs Modern (React/Vite) Architecture (2025-12 snapshot on feature/rizzoma-core-features)

- **Frontend stack**
  - Legacy: CoffeeScript + jQuery + Jade templates, global state via DOM/inline scripts, RequireJS/AMD-style bundling. UI served from legacy static assets; toolbars and controls are DOM-driven.
  - Modern: React + TypeScript + Vite, componentized UI (`RizzomaLayout`, `RizzomaBlip`, `BlipMenu`, TipTap editor). Module resolution via ES modules; shared types/constants under `src/shared`.

- **Routing and layout**
  - Legacy: URL hashes mapped to waves/topics; left nav + right pane built with jQuery; topic edit forms are rendered server-side/templated.
  - Modern: Single-page React router (hash-based), Rizzoma shell (`?layout=rizzoma`) with left nav, wave/content panel, right tools panel. Topic/wave detail intended to render React blip trees (`RizzomaTopicDetail` + `RizzomaBlip`), but some legacy fallbacks still exist (e.g., old edit form).

- **Auth/session**
  - Legacy: Session cookies set from server-side templates; login modals for Gmail/Facebook/email.
  - Modern: Express auth routes (`/api/auth/*`) with CSRF tokens; cookies (`rizzoma.sid`, `XSRF-TOKEN`) shared across React API calls. Dev mode supports memory store; prod uses Redis store.

- **Data/API**
  - Legacy: CouchDB directly from client via design docs and server proxies; many endpoints implicit in CoffeeScript code.
  - Modern: Explicit Express routes (`/api/topics`, `/api/blips`, `/api/waves`, inline comments, uploads). CouchDB access via typed helpers (`getDoc`, `find`, `insertDoc`, `updateDoc`).

- **Editor/toolbar**
  - Legacy: Inline toolbar injected next to blips; buttons wired via jQuery; follows the classic Rizzoma look.
  - Modern: TipTap-based editor (`BlipMenu`, `BlipEditor`, inline comments extension). Toolbar exposes `data-testid` hooks for Playwright; parity work needed to mirror legacy controls (Edit/Hide/Copy/Paste/Playback).

- **Realtime/collaboration**
  - Legacy: Socket-based presence and follow-the-green implemented in CoffeeScript.
  - Modern: Socket.io wrapper (`initSocket`, `EditorPresenceManager`) for presence; unread/follow-the-green is being reimplemented via `useWaveUnread` and right tools panel, but some features are still wired to legacy UIs.

- **“Follow the green” / Next button**
  - Legacy: Prominent “Next” button in the right pane to jump to unread blips; critical workflow.
  - Modern: RightToolsPanel + `useWaveUnread` hook exist, but the “Next” UI is not surfaced in the current React layout. The unread logic is present (`useWaveUnread`, `/api/waves/:id/unread`), but the control and badge wiring need to be added to the right pane to match the legacy “Next/Follow the green” behavior.

- **Static assets/build**
  - Legacy: Bundled static JS/CSS served from `src/static` with older build chain.
  - Modern: Vite dev server/build pipeline; output in `dist`. Shared types transpiled for server/client.

- **Testing/tooling**
  - Legacy: Minimal automated UI tests; manual QA.
  - Modern: Playwright/Vitest smoke and unit tests with data-testids (e.g., BlipMenu). CI workflow on the feature branch; lint/typecheck tasks defined.

- **Current gaps (parity)**
  - Blip toolbar rendering: modern BlipMenu not visible in the React view; legacy inline buttons still show.
  - Follow-the-green/Next control not exposed in the right pane.
  - CORS/config friction in dev; needs stable allowed origins and cookie reuse.
  - Some routes still fall back to legacy forms (old topic edit).
