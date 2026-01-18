import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
const useMemoryStore = process.env['SESSION_STORE'] === 'memory' || redisUrl.startsWith('memory://');
const redisClient = useMemoryStore ? null : createClient({ url: redisUrl });
if (redisClient) {
  redisClient.connect().catch((e: unknown) => console.error('[redis] connect error', e));
}

export function sessionMiddleware() {
  const store = useMemoryStore
    ? new session.MemoryStore()
    : new (RedisStore as unknown as any)({ client: redisClient as any }) as any;

  return session({
    store,
    secret: process.env['SESSION_SECRET'] || 'dev-secret-change-me',
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
