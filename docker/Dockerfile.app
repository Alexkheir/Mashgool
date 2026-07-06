# docker/Dockerfile.app — Next.js frontend
#
# npm-workspaces monorepo: the single lockfile lives at the repo root, so every
# stage copies root package.json + package-lock.json and installs with
# `npm ci --workspace`. Build context must be the repo root.

# ─── BASE ────────────────────────────────────────────────────────────────────
FROM node:24.18-alpine AS base
WORKDIR /repo
RUN apk add --no-cache libc6-compat

# ─── DEPS ────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=apps/web

# ─── DEV ─────────────────────────────────────────────────────────────────────
# Source is volume-mounted over /repo/apps/web by docker-compose.yml.
FROM deps AS dev
WORKDIR /repo/apps/web
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ─── BUILDER ─────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY apps/web/ apps/web/
WORKDIR /repo/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are inlined into the client bundle at build time.
# Empty string = same-origin: the browser calls /api/... on the public domain
# and nginx routes it to the api container. Local dev overrides this via
# docker-compose.yml instead (http://localhost:4000).
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# ─── PROD ────────────────────────────────────────────────────────────────────
# Runs the self-contained standalone output (see output: 'standalone' in
# next.config.ts) — no full node_modules, no source, non-root user.
FROM node:24.18-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output mirrors the monorepo layout: server.js sits at apps/web/.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
