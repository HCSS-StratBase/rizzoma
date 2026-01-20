import { Router } from 'express';
import { z } from 'zod';
// Use a wrapper that prefers native bcrypt but falls back to bcryptjs when native build is unavailable
import { hash as bcryptHash, compare as bcryptCompare } from '../lib/bcrypt.js';
import rateLimit from 'express-rate-limit';
import { findOne, insertDoc, getDoc } from '../lib/couch.js';
import { getCsrfTokenFromSession } from '../middleware/csrf.js';
import { isSamlEnabled, getSamlInstance, extractUserFromProfile, generateMetadata } from '../lib/saml.js';
// import { config } from '../config.js';

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

router.get('/me', async (req, res): Promise<void> => {
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
  return process.env['APP_URL'] || `${req.protocol}://${req.get('host')}`;
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
  res.redirect(authUrl.toString());
});

router.get('/google/callback', async (req, res): Promise<void> => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(501).json({ error: 'google_oauth_not_configured' });
    return;
  }
  const code = req.query['code'] as string;
  if (!code) {
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
      res.redirect('/?error=google_token_failed');
      return;
    }

    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json() as { email?: string; name?: string; id?: string; picture?: string };

    if (!userData.email) {
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
      // Update avatar if it changed
      user.avatar = userData.picture;
      // Note: In production you'd want to update the user doc in CouchDB here
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
    console.error('[auth] Google OAuth error:', error);
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
      // Update avatar if it changed
      user.avatar = pictureUrl;
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
