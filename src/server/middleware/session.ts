import session from 'express-session';
import type { RequestHandler } from 'express';
import RedisStore from 'connect-redis';
import { createClient, type RedisClientType } from 'redis';

// Hard Gap #30 (2026-04-13): Redis-backed session store with MemoryStore
// fallback.
//
// Before this fix, `sessionMiddleware()` always used `session.MemoryStore`,
// so every server restart invalidated every active session and forced
// every user to re-login via the AuthPanel. The CLAUDE_SESSION.md gotcha
// list explicitly called this out: "Sessions use MemoryStore - lost on
// server restart. User must re-login via AuthPanel after server restart."
//
// Redis 5.x is already running in docker-compose.yml and `connect-redis@7`
// + `redis@5` are already declared in package.json, so this is purely a
// wiring change. The store selection honors the env vars that HANDOFF.md
// documents for local smokes:
//
//   SESSION_STORE=memory       → always use MemoryStore (local smoke)
//   REDIS_URL=memory://        → always use MemoryStore (legacy local smoke)
//   REDIS_URL=redis://host:port → use connect-redis against that Redis
//   (unset)                    → fall back to MemoryStore with a warning
//
// The returned middleware is still a sync Express middleware — the Redis
// client connects in the background and session reads/writes are buffered
// until connect resolves. If connect fails the process logs the error and
// the client auto-reconnects (redis@5's default behavior).

let cachedRedisClient: RedisClientType | null = null;
let activeSessionStore: session.Store | null = null;
let activeSessionStoreMode: 'redis' | 'memory' | null = null;

const DEVELOPMENT_SESSION_SECRET = 'dev-secret-change-me';
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;
const INSECURE_PRODUCTION_SECRETS = new Set([
  DEVELOPMENT_SESSION_SECRET,
  'change-me',
  'changeme',
  'replace-with-a-random-secret',
  'replace_with_a_random_secret',
]);

function assertProductionSecret(secret: string, label: string): void {
  const normalized = secret.trim().toLowerCase();
  if (secret.length < MINIMUM_PRODUCTION_SECRET_LENGTH
    || INSECURE_PRODUCTION_SECRETS.has(normalized)) {
    throw new Error(`${label} must be at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters and must not be a placeholder in production`);
  }
}

function sessionSecrets(): string | string[] {
  const primary = (process.env['SESSION_SECRET'] || '').trim();
  const previous = (process.env['SESSION_SECRET_PREVIOUS'] || '')
    .split(',')
    .map(secret => secret.trim())
    .filter(Boolean);

  if (process.env['NODE_ENV'] === 'production') {
    assertProductionSecret(primary, 'SESSION_SECRET');
    previous.forEach(secret => assertProductionSecret(secret, 'SESSION_SECRET_PREVIOUS'));
  }

  const secrets = [primary || DEVELOPMENT_SESSION_SECRET, ...previous]
    .filter((secret, index, all) => all.indexOf(secret) === index);
  return secrets.length === 1 ? secrets[0]! : secrets;
}

function resolveStore(): session.Store {
  const storeMode = (process.env['SESSION_STORE'] || '').trim().toLowerCase();
  const redisUrl = (process.env['REDIS_URL'] || '').trim();

  const wantsMemory = storeMode === 'memory' || redisUrl === '' || redisUrl === 'memory://';
  if (wantsMemory) {
    if (!wantsMemory || storeMode === 'memory' || redisUrl === 'memory://') {
      // eslint-disable-next-line no-console
      console.log('[session] using MemoryStore (SESSION_STORE=memory or REDIS_URL=memory://)');
    } else {
      // eslint-disable-next-line no-console
      console.warn('[session] REDIS_URL is not set, falling back to MemoryStore. Sessions will be lost on server restart. Set REDIS_URL=redis://... for persistence.');
    }
    return new session.MemoryStore();
  }

  // Connect-redis path. Create one shared client and reuse it across
  // middleware invocations (sessionMiddleware() may be called once but
  // cache defensively in case of future multi-mount usage).
  if (!cachedRedisClient) {
    cachedRedisClient = createClient({ url: redisUrl }) as RedisClientType;
    cachedRedisClient.on('error', (err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[session] redis client error:', err);
    });
    cachedRedisClient.on('ready', () => {
      // eslint-disable-next-line no-console
      console.log(`[session] redis client ready at ${redisUrl}`);
    });
    // Fire-and-forget connect; redis@5 buffers commands until ready.
    cachedRedisClient.connect().catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[session] redis connect failed:', err);
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[session] using RedisStore at ${redisUrl}`);
  // Cast via unknown — connect-redis@7's RedisStore extends the abstract
  // session.Store class at runtime but TypeScript's structural check
  // doesn't see the inherited methods (regenerate, load, createSession,
  // etc.) because they live on Store.prototype. The cast is safe because
  // RedisStore IS a Store at runtime via prototype chain.
  const redisStore = new RedisStore({
    client: cachedRedisClient,
    prefix: 'rizzoma:sess:',
  });
  return redisStore as unknown as session.Store;
}

export function sessionMiddleware(storeOverride?: session.Store): RequestHandler {
  const secret = sessionSecrets();
  const store = storeOverride || resolveStore();
  activeSessionStore = store;
  activeSessionStoreMode = storeOverride || store instanceof session.MemoryStore ? 'memory' : 'redis';
  return session({
    store,
    // express-session signs with the first secret and accepts the remaining
    // entries for verification. This permits a no-logout secret rotation:
    // deploy a new SESSION_SECRET with the old value in
    // SESSION_SECRET_PREVIOUS, then remove the previous value after the
    // longest session lifetime has elapsed.
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
    name: 'rizzoma.sid',
  });
}

function sessionBelongsToUser(serialized: unknown, userId: string): boolean {
  try {
    const sessionData = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
    return String((sessionData as any)?.userId || '') === userId;
  } catch {
    return false;
  }
}

/**
 * Eagerly delete every server-side session for a user after password reset.
 * Credential-version checks remain the authoritative fail-closed boundary;
 * this scan shortens the lifetime of stale Redis/MemoryStore records and
 * makes logout immediate across browser sessions and application replicas.
 */
export async function revokeUserSessions(userId: string): Promise<number> {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return 0;

  if (activeSessionStoreMode === 'redis' && cachedRedisClient) {
    let revoked = 0;
    const client = cachedRedisClient as any;
    for await (const item of client.scanIterator({ MATCH: 'rizzoma:sess:*', COUNT: 100 })) {
      const keys = (Array.isArray(item) ? item : [item]).map(String).filter(Boolean);
      if (!keys.length) continue;
      const values = await client.mGet(keys);
      const matching = keys.filter((_key: string, index: number) => sessionBelongsToUser(values[index], normalizedUserId));
      if (matching.length) {
        revoked += Number(await client.del(matching));
      }
    }
    return revoked;
  }

  const store = activeSessionStore;
  if (!store || typeof store.all !== 'function' || typeof store.destroy !== 'function') {
    throw new Error('session store does not support user revocation');
  }
  const sessions = await new Promise<Record<string, unknown>>((resolve, reject) => {
    store.all!((error, result) => {
      if (error) reject(error);
      else resolve((result || {}) as Record<string, unknown>);
    });
  });
  const ids = Object.entries(sessions)
    .filter(([, value]) => sessionBelongsToUser(value, normalizedUserId))
    .map(([id]) => id);
  await Promise.all(ids.map((id) => new Promise<void>((resolve, reject) => {
    store.destroy(id, (error) => error ? reject(error) : resolve());
  })));
  return ids.length;
}

export type SessionStoreHealth = {
  status: 'ok' | 'error';
  mode: 'redis' | 'memory';
  ms: number;
  error?: string;
};

export async function sessionStoreHealth(): Promise<SessionStoreHealth> {
  const startedAt = Date.now();
  if (!cachedRedisClient) {
    const isProduction = process.env['NODE_ENV'] === 'production';
    return {
      status: isProduction ? 'error' : 'ok',
      mode: 'memory',
      ms: Date.now() - startedAt,
      ...(isProduction ? { error: 'Redis session store is not initialized' } : {}),
    };
  }

  try {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Redis PING timed out after 2000ms')), 2_000);
      timeout.unref?.();
    });
    const reply = await Promise.race([cachedRedisClient.ping(), timeoutPromise])
      .finally(() => { if (timeout) clearTimeout(timeout); });
    if (reply !== 'PONG') throw new Error(`Unexpected Redis PING response: ${reply}`);
    return { status: 'ok', mode: 'redis', ms: Date.now() - startedAt };
  } catch (error: any) {
    return {
      status: 'error',
      mode: 'redis',
      ms: Date.now() - startedAt,
      error: error?.message || 'Redis session store is unreachable',
    };
  }
}

export async function closeSessionStore(): Promise<void> {
  const client = cachedRedisClient;
  cachedRedisClient = null;
  if (!client || !client.isOpen) return;
  await client.quit();
}
