import { Router } from 'express';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
// Use a wrapper that prefers native bcrypt but falls back to bcryptjs when native build is unavailable
import { hash as bcryptHash, compare as bcryptCompare } from '../lib/bcrypt.js';
import rateLimit from 'express-rate-limit';
import { find, findOne, insertDoc, getDoc, updateDoc } from '../lib/couch.js';
import { csrfProtect, getCsrfTokenFromSession } from '../middleware/csrf.js';
import { noStore } from '../middleware/noStore.js';
import { isSamlEnabled, getSamlInstance, extractUserFromProfile, generateMetadata } from '../lib/saml.js';
import { logAuthEvent } from '../lib/logger.js';
import { issueTicket, redeemTicket } from '../lib/authTickets.js';
import { disconnectSessionSockets } from '../lib/socket.js';
import { hashInviteToken, invitationTokenDocId } from '../lib/invitations.js';
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
//   1. The app opens /api/auth/google?mobile=1 in Custom Tabs.
//   2. Backend stores a random, single-use OAuth transaction in the Chrome
//      session; only its random state crosses the provider.
//   3. Provider → callback validates and consumes state once.
//   4. Backend issues a fresh server-random auth ticket and redirects it only
//      through the rizzoma://auth-callback deep-link channel.
//   5. The app POSTs that ticket once to /api/auth/redeem-ticket through the
//      WebView cookie jar, so the session lands in the right place.
/** Return the server-random one-time ticket only through the native deep-link
 * channel; no caller-controlled value is ever promoted into a credential. */
const nativeTicketUrl = (ticket: string): string =>
  `rizzoma://auth-callback?ticket=${encodeURIComponent(ticket)}`;

// Use minimal bcrypt rounds in dev/test for speed; 10 in production
// 4 rounds is still slow with bcryptjs fallback, so use 2 rounds for even faster dev/test auth
const BCRYPT_ROUNDS = process.env['NODE_ENV'] === 'production' ? 10 : 2;

const router = Router();

// Basic rate limiters for auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(200),
  ownerRecoveryToken: z.string().min(32).optional(),
  inviteToken: z.string().min(32).optional(),
});
// Keep legacy password login compatible while requiring stronger passwords
// for every new invite/recovery credential.
const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

type User = {
  _id?: string;
  type: 'user';
  email: string;
  passwordHash?: string;
  createdAt: number;
  updatedAt: number;
  name?: string;
  avatar?: string;  // Profile picture URL from OAuth provider
  emailVerifiedAt?: number;
  emailVerificationProvider?: 'google' | 'facebook' | 'microsoft' | 'twitter' | 'saml' | 'invitation';
};

type SessionIdentity = { id?: string; email: string; name?: string; avatar?: string };

async function establishAuthenticatedSession(req: any, res: any, identity: SessionIdentity): Promise<void> {
  const previous = req.session;
  if (previous && typeof previous.regenerate === 'function') {
    await new Promise<void>((resolve, reject) => previous.regenerate((error?: unknown) => error ? reject(error) : resolve()));
  } else if (previous) {
    // Test/minimal-session fallback: discard pre-auth state while retaining
    // only store methods required by the harness.
    for (const key of Object.keys(previous)) {
      if (!['destroy', 'regenerate', 'reload', 'save', 'touch', 'cookie'].includes(key)) delete previous[key];
    }
  }
  req.session.userId = identity.id;
  req.session.userEmail = identity.email;
  req.session.userName = identity.name;
  req.session.userAvatar = identity.avatar;
  // Session regeneration intentionally invalidates every pre-auth session
  // value, including the old CSRF secret. Mint and return a fresh pair now so
  // the first authenticated mutation works without relying on a page reload.
  req.session.csrfToken = randomBytes(16).toString('hex');
  if (typeof req.session.save === 'function') {
    await new Promise<void>((resolve, reject) => req.session.save((error?: unknown) => error ? reject(error) : resolve()));
  }
  res.cookie('XSRF-TOKEN', req.session.csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

async function hasValidInvitationClaim(token: string | undefined, email: string): Promise<boolean> {
  if (!token) return false;
  const tokenHash = hashInviteToken(token);
  const tokenDoc = await getDoc<any>(invitationTokenDocId(tokenHash)).catch(() => null);
  if (tokenDoc) {
    return tokenDoc.type === 'invitation_token'
      && ['sent', 'pending_delivery'].includes(String(tokenDoc.status || ''))
      && Number(tokenDoc.expiresAt || 0) > Date.now()
      && String(tokenDoc.email || '').trim().toLowerCase() === email;
  }
  const legacy = await find<any>({ type: 'participant', inviteTokenHash: tokenHash }, { limit: 2 })
    .catch(() => ({ docs: [] as any[] }));
  return (legacy.docs || []).some((participant: any) => (
    participant.status === 'pending'
    && Number(participant.inviteExpiresAt || 0) > Date.now()
    && String(participant.email || '').trim().toLowerCase() === email
  ));
}

router.post('/register', authLimiter, csrfProtect(), async (req, res): Promise<void> => {
  try {
    const { email, password, ownerRecoveryToken, inviteToken } = RegisterBody.parse(req.body ?? {});
    const normalized = email.trim().toLowerCase();
    const existing = await findOne<User>({ type: 'user', email: normalized });
    const invitationVerified = await hasValidInvitationClaim(inviteToken, normalized);
    // Never let an unauthenticated password signup claim a credential-less
    // invite/owner placeholder merely by knowing its email address. Existing
    // placeholders require a one-time invite/owner-recovery token or a
    // provider-verified OAuth login.
    let recoveryDoc: any = null;
    if (existing && ownerRecoveryToken) {
      if (existing.passwordHash !== undefined) {
        res.status(409).json({ error: 'email_in_use', requestId: (req as any)?.id });
        return;
      }
      const recovery = await find<any>({
        type: 'owner_recovery',
        tokenHash: hashInviteToken(ownerRecoveryToken),
      }, { limit: 2 }).catch(() => ({ docs: [] as any[] }));
      recoveryDoc = recovery.docs?.[0];
      if (
        !recoveryDoc
        || recoveryDoc.status !== 'pending'
        || recoveryDoc.placeholderUserId !== existing._id
        || String(recoveryDoc.email || '').trim().toLowerCase() !== normalized
        || Number(recoveryDoc.expiresAt || 0) <= Date.now()
      ) {
        res.status(403).json({ error: 'invalid_owner_recovery', requestId: (req as any)?.id });
        return;
      }
    } else if (existing && existing.passwordHash !== undefined) {
      // An invitation proves mailbox access but is not a password-reset token.
      // Never overwrite an existing credentialed account before the invite is
      // redeemed; explicit recovery/linking is a separate flow.
      res.status(409).json({ error: 'email_in_use', requestId: (req as any)?.id });
      return;
    } else if (existing && !invitationVerified) {
      res.status(409).json({ error: 'email_in_use', requestId: (req as any)?.id });
      return;
    } else if (!existing && !invitationVerified) {
      // New password accounts must prove mailbox control. Existing legacy
      // password accounts continue to log in unchanged; new users can use an
      // emailed invitation or a verified OAuth/SAML provider.
      res.status(403).json({ error: 'email_verification_required', requestId: (req as any)?.id });
      return;
    }
    const passwordHash = await bcryptHash(password, BCRYPT_ROUNDS);
    const now = Date.now();
    const doc: User = existing
      ? {
          ...existing,
          passwordHash,
          ...(invitationVerified ? { emailVerifiedAt: now, emailVerificationProvider: 'invitation' as const } : {}),
          updatedAt: now,
        }
      : {
          _id: canonicalUserIdForEmail(normalized),
          type: 'user',
          email: normalized,
          passwordHash,
          emailVerifiedAt: now,
          emailVerificationProvider: 'invitation',
          createdAt: now,
          updatedAt: now,
        };
    let r: { id: string; rev?: string };
    try {
      r = existing ? await updateDoc(doc) : await insertDoc(doc);
    } catch (error: any) {
      if (!existing && String(error?.message || '').startsWith('409')) {
        res.status(409).json({ error: 'email_in_use', requestId: (req as any)?.id });
        return;
      }
      throw error;
    }
    const userId = existing?._id || r.id;
    if (recoveryDoc) {
      await updateDoc({
        ...recoveryDoc,
        status: 'used',
        usedAt: now,
        usedBy: userId,
        tokenHash: undefined,
      });
    }
    const sessionName = doc.name || normalized.split('@')[0];
    await establishAuthenticatedSession(req, res, { id: userId, email: normalized, name: sessionName });
    res.status(201).json({ id: userId, email: normalized, name: sessionName });
    return;
  } catch (e: any) {
    if (e?.issues) { res.status(400).json({ error: 'validation_error', issues: e.issues, requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'register_error', requestId: (req as any)?.id });
    return;
  }
});

router.post('/login', loginLimiter, csrfProtect(), async (req, res): Promise<void> => {
  try {
    const { email, password } = LoginBody.parse(req.body ?? {});
    const normalized = email.trim().toLowerCase();
    const user = await findOne<User>({ type: 'user', email: normalized });
    if (!user) { res.status(401).json({ error: 'invalid_credentials', requestId: (req as any)?.id }); return; }
    if (!user.passwordHash) { res.status(401).json({ error: 'invalid_credentials', requestId: (req as any)?.id }); return; }
    const ok = await bcryptCompare(password, user.passwordHash);
    if (!ok) { res.status(401).json({ error: 'invalid_credentials', requestId: (req as any)?.id }); return; }
    await establishAuthenticatedSession(req, res, { id: user._id, email: user.email, name: user.name, avatar: user.avatar });
    res.json({ id: user._id, email: user.email });
    return;
  } catch (e: any) {
    if (e?.issues) { res.status(400).json({ error: 'validation_error', issues: e.issues, requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'login_error', requestId: (req as any)?.id });
    return;
  }
});

router.post('/logout', csrfProtect(), async (req, res): Promise<void> => {
  const sessionId = String((req as any).sessionID || '');
  if (!req.session) {
    res.json({ ok: true, requestId: (req as any)?.id });
    return;
  }
  const destroyError = await new Promise<unknown>((resolve) => req.session.destroy((error) => resolve(error)));
  if (destroyError) {
    console.error('[auth] session revocation failed', { requestId: (req as any)?.id, error: String((destroyError as any)?.message || destroyError) });
    res.status(503).json({ error: 'revocation_failed', requestId: (req as any)?.id });
    return;
  }
  res.clearCookie('rizzoma.sid', {
    path: '/',
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
  });
  disconnectSessionSockets(sessionId);
  res.json({ ok: true, requestId: (req as any)?.id });
});

// Redeem a one-time ticket issued by a mobile OAuth callback. This
// endpoint is called by the Capacitor app from inside the WebView
// after catching the rizzoma://auth-callback deep link, so the
// session cookie this sets lands in the WebView's cookie jar.
router.post('/redeem-ticket', authLimiter, async (req, res): Promise<void> => {
  const body = req.body as { ticket?: unknown } | undefined;
  const ticket = typeof body?.ticket === 'string' ? body.ticket : '';
  const verifier = typeof (body as any)?.verifier === 'string' ? (body as any).verifier : undefined;
  if (!ticket) {
    res.status(400).json({ error: 'missing_ticket', requestId: (req as any)?.id });
    return;
  }
  const payload = redeemTicket(ticket, verifier);
  if (!payload) {
    logAuthEvent(req, { provider: 'ticket', ok: false, reason: 'invalid_or_expired' });
    res.status(401).json({ error: 'invalid_or_expired_ticket', requestId: (req as any)?.id });
    return;
  }
  await establishAuthenticatedSession(req, res, { id: payload.userId, email: payload.email, name: payload.name, avatar: payload.avatar });
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
const TWITTER_CLIENT_ID = process.env['TWITTER_CLIENT_ID'];
const TWITTER_CLIENT_SECRET = process.env['TWITTER_CLIENT_SECRET'];

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

const base64Url = (buffer: Buffer): string =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

type CorrelatedProvider = 'google' | 'facebook' | 'microsoft' | 'twitter';
const OAUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const SAML_CORRELATION_COOKIE = 'rizzoma.saml';
type SamlTransaction = { state: string; correlationId: string; callbackUrl: string; createdAt: number };
const samlTransactions = new Map<string, SamlTransaction>();

function beginOAuthTransaction(req: any, provider: CorrelatedProvider, mobileChallenge?: string, codeVerifier?: string): string {
  const state = base64Url(randomBytes(32));
  const now = Date.now();
  const current = Object.values(req.session.oauthTransactions || {})
    .filter((entry: any) => now - Number(entry?.createdAt || 0) <= OAUTH_TRANSACTION_TTL_MS)
    .sort((a: any, b: any) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
    .slice(0, 11);
  req.session.oauthTransactions = Object.fromEntries(current.map((entry: any) => [entry.state, entry]));
  req.session.oauthTransactions[state] = {
    provider,
    state,
    createdAt: now,
    ...(mobileChallenge ? { mobileChallenge } : {}),
    ...(codeVerifier ? { codeVerifier } : {}),
  };
  return state;
}

function consumeOAuthTransaction(
  req: any,
  provider: CorrelatedProvider,
  receivedState: unknown,
): { mobileChallenge?: string; codeVerifier?: string } | null {
  if (typeof receivedState !== 'string') return null;
  const transaction = req.session?.oauthTransactions?.[receivedState];
  if (req.session?.oauthTransactions) delete req.session.oauthTransactions[receivedState];
  if (
    !transaction
    || transaction.provider !== provider
    || receivedState !== transaction.state
    || Date.now() - Number(transaction.createdAt || 0) > OAUTH_TRANSACTION_TTL_MS
  ) return null;
  return {
    ...(transaction.mobileChallenge ? { mobileChallenge: transaction.mobileChallenge } : {}),
    ...(transaction.codeVerifier ? { codeVerifier: transaction.codeVerifier } : {}),
  };
}

function pruneSamlTransactions(now = Date.now()): void {
  for (const [state, transaction] of samlTransactions) {
    if (now - transaction.createdAt > OAUTH_TRANSACTION_TTL_MS) samlTransactions.delete(state);
  }
  if (samlTransactions.size <= 5_000) return;
  const oldest = [...samlTransactions.values()]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(0, samlTransactions.size - 5_000);
  for (const transaction of oldest) samlTransactions.delete(transaction.state);
}

function samlCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    path: '/api/auth/saml',
    maxAge: OAUTH_TRANSACTION_TTL_MS,
  };
}

/** SAML POST bindings are cross-site and omit the main SameSite=Lax session
 * cookie. Bind RelayState to a separate short-lived, opaque browser cookie
 * and a bounded server-side transaction without weakening the main session. */
function beginSamlTransaction(req: any, res: any, callbackUrl: string): string {
  const now = Date.now();
  pruneSamlTransactions(now);
  const suppliedCorrelation = String(req.cookies?.[SAML_CORRELATION_COOKIE] || '');
  const correlationId = /^[A-Za-z0-9_-]{43}$/.test(suppliedCorrelation)
    ? suppliedCorrelation
    : base64Url(randomBytes(32));
  const prior = [...samlTransactions.values()]
    .filter((transaction) => transaction.correlationId === correlationId)
    .sort((left, right) => right.createdAt - left.createdAt);
  for (const transaction of prior.slice(11)) samlTransactions.delete(transaction.state);
  const state = base64Url(randomBytes(32));
  samlTransactions.set(state, { state, correlationId, callbackUrl, createdAt: now });
  res.cookie(SAML_CORRELATION_COOKIE, correlationId, samlCookieOptions());
  return state;
}

function consumeSamlTransaction(req: any, res: any, receivedState: unknown, callbackUrl: string): boolean {
  pruneSamlTransactions();
  if (typeof receivedState !== 'string') return false;
  const correlationId = String(req.cookies?.[SAML_CORRELATION_COOKIE] || '');
  const transaction = samlTransactions.get(receivedState);
  if (
    !transaction
    || transaction.state !== receivedState
    || transaction.correlationId !== correlationId
    || transaction.callbackUrl !== callbackUrl
    || Date.now() - transaction.createdAt > OAUTH_TRANSACTION_TTL_MS
  ) return false;
  samlTransactions.delete(receivedState);
  if (![...samlTransactions.values()].some((candidate) => candidate.correlationId === correlationId)) {
    res.clearCookie(SAML_CORRELATION_COOKIE, { ...samlCookieOptions(), maxAge: undefined });
  }
  return true;
}

const canonicalUserIdForEmail = (email: string): string =>
  `user:email:${createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex')}`;

async function revokePendingOwnerRecoveries(userId: string, email: string, reason: string): Promise<void> {
  const result = await find<any>({ type: 'owner_recovery', placeholderUserId: userId, status: 'pending' }, { limit: 500 })
    .catch(() => ({ docs: [] as any[] }));
  const now = Date.now();
  for (const recovery of result.docs || []) {
    const { tokenHash: _tokenHash, ...withoutToken } = recovery;
    await updateDoc({ ...withoutToken, email, status: 'revoked', revokedAt: now, revokedReason: reason } as any)
      .catch(() => undefined);
  }
}

async function findOrCreateVerifiedUser(input: {
  email: string;
  name?: string;
  avatar?: string;
  provider: User['emailVerificationProvider'];
}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const now = Date.now();
  let user = await findOne<User>({ type: 'user', email });
  let created = false;
  if (user?.passwordHash && !user.emailVerifiedAt) {
    // Do not silently merge a provider-authenticated mailbox owner into an
    // unverified password account that may have pre-registered that address.
    // Existing legacy password login remains available; provider linking
    // requires a separate, explicit account-link flow.
    throw new Error('oauth_link_required');
  }
  if (!user) {
    const doc: User = {
      _id: canonicalUserIdForEmail(email),
      type: 'user',
      email,
      passwordHash: '',
      name: input.name,
      avatar: input.avatar,
      emailVerifiedAt: now,
      emailVerificationProvider: input.provider,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const result = await insertDoc(doc);
      user = { ...doc, _id: result.id };
      created = true;
    } catch (error: any) {
      if (!String(error?.message || '').startsWith('409')) throw error;
      user = await getDoc<User>(doc._id!);
      if (user.email.trim().toLowerCase() !== email) throw new Error('canonical_email_conflict');
    }
  }

  if (created) return user;

  const wasCredentiallessPlaceholder = user.passwordHash === undefined;
  const next: User = {
    ...user,
    name: input.name || user.name,
    avatar: input.avatar || user.avatar,
    emailVerifiedAt: now,
    emailVerificationProvider: input.provider,
    updatedAt: now,
  };
  await updateDoc(next as User & { _id: string; _rev?: string });
  if (wasCredentiallessPlaceholder && next._id) {
    await revokePendingOwnerRecoveries(next._id, email, `${input.provider}_verified_login`);
  }
  return next;
}

// Google OAuth
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(501).json({ error: 'google_oauth_not_configured' });
    return;
  }
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const mobile = req.query['mobile'] === '1';
  const mobileChallenge = mobile ? String(req.query['challenge'] || '') : undefined;
  if (mobile && !/^[A-Za-z0-9_-]{43}$/.test(mobileChallenge || '')) {
    res.status(400).json({ error: 'invalid_native_challenge' });
    return;
  }
  const state = beginOAuthTransaction(req, 'google', mobileChallenge);
  const scope = 'openid email profile';
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('state', state);
  if (mobile) {
    authUrl.searchParams.set('prompt', 'select_account');
  }
  res.redirect(authUrl.toString());
});

router.get('/google/callback', async (req, res): Promise<void> => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(501).json({ error: 'google_oauth_not_configured' });
    return;
  }
  const code = req.query['code'] as string | undefined;
  const transaction = consumeOAuthTransaction(req, 'google', req.query['state']);
  if (!code || !transaction) {
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

    const user = await findOrCreateVerifiedUser({
      email: userData.email,
      name: userData.name,
      avatar: userData.picture,
      provider: 'google',
    });

    // Mobile native handoff — see comments at the top of this file.
    // Bind the server-random deep-link ticket to the WebView-held verifier.
    // An app that intercepts the custom scheme sees the ticket but cannot
    // redeem it without the verifier whose SHA-256 challenge was correlated.
    if (transaction.mobileChallenge && user._id) {
      const ticket = issueTicket({
        userId: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      }, transaction.mobileChallenge);
      logAuthEvent(req, { provider: 'google', ok: true, email: user.email, reason: 'mobile_ticket' });
      res.redirect(nativeTicketUrl(ticket));
      return;
    }

    // Set session
    await establishAuthenticatedSession(req, res, { id: user._id, email: user.email, name: user.name, avatar: user.avatar });

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
  const mobile = req.query['mobile'] === '1';
  const mobileChallenge = mobile ? String(req.query['challenge'] || '') : undefined;
  if (mobile && !/^[A-Za-z0-9_-]{43}$/.test(mobileChallenge || '')) {
    res.status(400).json({ error: 'invalid_native_challenge' });
    return;
  }
  const state = beginOAuthTransaction(req, 'facebook', mobileChallenge);
  const scope = 'email,public_profile';
  const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
  authUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  res.redirect(authUrl.toString());
});

router.get('/facebook/callback', async (req, res): Promise<void> => {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    res.status(501).json({ error: 'facebook_oauth_not_configured' });
    return;
  }
  const code = req.query['code'] as string | undefined;
  const transaction = consumeOAuthTransaction(req, 'facebook', req.query['state']);
  if (!code || !transaction) {
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

    const user = await findOrCreateVerifiedUser({
      email: userData.email,
      name: userData.name,
      avatar: pictureUrl,
      provider: 'facebook',
    });

    // Mobile native handoff — see top-of-file comment
    if (transaction.mobileChallenge && user._id) {
      const ticket = issueTicket({
        userId: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      }, transaction.mobileChallenge);
      logAuthEvent(req, { provider: 'facebook', ok: true, email: user.email, reason: 'mobile_ticket' });
      res.redirect(nativeTicketUrl(ticket));
      return;
    }

    // Set session
    await establishAuthenticatedSession(req, res, { id: user._id, email: user.email, name: user.name, avatar: user.avatar });

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
  const mobile = req.query['mobile'] === '1';
  const mobileChallenge = mobile ? String(req.query['challenge'] || '') : undefined;
  if (mobile && !/^[A-Za-z0-9_-]{43}$/.test(mobileChallenge || '')) {
    res.status(400).json({ error: 'invalid_native_challenge' });
    return;
  }
  const state = beginOAuthTransaction(req, 'microsoft', mobileChallenge);
  const scope = 'openid email profile User.Read';
  const authUrl = new URL(`https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('state', state);
  res.redirect(authUrl.toString());
});

router.get('/microsoft/callback', async (req, res): Promise<void> => {
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    res.status(501).json({ error: 'microsoft_oauth_not_configured' });
    return;
  }
  const code = req.query['code'] as string | undefined;
  const transaction = consumeOAuthTransaction(req, 'microsoft', req.query['state']);
  if (!code || !transaction) {
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

    const user = await findOrCreateVerifiedUser({
      email,
      name: userData.displayName,
      avatar: avatarUrl,
      provider: 'microsoft',
    });

    // Mobile native handoff — see top-of-file comment
    if (transaction.mobileChallenge && user._id) {
      const ticket = issueTicket({
        userId: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      }, transaction.mobileChallenge);
      logAuthEvent(req, { provider: 'microsoft', ok: true, email: user.email, reason: 'mobile_ticket' });
      res.redirect(nativeTicketUrl(ticket));
      return;
    }

    // Set session
    await establishAuthenticatedSession(req, res, { id: user._id, email: user.email, name: user.name, avatar: user.avatar });

    const clientUrl = getClientUrl();
    res.redirect(clientUrl ? `${clientUrl}/?layout=rizzoma` : '/?layout=rizzoma');
  } catch (error) {
    console.error('[auth] Microsoft OAuth error:', error);
    res.redirect('/?error=microsoft_auth_error');
  }
});

// Twitter/X OAuth 2.0 with PKCE
router.get('/twitter', (req, res) => {
  if (!TWITTER_CLIENT_ID) {
    res.status(501).json({ error: 'twitter_oauth_not_configured' });
    return;
  }
  const codeVerifier = base64Url(randomBytes(48));
  const state = beginOAuthTransaction(req, 'twitter', undefined, codeVerifier);
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());

  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/twitter/callback`;
  const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
  authUrl.searchParams.set('client_id', TWITTER_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'tweet.read users.read offline.access');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  res.redirect(authUrl.toString());
});

router.get('/twitter/callback', async (req, res): Promise<void> => {
  if (!TWITTER_CLIENT_ID) {
    res.status(501).json({ error: 'twitter_oauth_not_configured' });
    return;
  }
  const code = req.query['code'] as string | undefined;
  const state = req.query['state'] as string | undefined;
  const transaction = consumeOAuthTransaction(req, 'twitter', state);
  const codeVerifier = transaction?.codeVerifier;

  if (!code || !transaction || !codeVerifier) {
    res.redirect('/?error=twitter_auth_failed');
    return;
  }

  try {
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/twitter/callback`;
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (TWITTER_CLIENT_SECRET) {
      headers['Authorization'] = `Basic ${Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64')}`;
    }

    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: TWITTER_CLIENT_ID,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    const tokens = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokens.access_token) {
      res.redirect('/?error=twitter_token_failed');
      return;
    }

    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json() as {
      data?: { id?: string; username?: string; name?: string; profile_image_url?: string };
    };
    const twitterUser = userData.data;
    if (!twitterUser?.id) {
      res.redirect('/?error=twitter_no_user');
      return;
    }

    const email = `twitter-${twitterUser.id}@twitter.local`;
    const user = await findOrCreateVerifiedUser({
      email,
      name: twitterUser.name || twitterUser.username,
      avatar: twitterUser.profile_image_url,
      provider: 'twitter',
    });

    await establishAuthenticatedSession(req, res, { id: user._id, email: user.email, name: user.name, avatar: user.avatar });

    const clientUrl = getClientUrl();
    res.redirect(clientUrl ? `${clientUrl}/?layout=rizzoma` : '/?layout=rizzoma');
  } catch (error) {
    console.error('[auth] Twitter OAuth error:', error);
    res.redirect('/?error=twitter_auth_error');
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
    const relayState = beginSamlTransaction(req, res, callbackUrl);
    saml.getAuthorizeUrlAsync(relayState, host, {})
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
  if (!consumeSamlTransaction(req, res, req.body?.RelayState, callbackUrl)) {
    res.redirect('/?error=saml_state_failed');
    return;
  }

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

    const user = await findOrCreateVerifiedUser({
      email: userInfo.email,
      name: userInfo.name,
      provider: 'saml',
    });

    // Set session
    await establishAuthenticatedSession(req, res, { id: user._id, email: user.email, name: user.name, avatar: user.avatar });

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
    twitter: !!TWITTER_CLIENT_ID,
    saml: isSamlEnabled(),
  });
});

export default router;
