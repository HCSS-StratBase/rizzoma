# Multi-stage Dockerfile for Rizzoma

# Stage 1: Base dependencies
FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++ git
WORKDIR /app

# Stage 2: Development
FROM base AS development
COPY package*.json ./
# Use npm install in dev to allow missing/updated lockfiles and faster iteration
RUN npm install
COPY . .
EXPOSE 3000 8000
CMD ["npm", "run", "dev"]

# Stage 3: Builder
FROM base AS builder
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 4: Production
FROM node:20-alpine AS production
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 8000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/app.js"]
