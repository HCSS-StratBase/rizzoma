# Rizzoma Architecture & Configuration Reference

This document provides a comprehensive reference for understanding the Rizzoma codebase structure, layout configuration, authentication, and key component locations.

## Table of Contents
1. [Layout System](#layout-system)
2. [Authentication](#authentication)
3. [Component Hierarchy](#component-hierarchy)
4. [Styling Architecture](#styling-architecture)
5. [State Management](#state-management)
6. [Development Notes](#development-notes)

---

## Layout System

### Layout Selection Logic

**File:** `src/client/main.tsx` (lines 81-159)

The app supports two layouts:
- **Rizzoma Layout** (default): Full-featured UI with sidebar, topics list, wave view
- **Basic Layout**: Simple developer/debug view

```typescript
// Line 82-84: Layout parameter parsing
const params = new URLSearchParams(window.location.search);
// Default to Rizzoma layout unless explicitly set to 'basic'
const useRizzomaLayoutParam = params.get('layout') !== 'basic';

// Line 139: Combined layout decision
const forceRizzomaLayout = useRizzomaLayoutParam || route.startsWith('#/topic/') || route.startsWith('#/wave/');
```

**To switch layouts:**
- `http://localhost:3001/` → Rizzoma layout (default)
- `http://localhost:3001/?layout=basic` → Basic layout
- Any `#/topic/` or `#/wave/` route → Forces Rizzoma layout

### Layout Preservation

**File:** `src/client/main.tsx` (lines 54-72)

When `?layout=rizzoma` is present, the app patches `history.pushState` and `history.replaceState` to preserve the layout parameter across navigation.

---

## Authentication

### OAuth Providers

**File:** `src/server/routes/auth.ts`

| Provider | Env Variables | Routes |
|----------|--------------|--------|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `/api/auth/google`, `/api/auth/google/callback` |
| Facebook | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | `/api/auth/facebook`, `/api/auth/facebook/callback` |
| Microsoft | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT` | `/api/auth/microsoft`, `/api/auth/microsoft/callback` |
| SAML 2.0 | `SAML_ENABLED`, `SAML_ENTRY_POINT`, `SAML_ISSUER`, `SAML_CERT` | `/api/auth/saml`, `/api/auth/saml/callback`, `/api/auth/saml/metadata` |

### OAuth Flow

1. User clicks OAuth button → `GET /api/auth/{provider}`
2. Redirect to provider's auth page
3. Provider redirects back → `GET /api/auth/{provider}/callback`
4. Server exchanges code for token, fetches user profile
5. Server finds/creates user by email, sets session
6. Redirect to `CLIENT_URL/?layout=rizzoma` (or `/?layout=rizzoma` if no CLIENT_URL)

### Key Configuration

**File:** `.env`

```bash
# Frontend URL (for OAuth redirects in dev)
CLIENT_URL=http://localhost:3001

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Facebook OAuth
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...

# Microsoft OAuth
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT=common  # 'common' for all accounts, or specific tenant ID

# SAML 2.0 (optional)
SAML_ENABLED=true
SAML_ENTRY_POINT=https://your-idp/sso/saml
SAML_ISSUER=https://your-app
SAML_CERT=-----BEGIN CERTIFICATE-----...
```

### Session Handling

**File:** `src/server/middleware/session.ts`

Sessions use `express-session` with Redis store (or memory fallback in dev).

Session data structure:
```typescript
{
  userId: string;       // CouchDB document ID
  userEmail: string;    // User's email
  userName?: string;    // Display name (from OAuth provider)
  userAvatar?: string;  // Profile picture URL (from OAuth provider)
}
```

### User Avatar Display

**File:** `src/client/components/RightToolsPanel.tsx`

The RightToolsPanel displays the user's avatar in the following priority order:
1. **OAuth provider avatar** (Google, Facebook) - direct URL from provider
2. **Gravatar fallback** - generated from email hash

Note: Microsoft OAuth doesn't provide a direct avatar URL (requires additional API call to fetch binary photo data), so Microsoft users fall back to Gravatar.

### OAuth Status Endpoint

**File:** `src/server/routes/auth.ts` (line 493)

`GET /api/auth/oauth-status` returns which providers are configured:
```json
{"google":true,"facebook":true,"microsoft":true,"saml":false}
```

---

## Component Hierarchy

### Main App Structure

```
src/client/main.tsx
├── App (main component)
│   ├── RizzomaLanding (when not authenticated)
│   │   └── AuthPanel (OAuth buttons + email login)
│   └── RizzomaLayout (when authenticated)
│       ├── NavigationPanel (far left - +New, Topics, Mentions, etc.)
│       ├── RizzomaTopicsList / MentionsList / TasksList (left panel)
│       ├── RizzomaTopicDetail (center - wave content)
│       └── RightToolsPanel (far right - avatar, Next, view toggles)
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `App` | `src/client/main.tsx` | Root component, layout switching, auth state |
| `RizzomaLayout` | `src/client/components/RizzomaLayout.tsx` | Main app shell with panels |
| `RizzomaLanding` | `src/client/components/RizzomaLanding.tsx` | Landing page for unauthenticated users |
| `AuthPanel` | `src/client/components/AuthPanel.tsx` | OAuth buttons and email login form |
| `NavigationPanel` | `src/client/components/NavigationPanel.tsx` | Left sidebar with tab buttons |
| `RizzomaTopicsList` | `src/client/components/RizzomaTopicsList.tsx` | Topics list with search |
| `RizzomaTopicDetail` | `src/client/components/RizzomaTopicDetail.tsx` | Wave/topic content viewer |
| `RightToolsPanel` | `src/client/components/RightToolsPanel.tsx` | User avatar, Next button, view controls |
| `RizzomaBlip` | `src/client/components/blip/RizzomaBlip.tsx` | Individual blip (message) renderer |

### Props Flow

```
main.tsx (me state)
  └── RizzomaLayout (isAuthed, user)
      └── RightToolsPanel (isAuthed, user, unreadState)
          └── User avatar display
```

---

## Styling Architecture

### CSS Files

Each component has a corresponding CSS file:

| Component | CSS File |
|-----------|----------|
| `RizzomaLayout` | `src/client/components/RizzomaLayout.css` |
| `RizzomaTopicsList` | `src/client/components/RizzomaTopicsList.css` |
| `RizzomaTopicDetail` | `src/client/components/RizzomaTopicDetail.css` |
| `RightToolsPanel` | `src/client/components/RightToolsPanel.css` |
| `AuthPanel` | `src/client/components/AuthPanel.css` |
| `RizzomaBlip` | `src/client/components/blip/RizzomaBlip.css` |

### Global Styles

- `src/client/RizzomaApp.css` - App-wide styles
- `src/client/styles/breakpoints.css` - Responsive breakpoints
- `src/client/styles/view-transitions.css` - Page transition animations

### Panel Widths (RizzomaLayout.css)

```css
.navigation-container { width: 56px; }     /* Far left - icons only */
.tabs-container { width: 280px; }          /* Topics/search panel */
.wave-container { flex: 1; }               /* Main content - fills remaining */
.right-tools-panel { width: 80px; }        /* Far right - avatar, controls */
```

### User Avatar Styling (RightToolsPanel.css)

```css
.user-avatar-large {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  /* ... */
}
```

---

## State Management

### Authentication State

**Location:** `src/client/main.tsx`

```typescript
const [me, setMe] = useState<any>(null);  // User object from /api/auth/me
```

User object structure:
```typescript
{
  id: string;       // CouchDB document ID
  email: string;    // User's email
  name?: string;    // Display name
  avatar?: string;  // Avatar URL (from OAuth provider)
}
```

### Topic/Wave State

**Location:** `src/client/components/RizzomaLayout.tsx`

```typescript
const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
const [activeTab, setActiveTab] = useState<TabType>('topics');
const unreadState = useWaveUnread(selectedTopicId);
```

### Unread State Hook

**File:** `src/client/hooks/useWaveUnread.ts`

Tracks unread blips for the current wave, provides:
- `unreadIds: string[]` - IDs of unread blips
- `markBlipRead(id)` - Mark a blip as read
- `refresh()` - Refresh unread state

---

## Development Notes

### Vite Hot Module Replacement (HMR)

**Known Issue:** Vite HMR sometimes doesn't pick up changes, especially:
- Changes to files imported at module level (constants, configs)
- Changes to hook dependencies
- Complex component structure changes

**Workarounds:**
1. Hard refresh: `Ctrl+Shift+R` or `Cmd+Shift+R`
2. Restart Vite: Kill and restart `npm run dev`
3. Clear Vite cache: Delete `node_modules/.vite`

**Why this happens:**
- Vite uses ES module imports which can cache at the browser level
- Some changes require full module graph invalidation
- React Fast Refresh has limitations with certain patterns

### Port Configuration

| Service | Default Port | Description |
|---------|-------------|-------------|
| Vite (frontend) | 3000 (or 3001 if 3000 in use) | Dev server with HMR |
| Express (API) | 8000 | Backend API server |
| CouchDB | 5984 | Database |
| Redis | 6379 | Session store |

### Environment Variables Loading

**File:** `src/server/app.ts` (line 1)

```typescript
import 'dotenv/config';  // Loads .env file
```

The `.env` file must be in the project root. Changes require server restart.

### Hash-based Routing

The app uses hash-based routing (`#/topic/...`, `#/wave/...`) for SPA navigation:

```typescript
// Route patterns
#/                    → Topics list
#/topic/{id}          → View topic
#/wave/{id}           → View wave
#/waves               → Waves list
#/editor/search       → Editor search
#/editor/admin        → Editor admin
```

---

## Quick Reference

### Adding a New OAuth Provider

1. Add env vars to `.env` and `src/server/routes/auth.ts`
2. Add routes: `GET /api/auth/{provider}` and `GET /api/auth/{provider}/callback`
3. Update `oauth-status` endpoint
4. Update `OAuthStatus` type in `src/client/components/AuthPanel.tsx`
5. Add button to AuthPanel

### Changing Layout Default

**File:** `src/client/main.tsx` line 84

```typescript
// Current: Rizzoma is default
const useRizzomaLayoutParam = params.get('layout') !== 'basic';

// To make basic default:
const useRizzomaLayoutParam = params.get('layout') === 'rizzoma';
```

### Adding User Data to Components

1. Pass `user` prop from `main.tsx` → `RizzomaLayout`
2. Add to `RizzomaLayoutProps` interface
3. Pass down to child components as needed

---

*Last updated: 2026-01-20*
