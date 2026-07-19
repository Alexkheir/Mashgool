# Project Progress Log

## Feature 5 provisioning + first-deploy healthcheck fix — 2026-07-19

- Infra: hosting switched Oracle→**RackNerd paid VPS** (amd64, static IP). Provisioned per runbook: `deploy` user (sudo+docker), key-only SSH (root kept, `prohibit-password`), UFW 22/80/443, `/opt/mashgool` + `/var/www/certbot`, DuckDNS domain `mashgool.duckdns.org`, cert via certbot standalone, GitHub secrets/vars set, `DEPLOY_ENABLED=true`.
- First deploy failed: web `unhealthy` → nginx (depends_on) never created. Root cause: healthcheck `wget localhost` resolved to `::1`, but Next standalone binds IPv4-only (`HOSTNAME=0.0.0.0`); api passed by luck (Express binds dual-stack).
- Fix: healthchecks probe `127.0.0.1` explicitly (prod web+api, dev api). Also committed the LEARNING.md gitignore rule.
- Next: merge → auto-redeploy → finish Feature 6 checklist (HTTPS check, `certbot renew --dry-run`, bad-push + rollback drills); update `docs/deployment.md` §1–2 for RackNerd.

## Phase 0b (CI/CD + prod infra) — 2026-07-06

- Implemented: `.github/workflows/deploy.yml` (PR→test only; main→Test/Build/Push GHCR/Deploy, deploy gated by `DEPLOY_ENABLED` var); `docker-compose.prod.yml` (app/api/db/nginx, persistent `postgres_data`, only nginx exposed); nginx config w/ envsubst `${DOMAIN}` template + Let's Encrypt; `docs/deployment.md` runbook (Oracle Always Free + DuckDNS); `.env.prod.example`.
- Key decisions: multi-arch images (amd64+arm64 — Oracle free VMs are ARM); prod API is same-origin `/api` via nginx (`NEXT_PUBLIC_API_URL=""` build arg — fixes build-time-baked URL, avoids cross-site cookies); no nginx rate limits (Express is source of truth); resolver-variable proxy_pass so nginx survives container recreation; rollback = `IMAGE_TAG=<sha>` on VPS. Oracle free tier halved June 2026 → 2 OCPU/12GB (still fine).
- Validated: prod stages of both Dockerfiles build + boot (web 200, api health ok); `compose config`, `nginx -t` (self-signed), actionlint, tests 5/5, lint, `npm audit --audit-level=high` all pass.
- Next: user provisions Oracle VM + DuckDNS + GitHub secrets per runbook; set `DEPLOY_ENABLED=true`; run Feature 6 validation checklist (hello-world over HTTPS, bad-push + rollback drills).

## Docs alignment — 2026-07-06

- Implemented: PROGRESS.md log + CLAUDE.md progress-tracking rules; fixed Project_phases.md and Project_requirement.md to reflect self-hosted prod DB (commit `e0c5c4a`).
- Key decisions: prod compose has four services (`app`, `api`, `db`, `nginx`); `db` needs a persistent VPS volume for `/var/lib/postgresql/data`; nightly `pg_dump` is the only backup; PROGRESS.md is committed (not gitignored).
- Next: Phase 0b on `feat/phase-0b-cicd` — CI/CD pipeline, prod compose + nginx, free-tier hosting research.

## Phase 0a — 2026-07-05

- Implemented: npm-workspaces monorepo (apps/web Next.js 16 + apps/api Express 5/TS); multi-stage Dockerfiles (dev/prod, non-root prod users); docker-compose with healthcheck-gated startup (db → api → web + adminer); hello-world page fetching `/api/v1/health` cross-origin; tests green (web 3/3, api 2/2). Commits `8fa3be8`, `1dfd0a0` pushed to main.
- Key decisions: prod DB = Postgres in Docker; Express middleware = rate-limit source of truth; spec sample code is illustrative only; project renamed FreelanceFlow → Mashgool; CORS added (`ALLOWED_ORIGIN`, credentials for future cookie auth).
- Next: Phase 0b on branch `feat/phase-0b-cicd` — GitHub Actions deploy.yml, docker-compose.prod.yml + nginx, free-tier hosting (Oracle Cloud Always Free + DuckDNS candidate). From Phase 0b on: feature branches + PRs, no direct commits to main.
