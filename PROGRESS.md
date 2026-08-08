# Project Progress Log

## Phase 1 Feature 10 (Scrum board) — 2026-08-08

- Built the Scrum Board View end-to-end on `feat/phase-1-board`. **Backend:** 3 endpoints — `GET /clients/:id/tasks/board` and `GET /tasks/board` (four columns, always all four, each card carrying its client; global board excludes archived clients, 200-card cap per column) and `PATCH /tasks/:taskId/order` with a new `.strict()` `MoveTaskDto` (`{ status, position }`). A drop is applied in **one transaction** that renumbers the destination column `0..n-1`; `position` is clamped, not rejected. `createTask`/`changeTaskStatus`/`updateTask` now place a card at the bottom of its column, so `boardOrder` is maintained on every path. **No migration** — Feature 9 already reserved `Task.boardOrder`. 79 api tests green (was 62).
- **Frontend** (new deps `@dnd-kit/core` + `/sortable` + `/utilities`): `use-board` hooks with an optimistic-move mutation (rollback = the card snaps back), `board/` components (`scrum-board`, `board-column`, `board-card`), board/list `ViewToggle` remembered **per workspace** (`ui-store` `viewModes`, persist v2 + migrate), global board on the dashboard, list body extracted to `task-list.tsx` so both views are siblings under shared modals. web tsc/lint/3 tests + `next build` green.
- Decisions: only a **column change** is audited (`TASK_STATUS_CHANGED`, `via: 'board'`) — reordering inside a column is presentation; the global board has **no per-column "+"** (a task needs a workspace, a global column doesn't identify one); `GET /tasks/board` must stay declared **before** `GET /tasks/:taskId`.
- CI audit: two newly-published highs (js-yaml via eslint, nanoid via postcss — unrelated to dnd-kit) pinned via root `overrides`; as in Feature 8 they only applied after a clean `rm -rf node_modules package-lock.json && npm install`. `npm audit --audit-level=high` back to 0.
- Local run: `docker compose up -d --build --renew-anon-volumes` (new deps). No `migrate deploy` needed. Verified against the running API with a seeded user + minted dev JWT: board shape, cross-column move, in-column reorder with clamping, route ordering, 400 on a negative position, 401 unauthenticated.
- Next: Feature 11 (Advanced Filtering & Query Search) — the filter bar applies to both the board and the list.

## UI redesign + dev-image hardening — 2026-08-01

- **Design enhancement** on `feat/ui-redesign` (branched off `feat/phase-1-tasks`): replaced the plain top-bar shell with a modern dashboard look inspired by reference art in `Design/`. New **left-sidebar app shell** (`app-sidebar.tsx`): brand mark, workspace search, Dashboard nav, live client-workspace list (color dot + open-task count, active-highlighted via pathname), profile + logout pinned bottom; `AppFrame` now composes sidebar + content with a compact mobile top bar. Warm **cream canvas + white cards** with soft layered shadows/hover-lift, emerald brand accent, modal scale-in — driven by design tokens in `globals.css` (`@theme`: `--color-canvas`, `--color-brand-*`, `--shadow-card*`, keyframes). Added shared **`Button`** primitive + hand-rolled **icon set** (`ui/button.tsx`, `ui/icons.tsx`); restyled client cards, task rows, both forms, and the modal. **Login is Google-only now** (email placeholder removed) with an on-theme emerald preview panel. Purely presentational — no API/schema/DTO/route changes. web tsc + lint + 3 tests + `next build` all green.
- **Docker dev-image fix** (`docker/Dockerfile.api`, `dev` stage only): bake `prisma generate` into the image at build time. Root cause of a startup failure today — the `predev` hook re-downloads the Prisma query engine from Prisma's binary CDN on every container start, and their CDN is on a flaky failover (`binaries.prisma.sh → r2.prisma.sh`), so a hiccup killed the API before it listened → healthcheck refused → Compose tore the stack down → the Google button hit an empty `:4000`. Caching the engine in the image makes startup independent of the CDN. **Prod stages untouched** → no production risk. Verified: `db/api/web` all healthy, `/health` 200, `/auth/google` 302 → Google.
- Next: Feature 10 (Scrum Board View) on top of the new design.

## Phase 1 Feature 9 (task management) — 2026-07-31

- Built Task Management end-to-end on `feat/phase-1-tasks`. **Backend:** `Task` model + `TaskStatus`/`Priority`/`CreationMethod` enums + migration `add_tasks`; 6 REST endpoints (2 nested `/clients/:id/tasks` for list+create, 4 flat `/tasks/:id`); atomic **task-key** generator (`UPDATE clients SET task_counter+1 … RETURNING` inside the create transaction — fixed the tech-spec's racy `$executeRaw`+separate-`findUnique` sample); user-scoped service (ownership via `client: { userId }`, 404-not-403); `.strict()` DTOs + new `validateQuery` middleware (Express 5 `req.query` is read-only → parsed onto `res.locals.query`); audit writes `TASK_CREATED/UPDATED/STATUS_CHANGED/DELETED`. Client list now returns a live `openTaskCount` (filtered `_count`). 62 api tests green.
- **Frontend** (hand-rolled Tailwind, no new deps): `use-tasks` React Query hooks (params-keyed list, `keepPreviousData`, invalidates `['tasks']`+`['clients']`), workspace route `/dashboard/clients/[clientId]`, sortable/paginated task list, create/edit form, one-click Done, delete-with-confirm; extracted `AppFrame` (auth guard + header) shared by dashboard + workspace; client cards navigate + show real open-task count. web tsc/lint/3 tests + `next build` green.
- Decisions: uppercase enum values in the API for status+priority (spec sample was inconsistent); sort is field-only in the UI (server applies per-field default direction); board drag-drop deferred to Feature 10 (`boardOrder` placed now), filter bar to Feature 11.
- Due-date guard: a due date can't be set to a past day (a deadline in the past is meaningless). Enforced by a `.refine()` on the shared `dueDate` schema in both the API and web DTOs (→ 400 with a field error); the picker also sets `min=today`. Only fires when the date is set/changed, so a naturally-overdue task stays editable.
- Local run: `docker compose up -d` then `docker compose exec api npx prisma migrate deploy` (no image rebuild — no new deps). Additive migration; existing data safe.
- Added `.claude/skills/feature-wrapup/` skill to standardize post-feature documentation (learning deep-dive + journal + README index + this log + memory).
- Next: Feature 10 (Scrum Board View) — board columns + drag-and-drop on `boardOrder`.

## Phase 1 Feature 8 (client workspaces) — 2026-07-30

- Built Client Workspaces end-to-end on `feat/phase-1-clients`. **Backend:** `Client` + `AuditLog` models + migration `add_clients_and_audit`; 8 REST endpoints under `/api/v1/clients` (list, archived, create, get, update, delete, archive, unarchive); `.strict()` Zod DTOs + `validate` middleware; service is user-scoped (404-not-403), maps unique collisions → 409, `shortCode` immutable (absent from UpdateDto); first **audit-write infra** (append-only, fire-and-forget). 33 api tests green.
- **Frontend** (hand-rolled Tailwind + new deps `zustand` + `zod`): `use-clients` React Query hooks (array keys + `['clients']` invalidation), `ui-store` (active client + view mode, persisted), client grid + create/edit modal (short-code auto-suggest from initials, override, collision→field error) + archive/unarchive + delete-with-confirm, wired into the dashboard. web tsc/lint/tests + `next build` green.
- Decisions: kept hand-rolled Tailwind (no shadcn CLI) to match existing style; audit **writes** begin now (Phase 1) though the audit **UI** is Feature 17; open-task counts show `0` until Feature 9.
- Local run after pulling new deps: `docker compose up -d --build --renew-anon-volumes` then `docker compose exec api npx prisma migrate deploy` (dev doesn't auto-migrate).
- **CI audit fixed (2026-07-30):** newly-published highs resolved without breaking the app — `next` auto-bumped 16.2.10→16.2.12 (patches its own CVEs); root `overrides` pin `postcss@^8.5.25`, `sharp@^0.35.3`, `brace-expansion@^5.0.9` (parents next/eslint hadn't bumped). `npm audit --audit-level=high` now 0 vulns; `npm ci` reproduces it; lint/tests/builds green. No allowlist needed. (Fragile npm detail: overrides only applied after a clean `rm -rf node_modules package-lock.json && npm install` — `npm install` alone short-circuited "up to date".)
- Next: Feature 9 (Task Management) — tasks + atomic task keys via `Client.taskCounter`.

## Phase 1 Feature 7 (auth) — frontend + production wiring — 2026-07-20

- Frontend login verified end-to-end locally: `docker compose up` (rebuilt images — dev api node_modules predated Prisma), `prisma migrate deploy` in the api container, real Google sign-in works (localhost). App code was already prod-aware (secure cookie gated on NODE_ENV, post-login redirect to `${ALLOWED_ORIGIN}/dashboard`, same-origin web build).
- **Prisma prod integration (was deferred):** `Dockerfile.api` prod stage now runs `prisma generate` (client shipped without devDeps) and a new `docker/api-entrypoint.sh` runs `prisma migrate deploy` on container start (idempotent, gated on db healthcheck) — retired the deploy.yml migration TODO. Moved `prisma` to `dependencies`. Validated: prod image builds, migrates a fresh db, boots (health 200, users table created).
- **Prod auth secrets wired:** `docker-compose.prod.yml` api now gets JWT_SECRET/GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (from .env.prod) + GOOGLE_CALLBACK_URL derived from DOMAIN; `deploy.yml` writes them into .env.prod from GitHub secrets; `.env.prod.example` documents them. Without this the prod API crashed at boot (env validation).
- **Pending user actions before merge/deploy:** Google Console — add prod redirect URI `https://<domain>/api/v1/auth/google/callback` + JS origin `https://<domain>`; GitHub — add secrets JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.

## Phase 1 Feature 7 (auth) — backend OAuth flow — 2026-07-20

- Google OAuth backend on `feat/phase-1-auth`: `config/env.ts` (Zod, exits on missing vars; validates only Feature-7 vars), `auth.service.ts` (google-auth-library code→id_token→verified profile→upsert on googleId→issue JWT; only Prisma caller), `requireAuth` (cookie JWT→load user; identical 401 for bad-token vs unknown-user), `error.middleware.ts` (AppError + global handler, Sentry deferred), 4 routes (`/auth/google`, `/callback`, `/me`, `/logout`), cookie httpOnly+lax+7d (secure in prod).
- Deps: google-auth-library, jsonwebtoken, cookie-parser, zod(v4), dotenv. Added eslint `no-unused-vars` underscore/rest-sibling ignore; vitest.config injects test env.
- Verified: 12 tests green (requireAuth + service paths), build, lint, and a live host smoke test (health 200; /auth/google 302→Google w/ openid+email+profile; /me + /logout 401 w/o cookie). Booted on :4100 since budget_tracker holds :4000.
- Dev compose + .env examples carry the auth vars with dev defaults (stack boots without real Google creds). **Not yet done on branch:** Dockerfile.api Prisma prod integration, frontend, and prod env/secrets — don't merge until those land. User must create Google OAuth creds for a live sign-in test.

## Phase 1 Feature 7 (auth) — data layer — 2026-07-20

- Added Prisma ORM to apps/api on branch `feat/phase-1-auth`. `User` model only (no password — Google is sole IdP); initial migration `init_users` creates the `users` table (UUID PK, snake_case cols, unique google_id + email). `lib/prisma.ts` = one client per process, cached on globalThis in dev.
- Decision: **pinned Prisma to 6.x**. v7 (installed first) dropped in-schema `url = env(...)` and now requires a driver adapter + prisma.config.ts; declined that complexity for a learning project — 6.x matches the tech spec and tutorials. Client/AuditLog models deferred to their own features (no columns added to users, so clean).
- Scripts: `pre{dev,build,test}` run `prisma generate`; `migrate:deploy` for prod. DATABASE_URL wired into dev compose api service (derived from db POSTGRES_*).
- Verified: validate, build, tests, and a real client round-trip against Postgres (had to use a throwaway db on :5433 — the user's separate `budget_tracker` stack occupies :5432/:4000/:3000 locally).
- Next (same branch): Zod env validation (`config/env.ts`) → `auth.service.ts` (Google OAuth exchange + upsert) → `requireAuth` → controller/routes → Dockerfile.api Prisma prod integration → frontend. User will need to create Google OAuth credentials before a live end-to-end test.

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
