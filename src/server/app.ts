import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import topicsRouter from './routes/topics.js';
import { config } from './config.js';
import { couchDbInfo, ensureAllIndexes } from './lib/couch.js';
import path from 'path';
import authRouter from './routes/auth.js';
import { requestLogger } from './lib/logger.js';
import { errorHandler } from './middleware/error.js';
import { requestId } from './middleware/requestId.js';
import { csrfInit } from './middleware/csrf.js';
import { sessionMiddleware } from './middleware/session.js';
import http from 'http';
import { initSocket } from './lib/socket.js';
import commentsRouter from './routes/comments.js';
import wavesRouter from './routes/waves.js';
import editorRouter from './routes/editor.js';
import linksRouter from './routes/links.js';
import blipsRouter from './routes/blips.js';
import { inlineCommentsRouter } from './routes/inlineComments.js';
import { uploadsPath, uploadsRouter } from './routes/uploads.js';
import healthRouter from './routes/health.js';
import notificationsRouter from './routes/notifications.js';
import gadgetsRouter from './routes/gadgets.js';
import mentionsRouter from './routes/mentions.js';
import tasksRouter from './routes/tasks.js';

const app = express();

// Middleware
app.use(helmet());
// reflect origin from allowlist for credentialed requests
const isProd = process.env['NODE_ENV'] === 'production';
const allowedOrigins = (process.env['ALLOWED_ORIGINS'] || 'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:8788,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002,http://127.0.0.1:3003,http://127.0.0.1:3004,http://127.0.0.1:3005,http://127.0.0.1:8788')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    // In dev mode, allow any origin (needed for LAN/mobile testing via IP)
    if (!isProd) return cb(null, true);
    const allowAll = allowedOrigins.includes('*');
    if (allowAll || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));
// trust proxy for secure cookies behind proxies
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Sessions across API routes (auth, topics, comments)
app.use(sessionMiddleware());
app.use(requestId());
app.use(requestLogger());
app.use(csrfInit());

// Health and basic routes
app.use('/api', healthRouter);
app.get('/api/deps', async (_req, res) => {
  try {
    const info = await couchDbInfo();
    res.json({ couchdb: info?.couchdb || 'ok', version: info?.version });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'deps_error' });
  }
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/topics', topicsRouter);
app.use('/api', commentsRouter);
app.use('/api/waves', wavesRouter);
app.use('/api/editor', editorRouter);
app.use('/api', linksRouter);
app.use('/api/blips', blipsRouter);
app.use('/api', inlineCommentsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/gadgets', gadgetsRouter);
app.use('/api/mentions', mentionsRouter);
app.use('/api/tasks', tasksRouter);

// Static assets and SPA fallback
const staticDir = path.resolve(process.cwd(), 'dist', 'client');

if (process.env['NODE_ENV'] === 'production') {
  app.use(express.static(staticDir));
}

// Uploads are served from disk; mount BEFORE the SPA catch-all so the
// catch-all doesn't need to defensively skip /uploads paths itself.
app.use('/uploads', express.static(uploadsPath, {
  fallthrough: false,
  maxAge: '1d',
}));

// SPA navigation handler (last registered — catch-all for non-/api, non-/uploads
// GET requests). Uses the Express 5 / path-to-regexp v8 named-wildcard syntax
// `/{*path}` which is the canonical form under the current stack — bare `*`
// was dropped in path-to-regexp v8 and is no longer supported. This is not
// a workaround; it's the correct syntax. See also Hard Gap #29 (2026-04-13).
app.get('/{*path}', (_req, res, next) => {
  // /api paths fall through to the API sub-routers mounted above. If none
  // of them match, let Express's default 404 handler deal with it rather
  // than swallow the request inside the SPA fallback.
  if (_req.path.startsWith('/api')) {
    return next();
  }

  if (process.env['NODE_ENV'] === 'production') {
    res.sendFile(path.join(staticDir, 'index.html'));
  } else {
    // In development, if they hit the reserved Rizzoma backend port, redirect
    // them to the Vite UI port. 8788 is the canonical Rizzoma backend port
    // (see src/server/config.ts and CLAUDE.md "Reserved Ports" section).
    const host = _req.get('host') || 'localhost';
    if (host.includes(':8788')) {
      return res.redirect(`http://${host.replace(':8788', ':3000')}${_req.originalUrl}`);
    }
    // Fallback if not on the Rizzoma backend port but still in dev
    res.status(404).send('Rizzoma Dev Server: Please use port 3000 for the UI');
  }
});

// Create HTTP server and bind socket.io for realtime events
const server = http.createServer(app);

// Initialize socket.io with same CORS policy as HTTP
initSocket(server, allowedOrigins);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${config.port}`);
  // Ensure CouchDB indexes exist (non-blocking, logged)
  ensureAllIndexes().catch(() => {});
});

// Error handler must be last
app.use(errorHandler);

export default app;
