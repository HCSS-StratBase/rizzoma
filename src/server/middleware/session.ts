import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });
redisClient.connect().catch((e) => console.error('[redis] connect error', e));

export function sessionMiddleware() {
  return session({
    store: new (RedisStore as unknown as any)({ client: redisClient as any }) as any,
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

