import { randomBytes } from 'crypto';

// Short-lived one-time auth tickets used to bridge an OAuth flow that
// completed in an external browser (Chrome Custom Tabs launched from a
// Capacitor native app) back into the WebView's own cookie jar.
//
// Why: Android's WebView has a Chromium bug (issue 40450316) where
// `setUserAgentString` is not honored for main-frame navigations —
// our overrideUserAgent is silently ignored when the React app does
// `window.location.href = '/api/auth/google'`, so Google rejects the
// request with `disallowed_useragent` (error 403). Google's official
// recommendation for OAuth in native Android apps is Chrome Custom
// Tabs. But Custom Tabs share cookies with the system Chrome browser,
// NOT with the Capacitor WebView — so even on a successful OAuth the
// session cookie lands in the wrong jar. The ticket handoff solves it:
//
//   1. WebView opens /api/auth/google?mobile=1 in Custom Tabs
//   2. Backend sets `state=mobile_<random>` on the Google redirect
//   3. Google redirects back to /api/auth/google/callback?code&state
//   4. Backend sees mobile-state, creates a ticket tied to the user,
//      and 302s to rizzoma://auth-callback?ticket=<id>
//   5. Android intent filter catches rizzoma://, opens the app
//   6. WebView POSTs the ticket to /api/auth/redeem-ticket — this
//      request goes through the WebView's cookie jar, so the session
//      cookie the backend sets on the response lands in the right
//      place and subsequent /api/auth/me calls succeed.
//
// Tickets are single-use and expire after 2 minutes.

export type TicketPayload = {
  userId: string;
  email: string;
  name?: string | undefined;
  avatar?: string | undefined;
};

type Entry = TicketPayload & { expiresAt: number };

const TTL_MS = 2 * 60 * 1000;
const tickets = new Map<string, Entry>();

function sweep(): void {
  const now = Date.now();
  for (const [id, entry] of tickets.entries()) {
    if (entry.expiresAt <= now) tickets.delete(id);
  }
}

export function issueTicket(payload: TicketPayload, explicitId?: string): string {
  sweep();
  const id = explicitId || randomBytes(24).toString('base64url');
  tickets.set(id, { ...payload, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function redeemTicket(id: string): TicketPayload | null {
  sweep();
  const entry = tickets.get(id);
  if (!entry) return null;
  tickets.delete(id);
  if (entry.expiresAt <= Date.now()) return null;
  const { expiresAt: _expiresAt, ...payload } = entry;
  return payload;
}
