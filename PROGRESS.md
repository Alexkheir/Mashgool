# Project Progress Log

## Docs alignment — 2026-07-06

- Implemented: PROGRESS.md log + CLAUDE.md progress-tracking rules; fixed Project_phases.md and Project_requirement.md to reflect self-hosted prod DB (commit `e0c5c4a`).
- Key decisions: prod compose has four services (`app`, `api`, `db`, `nginx`); `db` needs a persistent VPS volume for `/var/lib/postgresql/data`; nightly `pg_dump` is the only backup; PROGRESS.md is committed (not gitignored).
- Next: Phase 0b on `feat/phase-0b-cicd` — CI/CD pipeline, prod compose + nginx, free-tier hosting research.

## Phase 0a — 2026-07-05

- Implemented: npm-workspaces monorepo (apps/web Next.js 16 + apps/api Express 5/TS); multi-stage Dockerfiles (dev/prod, non-root prod users); docker-compose with healthcheck-gated startup (db → api → web + adminer); hello-world page fetching `/api/v1/health` cross-origin; tests green (web 3/3, api 2/2). Commits `8fa3be8`, `1dfd0a0` pushed to main.
- Key decisions: prod DB = Postgres in Docker; Express middleware = rate-limit source of truth; spec sample code is illustrative only; project renamed FreelanceFlow → Mashgool; CORS added (`ALLOWED_ORIGIN`, credentials for future cookie auth).
- Next: Phase 0b on branch `feat/phase-0b-cicd` — GitHub Actions deploy.yml, docker-compose.prod.yml + nginx, free-tier hosting (Oracle Cloud Always Free + DuckDNS candidate). From Phase 0b on: feature branches + PRs, no direct commits to main.
