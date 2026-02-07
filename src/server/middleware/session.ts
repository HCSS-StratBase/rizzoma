import session from 'express-session';

export function sessionMiddleware() {
  // Use MemoryStore for development simplicity
  // For production, consider connect-redis or similar
  const store = new session.MemoryStore();

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
