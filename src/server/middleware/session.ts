import session, { type Store } from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

export function sessionMiddleware() {
  const redisUrl = process.env['REDIS_URL'];
  const useMemoryStore = process.env['SESSION_STORE'] === 'memory' || redisUrl === 'memory://';
  const store: Store = useMemoryStore
    ? new session.MemoryStore()
    : createRedisSessionStore(redisUrl || 'redis://localhost:6379');

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

function createRedisSessionStore(url: string): Store {
  const client = createClient({ url });
  client.on('error', (error) => {
    console.error('[session] Redis session store error:', error);
  });
  void client.connect().catch((error) => {
    console.error('[session] Redis session store connection failed:', error);
  });
  return new RedisStore({ client, prefix: 'rizzoma:sess:' }) as unknown as Store;
}
