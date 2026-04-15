import { Router } from 'express';
import { z } from 'zod';
// Use a wrapper that prefers native bcrypt but falls back to bcryptjs when native build is unavailable
import { hash as bcryptHash, compare as bcryptCompare } from '../lib/bcrypt.js';
import rateLimit from 'express-rate-limit';
import { findOne, insertDoc, getDoc, updateDoc } from '../lib/couch.js';
import { getCsrfTokenFromSession } from '../middleware/csrf.js';
import { noStore } from '../middleware/noStore.js';
import { isSamlEnabled, getSamlInstance, extractUserFromProfile, generateMetadata } from '../lib/saml.js';
import { logAuthEvent } from '../lib/logger.js';
import { issueTicket, redeemTicket } from '../lib/authTickets.js';
import { randomBytes } from 'crypto';
// import { config } from '../config.js';

// Mobile OAuth handoff: Android's WebView has a Chromium bug where
// setUserAgentString is dropped on main-frame navigations (issue
// 40450316) — our overrideUserAgent is silently ignored when the
// React app does a full-page nav, so Google sees the `wv` marker
// and rejects the OAuth with a 400. Fix: the native shell launches
// OAuth in Chrome Custom Tabs (via @capacitor/browser), which is a
// real Chrome instance with a valid UA.
//
// Custom Tabs run in Chrome's cookie jar, not the WebView's, so we
// can't set a session cookie during the callback. Instead:
//   1. Before opening Custom Tabs, the app generates a random nonce.
//   2. The app opens /api/auth/google?mobile=1&nonce=<nonce> in tabs.
//   3. Backend sets state = mobile_<nonce> on the Google redirect.
//   4. Google → callback with state.
//   5. Backend issues an auth ticket keyed BY THE NONCE and renders
//      a tiny HTML page that closes the tab (window.close()).
//   6. Chrome Custom Tabs closes, Capacitor's browserFinished event
//      fires, and the app POSTs the nonce to /api/auth/redeem-ticket
//      through the WebView's own cookie jar — session cookie lands
//      in the right place and /api/auth/me returns the user.
const MOBILE_STATE_PREFIX = 'mobile_';
const isMobileState = (state: string | undefined | null): boolean =>
  typeof state === 'string' && state.startsWith(MOBILE_STATE_PREFIX);
const makeMobileState = (): string => MOBILE_STATE_PREFIX + randomBytes(16).toString('base64url');
const extractNonceFromState = (state: string): string => state.slice(MOBILE_STATE_PREFIX.length);

/** HTML page shown in Chrome Custom Tabs after a successful mobile
 *  OAuth callback. Auto-closes the tab which fires browserFinished
 *  in the Capacitor app; we include a visible fallback in case the
 *  user's browser blocks window.close on same-origin navigations. */
const OAUTH_DONE_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signed in</title><style>body{font-family:-apple-system,Roboto,sans-serif;background:#2c3e50;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}h1{margin:0 0 12px;font-size:22px}p{margin:0;opacity:.85}</style></head><body><div><h1>Signed in to Rizzoma</h1><p>You can close this tab and return to the app.</p></div><script>setTimeout(function(){try{window.close()}catch(e){}},400);</script></body></html>`;

// Use minimal bcrypt rounds in dev/test for speed; 10 in production
// 4 rounds is still slow with bcryptjs fallback, so use 2 rounds for even faster dev/test auth
const BCRYPT_ROUNDS = process.env['NODE_ENV'] === 'production' ? 10 : 2;

const router = Router();

// Basic rate limiters for auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

const RegisterBody = z.object({ email: z.string().email(), password: z.string().min(6).max(200) });
const LoginBody = RegisterBody;

type User = {
  _id?: string;
  type: 'user';
  email: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  name?: string;
  avatar?: string;  // Profile picture URL from OAuth provider
};

router.post('/register', authLimiter, async (req, res): Promise<void> => {
  try {
    const { email, password } = RegisterBody.parse(req.body ?? {});
    const normalized = email.trim().toLowerCase();
    const existing = await findOne<User>({ type: 'user', email: normalized });
    if (existing) { res.status(409).json({ error: 'email_in_use', requestId: (req as any)?.id }); return; }
    const passwordHash = await bcryptHash(password, BCRYPT_ROUNDS);
    const now = Date.now();
    const doc: User = { type: 'user', email: normalized, passwordHash, createdAt: now, updatedAt: now };
    const r = await insertDoc(doc);
    const session = req.session as unknown as (typeof req.session & { userId?: string; userEmail?: string; userName?: string });
    session.userId = r.id;
    res.status(201).json({ id: r.id });
    return;
  } catch (e: any) {
    if (e?.issues) { res.status(400).json({ error: 'validation_error', issues: e.issues, requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'register_error', requestId: (req as any)?.id });
    return;
  }
});

router.post('/login', loginLimiter, async (req, res): Promise<void> => {
  try {
    const { email, password } = LoginBody.parse(req.body ?? {});
    const normalized = email.trim().toLowerCase();
    const user = await findOne<User>({ type: 'user', email: normalized });
    if (!user) { res.status(401).json({ error: 'invalid_credentials', requestId: (req as any)?.id }); return; }
    const ok = await bcryptCompare(password, user.passwordHash);
    if (!ok) { res.status(401).json({ error: 'invalid_credentials', requestId: (req as any)?.id }); return; }
    const session = req.session as unknown as (typeof req.session & { userId?: string; userEmail?: string; userName?: string; userAvatar?: string });
    session.userId = user._id;
    session.userEmail = user.email;
    session.userName = user.name;
    session.userAvatar = user.avatar;
    res.json({ id: user._id, email: user.email });
    return;
  } catch (e: any) {
    if (e?.issues) { res.status(400).json({ error: 'validation_error', issues: e.issues, requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'login_error', requestId: (req as any)?.id });
    return;
  }
});

router.post('/logout', async (req, res): Promise<void> => {
  if (req.session) req.session.destroy(() => {});
  res.json({ ok: true, requestId: (req as any)?.id });
  return;
});

// Redeem a one-time ticket issued by a mobile OAuth callback. This
// endpoint is called by the Capacitor app from inside the WebView
// after catching the rizzoma://auth-callback deep link, so the
// session cookie this sets lands in the WebView's cookie jar.
router.post('/redeem-ticket', authLimiter, async (req, res): Promise<void> => {
  const body = req.body as { ticket?: unknown } | undefined;
  const ticket = typeof body?.ticket === 'string' ? body.ticket : '';
  if (!ticket) {
    res.status(400).json({ error: 'missing_ticket', requestId: (req as any)?.id });
    return;
  }
  const payload = redeemTicket(ticket);
  if (!payload) {
    logAuthEvent(req, { provider: 'ticket', ok: false, reason: 'invalid_or_expired' });
    res.status(401).json({ error: 'invalid_or_expired_ticket', requestId: (req as any)?.id });
    return;
  }
  const session = req.session as unknown as (typeof req.session & { userId?: string; userEmail?: string; userName?: string; userAvatar?: string });
  session.userId = payload.userId;
  session.userEmail = payload.email;
  session.userName = payload.name;
  session.userAvatar = payload.avatar;
  logAuthEvent(req, { provider: 'ticket', ok: true, email: payload.email });
  res.json({ id: payload.userId, email: payload.email, name: payload.name, avatar: payload.avatar });
});

// noStore: per-session identity; changes on login/logout without any
// URL change, so cached bodies would show the wrong user after a
// session switch.
router.get('/me', noStore, async (req, res): Promise<void> => {
  const session = req.session as unknown as (typeof req.session & { userId?: string; userAvatar?: string }) | undefined;
  const id = session?.userId;
  if (!id) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  try {
    const user = await getDoc<User>(id);
    if (!user) { res.status(404).json({ error: 'user_not_found', requestId: (req as any)?.id }); return; }
    // Return avatar from user doc, or from session (set during OAuth login)
    const avatar = user.avatar || session?.userAvatar;
    res.json({ id, email: user.email, name: user.name, avatar, requestId: (req as any)?.id });
    return;
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'me_error', requestId: (req as any)?.id });
    return;
  }
});

// CSRF token endpoint (ensures cookie set and returns token)
router.get('/csrf', (req, res) => {
  const token = getCsrfTokenFromSession(req);
  res.json({ csrfToken: token });
});

// OAuth configuration
const GOOGLE_CLIENT_ID = process.env['GOOGLE_CLIENT_ID'];
const GOOGLE_CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'];
const FACEBOOK_APP_ID = process.env['FACEBOOK_APP_ID'];
const FACEBOOK_APP_SECRET = process.env['FACEBOOK_APP_SECRET'];
const MICROSOFT_CLIENT_ID = process.env['MICROSOFT_CLIENT_ID'];
const MICROSOFT_CLIENT_SECRET = process.env['MICROSOFT_CLIENT_SECRET'];
const MICROSOFT_TENANT = process.env['MICROSOFT_TENANT'] || 'common'; // 'common' for personal+work accounts

const getBaseUrl = (req: any): string => {
  if (process.env['APP_URL']) return process.env['APP_URL'];
  // Trust X-Forwarded-Host / X-Forwarded-Proto so OAuth callback URLs
  // reflect the ORIGINAL host the user hit (e.g. the Vite dev server
  // on the LAN IP), not the internal proxy target. Without this, the
  // Vite dev proxy rewrites Host to `localhost:8788` and we generate
  // `http://localhost:8788/api/auth/google/callback` as the
  // redirect_uri — fine on desktop but unreachable from a phone on
  // the same LAN. 2026-04-14 task #39.
  const fwdHost = req.get('x-forwarded-host');
  const fwdProto = req.get('x-forwarded-proto');
  const host = fwdHost || req.get('host');
  const proto = fwdProto || req.protocol || 'http';
  return `${proto}://${host}`;
};

// Where to redirect after OAuth success (frontend URL)
const getClientUrl = (): string => {
  return process.env['CLIENT_URL'] || process.env['APP_URL'] || '';
};

// Google OAuth
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(501).json({ error: 'google_oauth_not_configured' });
    return;
  }
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const scope = 'openid email profile';
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('access_type', 'offline');
  if (req.query['mobile'] === '1') {
    const nonce = typeof req.query['nonce'] === 'string' ? req.query['nonce'] : '';
    authUrl.searchParams.set('state', nonce ? MOBILE_STATE_PREFIX + nonce : makeMobileState());
    authUrl.searchParams.set('prompt', 'select_account');
  }
  res.redirect(authUrl.toString());
});

router.get('/google/callback', async (req, res): Promise<void> => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(501).json({ error: 'google_oauth_not_configured' });
    return;
  }
  const code = req.query['code'] as string;
  if (!code) {
    logAuthEvent(req, { provider: 'google', ok: false, reason: 'missing_code' });
    res.redirect('/?error=google_auth_failed');
    return;
  }

  try {
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokens.access_token) {
      logAuthEvent(req, { provider: 'google', ok: false, reason: 'token_exchange_failed' });
      res.redirect('/?error=google_token_failed');
      return;
    }

    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json() as { email?: string; name?: string; id?: string; picture?: string };

    if (!userData.email) {
      logAuthEvent(req, { provider: 'google', ok: false, reason: 'no_email_in_profile' });
      res.redirect('/?error=google_no_email');
      return;
    }

    // Find or create user
    let user = await findOne<User>({ type: 'user', email: userData.email.toLowerCase() });
    if (!user) {
      const now = Date.now();
      const doc: User = {
        type: 'user',
        email: userData.email.toLowerCase(),
        passwordHash: '', // OAuth users don't have password
        name: userData.name,
        avatar: userData.picture,
        createdAt: now,
        updatedAt: now,
      };
      const r = await insertDoc(doc);
      user = { ...doc, _id: r.id };
    } else if (userData.picture && user.avatar !== userData.picture) {
      // Update avatar in CouchDB
      user.avatar = userData.picture;
      user.updatedAt = Date.now();
      try {
        await updateDoc(user as User & { _id: string; _rev?: string });
      } catch (e) {
        console.error('[auth] Failed to update user avatar:', e);
      }
    }

    // Mobile native handoff — see comments at the top of this file.
    // The state carries the nonce the app generated before opening
    // Chrome Custom Tabs; we use it as the ticket ID so the app can
    // redeem it after the tab closes without a deep link round-trip.
    const state = req.query['state'] as string | undefined;
    if (isMobileState(state) && user._id) {
      const nonce = extractNonceFromState(state as string);
      issueTicket({
        userId: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      }, nonce);
      logAuthEvent(req, { provider: 'google', ok: true, email: user.email, reason: 'mobile_ticket' });
      res.status(200).type('html').send(OAUTH_DONE_PAGE);
      return;
    }

    // Set session
    const session = req.session as unknown as (typeof req.session & { userId?: string; userEmail?: string; userName?: string; userAvatar?: string });
    session.userId = user._id;
    session.userEmail = user.email;
    session.userName = user.name;
    session.userAvatar = user.avatar;

    logAuthEvent(req, { provider: 'google', ok: true, email: user.email });
    const clientUrl = getClientUrl();
    res.redirect(clientUrl ? `${clientUrl}/?layout=rizzoma` : '/?layout=rizzoma');
  } catch (error) {
    console.error('[auth] Google OAuth error:', error);
    logAuthEvent(req, { provider: 'google', ok: false, reason: 'exception' });
    res.redirect('/?error=google_auth_error');
  }
});

// Facebook OAuth
router.get('/facebook', (req, res) => {
  if (!FACEBOOK_APP_ID) {
    res.status(501).json({ error: 'facebook_oauth_not_configured' });
    return;
  }
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/facebook/callback`;
  const scope = 'email,public_profile';
  const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
  authUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('response_type', 'code');
  if (req.query['mobile'] === '1') {
    const nonce = typeof req.query['nonce'] === 'string' ? req.query['nonce'] : '';
    authUrl.searchParams.set('state', nonce ? MOBILE_STATE_PREFIX + nonce : makeMobileState());
  }
  res.redirect(authUrl.toString());
});

router.get('/facebook/callback', async (req, res): Promise<void> => {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    res.status(501).json({ error: 'facebook_oauth_not_configured' });
    return;
  }
  const code = req.query['code'] as string;
  if (!code) {
    res.redirect('/?error=facebook_auth_failed');
    return;
  }

  try {
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/facebook/callback`;

    // Exchange code for tokens
    const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    tokenUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokens = await tokenResponse.json() as { access_token?: string; error?: { message?: string } };
    if (!tokens.access_token) {
      res.redirect('/?error=facebook_token_failed');
      return;
    }

    // Get user info (include picture with larger size)
    const userUrl = new URL('https://graph.facebook.com/me');
    userUrl.searchParams.set('fields', 'id,name,email,picture.width(200).height(200)');
    userUrl.searchParams.set('access_token', tokens.access_token);

    const userResponse = await fetch(userUrl.toString());
    const userData = await userResponse.json() as {
      email?: string;
      name?: string;
      id?: string;
      picture?: { data?: { url?: string } };
    };

    if (!userData.email) {
      res.redirect('/?error=facebook_no_email');
      return;
    }

    // Extract picture URL from Facebook's nested structure
    const pictureUrl = userData.picture?.data?.url;

    // Find or create user
    let user = await findOne<User>({ type: 'user', email: userData.email.toLowerCase() });
    if (!user) {
      const now = Date.now();
      const doc: User = {
        type: 'user',
        email: userData.email.toLowerCase(),
        passwordHash: '', // OAuth users don't have password
        name: userData.name,
        avatar: pictureUrl,
        createdAt: now,
        updatedAt: now,
      };
      const r = await insertDoc(doc);
      user = { ...doc, _id: r.id };
    } else if (pictureUrl && user.avatar !== pictureUrl) {
      // Update avatar in CouchDB
      user.avatar = pictureUrl;
      user.updatedAt = Date.now();
      try {
        await updateDoc(user as User & { _id: string; _rev?: string });
      } catch (e) {
        console.error('[auth] Failed to update user avatar:', e);
      }
    }

    // Mobile native handoff — see top-of-file comment
    const fbState = req.query['state'] as string | undefined;
    if (isMobileState(fbState) && user._id) {
      const nonce = extractNonceFromState(fbState as string);
      issueTicket({
        userId: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      }, nonce);
      logAuthEvent(req, { provider: 'facebook', ok: true, email: user.email, reason: 'mobile_ticket' });
      res.status(200).type('html').send(OAUTH_DONE_PAGE);
      return;
    }

    // Set session
    const session = req.session as unknown as (typeof req.session & { userId?: string; userEmail?: string; userName?: string; userAvatar?: string });
    session.userId = user._id;
    session.userEmail = user.email;
    session.userName = user.name;
    session.userAvatar = user.avatar;

    const clientUrl = getClientUrl();
    res.redirect(clientUrl ? `${clientUrl}/?layout=rizzoma` : '/?layout=rizzoma');
  } catch (error) {
    console.error('[auth] Facebook OAuth error:', error);
    res.redirect('/?error=facebook_auth_error');
  }
});

// Microsoft OAuth
router.get('/microsoft', (req, res) => {
  if (!MICROSOFT_CLIENT_ID) {
    res.status(501).json({ error: 'microsoft_oauth_not_configured' });
    return;
  }
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/microsoft/callback`;
  const scope = 'openid email profile User.Read';
  const authUrl = new URL(`https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('response_mode', 'query');
  if (req.query['mobile'] === '1') {
    const nonce = typeof req.query['nonce'] === 'string' ? req.query['nonce'] : '';
    authUrl.searchParams.set('state', nonce ? MOBILE_STATE_PREFIX + nonce : makeMobileState());
  }
  res.redirect(authUrl.toString());
});

router.get('/microsoft/callback', async (req, res): Promise<void> => {
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    res.status(501).json({ error: 'microsoft_oauth_not_configured' });
    return;
  }
  const code = req.query['code'] as string;
  if (!code) {
    res.redirect('/?error=microsoft_auth_failed');
    return;
  }

  try {
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/microsoft/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
    if (!tokens.access_token) {
      console.error('[auth] Microsoft token error:', tokens.error, tokens.error_description);
      res.redirect('/?error=microsoft_token_failed');
      return;
    }

    // Get user info from Microsoft Graph
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json() as { mail?: string; userPrincipalName?: string; displayName?: string; id?: string };

    // Microsoft may return email in 'mail' or 'userPrincipalName'
    const email = userData.mail || userData.userPrincipalName;
    if (!email || !email.includes('@')) {
      res.redirect('/?error=microsoft_no_email');
      return;
    }

    // Try to get Microsoft profile photo (returns binary, so we use a constructed URL)
    // Note: Microsoft doesn't provide a permanent public URL like Google/Facebook
    // The avatar URL will expire when the access token expires
    // For a production system, you'd download the photo and store it
    let avatarUrl: string | undefined;
    try {
      // Check if user has a photo
      const photoMetaResponse = await fetch('https://graph.microsoft.com/v1.0/me/photo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (photoMetaResponse.ok) {
        // If photo exists, we can construct a URL (though it needs auth)
        // For simplicity, we'll just note that a photo exists but use Gravatar as fallback
        // In production, download and store the photo
      }
    } catch {
      // Photo not available, that's fine
    }

    // Find or create user
    let user = await findOne<User>({ type: 'user', email: email.toLowerCase() });
    if (!user) {
      const now = Date.now();
      const doc: User = {
        type: 'user',
        email: email.toLowerCase(),
        passwordHash: '', // OAuth users don't have password
        name: userData.displayName,
        avatar: avatarUrl,
        createdAt: now,
        updatedAt: now,
      };
      const r = await insertDoc(doc);
      user = { ...doc, _id: r.id };
    }

    // Mobile native handoff — see top-of-file comment
    const msState = req.query['state'] as string | undefined;
    if (isMobileState(msState) && user._id) {
      const nonce = extractNonceFromState(msState as string);
      issueTicket({
        userId: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      }, nonce);
      logAuthEvent(req, { provider: 'microsoft', ok: true, email: user.email, reason: 'mobile_ticket' });
      res.status(200).type('html').send(OAUTH_DONE_PAGE);
      return;
    }

    // Set session
    const session = req.session as unknown as (typeof req.session & { userId?: string; userEmail?: string; userName?: string; userAvatar?: string });
    session.userId = user._id;
    session.userEmail = user.email;
    session.userName = user.name;
    session.userAvatar = user.avatar;

    const clientUrl = getClientUrl();
    res.redirect(clientUrl ? `${clientUrl}/?layout=rizzoma` : '/?layout=rizzoma');
  } catch (error) {
    console.error('[auth] Microsoft OAuth error:', error);
    res.redirect('/?error=microsoft_auth_error');
  }
});

// SAML 2.0 Authentication
// SP Metadata endpoint - IdP admins use this to configure the SP
router.get('/saml/metadata', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const callbackUrl = `${baseUrl}/api/auth/saml/callback`;
  const issuer = process.env['SAML_ISSUER'] || baseUrl;

  const metadata = generateMetadata(callbackUrl, issuer);
  res.setHeader('Content-Type', 'application/xml');
  res.send(metadata);
});

// Initiate SAML login
router.get('/saml', (req, res) => {
  if (!isSamlEnabled()) {
    res.status(501).json({ error: 'saml_not_configured' });
    return;
  }

  const baseUrl = getBaseUrl(req);
  const callbackUrl = `${baseUrl}/api/auth/saml/callback`;

  try {
    const saml = getSamlInstance(callbackUrl);
    const host = req.get('host');
    saml.getAuthorizeUrlAsync('', host, {})
      .then((loginUrl: string) => {
        res.redirect(loginUrl);
      })
      .catch((error: Error) => {
        console.error('[auth] SAML authorize error:', error);
        res.redirect('/?error=saml_auth_error');
      });
  } catch (error) {
    console.error('[auth] SAML init error:', error);
    res.redirect('/?error=saml_init_error');
  }
});

// SAML ACS (Assertion Consumer Service) - receives SAML responses
router.post('/saml/callback', async (req, res): Promise<void> => {
  if (!isSamlEnabled()) {
    res.status(501).json({ error: 'saml_not_configured' });
    return;
  }

  const baseUrl = getBaseUrl(req);
  const callbackUrl = `${baseUrl}/api/auth/saml/callback`;

  try {
    const saml = getSamlInstance(callbackUrl);
    const samlResponse = req.body?.SAMLResponse as string;

    if (!samlResponse) {
      res.redirect('/?error=saml_no_response');
      return;
    }

    // Validate SAML response and extract profile
    const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });

    if (!profile) {
      res.redirect('/?error=saml_invalid_response');
      return;
    }

    // Extract user info from profile
    const userInfo = extractUserFromProfile(profile as Record<string, unknown>);
    if (!userInfo) {
      res.redirect('/?error=saml_no_email');
      return;
    }

    // Find or create user
    let user = await findOne<User>({ type: 'user', email: userInfo.email });
    if (!user) {
      const now = Date.now();
      const doc: User = {
        type: 'user',
        email: userInfo.email,
        passwordHash: '', // SAML users don't have password
        name: userInfo.name,
        createdAt: now,
        updatedAt: now,
      };
      const r = await insertDoc(doc);
      user = { ...doc, _id: r.id };
    }

    // Set session
    const session = req.session as unknown as (typeof req.session & { userId?: string; userEmail?: string; userName?: string; userAvatar?: string });
    session.userId = user._id;
    session.userEmail = user.email;
    session.userName = user.name;
    session.userAvatar = user.avatar;

    const clientUrl = getClientUrl();
    res.redirect(clientUrl ? `${clientUrl}/?layout=rizzoma` : '/?layout=rizzoma');
  } catch (error) {
    console.error('[auth] SAML callback error:', error);
    res.redirect('/?error=saml_auth_error');
  }
});

// Check OAuth availability
router.get('/oauth-status', (_req, res) => {
  res.json({
    google: !!GOOGLE_CLIENT_ID,
    facebook: !!FACEBOOK_APP_ID,
    microsoft: !!MICROSOFT_CLIENT_ID,
    saml: isSamlEnabled(),
  });
});

export default router;
