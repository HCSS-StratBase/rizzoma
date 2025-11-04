# Rizzoma Modernization Strategy

## Overview
This document outlines the strategy for modernizing the Rizzoma codebase from Node.js 0.10 and CoffeeScript to modern JavaScript/TypeScript.

### Repository Target (Fork Policy)
- All work is done in the HCSS fork repository: `HCSS-StratBase/rizzoma`.
- Do not open PRs to `rizzoma/rizzoma` until the modern app works end‑to‑end.
- PR command (explicitly targeting our fork):
  - `gh pr create -R HCSS-StratBase/rizzoma -B master -H <branch>`
  - Always verify `git remote -v` shows `origin` → `https://github.com/HCSS-StratBase/rizzoma`.

## Current State Analysis

### Core Dependencies (Critical Updates Needed)
1. **Node.js**: 0.10.x → 20.x LTS
2. **Express**: 2.5.8 → 4.x/5.x
3. **CoffeeScript**: 1.2.0 → TypeScript 5.x
4. **Socket.io**: sockjs 0.3.0 → socket.io 4.x
5. **Redis**: 0.7.1 → 4.x
6. **CouchDB Access**: cradle 0.6.6 → direct HTTP (Mango `_find` + views)

### Migration Phases

## Current Progress Snapshot
- Modern tooling configured: TypeScript, ESLint/Prettier, Vite (client), TSX (server)
- Docker dev environment added (CouchDB, Redis, RabbitMQ, Sphinx, app)
- CouchDB views copied from legacy and deployable via script
- TS server + client with Auth, Topics/Comments CRUD, CSRF, requestId, basic search/pagination, and Socket.IO-based realtime refresh
- Coffee→TS migration tool in place; dry‑run enumerates 500+ CoffeeScript files

Next immediate objectives:
- Replace in‑memory search/pagination with CouchDB Mango/view queries (DONE in Phase 2)
- Add unit/integration tests (server middleware + routes; client basics) (IN PROGRESS)
- Verify production image + compose profile and finalize deploy docs (IN PROGRESS)

Milestone A (Phase 3 start): Waves + Blips (read‑only)
- Data model: `wave` + `blip` documents (tree via `parentId`), reuse legacy views when helpful
- API: list waves, get wave + nested blip tree
- UI: React WaveView with expand/collapse on nested blips
- Outcome: recognizable Rizzoma waves with nested blips (read‑only)

## Phase 1: Infrastructure & Build System (Week 1-2)
1. Create modern package.json with updated dependencies
2. Set up TypeScript configuration
3. Configure modern build tools (Vite for frontend, esbuild for backend)
4. Create Docker development environment
5. Set up ESLint and Prettier

## Phase 2: Dependency Updates (Week 3-4)
1. Update Express to 4.x (breaking changes in middleware)
2. Replace deprecated libraries:
   - cradle → nano (CouchDB)
   - connect-redis → modern session store
   - node-xmpp → @xmpp/client
   - mailparser → mailparser 3.x
3. Update authentication libraries (passport 0.6.x)
4. Replace sockjs with socket.io

## Phase 3: CoffeeScript to TypeScript Migration (Week 5-8) and Parity
1. Create automated migration scripts using decaffeinate
2. Start with shared modules (`src/share/`)
3. Migrate server-side code (`src/server/`)
4. Migrate client-side code (`src/client/`)
5. Add type definitions progressively

## Phase 4: Frontend Modernization (Week 9-10)
1. Replace jQuery with modern alternatives
2. Introduce React/Vue for UI components
3. Set up Vite for frontend bundling
4. Implement CSS modules or Tailwind

## Phase 5: Testing & Quality (Week 11-12)
1. Set up Jest for unit testing
2. Add Cypress for E2E testing
3. Implement CI/CD pipeline
4. Performance optimization

## Breaking Changes to Address

### Express 2.x → 4.x
- Body parser is now separate middleware
- Router syntax changed
- Error handling middleware signature changed
- Session handling updated

### Authentication
- Passport strategies need updates
- OAuth flows have changed significantly
- Need to implement JWT tokens

### Real-time Communication
- ShareJS is abandoned, need alternative OT library
- SockJS → Socket.io migration (server + client wiring complete for topics/comments refresh)
- WebRTC implementation needs updates

### Database Access
- Cradle is unmaintained; we now use direct HTTP helpers
- CouchDB views may need updates and should be deployed via script
- Consider adding Mango indexes and/or map/reduce views for search

## Risk Mitigation
1. Create comprehensive test suite before migration
2. Migrate incrementally, keeping old code functional
3. Use feature flags for gradual rollout
4. Maintain backward compatibility where possible
5. Document all breaking changes

## Success Metrics
- All tests passing
- Performance improvement (target 50% faster)
- Successful Docker deployment
- Modern development experience
- Security vulnerabilities resolved
