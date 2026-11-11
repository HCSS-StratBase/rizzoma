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
  - Legacy: TWO-LEVEL TOOLBAR ARCHITECTURE:
    1. **Topic-level toolbars** (always visible at top): Collaboration toolbar (Invite, participant avatars +N, Share, gear) + Topic Edit toolbar (Edit, comments, link)
    2. **Blip-level toolbar** (only on EXPANDED blip): Appears when you click/focus a blip; hidden for collapsed blips
  - Modern: TipTap-based editor (`BlipMenu`, `BlipEditor`, inline comments extension). Toolbar exposes `data-testid` hooks for Playwright.
  - **GAP**: Modern shows toolbar on ALL blips. Legacy shows toolbar ONLY on expanded/focused blip. Topic-level toolbars are completely missing.

- **Blip collapse/expand behavior**
  - Legacy: Blips are COLLAPSED by default (when "Hidden" is checked), showing only `• Label [+]`. Click [+] to expand. Toolbar appears ONLY when blip is expanded. Green [+] indicates unread content. Expanding parent does NOT auto-expand children.
  - Modern: All blips rendered expanded with toolbars visible. No [+]/[−] collapse icons. No collapsed "Table of Contents" view.
  - **GAP**: This is a FUNDAMENTAL difference in how the UI behaves. Modern needs complete rework to match the collapse-first BLB pattern.

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

- **Reply vs Inline Comment (Two types of child blips)**
  - Legacy: TWO ways to create child blips:
    1. **Reply** (blip UNDER): Created via "Write a reply..." at bottom. Comments on ENTIRE parent blip. Appears at end of parent's content.
    2. **Inline Comment** (blip IN): Created via Ctrl+Enter at cursor position. Comments on THAT SPECIFIC SPOT. Appears INLINE at anchor position within content.
  - Both are full blip documents (own author, timestamp, can have their own children recursively)
  - Both are "blank sheets" - user decides format (bulleted, plain text, etc.)
  - Data model: `anchorPosition` field distinguishes them (null = reply, set = inline)
  - Modern: Currently treats Ctrl+Enter incorrectly. Child blips render as separate containers below "Write a reply..." instead of at anchor positions.
  - **GAP**: Need to implement `anchorPosition` field and render inline comments at their anchor positions within parent content.

- **Blip container structure**
  - Legacy: ONE container per expanded blip containing:
    1. Toolbar
    2. Content with INLINE COMMENTS embedded at anchor positions
    3. REPLIES (child blips with no anchor) as collapsed rows
    4. "Write a reply..." input at the very bottom
  - Modern: Wrong structure - child blips rendered as separate containers AFTER "Write a reply..." instead of integrated into the parent's view.
  - **GAP**: Need to fix render order and integrate inline comments at anchor positions.

- **Topic = Meta-Blip (Title is First Line)**
  - Legacy: Topic IS a blip (the root/meta-blip). Title is just the first line of content with H1/bold styling. Topic content is fully editable like any blip. Can have inline comments (Ctrl+Enter) anywhere in topic content.
  - Modern: Topic title is a SEPARATE field, edited via special textarea. Topic content only used for tag extraction. No inline comments in topic content.
  - **GAP**: Topic should be treated as a full editable blip with title as first line. Need to unify Topic and Blip rendering/editing.

- **Current gaps (parity)**
  - **Topic as meta-blip missing**: Topic should be editable like any blip, with title as styled first line
  - **Topic-level toolbars missing**: No collaboration toolbar (Invite, avatars, Share) or topic-level Edit toolbar at top of topics.
  - **Blip collapse behavior wrong**: Modern shows all blips expanded with toolbars. Legacy collapses blips by default, showing only `Label [+]`. Toolbar only appears on expanded/focused blip.
  - **No [+]/[−] expand icons**: Legacy uses [+] (collapsed) and [−] (expanded) icons. Green [+] for unread content.
  - **Child blip render order wrong**: Should be: content → inline comments at anchors → replies at bottom → "Write a reply..."
  - **Child blip format inconsistent**: Child blips should render same as any collapsed blip (`Label [+] avatar date`), not as `□ Untitled blip`
  - **Inline comment anchoring missing**: Ctrl+Enter should create blip at cursor position, not at bottom
  - Follow-the-green/Next control not exposed in the right pane.
  - CORS/config friction in dev; needs stable allowed origins and cookie reuse.
  - Some routes still fall back to legacy forms (old topic edit).
