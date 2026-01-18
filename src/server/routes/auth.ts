import { Router } from 'express';
import { z } from 'zod';
// Use a wrapper that prefers native bcrypt but falls back to bcryptjs when native build is unavailable
import { hash as bcryptHash, compare as bcryptCompare } from '../lib/bcrypt.js';
import rateLimit from 'express-rate-limit';
import { findOne, insertDoc, getDoc } from '../lib/couch.js';
import { getCsrfTokenFromSession } from '../middleware/csrf.js';
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
    const session = req.session as unknown as (typeof req.session & { userId?: string; userEmail?: string; userName?: string });
    session.userId = user._id;
    session.userEmail = user.email;
    session.userName = user.name;
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
  const session = req.session as unknown as (typeof req.session & { userId?: string }) | undefined;
  const id = session?.userId;
  if (!id) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  try {
    const user = await getDoc<User>(id);
    if (!user) { res.status(404).json({ error: 'user_not_found', requestId: (req as any)?.id }); return; }
    res.json({ id, email: user.email, name: user.name, requestId: (req as any)?.id });
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

export default router;
