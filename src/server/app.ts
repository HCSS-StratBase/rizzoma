import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import topicsRouter from './routes/topics.js';
import { config } from './config.js';
import { couchDbInfo } from './lib/couch.js';
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

const app = express();

// Middleware
app.use(helmet());
// reflect origin from allowlist for credentialed requests
const isProd = process.env['NODE_ENV'] === 'production';
const allowedOrigins = (process.env['ALLOWED_ORIGINS'] || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowAll = !isProd && allowedOrigins.includes('*');
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
app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
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

// Placeholder root
app.get('/', (_req, res) => {
  res.type('text').send('Rizzoma modern server running');
});

// Static assets in production
if (process.env['NODE_ENV'] === 'production') {
  const staticDir = path.resolve(process.cwd(), 'dist', 'client');
  app.use(express.static(staticDir));
}

// Create HTTP server and bind socket.io for realtime events
const server = http.createServer(app);

// Initialize socket.io with same CORS policy as HTTP
initSocket(server, allowedOrigins);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${config.port}`);
});

// Error handler must be last
app.use(errorHandler);

export default app;
