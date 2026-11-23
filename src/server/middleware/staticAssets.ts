import express, { type Router } from 'express';
import compression from 'compression';
import path from 'path';

/**
 * Serves the built client (dist/client) with the two things the production server was missing (measured 23 Nov 2026,
 * see wiki/log.md): compression and long-lived caching for content-hashed files.
 *
 * Before this, `main-<hash>.js` (1,577,380 bytes), `api-<hash>.js` and `main-<hash>.css` were sent byte for byte
 * (Content-Encoding absent although the browser offered gzip and br: nginx only compresses text/html for proxied
 * responses) and with `Cache-Control: public, max-age=0`, so every visit and every reload downloaded about 2.1 MB again.
 * Compressed they are about 0.58 MB; with an immutable cache a returning visitor downloads none of them.
 *
 * Only this router compresses. API responses are deliberately left out: they are small, and compressing responses that
 * can reflect secrets next to attacker-influenced text is a BREACH risk for no measurable gain.
 */
// Vite names every build output `<name>-<8+ chars of hash>.<ext>`; only those files may be cached forever.
export const HASHED_ASSET = /^assets\/(?:.*\/)?[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

export function staticAssets(dir: string): Router {
  const router = express.Router();
  router.use(compression({ threshold: 1024 }));
  router.use(
    express.static(dir, {
      setHeaders(res, filePath) {
        const rel = path.relative(dir, filePath).split(path.sep).join('/');
        if (HASHED_ASSET.test(rel)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (rel === 'index.html' || rel === 'sw.js' || rel === 'service-worker.js' || rel === 'manifest.json') {
          // the entry point and the service worker name the hashed files; they must be revalidated on every visit
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  return router;
}
