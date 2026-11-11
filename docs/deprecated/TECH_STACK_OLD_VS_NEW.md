# Old vs New Tech Stack

Branch: `feature/rizzoma-core-features`
Date: 2026-02-03

This summarizes the legacy (CoffeeScript-era) stack versus the modernized stack in this repo.

## Summary Table

| Area | Legacy (Old) | Modern (New)
| --- | --- | --- |
| Language/runtime | CoffeeScript + Node (older LTS) | TypeScript/ESM + Node 20.19+
| Frontend build | Hand-rolled CoffeeScript + legacy tooling | Vite 7
| UI framework | Custom/jQuery-era components | React + modern component structure
| Editor | Legacy rich text / bespoke | TipTap + Yjs
| Realtime | Legacy websocket stack | Socket.IO + Yjs
| Storage | CouchDB (legacy schema) | CouchDB (modernized schema + indexes)
| Cache | Redis (legacy usage) | Redis 5
| Search | Sphinx | Sphinx (still used)
| Queues | RabbitMQ | RabbitMQ (still used)
| Tests | Legacy ad‑hoc scripts | Vitest + Playwright
| Auth | Legacy/demo flows | Real auth only (OAuth/SAML + sessions)
| CI | Minimal | Playwright smokes + health checks + linting
| Assets | Legacy static bundle | Modern Vite build + cleaned legacy assets

## Notes
- Legacy UI behavior is still referenced from `original-rizzoma/` and `original-rizzoma-src/` to maintain BLB parity.
- Some legacy services (CouchDB/Redis/RabbitMQ/Sphinx) remain, but client/server code paths are modernized.
