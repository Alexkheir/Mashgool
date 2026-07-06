# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current State

This repository is **pre-implementation**. It currently contains only three planning documents — no application code, no `package.json`, no Docker files yet. The docs are the source of truth for what to build:

- `Project_requirement.md` — natural-language requirements brief (the "what" and "why")
- `Technical_requirements.md` — full technical spec: repo structure, Prisma schema, Docker, Nginx, auth, API design, CI/CD, monitoring (the "how", with concrete code)
- `Project_phases.md` — the product backlog, organized into phases with acceptance-criteria-style bullets

**Before writing any feature code, read the relevant section of `Technical_requirements.md`** — it already specifies file layout, schemas, middleware, and integration code in detail. Do not invent alternate structures.

Two hard rules from the brief:
1. **Do not substitute technologies** from the chosen stack without discussing it first.
2. **Infrastructure comes before features.** Phase 0 (Dockerfiles, docker-compose, CI/CD) must work end-to-end — deploy a hello-world to production over HTTPS — before any feature is built. Every merge to `main` auto-deploys.

## Stack

- **Frontend:** Next.js (App Router) + React + Tailwind + shadcn/ui. React Query for server state, Zustand for UI/filter state.
- **Backend:** Express REST API (TypeScript), layered Routes → Controllers → Services.
- **Database:** PostgreSQL via Prisma ORM.
- **Auth:** Google OAuth 2.0 → JWT in an HTTP-only cookie.
- **AI:** Anthropic Claude (`claude-sonnet-4-6`) for task extraction; OpenAI Whisper (`whisper-1`) for transcription.
- **Infra:** Docker + Docker Compose, Nginx reverse proxy (SSL termination), GitHub Actions → GHCR → VPS. Sentry, Prometheus/Grafana, Uptime Kuma for observability.

## Repository Layout (planned)

npm Workspaces monorepo. No shared code package between apps — each is self-contained with its own DTOs.

```
apps/web/    ← Next.js frontend (App Router under src/app, route groups (auth) and (app))
apps/api/    ← Express API (src/{routes,controllers,services,middleware,dtos,lib,config})
docker/      ← Dockerfile.app, Dockerfile.api, nginx/, grafana/
.github/workflows/deploy.yml
docker-compose.yml         ← local dev (web, api, db, adminer)
docker-compose.prod.yml    ← production (web, api, db, nginx)
```

## Commands

Once `package.json` files exist, these are the intended workflows (from the root):

```bash
# Everyday local development — run the whole stack in Docker
docker compose up            # starts web (:3000), api (:4000), db (:5432), adminer (:8080)
docker compose up -d         # detached
docker compose down          # stop cleanly
# docker compose down -v     # DESTRUCTIVE — wipes the db volume. NEVER in production.

# Running the apps without Docker (root scripts)
npm run dev                  # concurrently runs web + api dev servers
npm run build                # builds both apps
npm run test                 # runs web then api tests
npm run lint                 # lints both apps

# A single workspace
npm run <script> -w apps/web
npm run <script> -w apps/api

# Database (run inside apps/api)
npx prisma migrate dev       # create + apply a migration in dev
npx prisma migrate deploy    # apply migrations (prod / CI)
npx prisma db seed           # seed local dev data (apps/api/prisma/seed.ts)
```

The Prisma schema lives at `apps/api/prisma/schema.prisma`. Never hand-edit the database — always go through a migration, and commit migration files.

## Architecture Notes That Span Files

These are the non-obvious rules that hold the design together. Getting them wrong causes subtle bugs.

**Layering (backend).** Prisma is called *only* from the Services layer. Controllers are thin (parse `req`, call a service, send response). Services hold all business logic and throw `AppError` (see `error.middleware.ts`); the global error handler is the last middleware and never leaks stack traces to clients.

**Data ownership.** Every service method scopes queries to the authenticated user (`where: { ..., userId }`) at the service layer, not just via route middleware. When a resource isn't owned by the user, return **404, not 403** — never confirm existence to unauthorized callers.

**Task keys are the trickiest invariant.** Each task gets an immutable key like `BS-12` (client `shortCode` + `-` + number). The number comes from `Client.taskCounter`, incremented via an **atomic** `UPDATE ... SET task_counter = task_counter + 1 ... RETURNING` so concurrent creates never collide. Keys are **never reused** even after deletion, and `shortCode` cannot change after client creation. Applies to all creation paths (manual, paste, voice).

**Validation & mass-assignment.** All request bodies pass through Zod DTOs using `.strict()` — unknown fields are rejected. Backend DTOs (`apps/api/src/dtos`) and frontend form DTOs (`apps/web/src/dtos`) are separate copies by design.

**Auth flow.** JWT lives in an HTTP-only cookie (`token`); the frontend never touches it directly (`credentials: 'include'` on every fetch). Express `requireAuth` verifies the cookie and loads `req.user`. Next.js `middleware.ts` guards routes at the edge and redirects to `/login?redirect=...`. Env vars are Zod-validated at startup (`config/env.ts`); the API refuses to boot if any required var is missing.

**AI is a 3-endpoint pipeline, not one call.** `POST /ai/transcribe` (Whisper) → user edits transcript → `POST /ai/structure` (Claude) for voice; `POST /ai/extract` (Claude) for paste. Split deliberately so the UI shows two-step progress and the user can correct the transcript between steps. Claude returns a fixed JSON shape including per-field `confidence` and `hasActionableTask`; low-confidence fields are flagged for review but never block saving. Full pipeline must work in Arabic and English.

**Audit log is append-only, fire-and-forget.** `writeAuditLog` never throws and never blocks the main operation (catches and logs its own failure). Never log raw AI input content or any secret — metadata stores extracted output fields only.

**Frontend state split.** React Query owns server state (see the `queryKeys` convention — keys are arrays; invalidation depends on consistency). Zustand owns UI state: `ui.store` (view mode + active client, persisted), `filter.store` (per-workspace filters, keyed by clientId or `'global'`, cleared on navigate-away). The filter bar parses a free-text query string (`client = X status = blocked`, or a bare `BS-12` key lookup) into a structured filter object before hitting the API; active filters are reflected in the URL.

**All API routes** are prefixed `/api/v1/`. Creates → 201, updates → 200 with the resource, deletes → 204.

## Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `task-key.service.ts` |
| React components | PascalCase | `TaskCard.tsx` |
| Types / interfaces | PascalCase | `TaskResponse` |
| Zod DTOs | PascalCase + suffix | `CreateTaskDto` |
| DB tables / columns | snake_case (tables plural) | `audit_logs`, `client_id` |
| Env vars | SCREAMING_SNAKE_CASE | `DATABASE_URL` |
| API routes | kebab-case | `/api/v1/task-keys` |
| Zustand stores | `useXStore` | `useAuthStore` |
| React Query keys | array of strings | `['tasks', clientId]` |

Prisma models use `@map`/`@@map` to bridge camelCase (TS) and snake_case (DB). All PKs are UUIDs; all timestamps UTC.

## Scope Guardrails

Out of scope for v1 (do **not** build, but do **not** architect them out): team collaboration, client portal, invoicing, mobile app, WhatsApp/email/calendar integration, time tracking, recurring tasks, file attachments, Arabic UI (input is bilingual, but the interface is English-only), MFA, WIP limits, multi-task extraction from one message.

When a design decision is genuinely ambiguous, ask rather than guess — the brief explicitly prefers an upfront question over a wrong assumption.

## Progress Tracking

- After completing each commit, append a new dated entry to `PROGRESS.md` summarizing what was implemented, any key decisions made, and what's next. Keep it short — 3-5 lines.
- At the start of any new session, read `PROGRESS.md` before proposing or starting work, so context from prior sessions carries over without needing to resume the full conversation.
- Do not let `PROGRESS.md` entries grow verbose over time — stay factual and brief.
