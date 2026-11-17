import express, { type RequestHandler, type Router } from 'express';

/**
 * Sandboxed gadget apps (Kanban, Planner, Focus, Notes) are static pages that
 * the editor embeds as `<iframe sandbox="allow-scripts allow-forms allow-popups">`.
 * That sandbox has NO `allow-same-origin`, so the frame's document runs in an
 * OPAQUE origin (`null`). Everything the frame loads is therefore cross-origin
 * from the browser's point of view, and the application-wide hardening that is
 * right for the SPA silently emptied every frame in production (measured
 * 2026-11-17 on a production-mode server, identical headers to the live host):
 *
 *   1. `cors()` with an origin allowlist answers the frame's module-script
 *      fetch (`Origin: null`) with HTTP 500 `CORS not allowed`.
 *   2. helmet's `Cross-Origin-Resource-Policy: same-origin` blocks the frame's
 *      stylesheet (`net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`).
 *   3. helmet's `script-src 'self'` (no `'unsafe-inline'`) blocks any inline
 *      `<script>` in the gadget page ("Executing inline script violates ...").
 *
 * The result was a white rectangle: `#app` never populated. The gadget assets
 * are public, credential-free static files, so they get their own mount that
 * is registered BEFORE helmet/cors with a purpose-built, still strict policy.
 * Gadget pages must keep their scripts in external `.js` files (CSP forbids
 * inline script by design).
 */
export const GADGET_APPS_MOUNT = '/gadgets/apps';

/** CSP for gadget documents: own-origin script/style/img only, no network. */
export const GADGET_APP_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  // The gadget pages carry small inline <style> blocks.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  // Only our own application may embed a gadget.
  "frame-ancestors 'self'",
].join('; ');

export function gadgetAppResponseHeaders(): RequestHandler {
  return (_req, res, next) => {
    // Opaque-origin frames fetch their module scripts in CORS mode.
    res.setHeader('Access-Control-Allow-Origin', '*');
    // ...and their stylesheet in no-cors mode: CORP must allow cross-origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', GADGET_APP_CSP);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  };
}

/** Router serving the built gadget app files from `rootDir` (dist/client/gadgets/apps). */
export function gadgetAppsRouter(rootDir: string): Router {
  const router = express.Router();
  router.use(gadgetAppResponseHeaders());
  router.use(express.static(rootDir, { index: false }));
  // A missing gadget file is a plain 404, never the SPA index.html (and not a logged server error).
  router.use((_req, res) => { res.status(404).type('text/plain').send('Not found'); });
  return router;
}
