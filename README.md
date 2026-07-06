# Mashgool

Task and client management for freelancers, built around WhatsApp-style workflows: paste a client message or record a voice note and the app turns it into a structured task using Claude (extraction) and Whisper (transcription).

**Stack:** Next.js (App Router) · Express (TypeScript) · PostgreSQL + Prisma · Docker · Nginx · GitHub Actions

## Local development (Docker — recommended)

You do **not** need Node or PostgreSQL installed locally. From a fresh clone:

```bash
cp .env.example .env       # 1. create your local env file (defaults work as-is)
docker compose up          # 2. build and start the whole stack
```

That's it. The stack:

| Service | URL | What it is |
|---|---|---|
| web | http://localhost:3000 | Next.js frontend (hot reload) |
| api | http://localhost:4000/api/v1/health | Express API (hot reload) |
| db | localhost:5432 | PostgreSQL 16 |
| adminer | http://localhost:8080 | Database browser (server: `db`, user/password from `.env`) |

Useful commands:

```bash
docker compose up -d       # run in the background
docker compose down        # stop cleanly (data is kept)
docker compose down -v     # ⚠️ DESTRUCTIVE — also wipes the database volume.
                           #    Never run this in production.
```

Code changes under `apps/web` and `apps/api` reload automatically inside the containers — no rebuild needed. Rebuild only when dependencies change: `docker compose up --build`.

## Running without Docker

Requires Node ≥ 24 and a reachable PostgreSQL.

```bash
npm install
npm run dev                # web (:3000) + api (:4000) concurrently
npm run build              # build both apps
npm run test               # test both apps
npm run lint               # lint both apps
```

Single workspace: `npm run <script> -w apps/web` or `-w apps/api`.

## Deployment

Every merge to `main` runs Test → Build → Push (GHCR) → Deploy via
`.github/workflows/deploy.yml`. The Deploy job is gated by the
`DEPLOY_ENABLED` repository variable. Server setup, SSL, GitHub
secrets, and the rollback procedure are documented in
[docs/deployment.md](docs/deployment.md).

## Repository layout

```
apps/web/     Next.js frontend (App Router)
apps/api/     Express REST API (routes → controllers → services)
docker/       Dockerfile.app, Dockerfile.api, nginx config
```

See `CLAUDE.md` and `Technical_requirements.md` for the full architecture.
