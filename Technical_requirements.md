# FreelanceFlow — Technical Requirements Document

**Version:** 1.0  
**Status:** Initial Draft  
**Stack:** Next.js · Express · PostgreSQL · Docker · GitHub Actions  

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [Database Schema and Relations](#2-database-schema-and-relations)
3. [Docker Architecture](#3-docker-architecture)
4. [Nginx Configuration](#4-nginx-configuration)
5. [Authentication Architecture](#5-authentication-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Frontend Architecture](#7-frontend-architecture)
8. [API Design](#8-api-design)
9. [Security Architecture](#9-security-architecture)
10. [CI/CD Pipeline](#10-cicd-pipeline)
11. [Monitoring and Observability](#11-monitoring-and-observability)

---

## 1. Repository Structure

### Overview

FreelanceFlow is a monorepo managed with npm Workspaces. It contains two applications — the Next.js frontend and the Express API — each fully self-contained with their own dependencies, DTOs, and build configuration. There is no shared code package between them. Shared infrastructure configuration (Docker, Nginx, GitHub Actions) lives at the root level.

### Full Directory Tree

```
freelanceflow/
│
├── apps/
│   ├── web/                          ← Next.js frontend (App Router)
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   ├── .env.local.example
│   │   └── src/
│   │       ├── app/                  ← App Router pages and layouts
│   │       │   ├── layout.tsx        ← Root layout (providers, fonts)
│   │       │   ├── page.tsx          ← Landing / login page
│   │       │   ├── (auth)/           ← Auth route group
│   │       │   │   └── login/
│   │       │   │       └── page.tsx
│   │       │   └── (app)/            ← Protected route group
│   │       │       ├── layout.tsx    ← App shell (sidebar, navbar)
│   │       │       ├── dashboard/
│   │       │       │   └── page.tsx
│   │       │       ├── clients/
│   │       │       │   ├── page.tsx
│   │       │       │   └── [clientId]/
│   │       │       │       ├── page.tsx
│   │       │       │       └── tasks/
│   │       │       │           └── [taskId]/
│   │       │       │               └── page.tsx
│   │       │       ├── ai/
│   │       │       │   └── page.tsx  ← Paste and voice to task
│   │       │       └── audit/
│   │       │           └── page.tsx
│   │       ├── components/           ← React components
│   │       │   ├── ui/               ← shadcn/ui base components
│   │       │   ├── board/            ← Scrum board components
│   │       │   ├── tasks/            ← Task card, task form, task detail
│   │       │   ├── clients/          ← Client card, client form
│   │       │   ├── ai/               ← Paste and voice to task components
│   │       │   ├── dashboard/        ← Dashboard widgets and stats
│   │       │   ├── audit/            ← Audit log components
│   │       │   └── shared/           ← Filter bar, pagination, modals
│   │       ├── lib/                  ← Utilities and configuration
│   │       │   ├── api-client.ts     ← Base fetch wrapper
│   │       │   ├── query-client.ts   ← React Query client setup
│   │       │   └── utils.ts          ← General utility functions
│   │       ├── hooks/                ← Custom React hooks
│   │       │   ├── use-clients.ts    ← React Query hooks for clients
│   │       │   ├── use-tasks.ts      ← React Query hooks for tasks
│   │       │   ├── use-ai.ts         ← React Query hooks for AI features
│   │       │   └── use-audit.ts      ← React Query hooks for audit log
│   │       ├── store/                ← Zustand stores
│   │       │   ├── auth.store.ts     ← Current user state
│   │       │   ├── ui.store.ts       ← View preferences, active workspace
│   │       │   └── filter.store.ts   ← Active filter state per workspace
│   │       ├── dtos/                 ← Frontend Zod schemas (form validation)
│   │       │   ├── task.dto.ts
│   │       │   ├── client.dto.ts
│   │       │   └── ai.dto.ts
│   │       ├── types/                ← Frontend TypeScript types
│   │       │   └── index.ts
│   │       └── middleware.ts         ← Next.js middleware (route protection)
│   │
│   └── api/                          ← Express backend
│       ├── package.json
│       ├── tsconfig.json
│       ├── .env.example
│       └── src/
│           ├── index.ts              ← Entry point — creates and starts app
│           ├── app.ts                ← Express app setup and middleware chain
│           ├── routes/               ← Route definitions
│           │   ├── index.ts          ← Mounts all routers under /api/v1
│           │   ├── auth.routes.ts
│           │   ├── client.routes.ts
│           │   ├── task.routes.ts
│           │   ├── ai.routes.ts
│           │   ├── audit.routes.ts
│           │   └── health.routes.ts
│           ├── controllers/          ← Request handlers (thin layer)
│           │   ├── auth.controller.ts
│           │   ├── client.controller.ts
│           │   ├── task.controller.ts
│           │   ├── ai.controller.ts
│           │   └── audit.controller.ts
│           ├── services/             ← Business logic (fat layer)
│           │   ├── auth.service.ts
│           │   ├── client.service.ts
│           │   ├── task.service.ts
│           │   ├── task-key.service.ts
│           │   ├── ai.service.ts
│           │   ├── whisper.service.ts
│           │   ├── claude.service.ts
│           │   └── audit.service.ts
│           ├── middleware/           ← Express middleware
│           │   ├── auth.middleware.ts     ← JWT verification
│           │   ├── validate.middleware.ts ← Zod request validation
│           │   ├── rate-limit.middleware.ts
│           │   ├── error.middleware.ts    ← Global error handler
│           │   └── audit.middleware.ts    ← Audit log writer
│           ├── dtos/                 ← Backend Zod schemas (API validation)
│           │   ├── task.dto.ts
│           │   ├── client.dto.ts
│           │   └── ai.dto.ts
│           ├── lib/                  ← External clients and singletons
│           │   ├── prisma.ts         ← Prisma client singleton
│           │   ├── sentry.ts         ← Sentry initialization
│           │   └── metrics.ts        ← Prometheus metrics setup
│           ├── config/               ← Environment variable validation
│           │   └── env.ts            ← Zod-validated env config
│           └── types/                ← Backend TypeScript types
│               └── index.ts
│
├── docker/
│   ├── Dockerfile.app                ← Multi-stage Dockerfile for Next.js
│   ├── Dockerfile.api                ← Multi-stage Dockerfile for Express
│   └── nginx/
│       ├── nginx.conf                ← Production Nginx config
│       └── nginx.dev.conf            ← Local dev Nginx config (optional)
│
├── .github/
│   └── workflows/
│       └── deploy.yml                ← CI/CD pipeline
│
├── scripts/
│   ├── backup.sh                     ← Manual database backup script
│   └── restore.sh                    ← Database restore script
│
├── docs/
│   ├── requirements-brief.md         ← Natural language requirements
│   ├── technical-requirements.md     ← This document
│   ├── backlog.md                    ← Full product backlog
│   ├── runbooks/
│   │   ├── backup.md                 ← How to back up the database
│   │   ├── restore.md                ← How to restore from backup
│   │   └── rollback.md               ← How to roll back a deployment
│   └── architecture/
│       └── diagrams/                 ← Architecture diagrams
│
├── docker-compose.yml                ← Local development stack
├── docker-compose.prod.yml           ← Production stack
├── package.json                      ← Root package.json with workspaces
├── .env.example                      ← All environment variables documented
├── .gitignore
└── README.md
```

### Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `task-key.service.ts` |
| React components | PascalCase | `TaskCard.tsx` |
| TypeScript types and interfaces | PascalCase | `TaskResponse` |
| Zod schemas / DTOs | PascalCase with suffix | `CreateTaskDto` |
| Database tables | snake_case plural | `tasks`, `audit_logs` |
| Database columns | snake_case | `created_at`, `client_id` |
| Environment variables | SCREAMING_SNAKE_CASE | `DATABASE_URL` |
| API routes | kebab-case | `/api/v1/task-keys` |
| Zustand stores | camelCase with suffix | `useAuthStore` |
| React Query keys | array of strings | `['tasks', clientId]` |

### Root package.json

```json
{
  "name": "freelanceflow",
  "private": true,
  "workspaces": [
    "apps/web",
    "apps/api"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev -w apps/web\" \"npm run dev -w apps/api\"",
    "build": "npm run build -w apps/web && npm run build -w apps/api",
    "test": "npm run test -w apps/web && npm run test -w apps/api",
    "lint": "npm run lint -w apps/web && npm run lint -w apps/api"
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

---

## 2. Database Schema and Relations

### Overview

The database is PostgreSQL managed via Prisma ORM. All tables use UUIDs as primary keys. All timestamps are stored in UTC. Soft deletion is not used — records are either archived (clients) or permanently deleted (tasks). The Prisma schema file lives at `apps/api/prisma/schema.prisma`.

### Entity Relationship Overview

```
User
 └── has many Clients
      └── has many Tasks
           └── has many AuditLogs (via entity reference)
 └── has many AuditLogs (as actor)
```

### Prisma Schema

```prisma
// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── USER ────────────────────────────────────────────────────────────────────

model User {
  id            String    @id @default(uuid())
  googleId      String    @unique @map("google_id")
  email         String    @unique
  name          String
  avatarUrl     String?   @map("avatar_url")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  clients       Client[]
  auditLogs     AuditLog[]

  @@map("users")
}

// ─── CLIENT ──────────────────────────────────────────────────────────────────

model Client {
  id            String    @id @default(uuid())
  userId        String    @map("user_id")
  name          String
  shortCode     String    @map("short_code")
  description   String?
  color         String    @default("#4A90D9")
  isArchived    Boolean   @default(false) @map("is_archived")
  taskCounter   Int       @default(0) @map("task_counter")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tasks         Task[]

  @@unique([userId, name])
  @@unique([userId, shortCode])
  @@index([userId])
  @@index([userId, isArchived])
  @@map("clients")
}

// ─── TASK ────────────────────────────────────────────────────────────────────

model Task {
  id            String      @id @default(uuid())
  clientId      String      @map("client_id")
  taskKey       String      @map("task_key")
  title         String
  description   String?
  notes         String?
  status        TaskStatus  @default(TODO)
  priority      Priority    @default(MEDIUM)
  dueDate       DateTime?   @map("due_date")
  boardOrder    Int         @default(0) @map("board_order")
  creationMethod CreationMethod @default(MANUAL) @map("creation_method")
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  client        Client      @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@unique([clientId, taskKey])
  @@index([clientId])
  @@index([clientId, status])
  @@index([clientId, dueDate])
  @@index([clientId, priority])
  @@map("tasks")
}

// ─── AUDIT LOG ───────────────────────────────────────────────────────────────

model AuditLog {
  id            String      @id @default(uuid())
  userId        String      @map("user_id")
  action        AuditAction
  entityType    EntityType  @map("entity_type")
  entityId      String?     @map("entity_id")
  description   String
  metadata      Json?
  createdAt     DateTime    @default(now()) @map("created_at")

  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, action])
  @@index([userId, entityType])
  @@index([createdAt])
  @@map("audit_logs")
}

// ─── ENUMS ───────────────────────────────────────────────────────────────────

enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
  BLOCKED

  @@map("task_status")
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT

  @@map("priority")
}

enum CreationMethod {
  MANUAL
  PASTE_TO_TASK
  VOICE_TO_TASK

  @@map("creation_method")
}

enum AuditAction {
  USER_SIGNED_IN
  USER_SIGNED_OUT
  USER_AUTH_FAILED
  CLIENT_CREATED
  CLIENT_UPDATED
  CLIENT_ARCHIVED
  CLIENT_UNARCHIVED
  CLIENT_DELETED
  TASK_CREATED
  TASK_UPDATED
  TASK_STATUS_CHANGED
  TASK_DELETED
  AI_EXTRACTION_TRIGGERED
  AI_TRANSCRIPTION_TRIGGERED

  @@map("audit_action")
}

enum EntityType {
  USER
  CLIENT
  TASK

  @@map("entity_type")
}
```

### Table Explanations

#### users
Stores one record per authenticated user. `googleId` is the unique identifier from Google OAuth. `email` and `name` come from the Google profile and are updated on each sign-in. No passwords are stored.

#### clients
Each client workspace belongs to one user. `shortCode` is the immutable prefix for task keys — unique per user. `taskCounter` is an incrementing integer that never decrements — it is the source of the task key number. When a new task is created for this client, `taskCounter` increments by one and that value becomes the task key number. Deleted tasks do not decrement this counter. `color` stores a hex color string. `isArchived` is the soft-archive flag.

**Why taskCounter lives on the Client table:**
Task key generation requires an atomic increment — two tasks created simultaneously for the same client must never get the same number. Using a counter column with a database-level atomic increment (`UPDATE clients SET task_counter = task_counter + 1 WHERE id = ? RETURNING task_counter`) guarantees uniqueness without race conditions.

#### tasks
Each task belongs to one client. `taskKey` is the formatted key string (e.g. `BS-12`) stored as a string for fast lookup and display. `boardOrder` is an integer used for manual card ordering within a column on the Scrum board — lower numbers appear first. `creationMethod` records whether the task was created manually, via paste-to-task, or via voice-to-task.

#### audit_logs
Append-only. No update or delete operations are ever performed on this table — only inserts. `entityId` is nullable because some actions (sign in, sign out, auth failures) are not tied to a specific entity. `metadata` is a JSON field for storing additional context — for AI actions it stores the output fields extracted (never the raw input content).

### Database Indexes Strategy

| Table | Index | Reason |
|---|---|---|
| clients | `user_id` | Every client query filters by user |
| clients | `user_id, is_archived` | Client list filters by archived status |
| clients | `user_id, short_code` | Short code uniqueness check on creation |
| tasks | `client_id` | Every task query filters by client |
| tasks | `client_id, status` | Board view groups tasks by status |
| tasks | `client_id, due_date` | Overdue detection and due-soon filters |
| tasks | `client_id, priority` | Priority sorting and filtering |
| audit_logs | `user_id` | Audit log always scoped to one user |
| audit_logs | `user_id, action` | Filtering audit log by action type |
| audit_logs | `user_id, entity_type` | Filtering audit log by entity type |
| audit_logs | `created_at` | Chronological ordering |

### Migration Strategy

- Prisma Migrations are used for all schema changes — never manually alter the database
- Each migration is a timestamped SQL file generated by `npx prisma migrate dev`
- Migrations run automatically on application startup in development via `prisma migrate deploy`
- In production migrations run as a separate step before the new container starts — defined in the deployment pipeline
- Migration files are committed to the repository and treated as source of truth

### Seed Data

A seed file at `apps/api/prisma/seed.ts` creates one test user, two clients, and a set of tasks across all statuses and priorities for local development. Run with `npx prisma db seed`.

---

## 3. Docker Architecture

### Overview

Two custom Docker images are built from the monorepo — one for Next.js and one for Express. Two official images are pulled from Docker Hub — PostgreSQL and Nginx. The local development stack runs all four services. The production stack runs three services (no local database) — wait, correction: per the final decision, PostgreSQL runs in Docker in production too for learning purposes. The production stack runs all four services.

### Dockerfile.app (Next.js)

```dockerfile
# docker/Dockerfile.app

# ─── BASE ────────────────────────────────────────────────────────────────────
FROM node:20.11-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ─── DEPENDENCIES ────────────────────────────────────────────────────────────
FROM base AS deps
COPY apps/web/package*.json ./
RUN npm ci

# ─── DEV ─────────────────────────────────────────────────────────────────────
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Source is mounted as a volume — not copied here
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ─── BUILDER ─────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web/ .
RUN npm run build

# ─── PROD ────────────────────────────────────────────────────────────────────
FROM base AS prod
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
```

### Dockerfile.api (Express)

```dockerfile
# docker/Dockerfile.api

# ─── BASE ────────────────────────────────────────────────────────────────────
FROM node:20.11-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ─── DEPENDENCIES ────────────────────────────────────────────────────────────
FROM base AS deps
COPY apps/api/package*.json ./
RUN npm ci

# ─── DEV ─────────────────────────────────────────────────────────────────────
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Source is mounted as a volume — not copied here
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ─── BUILDER ─────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api/ .
RUN npm run build

# ─── PROD ────────────────────────────────────────────────────────────────────
FROM base AS prod
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

COPY --from=builder --chown=expressjs:nodejs /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

USER expressjs
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### docker-compose.yml (Local Development)

```yaml
# docker-compose.yml

version: '3.9'

services:

  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.app
      target: dev
    volumes:
      - ./apps/web:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - NEXT_PUBLIC_API_URL=http://localhost:4000
    env_file:
      - apps/web/.env.local
    depends_on:
      api:
        condition: service_healthy
    networks:
      - freelanceflow

  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
      target: dev
    volumes:
      - ./apps/api:/app
      - /app/node_modules
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=development
    env_file:
      - apps/api/.env
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:4000/api/v1/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - freelanceflow

  db:
    image: postgres:16.2-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-freelanceflow}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - freelanceflow

  adminer:
    image: adminer:4.8.1
    ports:
      - "8080:8080"
    depends_on:
      db:
        condition: service_healthy
    networks:
      - freelanceflow

volumes:
  postgres_data:

networks:
  freelanceflow:
    driver: bridge
```

### docker-compose.prod.yml (Production)

```yaml
# docker-compose.prod.yml

version: '3.9'

services:

  web:
    image: ghcr.io/${GITHUB_USERNAME}/freelanceflow-web:${IMAGE_TAG:-latest}
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
    expose:
      - "3000"
    depends_on:
      - api
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - freelanceflow

  api:
    image: ghcr.io/${GITHUB_USERNAME}/freelanceflow-api:${IMAGE_TAG:-latest}
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - CLAUDE_API_KEY=${CLAUDE_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - SENTRY_DSN=${SENTRY_DSN}
    expose:
      - "4000"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:4000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - freelanceflow

  db:
    image: postgres:16.2-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    expose:
      - "5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 10
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - freelanceflow

  nginx:
    image: nginx:1.25-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/www/certbot:/var/www/certbot:ro
    depends_on:
      - web
      - api
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - freelanceflow

volumes:
  postgres_data:

networks:
  freelanceflow:
    driver: bridge
```

### Internal Docker Networking

All services communicate using their service names as hostnames within the `freelanceflow` Docker network. No service except Nginx is reachable from outside the network.

| From | To | Hostname | Port |
|---|---|---|---|
| web | api | `http://api:4000` | 4000 |
| api | db | `postgresql://db:5432` | 5432 |
| nginx | web | `http://web:3000` | 3000 |
| nginx | api | `http://api:4000` | 4000 |
| Public internet | nginx | VPS IP | 80, 443 |
| Local machine | web | `localhost:3000` | 3000 (dev only) |
| Local machine | api | `localhost:4000` | 4000 (dev only) |
| Local machine | db | `localhost:5432` | 5432 (dev only) |
| Local machine | adminer | `localhost:8080` | 8080 (dev only) |

### PostgreSQL Data Persistence

The named volume `postgres_data` maps to `/var/lib/postgresql/data` inside the container. This directory is where PostgreSQL stores all its data files. The volume persists across:

- Container restarts
- `docker compose down` and `docker compose up`
- Image upgrades (pull new postgres image, restart — data is safe)
- VPS reboots (Docker restarts automatically, volume re-attaches)

**Never run `docker compose down -v` in production.** The `-v` flag deletes named volumes. This is documented in the README and runbooks.

### Environment Variables

#### apps/api/.env.example
```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@db:5432/freelanceflow"
POSTGRES_DB="freelanceflow"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"

# Auth
JWT_SECRET="change-this-to-a-long-random-string-in-production"
JWT_EXPIRES_IN="7d"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:4000/api/v1/auth/google/callback"

# AI
CLAUDE_API_KEY="your-claude-api-key"
OPENAI_API_KEY="your-openai-api-key"

# Monitoring
SENTRY_DSN="your-sentry-dsn"

# App
PORT=4000
NODE_ENV=development
ALLOWED_ORIGIN="http://localhost:3000"
```

#### apps/web/.env.local.example
```bash
# API
NEXT_PUBLIC_API_URL="http://localhost:4000"

# Auth (used by NextAuth or custom auth)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="change-this-in-production"

# Monitoring
NEXT_PUBLIC_SENTRY_DSN="your-sentry-dsn"
```

---

## 4. Nginx Configuration

### Overview

Nginx sits in front of all services and is the only entry point from the public internet. It handles SSL termination, HTTP to HTTPS redirection, reverse proxying to the Next.js frontend and Express API, security headers, gzip compression, and static asset caching.

### Production nginx.conf

```nginx
# docker/nginx/nginx.conf

worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  # ─── LOGGING ─────────────────────────────────────────────────────────────
  log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                  '$status $body_bytes_sent "$http_referer" '
                  '"$http_user_agent" "$http_x_forwarded_for"';
  access_log /var/log/nginx/access.log main;

  # ─── PERFORMANCE ─────────────────────────────────────────────────────────
  sendfile on;
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 65;

  # ─── GZIP ────────────────────────────────────────────────────────────────
  gzip on;
  gzip_vary on;
  gzip_proxied any;
  gzip_comp_level 6;
  gzip_types
    text/plain
    text/css
    text/xml
    text/javascript
    application/json
    application/javascript
    application/xml+rss
    application/atom+xml
    image/svg+xml;

  # ─── RATE LIMITING ───────────────────────────────────────────────────────
  limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
  limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
  limit_req_zone $binary_remote_addr zone=ai:10m rate=10r/m;

  # ─── HTTP → HTTPS REDIRECT ───────────────────────────────────────────────
  server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location /.well-known/acme-challenge/ {
      root /var/www/certbot;
    }

    location / {
      return 301 https://$host$request_uri;
    }
  }

  # ─── MAIN SERVER ─────────────────────────────────────────────────────────
  server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # ─── SSL ───────────────────────────────────────────────────────────────
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # ─── SECURITY HEADERS ──────────────────────────────────────────────────
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(self), geolocation=()" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # ─── FILE UPLOAD SIZE ──────────────────────────────────────────────────
    client_max_body_size 30M;

    # ─── API ROUTES ────────────────────────────────────────────────────────
    location /api/v1/auth/ {
      limit_req zone=auth burst=10 nodelay;
      proxy_pass http://api:4000;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/v1/ai/ {
      limit_req zone=ai burst=5 nodelay;
      proxy_pass http://api:4000;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_read_timeout 30s;
    }

    location /api/ {
      limit_req zone=api burst=20 nodelay;
      proxy_pass http://api:4000;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ─── STATIC ASSETS ─────────────────────────────────────────────────────
    location /_next/static/ {
      proxy_pass http://web:3000;
      proxy_cache_valid 200 1y;
      add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # ─── NEXT.JS APP ───────────────────────────────────────────────────────
    location / {
      proxy_pass http://web:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_cache_bypass $http_upgrade;
    }
  }
}
```

### Rate Limiting Strategy

| Zone | Route | Rate | Burst |
|---|---|---|---|
| `auth` | `/api/v1/auth/` | 5 requests/minute | 10 |
| `ai` | `/api/v1/ai/` | 10 requests/minute | 5 |
| `api` | `/api/` (all others) | 30 requests/minute | 20 |

---

## 5. Authentication Architecture

### Overview

Authentication uses Google OAuth 2.0. The user signs in with Google, the API exchanges the OAuth code for a Google profile, creates or finds the user in the database, issues a JWT, and stores it in an HTTP-only cookie. Every subsequent API request includes the cookie automatically and the auth middleware verifies the JWT before any route handler runs.

### OAuth Flow — Step by Step

```
1. User clicks "Sign in with Google" on the frontend
         ↓
2. Frontend redirects to GET /api/v1/auth/google
         ↓
3. API redirects to Google OAuth consent screen
         ↓
4. User approves — Google redirects to GET /api/v1/auth/google/callback?code=...
         ↓
5. API exchanges the code for a Google access token
         ↓
6. API fetches the user's Google profile (id, email, name, avatar)
         ↓
7. API upserts the user in the database
   (creates if first time, updates name/avatar if returning)
         ↓
8. API generates a JWT containing { userId, email }
         ↓
9. API sets the JWT in an HTTP-only cookie
         ↓
10. API redirects the browser to the frontend dashboard
         ↓
11. Frontend reads user info from GET /api/v1/auth/me
    (which reads the cookie automatically)
```

### JWT Structure

```typescript
// Payload stored in the JWT
interface JwtPayload {
  userId: string;    // UUID from the users table
  email: string;     // User's email address
  iat: number;       // Issued at (set automatically)
  exp: number;       // Expiry (set automatically based on JWT_EXPIRES_IN)
}
```

### Cookie Configuration

```typescript
// How the JWT cookie is set on the response
res.cookie('token', jwt, {
  httpOnly: true,        // Not accessible via JavaScript — XSS protection
  secure: true,          // HTTPS only in production
  sameSite: 'lax',       // CSRF protection — sent on same-site and top-level navigation
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days in milliseconds
  path: '/'
});
```

### Auth Middleware (Express)

The auth middleware runs on every protected route before the controller. It reads the JWT from the cookie, verifies it, fetches the user from the database, and attaches them to `req.user`. If anything fails it returns 401 immediately.

```typescript
// apps/api/src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
}
```

### Route Protection (Next.js)

Next.js App Router uses middleware at the edge to protect routes before they render. The middleware checks for the JWT cookie and redirects to login if it is missing or invalid.

```typescript
// apps/web/src/middleware.ts

import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_ROUTES = ['/', '/login'];

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const { pathname } = request.nextUrl;

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  if (!token && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token && isPublicRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)']
};
```

### Auth State on the Frontend

The current user is stored in Zustand and populated by a React Query call to `GET /api/v1/auth/me` on app load. The cookie is sent automatically with every request — the frontend never handles the JWT directly.

```typescript
// apps/web/src/store/auth.store.ts
import { create } from 'zustand';

interface AuthStore {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  setUser: (user) => set({ user })
}));
```

```typescript
// apps/web/src/hooks/use-auth.ts
export function useAuth() {
  const setUser = useAuthStore((state) => state.setUser);

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient('/auth/me'),
    onSuccess: (user) => setUser(user),
    retry: false,
    staleTime: 5 * 60 * 1000  // 5 minutes
  });
}
```

---

## 6. Backend Architecture

### Overview

The Express API follows a layered architecture with three main layers: Routes → Controllers → Services. Each layer has a single responsibility. Prisma handles all database access and is only ever called from the Services layer.

### Layer Responsibilities

```
Request
   ↓
Middleware chain
(auth → validate → rate-limit)
   ↓
Router
(matches URL and method → calls controller)
   ↓
Controller
(extracts validated data from req → calls service → sends response)
   ↓
Service
(business logic → calls Prisma → returns result)
   ↓
Prisma
(database query → returns typed result)
   ↓
Controller sends response
   ↓
Response
```

**Routes** — define URL patterns and HTTP methods, apply middleware, delegate to controllers. No logic.

**Controllers** — handle the HTTP layer. Extract data from `req.body`, `req.params`, `req.query`. Call the correct service method. Send the response. No business logic.

**Services** — contain all business logic. Call Prisma for database operations. Call external APIs (Claude, Whisper). Throw typed errors that the global error handler catches. No HTTP knowledge.

### Express App Setup

```typescript
// apps/api/src/app.ts

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { router } from './routes';
import { errorHandler } from './middleware/error.middleware';
import { env } from './config/env';
import { metricsMiddleware } from './lib/metrics';

export function createApp() {
  const app = express();

  // ─── SENTRY ──────────────────────────────────────────────────────────────
  Sentry.init({ dsn: env.SENTRY_DSN });
  app.use(Sentry.Handlers.requestHandler());

  // ─── CORE MIDDLEWARE ─────────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors({
    origin: env.ALLOWED_ORIGIN,
    credentials: true  // required for cookies
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ─── METRICS ─────────────────────────────────────────────────────────────
  app.use(metricsMiddleware);

  // ─── ROUTES ──────────────────────────────────────────────────────────────
  app.use('/api/v1', router);

  // ─── SENTRY ERROR HANDLER ────────────────────────────────────────────────
  app.use(Sentry.Handlers.errorHandler());

  // ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
```

### Environment Variable Validation

All environment variables are validated at startup using Zod. If any required variable is missing or invalid the process exits immediately with a clear error message — the app never starts in a broken state.

```typescript
// apps/api/src/config/env.ts

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000').transform(Number),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_CALLBACK_URL: z.string().url(),
  CLAUDE_API_KEY: z.string(),
  OPENAI_API_KEY: z.string(),
  SENTRY_DSN: z.string().optional(),
  ALLOWED_ORIGIN: z.string().url()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten());
  process.exit(1);
}

export const env = parsed.data;
```

### Global Error Handler

The global error handler is the last middleware in the chain. It catches all errors thrown from controllers and services, logs them, reports them to Sentry, and returns a consistent JSON error response. Stack traces are never sent to the client.

```typescript
// apps/api/src/middleware/error.middleware.ts

import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Operational errors — expected, user-facing
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      message: err.message
    });
  }

  // Unexpected errors — log and report
  console.error({
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    error: err.message,
    stack: err.stack
  });

  Sentry.captureException(err);

  return res.status(500).json({
    message: 'Something went wrong. Please try again.'
  });
}
```

### Request Validation Middleware

A generic middleware factory that takes a Zod schema and validates `req.body` against it. Used on every route that accepts a request body.

```typescript
// apps/api/src/middleware/validate.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: result.error.flatten().fieldErrors
      });
    }

    req.body = result.data;
    next();
  };
}
```

### Task Key Generation Service

Task key generation is a critical operation that must be atomic. Two concurrent task creations for the same client must never produce the same key. This is solved with a single atomic database operation.

```typescript
// apps/api/src/services/task-key.service.ts

import { prisma } from '../lib/prisma';

export async function generateTaskKey(clientId: string): Promise<string> {
  // Atomic increment — returns the new counter value
  const updated = await prisma.$executeRaw`
    UPDATE clients
    SET task_counter = task_counter + 1
    WHERE id = ${clientId}
    RETURNING task_counter, short_code
  `;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { shortCode: true, taskCounter: true }
  });

  return `${client!.shortCode}-${client!.taskCounter}`;
}
```

### Claude API Integration

```typescript
// apps/api/src/services/claude.service.ts

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';

const client = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

interface ExtractionResult {
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  confidence: {
    title: 'high' | 'low';
    dueDate: 'high' | 'low' | null;
    priority: 'high' | 'low';
  };
  hasActionableTask: boolean;
}

export async function extractTaskFromText(
  text: string
): Promise<ExtractionResult> {
  const today = new Date().toISOString().split('T')[0];

  const prompt = `
You are a task extraction assistant. Given a client message, extract a structured task.

Today's date is ${today}.

Message:
"""
${text}
"""

Respond ONLY with a valid JSON object in this exact shape:
{
  "hasActionableTask": boolean,
  "title": "string — concise task title",
  "description": "string or null — additional context",
  "dueDate": "YYYY-MM-DD or null — convert relative dates to absolute",
  "priority": "low | medium | high | urgent",
  "confidence": {
    "title": "high | low",
    "dueDate": "high | low | null",
    "priority": "high | low"
  }
}

If there is no actionable task in the message set hasActionableTask to false and all other fields to null.
Confidence is "low" when you are guessing or inferring — flag these for user review.
`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new AppError(500, 'Unexpected response from Claude API');
    }

    return JSON.parse(content.text) as ExtractionResult;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'AI extraction service is temporarily unavailable');
  }
}
```

### Whisper API Integration

```typescript
// apps/api/src/services/whisper.service.ts

import OpenAI from 'openai';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  try {
    const file = new File([audioBuffer], filename, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'text'
    });

    if (!transcription || transcription.trim().length === 0) {
      throw new AppError(422, 'No speech detected in the audio. Please try recording again.');
    }

    return transcription;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'Transcription service is temporarily unavailable');
  }
}
```

### Audit Log Service

```typescript
// apps/api/src/services/audit.service.ts

import { prisma } from '../lib/prisma';
import { AuditAction, EntityType } from '@prisma/client';

interface AuditEntry {
  userId: string;
  action: AuditAction;
  entityType?: EntityType;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  // Fire and forget — audit log failures never block the main operation
  prisma.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      description: entry.description,
      metadata: entry.metadata ?? null
    }
  }).catch((error) => {
    // Log the failure but never throw — audit log must not break the app
    console.error('Audit log write failed:', error);
  });
}
```

---

## 7. Frontend Architecture

### Overview

The Next.js frontend uses the App Router with React Server Components where possible and Client Components only where interactivity is needed. Data fetching uses React Query for server state and Zustand for UI state. All API calls go through a single fetch wrapper that handles the base URL and credentials.

### App Router Structure

```
app/
  layout.tsx              ← Root layout: providers (QueryClient, Zustand)
  page.tsx                ← Public landing/login page (Server Component)
  (auth)/
    login/
      page.tsx            ← Login page — redirects if already authed
  (app)/
    layout.tsx            ← Protected layout: sidebar, navbar, auth check
    dashboard/
      page.tsx            ← Global dashboard (Server Component shell)
    clients/
      page.tsx            ← Client list
      [clientId]/
        page.tsx          ← Per-client board/list view
        tasks/
          [taskId]/
            page.tsx      ← Task detail view
    ai/
      page.tsx            ← Paste-to-task and voice-to-task
    audit/
      page.tsx            ← Audit log
```

The `(auth)` and `(app)` folders are route groups — they do not appear in the URL. They exist to apply different layouts to different sections of the app.

### Fetch Wrapper

```typescript
// apps/web/src/lib/api-client.ts

const API_BASE = process.env.NEXT_PUBLIC_API_URL + '/api/v1';

class ApiError extends Error {
  constructor(
    public status: number,
    public message: string
  ) {
    super(message);
  }
}

async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',  // sends HTTP-only cookie automatically
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'An unexpected error occurred'
    }));
    throw new ApiError(response.status, error.message);
  }

  if (response.status === 204) return null as T;

  return response.json();
}

export const api = {
  get: <T>(endpoint: string) =>
    apiClient<T>(endpoint),

  post: <T>(endpoint: string, data: unknown) =>
    apiClient<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  patch: <T>(endpoint: string, data: unknown) =>
    apiClient<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  delete: <T>(endpoint: string) =>
    apiClient<T>(endpoint, { method: 'DELETE' }),

  upload: <T>(endpoint: string, formData: FormData) =>
    apiClient<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {}  // Let browser set Content-Type with boundary for multipart
    })
};
```

### React Query Setup

```typescript
// apps/web/src/lib/query-client.ts

import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,           // 1 minute
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
        if (error instanceof ApiError && error.status === 404) return false;
        return failureCount < 2;
      }
    },
    mutations: {
      onError: (error) => {
        // Global mutation error handling — show toast notification
        console.error('Mutation failed:', error);
      }
    }
  }
});
```

### React Query Keys Convention

Query keys are arrays that uniquely identify a piece of server state. They must be consistent across the app so cache invalidation works correctly.

```typescript
// Standard query key patterns used across all hooks
export const queryKeys = {
  auth: {
    me: ['auth', 'me']
  },
  clients: {
    all: ['clients'],
    archived: ['clients', 'archived'],
    detail: (id: string) => ['clients', id]
  },
  tasks: {
    all: (clientId: string) => ['tasks', clientId],
    filtered: (clientId: string, filters: FilterState) => ['tasks', clientId, filters],
    detail: (taskId: string) => ['tasks', 'detail', taskId],
    global: (filters: FilterState) => ['tasks', 'global', filters]
  },
  audit: {
    all: (filters: AuditFilterState) => ['audit', filters]
  }
};
```

### Zustand Stores

```typescript
// apps/web/src/store/ui.store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewMode = 'board' | 'list';

interface UiStore {
  viewMode: Record<string, ViewMode>;  // keyed by clientId or 'global'
  setViewMode: (key: string, mode: ViewMode) => void;
  activeClientId: string | null;
  setActiveClientId: (id: string | null) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      viewMode: {},
      setViewMode: (key, mode) =>
        set((state) => ({
          viewMode: { ...state.viewMode, [key]: mode }
        })),
      activeClientId: null,
      setActiveClientId: (id) => set({ activeClientId: id })
    }),
    { name: 'ui-preferences' }
  )
);
```

```typescript
// apps/web/src/store/filter.store.ts

import { create } from 'zustand';

interface FilterState {
  client?: string;
  status?: string[];
  priority?: string[];
  due?: 'today' | 'this-week';
  taskKey?: string;
  rawQuery: string;
}

interface FilterStore {
  filters: Record<string, FilterState>;  // keyed by clientId or 'global'
  setFilters: (key: string, filters: FilterState) => void;
  clearFilters: (key: string) => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  filters: {},
  setFilters: (key, filters) =>
    set((state) => ({
      filters: { ...state.filters, [key]: filters }
    })),
  clearFilters: (key) =>
    set((state) => {
      const { [key]: _, ...rest } = state.filters;
      return { filters: rest };
    })
}));
```

### Filter Query Parser

The filter bar accepts a structured query string. A parser on the frontend converts it to a structured filter object before sending to the API.

```typescript
// apps/web/src/lib/filter-parser.ts

interface ParsedFilters {
  client?: string;
  status?: string[];
  priority?: string[];
  due?: string;
  taskKey?: string;
  errors: string[];
}

const TASK_KEY_PATTERN = /^[A-Z]{2,5}-\d+$/i;

export function parseFilterQuery(query: string): ParsedFilters {
  const result: ParsedFilters = { errors: [] };
  const trimmed = query.trim();

  // Task key lookup — e.g. "BS-12"
  if (TASK_KEY_PATTERN.test(trimmed)) {
    result.taskKey = trimmed.toUpperCase();
    return result;
  }

  // Structured query parsing — e.g. "client = BrandStudio status = blocked"
  const pairs = trimmed.match(/(\w+)\s*=\s*([^\s]+)/g) || [];

  for (const pair of pairs) {
    const [field, ...valueParts] = pair.split(/\s*=\s*/);
    const value = valueParts.join('=').toLowerCase();

    switch (field.toLowerCase()) {
      case 'client':
        result.client = value;
        break;
      case 'status':
        result.status = value.split(',');
        break;
      case 'priority':
        result.priority = value.split(',');
        break;
      case 'due':
        result.due = value;
        break;
      default:
        result.errors.push(`Unknown filter field: "${field}"`);
    }
  }

  return result;
}
```

### Scrum Board with dnd-kit

```typescript
// apps/web/src/components/board/ScrumBoard.tsx — structure overview

import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

// The board receives tasks grouped by status
// On DragEnd: if column changed → update task status via mutation
// On DragEnd: if same column → update boardOrder via mutation
// Optimistic updates: update local state immediately, revert on error
```

---

## 8. API Design

### Conventions

- All routes prefixed with `/api/v1/`
- Request bodies and responses are JSON
- Successful creates return `201 Created`
- Successful updates return `200 OK` with the updated resource
- Successful deletes return `204 No Content`
- Validation errors return `400 Bad Request` with field-level error details
- Auth errors return `401 Unauthorized`
- Authorization errors (accessing another user's data) return `403 Forbidden`
- Not found errors return `404 Not Found`
- Server errors return `500 Internal Server Error` with a generic message

### Auth Routes

| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/auth/google` | Initiate Google OAuth flow | No |
| `GET` | `/api/v1/auth/google/callback` | Google OAuth callback | No |
| `GET` | `/api/v1/auth/me` | Get current user | Yes |
| `POST` | `/api/v1/auth/logout` | Clear session cookie | Yes |

### Health Route

| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/health` | Health check — returns 200 OK | No |
| `GET` | `/api/v1/metrics` | Prometheus metrics | No |

### Client Routes

| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/clients` | List all active clients | Yes |
| `GET` | `/api/v1/clients/archived` | List archived clients | Yes |
| `POST` | `/api/v1/clients` | Create a client | Yes |
| `GET` | `/api/v1/clients/:clientId` | Get a single client | Yes |
| `PATCH` | `/api/v1/clients/:clientId` | Update a client | Yes |
| `DELETE` | `/api/v1/clients/:clientId` | Permanently delete a client | Yes |
| `POST` | `/api/v1/clients/:clientId/archive` | Archive a client | Yes |
| `POST` | `/api/v1/clients/:clientId/unarchive` | Unarchive a client | Yes |

### Task Routes

| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/clients/:clientId/tasks` | List tasks for a client | Yes |
| `POST` | `/api/v1/clients/:clientId/tasks` | Create a task | Yes |
| `GET` | `/api/v1/tasks` | List all tasks (global dashboard) | Yes |
| `GET` | `/api/v1/tasks/:taskId` | Get a single task | Yes |
| `PATCH` | `/api/v1/tasks/:taskId` | Update a task | Yes |
| `DELETE` | `/api/v1/tasks/:taskId` | Delete a task | Yes |
| `PATCH` | `/api/v1/tasks/:taskId/status` | Update task status only | Yes |
| `PATCH` | `/api/v1/tasks/:taskId/order` | Update board order | Yes |

### Query Parameters for Task Listing

```
GET /api/v1/clients/:clientId/tasks
  ?status=todo,in_progress          ← filter by status (comma-separated)
  ?priority=high,urgent             ← filter by priority
  ?due=today                        ← filter by due date (today | this-week)
  ?taskKey=BS-12                    ← look up by task key
  ?sortBy=due_date                  ← sort field (due_date | priority | created_at)
  ?sortOrder=asc                    ← sort direction (asc | desc)
  ?page=1                           ← page number (default: 1)
  ?limit=20                         ← items per page (default: 20, max: 100)
```

### Pagination Response Shape

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### AI Routes

| Method | Route | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/v1/ai/extract` | Extract task from pasted text | Yes |
| `POST` | `/api/v1/ai/transcribe` | Transcribe audio via Whisper | Yes |
| `POST` | `/api/v1/ai/structure` | Structure transcript via Claude | Yes |

The AI flow is split into separate endpoints so the frontend can show a two-step progress indicator and allow the user to edit the transcript between steps.

### Audit Routes

| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/audit` | List audit log entries | Yes |

```
GET /api/v1/audit
  ?action=TASK_CREATED              ← filter by action type
  ?entityType=TASK                  ← filter by entity type
  ?from=2024-01-01                  ← date range start
  ?to=2024-01-31                    ← date range end
  ?page=1
  ?limit=50
```

---

## 9. Security Architecture

### Data Ownership Enforcement

Every service method verifies that the resource being accessed belongs to the currently authenticated user. This check happens at the service layer, not just the route level.

```typescript
// Pattern used in every service method
async function getClient(clientId: string, userId: string) {
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      userId: userId  // ← always scope to the authenticated user
    }
  });

  if (!client) {
    throw new AppError(404, 'Client not found');
    // Returns 404 not 403 — we do not confirm the resource exists to unauthorized users
  }

  return client;
}
```

### CORS Configuration

```typescript
app.use(cors({
  origin: env.ALLOWED_ORIGIN,  // only the Next.js frontend origin
  credentials: true,            // required for cookie-based auth
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
```

### Input Sanitization

All request bodies pass through Zod validation before reaching any business logic. Zod strips unknown fields by default — any field not defined in the schema is removed from the parsed object. This prevents mass assignment vulnerabilities.

```typescript
// In all DTOs — strip unknown keys
const CreateTaskDto = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']).optional()
}).strict();  // .strict() rejects any extra fields not defined in the schema
```

### API Key Protection

Claude and Whisper API keys exist only as environment variables on the server. They are:

- Never sent to the frontend under any circumstances
- Never logged — the logging configuration explicitly excludes any field named `*key*`, `*secret*`, or `*token*`
- Never returned in any API response
- Validated at startup — the app does not start without them

---

## 10. CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml

name: Deploy FreelanceFlow

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  WEB_IMAGE: ghcr.io/${{ github.repository_owner }}/freelanceflow-web
  API_IMAGE: ghcr.io/${{ github.repository_owner }}/freelanceflow-api

jobs:

  # ─── STAGE 1: TEST ─────────────────────────────────────────────────────────
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run web tests
        run: npm run test -w apps/web

      - name: Run API tests
        run: npm run test -w apps/api

      - name: Audit dependencies
        run: npm audit --audit-level=high

  # ─── STAGE 2: BUILD ────────────────────────────────────────────────────────
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: test
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set image tag
        id: meta
        run: echo "TAG=${GITHUB_SHA::7}" >> $GITHUB_OUTPUT

      - name: Build and push web image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.app
          target: prod
          push: true
          tags: |
            ${{ env.WEB_IMAGE }}:latest
            ${{ env.WEB_IMAGE }}:${{ steps.meta.outputs.TAG }}

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.api
          target: prod
          push: true
          tags: |
            ${{ env.API_IMAGE }}:latest
            ${{ env.API_IMAGE }}:${{ steps.meta.outputs.TAG }}

  # ─── STAGE 3: DEPLOY ───────────────────────────────────────────────────────
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    needs: build

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/freelanceflow

            # Pull latest images
            docker pull ${{ env.WEB_IMAGE }}:latest
            docker pull ${{ env.API_IMAGE }}:latest

            # Write environment file from secrets
            cat > .env.prod << EOF
            DATABASE_URL=${{ secrets.DATABASE_URL }}
            JWT_SECRET=${{ secrets.JWT_SECRET }}
            GOOGLE_CLIENT_ID=${{ secrets.GOOGLE_CLIENT_ID }}
            GOOGLE_CLIENT_SECRET=${{ secrets.GOOGLE_CLIENT_SECRET }}
            CLAUDE_API_KEY=${{ secrets.CLAUDE_API_KEY }}
            OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}
            SENTRY_DSN=${{ secrets.SENTRY_DSN }}
            POSTGRES_DB=${{ secrets.POSTGRES_DB }}
            POSTGRES_USER=${{ secrets.POSTGRES_USER }}
            POSTGRES_PASSWORD=${{ secrets.POSTGRES_PASSWORD }}
            GITHUB_USERNAME=${{ github.repository_owner }}
            EOF

            # Run database migrations before starting new containers
            docker compose -f docker-compose.prod.yml run --rm api \
              node -e "require('./dist/lib/migrate').runMigrations()"

            # Restart with new images
            docker compose -f docker-compose.prod.yml \
              --env-file .env.prod \
              up -d --no-build

            # Clean up old images
            docker image prune -f
```

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `VPS_HOST` | IP address or domain of the production VPS |
| `VPS_USER` | SSH username on the VPS |
| `VPS_SSH_KEY` | Private SSH key for authenticating into the VPS |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Minimum 32 character random string |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `CLAUDE_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `SENTRY_DSN` | Sentry project DSN |
| `POSTGRES_DB` | Production database name |
| `POSTGRES_USER` | Production database user |
| `POSTGRES_PASSWORD` | Production database password |

### Rollback Procedure

To roll back to a previous deployment, SSH into the VPS and restart with a specific image tag:

```bash
# On the VPS
cd /opt/freelanceflow

# Replace abc1234 with the commit SHA of the working version
IMAGE_TAG=abc1234 docker compose -f docker-compose.prod.yml \
  --env-file .env.prod \
  up -d --no-build
```

---

## 11. Monitoring and Observability

### Prometheus Metrics

```typescript
// apps/api/src/lib/metrics.ts

import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { Request, Response, NextFunction } from 'express';

export const register = new Registry();

export const httpRequestCount = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP request count',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register]
});

export const aiExtractionDuration = new Histogram({
  name: 'ai_extraction_duration_seconds',
  help: 'Claude API extraction duration',
  buckets: [1, 2, 3, 5, 10],
  registers: [register]
});

export const aiTranscriptionDuration = new Histogram({
  name: 'ai_transcription_duration_seconds',
  help: 'Whisper API transcription duration',
  buckets: [2, 5, 10, 15, 30],
  registers: [register]
});

export const activeDbConnections = new Gauge({
  name: 'db_connections_active',
  help: 'Active database connections',
  registers: [register]
});

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: req.route?.path ?? req.path,
      status_code: String(res.statusCode)
    };
    httpRequestCount.inc(labels);
    end(labels);
  });

  next();
}
```

### Sentry Integration Points

```typescript
// Frontend — apps/web/src/app/layout.tsx
// Initialize Sentry in the root layout

// Backend — apps/api/src/app.ts
// Sentry.Handlers.requestHandler() before all routes
// Sentry.Handlers.errorHandler() after all routes, before global error handler

// Both capture:
// - Unhandled exceptions automatically
// - Manual captures for business-logic errors worth tracking
// - User context (userId) attached to every event
```

### Grafana Dashboard Provisioning

```
docker/
  grafana/
    provisioning/
      datasources/
        prometheus.yml    ← Auto-connects Grafana to Prometheus
      dashboards/
        dashboard.yml     ← Tells Grafana where to find dashboard JSON files
    dashboards/
      main.json           ← The main application dashboard
```

```yaml
# docker/grafana/provisioning/datasources/prometheus.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
```

### Log Rotation

Configured per service in `docker-compose.prod.yml` via the `logging` driver options. Every service has:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"   # rotate when log file reaches 10MB
    max-file: "3"     # keep 3 rotated files maximum
```

This caps each service's log storage at 30MB maximum. With four services the total maximum log disk usage is 120MB — well within any reasonable VPS disk size.

---

*FreelanceFlow Technical Requirements v1.0*