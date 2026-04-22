# Multi-stage Dockerfile for Rizzoma

# Stage 1: Base dependencies
FROM node:20-alpine AS base
ENV CYPRESS_INSTALL_BINARY=0
RUN apk add --no-cache python3 make g++ git
WORKDIR /app

# Stage 2: Development
FROM base AS development
COPY package*.json ./
# Use npm install in dev to allow missing/updated lockfiles and faster iteration
RUN npm install
COPY . .
EXPOSE 3000 8788
CMD ["npm", "run", "dev"]

# Stage 3: Builder
FROM base AS builder
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

# Stage 4: Production
FROM node:20-alpine AS production
RUN apk add --no-cache tini curl
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi && npm cache clean --force

COPY --from=builder /app/dist ./dist

# winston FileTransport mkdirs /app/logs at startup; USER node can't write to
# /app (owned by root from COPY), so pre-create the dir and chown it.
RUN mkdir -p /app/logs && chown -R node:node /app/logs

USER node
EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD curl -fsS http://localhost:8788/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# tsc preserves src/ → dist/ hierarchy (rootDir=src, outDir=dist/server in
# tsconfig.server.json), so src/server/app.ts emits to dist/server/server/app.js.
CMD ["node", "dist/server/server/app.js"]
