# Rizzoma Build Quality Verdict

- Sweep folder: `screenshots/260424-025320-feature-sweep/`
- Branch: `feature/rizzoma-core-features`
- Working-tree checkpoint: generated from the rebuilt public-production app on 2026-04-24 02:53 CEST; the commit containing this verdict is the durable checkpoint.
- Evidence scope: visual/public-prod sweep plus the local verification commands recorded in project docs. This file is a visual verdict, not a replacement for backend/security/load testing.

## Overall Verdict

- 🟩 Green: 98 functionality rows have acceptable visual evidence in this sweep.
- 🟧 Orange: 63 functionality rows are partial, non-visual, or visually present with a known caveat.
- 🟥 Red: 0 functionality rows are visually blocked or missing required screenshot evidence.
- Bottom line: the branch is substantially better than a smoke-test build. Core Rizzoma UI, BLB navigation, rich-text editing, playback surfaces, right-panel tools, mobile topic content, avatar/presence fallback rendering, and realtime cursor/typing surfaces are visually covered. It is not yet a polished production finish because backend-only features, security behavior, email/upload/offline behavior, real-device mobile validation, gesture validation, and larger perf/device sweeps remain outside or below the visual sign-off bar.

## Legend

- 🟩 [x] Green means the functionality has acceptable visual evidence in this screenshot sweep.
- 🟧 [x] Orange means partial evidence, backend-only evidence, static screenshot limits, or a known product-quality caveat.
- 🟥 [x] Red means a visual blocker or missing required screenshot evidence. There are no red rows in this sweep.

## Section Health

| Section | Total | 🟩 Green | 🟧 Orange | 🟥 Red | Readout |
|---|---:|---:|---:|---:|---|
| Authentication & Security | 12 | 4 | 8 | 0 | Mixed: visible UI is mostly covered; non-visual or caveated behavior remains. |
| Waves & Blips (Core Data Model) | 8 | 1 | 7 | 0 | Mixed: visible UI is mostly covered; non-visual or caveated behavior remains. |
| Rich Text Editor | 16 | 16 | 0 | 0 | Visually healthy in this sweep. |
| Real-time Collaboration | 6 | 3 | 3 | 0 | Mixed: visible UI is mostly covered; non-visual or caveated behavior remains. |
| Unread Tracking (Follow-the-Green) | 9 | 4 | 5 | 0 | Mixed: visible UI is mostly covered; non-visual or caveated behavior remains. |
| Inline Comments System | 6 | 1 | 5 | 0 | Mixed: visible UI is mostly covered; non-visual or caveated behavior remains. |
| File Uploads & Storage | 7 | 0 | 7 | 0 | Needs non-visual verification beyond screenshots. |
| Search & Recovery | 5 | 1 | 4 | 0 | Mixed: visible UI is mostly covered; non-visual or caveated behavior remains. |
| Blip Operations (Gear Menu) | 9 | 9 | 0 | 0 | Visually healthy in this sweep. |
| History & Playback | 13 | 10 | 3 | 0 | Mixed: visible UI is mostly covered; non-visual or caveated behavior remains. |
| Email Notifications | 6 | 1 | 5 | 0 | Mixed: visible UI is mostly covered; non-visual or caveated behavior remains. |
| Mobile & PWA | 11 | 0 | 11 | 0 | Needs non-visual verification beyond screenshots. |
| User Interface Components | 23 | 23 | 0 | 0 | Visually healthy in this sweep. |
| BLB (Bullet-Label-Blip) — Core Paradigm | 22 | 17 | 5 | 0 | Mixed: visible UI is mostly covered; non-visual or caveated behavior remains. |
| Inline Widgets & Styling | 8 | 8 | 0 | 0 | Visually healthy in this sweep. |

## Functionality Visual Checklist

### Authentication & Security

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-001 | User registration (email/password) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [001-logged-out-sign-in-form.png](001-logged-out-sign-in-form.png)<br>[002-logged-out-sign-up-form.png](002-logged-out-sign-up-form.png) | Visible in the sweep; screenshot evidence exists. |
| VF-002 | User login (rate-limited, secure cookies) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | [001-logged-out-sign-in-form.png](001-logged-out-sign-in-form.png) | Login entry is visible, but rate limiting and cookie security are not visually proven. |
| VF-003 | Google OAuth 2.0 | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [001-logged-out-sign-in-form.png](001-logged-out-sign-in-form.png) | Visible in the sweep; screenshot evidence exists. |
| VF-004 | Facebook OAuth | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [001-logged-out-sign-in-form.png](001-logged-out-sign-in-form.png) | Visible in the sweep; screenshot evidence exists. |
| VF-005 | Microsoft OAuth (hand-rolled, Graph API) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [001-logged-out-sign-in-form.png](001-logged-out-sign-in-form.png) | Visible in the sweep; screenshot evidence exists. |
| VF-006 | SAML 2.0 (`@node-saml/node-saml` v5) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-007 | Twitter OAuth | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-008 | Session management (Redis 5) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-009 | CSRF protection (double-submit token) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-010 | Permission guards (`requireAuth` middleware) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-011 | Zod request validation | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-012 | Rate limiting (per-route) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |

### Waves & Blips (Core Data Model)

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-013 | Wave (topic) schema + typed interface | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-014 | Wave CRUD API (list, create, read, update, delete) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-015 | Blip schema + typed interface | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-016 | Blip CRUD API (list, create, read, update, delete) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-017 | Blip tree retrieval (single Mango query, 18s → 29ms) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-018 | Blip soft-delete + cascade to children | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-019 | Topic view with full blip tree | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png) | Visible in the sweep; screenshot evidence exists. |
| VF-020 | Wave participants API | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |

### Rich Text Editor

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-021 | Editor framework (TipTap v2 / ProseMirror) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-022 | Bold / Italic / Underline / Strikethrough | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-023 | Headings (H1-H6) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-024 | Bullet list / Ordered list | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-025 | Task lists (checkboxes) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-026 | Code / Code block / Blockquote | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-027 | Code block: syntax highlighting (30 languages) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-028 | Highlight (text background color) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-029 | Links (add/edit/remove) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-030 | Images (node extension) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-031 | @mentions autocomplete dropdown | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [024-mention-autocomplete-active.png](024-mention-autocomplete-active.png) | Visible in the sweep; screenshot evidence exists. |
| VF-032 | Edit mode toolbar (blue #4EA0F1) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |
| VF-033 | Read mode toolbar (minimal) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png) | Visible in the sweep; screenshot evidence exists. |
| VF-034 | Gadget nodes (chart, poll, attachment, image) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [027-right-panel-gadget-palette-open.png](027-right-panel-gadget-palette-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-035 | Gadget palette (11 types in grid layout) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [027-right-panel-gadget-palette-open.png](027-right-panel-gadget-palette-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-036 | Toolbar icons: SVG sprites vs emoji characters | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [021-edit-toolbar-full-rich-text-controls.png](021-edit-toolbar-full-rich-text-controls.png) | Visible in the sweep; screenshot evidence exists. |

### Real-time Collaboration

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-037 | Transport layer (Socket.IO v4) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-038 | CRDT engine (Yjs) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-039 | Live cursors (Yjs awareness, user colors) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [042-real-time-cursor-and-typing-indicator-visible.png](042-real-time-cursor-and-typing-indicator-visible.png) | Dynamic two-client visual evidence captured. |
| VF-040 | Typing indicators | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [042-real-time-cursor-and-typing-indicator-visible.png](042-real-time-cursor-and-typing-indicator-visible.png) | Dynamic two-client visual evidence captured. |
| VF-041 | Presence indicator (avatars, overflow counts) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png)<br>[040-mobile-topic-content-view.png](040-mobile-topic-content-view.png)<br>[042-real-time-cursor-and-typing-indicator-visible.png](042-real-time-cursor-and-typing-indicator-visible.png) | Avatar/presence areas now render local initials or provider avatars without broken external fallback placeholders in the rebuilt public-prod sweep. |
| VF-042 | Event broadcasting (blip:created/updated/deleted) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |

### Unread Tracking (Follow-the-Green)

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-043 | Per-user read state (CouchDB BlipRead docs) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-044 | Mark single blip read API | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-045 | Mark batch read API | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-046 | Unread count aggregation (batch query) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-047 | Next/Prev unread navigation (server-computed) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-048 | Green left border on unread blips | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png) | Visible in the sweep; screenshot evidence exists. |
| VF-049 | Wave list badge (unread/total count) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png) | Visible in the sweep; screenshot evidence exists. |
| VF-050 | "Follow the Green" CTA button | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png) | Visible in the sweep; screenshot evidence exists. |
| VF-051 | Keyboard navigation (j/k/g/G) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png) | Visible in the sweep; screenshot evidence exists. |

### Inline Comments System

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-052 | Comment structure (range anchoring, text snapshot) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-053 | Comment CRUD APIs | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-054 | Comment threading (rootId + parentId) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-055 | Resolve / unresolve | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [029-inline-comments-nav-state.png](029-inline-comments-nav-state.png) | Visible in the sweep; screenshot evidence exists. |
| VF-056 | Visibility preference per-blip (server + localStorage) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-057 | Keyboard shortcuts (Ctrl+Shift+Up/Down) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |

### File Uploads & Storage

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-058 | Upload endpoint (Multer, 10MB limit) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-059 | MIME magic-byte sniffing | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-060 | Executable extension blocking (.exe, .bat, etc.) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-061 | ClamAV virus scanning (optional) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-062 | Storage backends: local filesystem | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-063 | Storage backends: AWS S3 / MinIO | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-064 | Client upload library (progress, cancel, retry) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |

### Search & Recovery

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-065 | Full-text search (Mango regex, title + content) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-066 | Snippet generation (150-char context + highlight) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [004-topics-search-filter-typed.png](004-topics-search-filter-typed.png) | Visible in the sweep; screenshot evidence exists. |
| VF-067 | Yjs document rebuild | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-068 | Wave materialization | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-069 | Rebuild status polling | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |

### Blip Operations (Gear Menu)

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-070 | Reply (create child blip) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-071 | Edit (inline TipTap editor) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-072 | Delete (soft delete + children) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-073 | Duplicate blip | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-074 | Cut / Paste (clipboard store, reparent) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-075 | Copy link (navigator clipboard) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-076 | History modal (timeline, play/pause, diff) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [030-per-blip-playback-history-modal.png](030-per-blip-playback-history-modal.png) | Visible in the sweep; screenshot evidence exists. |
| VF-077 | Gear dropdown menu | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-078 | Copy/paste reply/cursor variants | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |

### History & Playback

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-079 | History storage (BlipHistoryDoc, snapshots) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-080 | History API (`GET /api/blips/:id/history`) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-081 | Per-blip playback UI (timeline slider, play/pause/step) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [030-per-blip-playback-history-modal.png](030-per-blip-playback-history-modal.png) | Visible in the sweep; screenshot evidence exists. |
| VF-082 | Per-blip playback speed (0.5x to 4x) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [030-per-blip-playback-history-modal.png](030-per-blip-playback-history-modal.png) | Visible in the sweep; screenshot evidence exists. |
| VF-083 | Per-blip diff view (before/after comparison) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [030-per-blip-playback-history-modal.png](030-per-blip-playback-history-modal.png) | Visible in the sweep; screenshot evidence exists. |
| VF-084 | Wave-level history API (`GET /api/waves/:id/history`) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-085 | Wave-level playback modal (all blips chronologically) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [017-wave-timeline-playback-modal-open.png](017-wave-timeline-playback-modal-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-086 | Wave playback: split pane (content + wave overview) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [017-wave-timeline-playback-modal-open.png](017-wave-timeline-playback-modal-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-087 | Wave playback: cluster fast-forward/back (3s gap) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [017-wave-timeline-playback-modal-open.png](017-wave-timeline-playback-modal-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-088 | Wave playback: date jump (datetime picker) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [017-wave-timeline-playback-modal-open.png](017-wave-timeline-playback-modal-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-089 | Wave playback: per-blip diff (same blip comparison) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [030-per-blip-playback-history-modal.png](030-per-blip-playback-history-modal.png) | Visible in the sweep; screenshot evidence exists. |
| VF-090 | Wave playback: keyboard shortcuts | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [017-wave-timeline-playback-modal-open.png](017-wave-timeline-playback-modal-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-091 | Wave playback: speed (0.5x to 10x) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [017-wave-timeline-playback-modal-open.png](017-wave-timeline-playback-modal-open.png) | Visible in the sweep; screenshot evidence exists. |

### Email Notifications

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-092 | Email service (Nodemailer v7) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-093 | Invite emails | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [011-invite-participants-modal-open.png](011-invite-participants-modal-open.png)<br>[012-invite-participants-modal-filled-email.png](012-invite-participants-modal-filled-email.png) | Visible in the sweep; screenshot evidence exists. |
| VF-094 | Activity notifications (mentions, replies) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-095 | Digest emails (daily/weekly summary) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-096 | Notification preferences API | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-097 | SMTP templates (styled HTML) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |

### Mobile & PWA

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-098 | Responsive breakpoints (xs/sm/md/lg/xl) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-099 | Mobile detection hooks (isMobile/isTablet/isDesktop) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-100 | PWA manifest + icons (8 sizes) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-101 | Service worker (cache-first assets, network-first API) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-102 | Swipe gestures (left/right panel navigation) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | [039-mobile-authenticated-topic-navigation.png](039-mobile-authenticated-topic-navigation.png) | Mobile navigation/content is visible; swipe gesture behavior still needs action-level device verification. |
| VF-103 | Pull to refresh | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | [039-mobile-authenticated-topic-navigation.png](039-mobile-authenticated-topic-navigation.png) | Mobile shell is visible; pull-to-refresh behavior is not proven by this static screenshot. |
| VF-104 | View Transitions API (with reduced-motion) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-105 | Offline mutation queue (auto-sync, max 3 retries) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-106 | BottomSheet mobile menu | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | [039-mobile-authenticated-topic-navigation.png](039-mobile-authenticated-topic-navigation.png) | Mobile view is present, but the BottomSheet open/dismiss interaction is not directly captured in this sweep. |
| VF-107 | Touch targets (44px minimum) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | [039-mobile-authenticated-topic-navigation.png](039-mobile-authenticated-topic-navigation.png) | Touch layout is visible, but 44px target compliance has not been measured across devices. |
| VF-108 | Mobile layout (device validation on real devices) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Real-device validation is explicitly outside this screenshot sweep. |

### User Interface Components

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-109 | Three-panel layout (nav + topic + tools) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png) | Visible in the sweep; screenshot evidence exists. |
| VF-110 | Navigation panel (Topics, Mentions, Tasks, Public, Store, Teams) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png)<br>[005-nav-mentions-tab.png](005-nav-mentions-tab.png)<br>[006-nav-tasks-tab.png](006-nav-tasks-tab.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-111 | Navigation panel icons (SVG sprites vs emojis) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png)<br>[005-nav-mentions-tab.png](005-nav-mentions-tab.png)<br>[006-nav-tasks-tab.png](006-nav-tasks-tab.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-112 | Navigation badge count | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png)<br>[004-topics-search-filter-typed.png](004-topics-search-filter-typed.png) | Visible in the sweep; screenshot evidence exists. |
| VF-113 | Topics list | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png)<br>[004-topics-search-filter-typed.png](004-topics-search-filter-typed.png) | Visible in the sweep; screenshot evidence exists. |
| VF-114 | Topics list: date format | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png)<br>[004-topics-search-filter-typed.png](004-topics-search-filter-typed.png) | Visible in the sweep; screenshot evidence exists. |
| VF-115 | Topics list: unread bar color | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png)<br>[004-topics-search-filter-typed.png](004-topics-search-filter-typed.png) | Visible in the sweep; screenshot evidence exists. |
| VF-116 | Topics list: filter dropdown (Inbox/All/By me) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png)<br>[004-topics-search-filter-typed.png](004-topics-search-filter-typed.png) | Visible in the sweep; screenshot evidence exists. |
| VF-117 | Mentions tab | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [005-nav-mentions-tab.png](005-nav-mentions-tab.png) | Visible in the sweep; screenshot evidence exists. |
| VF-118 | Mentions tab: populated content | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [005-nav-mentions-tab.png](005-nav-mentions-tab.png) | Visible in the sweep; screenshot evidence exists. |
| VF-119 | Tasks tab | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [006-nav-tasks-tab.png](006-nav-tasks-tab.png) | Visible in the sweep; screenshot evidence exists. |
| VF-120 | Tasks tab: filter buttons | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png)<br>[004-topics-search-filter-typed.png](004-topics-search-filter-typed.png) | Visible in the sweep; screenshot evidence exists. |
| VF-121 | Participants bar (invite + avatars) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [011-invite-participants-modal-open.png](011-invite-participants-modal-open.png)<br>[012-invite-participants-modal-filled-email.png](012-invite-participants-modal-filled-email.png) | Visible in the sweep; screenshot evidence exists. |
| VF-122 | Share modal | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [013-share-settings-modal-open.png](013-share-settings-modal-open.png)<br>[014-share-settings-option-selected.png](014-share-settings-option-selected.png) | Visible in the sweep; screenshot evidence exists. |
| VF-123 | Right panel: user avatar | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [033-fold-all-after-hide-replies.png](033-fold-all-after-hide-replies.png)<br>[034-unfold-all-after-show-replies.png](034-unfold-all-after-show-replies.png)<br>[035-right-panel-text-view-selected.png](035-right-panel-text-view-selected.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-124 | Right panel: Next button color | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [033-fold-all-after-hide-replies.png](033-fold-all-after-hide-replies.png)<br>[034-unfold-all-after-show-replies.png](034-unfold-all-after-show-replies.png)<br>[035-right-panel-text-view-selected.png](035-right-panel-text-view-selected.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-125 | Right panel: hide/show replies icons | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [033-fold-all-after-hide-replies.png](033-fold-all-after-hide-replies.png)<br>[034-unfold-all-after-show-replies.png](034-unfold-all-after-show-replies.png)<br>[035-right-panel-text-view-selected.png](035-right-panel-text-view-selected.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-126 | Right panel: mind map button | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [033-fold-all-after-hide-replies.png](033-fold-all-after-hide-replies.png)<br>[034-unfold-all-after-show-replies.png](034-unfold-all-after-show-replies.png)<br>[035-right-panel-text-view-selected.png](035-right-panel-text-view-selected.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-127 | Login modal | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [001-logged-out-sign-in-form.png](001-logged-out-sign-in-form.png)<br>[002-logged-out-sign-up-form.png](002-logged-out-sign-up-form.png) | Visible in the sweep; screenshot evidence exists. |
| VF-128 | Hide replies / folded view | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [033-fold-all-after-hide-replies.png](033-fold-all-after-hide-replies.png)<br>[034-unfold-all-after-show-replies.png](034-unfold-all-after-show-replies.png)<br>[035-right-panel-text-view-selected.png](035-right-panel-text-view-selected.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-129 | Auth panel (modal, not page) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [001-logged-out-sign-in-form.png](001-logged-out-sign-in-form.png)<br>[002-logged-out-sign-up-form.png](002-logged-out-sign-up-form.png) | Visible in the sweep; screenshot evidence exists. |
| VF-130 | Toast notifications | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [041-toast-notification-component-visible.png](041-toast-notification-component-visible.png) | Visible in the sweep; screenshot evidence exists. |
| VF-131 | Keyboard shortcuts panel (bottom of nav) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [003-nav-topics-tab-and-searchable-topic-list.png](003-nav-topics-tab-and-searchable-topic-list.png)<br>[039-mobile-authenticated-topic-navigation.png](039-mobile-authenticated-topic-navigation.png) | Visible in the sweep; screenshot evidence exists. |

### BLB (Bullet-Label-Blip) — Core Paradigm

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-132 | Collapsed TOC (bullet + label + [+]) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-133 | Section expanded (blip content visible) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-134 | [+] click = INLINE expansion (not navigation) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-135 | [−] click = collapse back | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>[032-inline-marker-after-click-expanded.png](032-inline-marker-after-click-expanded.png)<br>[033-fold-all-after-hide-replies.png](033-fold-all-after-hide-replies.png) | Visible in the sweep; screenshot evidence exists. |
| VF-136 | Portal-based rendering (child at marker position) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-137 | Three-state toolbar: [+] expand = just text | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-138 | Three-state toolbar: click into child = read toolbar | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-139 | Three-state toolbar: click Edit = full edit toolbar | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-140 | Click outside inline child = toolbar hidden | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-141 | Toolbar left-aligned in inline children | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-142 | Ctrl+Enter creates inline child at cursor position | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-143 | Inline child editing (Edit button, content persists) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-144 | [+] marker styling (gray #b3b3b3, 16x14px, white text) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-145 | [+] marker: green for unread, gray for read | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-146 | Orphaned markers hidden (cross-wave references) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-147 | All sections expanded simultaneously | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-148 | Fold/Unfold all (▲/▼ in right panel) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-149 | Fold state persistence (localStorage + server) | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |
| VF-150 | Reply vs inline comment distinction | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-151 | Mid-sentence [+] markers (multiple per paragraph) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-152 | Nested inline expansion ([+] within expanded [+]) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [018-topic-landing-collapsed-blb-toc.png](018-topic-landing-collapsed-blb-toc.png)<br>[019-expanded-blip-read-toolbar.png](019-expanded-blip-read-toolbar.png)<br>[031-inline-marker-before-click.png](031-inline-marker-before-click.png)<br>+3 more | Visible in the sweep; screenshot evidence exists. |
| VF-153 | Auth-gated Edit button | 🟩 [ ] | 🟧 [x] | 🟥 [ ] | - | Not meaningfully judgeable from a screenshot; needs API/unit/security/runtime evidence. |

### Inline Widgets & Styling

| ID | Functionality | Green | Orange | Red | Evidence | Visual verdict |
|---|---|---|---|---|---|---|
| VF-154 | @mention: turquoise pill with pipe delimiters (\ | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [024-mention-autocomplete-active.png](024-mention-autocomplete-active.png) | Visible in the sweep; screenshot evidence exists. |
| VF-155 | ~task: turquoise pill with checkbox (\ | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [025-task-trigger-typed.png](025-task-trigger-typed.png) | Visible in the sweep; screenshot evidence exists. |
| VF-156 | #tag: plain turquoise text (no background/border) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [026-tag-trigger-typed.png](026-tag-trigger-typed.png)<br>[032-inline-marker-after-click-expanded.png](032-inline-marker-after-click-expanded.png) | Visible in the sweep; screenshot evidence exists. |
| VF-157 | Insert shortcuts (right panel: ↵ @ ~ # Gadgets) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [027-right-panel-gadget-palette-open.png](027-right-panel-gadget-palette-open.png)<br>[020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-158 | Insert shortcut button styling (light blue bg, white icons) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [027-right-panel-gadget-palette-open.png](027-right-panel-gadget-palette-open.png)<br>[020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-159 | Insert buttons auto-enter-edit-mode | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [027-right-panel-gadget-palette-open.png](027-right-panel-gadget-palette-open.png)<br>[020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-160 | Toolbar decluttered (Hide/Delete → gear overflow) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [027-right-panel-gadget-palette-open.png](027-right-panel-gadget-palette-open.png)<br>[020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
| VF-161 | Gadget iframe rendering (Yes/No/Maybe poll, YouTube, etc.) | 🟩 [x] | 🟧 [ ] | 🟥 [ ] | [027-right-panel-gadget-palette-open.png](027-right-panel-gadget-palette-open.png)<br>[020-read-gear-menu-open.png](020-read-gear-menu-open.png)<br>[022-edit-overflow-menu-open.png](022-edit-overflow-menu-open.png) | Visible in the sweep; screenshot evidence exists. |
