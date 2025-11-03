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
import commentsRouter from './routes/comments.js';

const app = express();

// Middleware
app.use(helmet());
// reflect origin from allowlist for credentialed requests
const allowedOrigins = (process.env['ALLOWED_ORIGINS'] || 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));
// trust proxy for secure cookies behind proxies
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
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

// Placeholder root
app.get('/', (_req, res) => {
  res.type('text').send('Rizzoma modern server running');
});

// Static assets in production
if (process.env['NODE_ENV'] === 'production') {
  const staticDir = path.resolve(process.cwd(), 'dist', 'client');
  app.use(express.static(staticDir));
}

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${config.port}`);
});

// Error handler must be last
app.use(errorHandler);

export default app;
