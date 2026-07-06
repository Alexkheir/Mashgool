# FreelanceFlow — Complete Product Backlog

---

# 🏗️ Phase 0 — Infrastructure Foundation

## Feature 1 — Multi-Stage Dockerfiles

**Dockerfile.app (Next.js)**
- A `Dockerfile.app` exists at the root of the repository for the Next.js frontend
- It uses multi-stage builds with two named stages: `dev` and `prod`
- The `dev` stage installs all dependencies including devDependencies and starts the app with hot reload (`next dev`)
- The `prod` stage installs production dependencies only, runs `next build`, and starts with `next start`
- The `prod` stage runs as a non-root user
- The `prod` stage image excludes dev tools, source maps, and unnecessary files
- The base Node.js image is pinned to a specific version — never `latest`

**Dockerfile.api (Express)**
- A `Dockerfile.api` exists at the root of the repository for the Express API
- It follows the same two-stage structure: `dev` with hot reload and `prod` with optimized output
- The `prod` stage runs as a non-root user
- The base Node.js image is pinned to the same version as `Dockerfile.app` for consistency

**Shared**
- A `.dockerignore` file exists at the root excluding: `node_modules`, `.git`, `.env*`, build artifacts, and local-only files
- Both Dockerfiles are kept as small and explicit as possible — no unnecessary layers

---

## Feature 2 — Local Development Environment (docker-compose.yml)

**Compose File**
- A `docker-compose.yml` exists at the root defining the full local development environment
- Running `docker compose up` starts the entire local stack with a single command
- The compose file defines four services: `app`, `api`, `db`, `adminer`

**App Service (Next.js)**
- Uses the `dev` stage of `Dockerfile.app`
- Mounts the local source directory as a volume so edits reflect immediately without rebuilding
- Exposes the Next.js dev port to localhost
- Reads environment variables from the local `.env` file
- Depends on the `api` service being healthy before starting

**API Service (Express)**
- Uses the `dev` stage of `Dockerfile.api`
- Mounts the local source directory as a volume
- Exposes the Express API port to localhost
- Reads environment variables from the local `.env` file
- Depends on the `db` service being healthy before starting
- Exposes a `GET /health` endpoint that returns `200 OK` when the service is running

**Database Service (PostgreSQL)**
- Uses the official `postgres` image pinned to a specific version
- Data is persisted via a named Docker volume (`postgres_data`) so the database survives container restarts
- The database port is exposed to localhost for local tooling access
- A health check is defined so dependent services wait until PostgreSQL is genuinely ready to accept connections
- Database name, user, and password are configured via environment variables from the `.env` file

**Adminer Service**
- Uses the official `adminer` image
- Accessible at `localhost:8080` for browser-based database management
- Only present in the local compose file — never in production
- Depends on the `db` service being healthy before starting

**Environment Variables**
- A `.env.example` file exists at the root documenting every required environment variable with a description and placeholder value
- The actual `.env` file is listed in `.gitignore` and never committed to the repository
- The compose file reads from `.env` automatically — no manual export step required

**Developer Experience**
- `docker compose up` starts all services and streams logs to the terminal
- `docker compose up -d` runs everything in the background
- `docker compose down` stops all services cleanly
- `docker compose down -v` stops all services and wipes the database volume — clearly documented as destructive and never to be run in production
- A `README.md` section documents how to get the local environment running from a fresh clone in under 5 commands

---

## Feature 3 — Production Environment (docker-compose.prod.yml)

**Compose File**
- A `docker-compose.prod.yml` exists and defines the production stack
- It is never used locally — only used on the VPS by the CI/CD pipeline
- The compose file defines four services: `app`, `api`, `db`, `nginx`
- The `db` service runs PostgreSQL in Docker on the VPS (decided 2026-07-05 — self-hosted for the learning experience, instead of a managed provider); the app connects to it via `DATABASE_URL`
- The `db` service **must** mount a volume on the VPS (named Docker volume or host bind mount) for `/var/lib/postgresql/data` — without it, all data is lost when the container is recreated
- The `db` container is never exposed to the public internet — no published port; only reachable by `api` over the internal Docker network

**App Service (Next.js)**
- Uses the `prod` stage of `Dockerfile.app`
- No volume mounts — the built image is self-contained
- Environment variables are injected at runtime from secrets stored on the VPS
- Configured to restart automatically if it crashes (`restart: unless-stopped`)
- Not exposed directly to the internet — only accessible through Nginx

**API Service (Express)**
- Uses the `prod` stage of `Dockerfile.api`
- No volume mounts
- Environment variables are injected at runtime from secrets stored on the VPS
- Configured to restart automatically (`restart: unless-stopped`)
- Not exposed directly to the internet — only accessible through Nginx
- Exposes `GET /health` for uptime monitoring

**Nginx Service**
- Uses the official `nginx:alpine` image
- Acts as a reverse proxy routing all incoming traffic to the correct internal service
- SSL termination happens at Nginx using Let's Encrypt certificates
- HTTP traffic on port 80 is automatically redirected to HTTPS
- The Nginx config file is mounted from the repository into the container
- Configured to restart automatically (`restart: unless-stopped`)

**Nginx Configuration**
- An `nginx/nginx.conf` file exists in the repository
- Defines reverse proxy rules routing to Next.js and Express API
- Sets headers: `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`
- Sets security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
- Gzip compression enabled for all text-based responses
- Static assets served by Next.js are cached with appropriate cache headers

---

## Feature 4 — CI/CD Pipeline (GitHub Actions)

**Workflow File**
- A `.github/workflows/deploy.yml` file exists in the repository
- The workflow triggers automatically on every push to `main`
- It does not trigger on pushes to any other branch
- It runs in a clean Ubuntu environment on GitHub hosted runners

**Pipeline Stages**
- The pipeline runs in this exact order: Test → Build → Push → Deploy
- If any stage fails, all subsequent stages are skipped and the workflow is marked failed
- A failed pipeline never affects the currently running production deployment

**Test Stage**
- Runs all unit and integration tests before anything is built
- Pipeline stops and nothing is built or deployed if tests fail
- `npm audit` runs as part of this stage — pipeline fails on high or critical severity vulnerabilities

**Build Stage**
- Builds two production images: one from `Dockerfile.app` and one from `Dockerfile.api`
- Each image is tagged with two tags: `latest` and the Git commit SHA (e.g. `ghcr.io/username/freelanceflow-app:abc1234`)
- Commit SHA tags allow rolling back to any previous image

**Push Stage**
- Pushes both images with both tags to GitHub Container Registry (`ghcr.io`)
- Authentication uses the automatically available `GITHUB_TOKEN` — no manual registry credentials needed
- Push only happens if the build stage succeeded

**Deploy Stage**
- SSHs into the production VPS using a private key stored as a GitHub Actions secret
- Pulls both newly pushed images from ghcr.io onto the VPS
- Runs `docker compose -f docker-compose.prod.yml up -d --no-build` to restart the stack
- Old containers are replaced automatically — the database and Nginx are not restarted unless their config changed
- All secrets are stored as GitHub Actions secrets — never hardcoded in the workflow file

**GitHub Secrets Required**
- `VPS_HOST` — IP address or domain of the production server
- `VPS_USER` — SSH user on the VPS
- `VPS_SSH_KEY` — private SSH key for authenticating into the VPS
- `DATABASE_URL` — connection string for the Postgres container (uses the `db` service name as host)
- `POSTGRES_PASSWORD` — password for the production Postgres container
- `GOOGLE_CLIENT_ID` — Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
- `CLAUDE_API_KEY` — Anthropic Claude API key
- `OPENAI_API_KEY` — OpenAI Whisper API key
- `JWT_SECRET` — secret used to sign JWT tokens

---

## Feature 5 — VPS Provisioning

**Server Setup**
- A VPS is provisioned on Hetzner or DigitalOcean before any deployment is attempted
- The server runs Ubuntu LTS pinned to a specific version
- A non-root sudo user is created — root is not used after initial setup
- SSH password authentication is disabled — key-based authentication only
- UFW firewall allows only ports 22, 80, and 443

**Docker Installation**
- Docker Engine and Docker Compose plugin are installed on the VPS
- The deploy user is added to the `docker` group
- Docker is configured to start automatically on server reboot

**SSL Certificate**
- Certbot is installed for Let's Encrypt certificate management
- An SSL certificate is issued for the production domain before first deployment
- Certbot auto-renewal is configured and tested — a dry run is executed to confirm it works

**Production Database (Postgres in Docker)**
- PostgreSQL runs as the `db` service in `docker-compose.prod.yml` on the VPS (decided 2026-07-05 — no managed provider)
- A persistent volume is created on the VPS and mounted at `/var/lib/postgresql/data` so data survives container recreation, image upgrades, and reboots
- The connection string (`DATABASE_URL`) and `POSTGRES_PASSWORD` are stored as GitHub Actions secrets and injected at runtime
- Backups, upgrades, and failure recovery are our responsibility — the nightly `pg_dump` (Feature 22) is the only backup and is therefore mandatory before real data exists

---

## Feature 6 — Pipeline Validation (Hello World Deploy)

**Local Validation**
- `docker compose up` starts all four local services without errors
- Next.js app is accessible at `localhost:3000`
- Express API is accessible at the configured port
- `GET /health` returns `200 OK`
- Adminer is accessible at `localhost:8080` and can connect to the local database

**Pipeline Validation**
- A push to main triggers the GitHub Actions workflow automatically
- All four stages complete successfully
- Both images are pushed to ghcr.io
- The hello world app is accessible at the production domain over HTTPS
- HTTP redirects to HTTPS automatically
- SSL certificate is valid and trusted by browsers

**Rollback Validation**
- A deliberate bad push is made to confirm the pipeline catches failures
- The bad push does not affect the running production deployment
- The previous working images remain live throughout the failed pipeline run

---

# 🔐 Phase 1 — Foundation

## Feature 7 — Authentication

**Sign In**
- User can sign in using their Google account via a "Sign in with Google" button on the login page
- Clicking the button redirects to Google's OAuth consent screen
- After successful authentication the user lands on their global dashboard
- If the user has never signed in before an account is automatically created on first login

**Session Management**
- The user remains logged in across browser sessions without re-authenticating
- Session tokens are stored in HTTP-only cookies
- If a session expires the user is redirected to the login page with a clear message

**Logout**
- User can log out from anywhere in the app via a visible logout option
- On logout the session token and cookies are cleared immediately
- After logout the user is redirected to the login page and cannot navigate back using the browser back button

**Route Protection**
- Any attempt to access an app route while unauthenticated redirects to the login page
- The originally requested URL is preserved so the user lands there after signing in

---

## Feature 8 — Client Workspaces

**Client Short Code**
- When creating a client the system auto-suggests a short code based on the initials of the client name (e.g. "Brand Studio" → `BS`)
- The user can override the suggested code to any 2–5 character uppercase string before saving
- If the entered code collides with an existing client code the system rejects it and prompts the user to choose a different one
- The short code is set at creation and is immutable after that — it does not change even if the client is renamed
- The short code is used as the prefix for all task keys belonging to that client

**Create a Client**
- User can create a new client workspace from the sidebar or main dashboard
- Required fields: client name, short code
- Optional fields: description, color label
- Client is immediately visible in the client list after creation
- Client name must be unique per user

**Edit a Client**
- User can edit the client name, description, and color label
- The short code cannot be edited after creation
- Changes are saved immediately and reflected everywhere the client appears

**Archive a Client**
- User can archive a client removing it from the active list without deleting data
- Archived clients and their tasks are accessible via an "Archived" section
- User can unarchive a client at any time

**Delete a Client**
- User can permanently delete a client workspace
- Deleting a client permanently deletes all tasks belonging to that client
- User is shown a confirmation prompt before deletion clearly stating all tasks will be lost

**Client List View**
- All active client workspaces are displayed in a sidebar or grid view
- Each client card shows: name, short code, color label, and count of open tasks
- Archived clients are hidden from this view by default

**Color Labels**
- User can assign one color from a predefined palette to each client
- The color is displayed consistently on the client card, sidebar item, and task list headers

---

## Feature 9 — Task Management

**Task Keys**
- Every task is automatically assigned a unique key at the moment of creation regardless of how it was created (manual, paste-to-task, or voice-to-task)
- Key format: `SHORTCODE-N` where SHORTCODE is the client's immutable short code and N is an incrementing integer starting at 1 per client
- Example: client with short code `BS` → task keys are `BS-1`, `BS-2`, `BS-3`
- The key is immutable — it never changes after creation
- No two tasks belonging to the same client can share a key
- If a task is deleted its key is retired and the number is never reused
- Keys are generated server-side

**Create a Task Manually**
- User can create a task from within a client workspace via a clearly visible "New Task" button
- User can also create a task directly from a column on the Scrum board via a "+" button in that column — the task is pre-assigned the status of that column
- Required field: task title
- Optional fields: description, due date, priority, notes
- New tasks default to status "To Do" and priority "Medium" if not specified
- A task key is automatically generated and assigned on creation
- Task appears immediately in the workspace after creation

**Edit a Task**
- User can edit any field of a task: title, description, due date, priority, status, notes
- Edits can be made inline or via a task detail panel
- Changes are saved immediately
- The task key is displayed in the task detail view and is not editable

**Delete a Task**
- User can permanently delete a task
- A confirmation prompt is shown before deletion
- The deleted task's key is retired and never reused

**Task Statuses**
- Every task has one of four statuses: To Do · In Progress · Done · Blocked
- User can change the status of any task at any time
- User can mark a task as Done with a single click without opening the edit panel

**Task Priority**
- Every task has one of four priority levels: Low · Medium · High · Urgent
- Priority is visually distinguishable in the task list and board view via a color badge

**Due Dates**
- User can set an optional due date on any task using a date picker
- Tasks past their due date are visually flagged in red
- Tasks with no due date show no date indicator

**Task Notes**
- User can add free-text notes to any task as a secondary content field

**Pagination**
- Task lists are paginated — a fixed number of tasks are shown per page
- The user can navigate between pages via previous and next controls
- The current page number and total task count are displayed
- Pagination resets to page 1 when filters or sort order change

**Sort Tasks**
- User can sort the task list by: due date, priority, or creation date
- Sort order persists while the user is within the same workspace session

---

## Feature 10 — Scrum Board View

**Board Layout**
- Within each client workspace tasks can be viewed as a Scrum board
- The board displays four columns: To Do · In Progress · Blocked · Done
- Each column displays its name and a count of tasks in that column
- The board view is toggleable with the list view — user can switch between the two at any time
- The last selected view is remembered per workspace during the session

**Task Cards**
- Each task is represented as a card showing: task key, task title, priority badge, and due date if set
- Overdue tasks are visually flagged on the card with a red due date
- Clicking a card opens the full task detail panel

**Create Task from Board**
- Each column has a "+" button that opens a new task form with the status pre-set to that column's status
- The created task appears immediately in that column

**Drag and Drop**
- User can drag a task card from one column and drop it into another
- Dropping a card into a new column immediately updates the task status to match that column
- The board reflects the new position instantly without a page reload
- If the drag is cancelled or dropped outside a valid column the card returns to its original position
- Cards within a column can be manually reordered by dragging within the same column
- The manual order within a column is persisted

**Column Behavior**
- Columns scroll independently if cards exceed the visible height
- Empty columns remain visible and accept drops

**Global Board View**
- The global dashboard displays a full board view showing tasks from all clients across the four columns
- Each task card on the global board displays the client name and color label for visual distinction
- The global board supports the same drag and drop behavior as the per-client board
- The global board supports the same filter bar as the per-client board

---

## Feature 11 — Advanced Filtering & Query Search

**Filter Bar**
- A persistent filter bar is available on both the board view and list view in every workspace and on the global dashboard
- The filter bar accepts structured query input (e.g. `client = BrandStudio status = high`)
- Filters apply instantly on submission
- Active filters are clearly displayed and individually dismissible
- User can clear all active filters with a single action
- Filter state is reflected in the URL so filtered views can be bookmarked or shared
- Filter state persists when the user switches between list and board view within the same workspace session
- Filter state is cleared when the user navigates away from the workspace

**Supported Filter Fields**
- `client` — filter by client name (partial match supported)
- `status` — filter by one or more statuses: `todo`, `inprogress`, `done`, `blocked`
- `priority` — filter by one or more priority levels: `low`, `medium`, `high`, `urgent`
- `due` — filter by due date: `due = today`, `due = this week`

**Task Key Lookup**
- User can search for a specific task by its key directly in the filter bar (e.g. `BS-12`)
- Entering a valid task key immediately surfaces that single task
- Key lookup is case-insensitive
- If the key does not match any task a clear "no results" message is shown

**Query Behavior**
- Multiple filters can be combined in a single query
- Filters use AND logic by default
- Invalid filter fields surface a clear inline error without clearing the rest of the query
- Filtered results on the board view still display across the correct status columns
- If no tasks match the active filters an empty state is shown with a prompt to clear filters

---

## Feature 12 — Dashboards

**Global Dashboard**
- User lands on the global dashboard after signing in
- The dashboard displays all active client workspaces as cards in a grid
- Each client card shows: name, short code, color label, open task count, overdue task count, and a progress bar
- Progress bar is calculated as: tasks with status Done ÷ total tasks × 100
- The global dashboard also provides a full board view showing all tasks across all clients in the four status columns
- User can toggle between the client card grid and the full global board view

**Per-Client Dashboard**
- Each client workspace has its own dashboard scoped to that client
- Shows the task list and board view for that client
- Shows a status breakdown: count of tasks per status
- Shows the count of overdue tasks

**Status Breakdown**
- Both dashboards display task counts per status: To Do · In Progress · Done · Blocked
- Counts update in real time as tasks are created, edited, or deleted

**Overdue Task Flagging**
- Any task past its due date is visually flagged in red on both dashboards
- Overdue tasks are surfaced prominently

**Due Today / This Week**
- User can filter dashboard tasks to show only tasks due today
- User can filter to show only tasks due within the current week

---

# ✍️ Phase 2 — AI Paste to Task

## Feature 13 — Paste to Task

**Entry Points**
- User can access paste-to-task from a clearly visible button on the global dashboard
- User can access paste-to-task from within any client workspace
- When accessed from within a client workspace that client is pre-selected in the client dropdown

**Text Input**
- User is presented with a large textarea for pasting raw text
- The textarea accepts English and Arabic input
- There is no character minimum
- User can clear the textarea with a single action before submitting

**Client Assignment**
- User selects which client this message belongs to via a dropdown listing all active clients
- If accessed from within a workspace that client is pre-selected
- The user cannot submit without a client selected

**AI Extraction**
- On submission the raw text is sent to the Claude API for structured task extraction
- Claude returns: task title, description, due date if detectable, and suggested priority
- Relative dates (e.g. "by Friday", "next week") are converted to absolute dates based on the current date
- If no due date is mentioned the due date field is left empty
- If no priority can be inferred priority defaults to Medium
- The user sees a loading state during extraction
- Extraction must complete in under 5 seconds
- If the pasted text contains no actionable task Claude returns a clear signal and the user is shown a message explaining no task was found with the option to try different text or switch to manual creation

**Review Before Save**
- After extraction the user sees a structured task preview with all fields populated and editable
- The original pasted text remains visible during review for cross-referencing
- Flagged fields (where Claude is uncertain) are visually highlighted to prompt review
- Flagged fields do not block saving
- User can go back to the input step without losing their client selection
- User confirms with a single "Save Task" action

**Post Save Behavior**
- After saving the user is navigated to the client workspace board view with the new task visible and highlighted briefly to draw attention
- A success message confirms the task was created

**Language Support**
- Extraction works correctly for English input
- Extraction works correctly for Arabic input
- Mixed-language input is handled without errors

**Error Handling**
- If the Claude API call fails the user sees a clear error and can retry without re-entering text
- If extraction returns empty or unusable the user is notified and can retry or switch to manual creation
- Network errors are caught and surfaced — the app does not crash or silently fail

---

# 🎙️ Phase 3 — AI Voice to Task

## Feature 14 — Voice to Task

**Entry Points**
- Voice-to-task is accessible from the same entry point as paste-to-task presented as a tab or toggle
- When accessed from within a client workspace that client is pre-selected

**In-Browser Recording**
- User can record a voice note directly in the browser without installing anything
- Recording starts on clicking a clearly visible record button
- A live timer shows elapsed time (e.g. 0:12 / 1:00)
- A pulsing visual indicator confirms active recording
- User can stop recording at any time before the 60-second limit
- Recording automatically stops at 60 seconds and the user is notified
- User can play back the recording before submitting
- User can discard and re-record with a single action

**File Upload Fallback**
- User can upload an existing audio file instead of recording live
- Accepted formats: `.mp3`, `.m4a`, `.wav`, `.ogg`
- Maximum file size: 25MB (Whisper API limit) — communicated clearly before upload
- Unsupported formats surface a clear error before any processing begins
- User can remove an uploaded file and switch back to live recording

**Client Assignment**
- User selects the client via a dropdown listing all active clients
- Pre-selected if accessed from within a workspace
- Cannot submit without a client selected

**Whisper Transcription**
- On submission audio is sent to the OpenAI Whisper API
- Supports English and Arabic audio
- User sees a loading state with a status message: "Transcribing your note…"
- If Whisper returns an empty transcript (e.g. silence or background noise only) the user is shown a clear message and prompted to re-record or upload a different file

**Transcript Review**
- After transcription the user sees the full transcript text
- User can edit the transcript manually before proceeding
- User confirms the transcript to trigger Claude structuring
- Original audio playback remains available during transcript review

**Claude Structuring**
- The confirmed transcript is passed to the Claude API using the same extraction pipeline as paste-to-task
- Same output: title, description, due date, priority
- Relative dates are converted to absolute dates
- User sees a loading state: "Structuring your task…"
- The two loading states (transcription and structuring) are presented as a clear two-step progress flow — not a single opaque spinner

**Task Review Before Save**
- After structuring the user sees the extracted task with all fields editable
- The transcript remains visible during task review
- User can go back to the transcript step and edit before re-running extraction
- User confirms with "Save Task"

**Post Save Behavior**
- After saving the user is navigated to the client workspace board view with the new task visible and briefly highlighted
- A success message confirms the task was created
- Post-save behavior is identical to paste-to-task

**Arabic Voice Support**
- Arabic voice notes are transcribed correctly by Whisper
- Arabic transcripts are structured correctly by Claude
- The full pipeline works end to end in Arabic

**Error Handling**
- If the browser does not support audio recording the user sees a clear message and is automatically shown the file upload option
- If microphone permission is denied the user sees an actionable message explaining how to grant it
- If the Whisper API call fails the user can retry without re-recording
- If Claude structuring fails after a successful transcription the user can retry structuring from the transcript without re-recording
- Network errors at any step are caught and surfaced — the app does not crash or silently fail

---

# 🔒 Phase 4 — Hardening & Monitoring

## Feature 15 — Uptime Monitoring (Uptime Kuma)

**Setup**
- Uptime Kuma is added as a service in `docker-compose.prod.yml`
- Its data is persisted via a named Docker volume
- Accessible via a subdomain (e.g. `status.freelanceflow.com`) protected by Nginx
- Dashboard access requires a username and password

**Monitors**
- Monitor configured for the Next.js frontend — checks for 200 response
- Monitor configured for the Express API `GET /health` endpoint
- Monitor configured for SSL certificate expiry — alerts before expiry
- Each monitor checks every 60 seconds
- Monitor history retained for at least 30 days

**Alerting**
- Alert sent when any monitor goes down
- Recovery alert sent when monitor comes back up
- No repeated alerts for sustained outages — one down alert and one recovery alert only
- Alerts delivered via email or Telegram

**Status Page**
- A public status page shows uptime of all monitored services
- Accessible without login
- Shows current status and historical uptime percentage

---

## Feature 16 — Application Metrics (Prometheus + Grafana)

**Prometheus Setup**
- Prometheus added as a service in `docker-compose.prod.yml` with a named volume
- A `prometheus.yml` config file exists in the repository and is mounted into the container
- Not exposed to the public internet — internal Docker network only
- Scrapes metrics from the Express API every 15 seconds

**Metrics Exposed by the API**
- The Express API exposes a `/metrics` endpoint in Prometheus format
- Metrics collected: HTTP request count per route and status code, request duration (p50/p95/p99), active database connections, Claude API call count and response time, Whisper API call count and response time, error rate per route

**Grafana Setup**
- Grafana added as a service in `docker-compose.prod.yml` with a named volume
- Accessible via a subdomain (e.g. `metrics.freelanceflow.com`) protected by Nginx
- Login required — default credentials changed on first setup
- Prometheus configured as a data source automatically via provisioning config

**Grafana Dashboards**
- A pre-built dashboard is provisioned automatically on startup
- Dashboard includes: request rate, error rate, API latency percentiles, Claude and Whisper usage, active users
- Dashboards stored as JSON files in the repository — version controlled and restored automatically on redeploy

---

## Feature 17 — Audit Log

**Audit Log Storage**
- Every significant action in the application is recorded as an audit log entry in the database
- Each entry records: timestamp, user ID, action type, entity type, entity ID, and a human-readable description of the change
- Audit log entries are never edited or deleted — they are append-only
- Audit log entries are associated with the user who performed the action

**Actions Logged**
- User signs in and signs out
- Client created, edited, archived, unarchived, deleted
- Task created (including method: manual, paste-to-task, voice-to-task), edited, deleted, status changed
- Task key generated
- AI extraction triggered (paste or voice) — logs input length and output fields, never the raw content
- Any failed authentication attempt

**Audit Log UI**
- A dedicated Audit Log section is accessible from the app settings or sidebar
- The log displays entries in reverse chronological order (most recent first)
- Each entry shows: timestamp, action description, and affected entity with a link to it if it still exists
- The log is paginated — a fixed number of entries per page
- User can filter the audit log by: date range, action type, and entity type
- The audit log is read-only — no entries can be edited or deleted from the UI

---

## Feature 18 — Error Tracking

**Setup**
- Application errors are captured from both Next.js frontend and Express API
- Errors include: stack trace, timestamp, user ID (no PII), request path, and environment
- Local development errors are not reported — production only

**Frontend Error Tracking**
- Unhandled JavaScript exceptions are captured automatically
- Failed API calls are logged with response status and endpoint
- User sees a friendly error UI — never a raw error or blank screen

**Backend Error Tracking**
- Unhandled exceptions are caught by a global error handler middleware
- The handler logs the full error with context before returning a structured JSON error response
- 500-level errors are distinguished from 400-level — only 500-level trigger alerts
- Database errors and external API errors are caught and logged with full context

**Error Alerting**
- More than 5 errors per minute triggers an alert
- Individual critical errors trigger an immediate alert
- Alerts delivered to the same channel as uptime alerts

---

## Feature 19 — Performance Tuning

**API Response Times**
- All endpoints reviewed against PRD performance targets
- Endpoints exceeding targets identified via Grafana and optimized
- Database queries reviewed — missing indexes added where queries are slow
- N+1 query problems identified and resolved

**Database Optimization**
- Indexes added on: `user_id`, `client_id`, `status`, `due_date`, `task_key`
- Connection pooling configured via Prisma
- Slow query logging enabled in the Postgres container (`log_min_duration_statement`)

**Next.js Optimization**
- Static generation used where possible
- Images served via Next.js Image component with proper sizing and lazy loading
- Bundle size analyzed and unnecessary dependencies removed or code-split

---

## Feature 20 — Security Hardening

**API Security**
- All API routes verified to require authentication
- Rate limiting applied to all routes — stricter limits on auth and AI endpoints
- API keys verified to exist only as environment variables — never in code or logs
- API responses never include stack traces or internal error details

**HTTP Security Headers**
- `Strict-Transport-Security` — enforces HTTPS
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables unnecessary browser features

**Database Security**
- Database not exposed to the public internet
- Application database user has minimum required privileges only
- A separate read-only user created for monitoring queries

**Dependency Audit**
- `npm audit` runs in the GitHub Actions pipeline
- Pipeline fails on high or critical severity vulnerabilities

---

## Feature 21 — Log Management

**Application Logs**
- Docker container logs for all services are captured and available via `docker logs` on the VPS
- Log rotation is configured for all containers — maximum log file size and number of rotated files are defined to prevent disk exhaustion
- Log rotation config is defined in `docker-compose.prod.yml` via Docker's logging driver options

**Disk Space Monitoring**
- VPS disk usage is monitored as a metric
- An alert is triggered when disk usage exceeds 80% of total capacity
- Docker image cleanup (`docker image prune`) is scheduled as a weekly cron job on the VPS to remove unused images

**SSL Certificate Renewal Verification**
- Certbot auto-renewal is verified by running a dry run (`certbot renew --dry-run`) before go-live
- A monthly cron job runs the dry run and logs the result
- An alert is triggered if the certificate is within 14 days of expiry

---

## Feature 22 — Backup Strategy

**Automated Database Backups**
- There is no managed provider — the nightly `pg_dump` is the **only** backup layer, so it must be in place before any real data exists
- A nightly `pg_dump` (run via `docker exec` against the `db` container) is triggered by a cron job on the VPS and the output uploaded to S3-compatible object storage
- Backup files are named with timestamps (e.g. `backup-2024-01-15-02-00.sql.gz`)
- The last 30 daily backups are retained — older ones deleted automatically

**Backup Verification**
- A weekly automated test restores the most recent backup to a temporary database and verifies it contains data
- Verification result is logged and an alert sent on failure
- Backup file size is monitored — an unusually small file triggers an alert

**Manual Backup and Restore Runbook**
- A documented runbook exists in the repository for manually triggering a backup
- A documented runbook exists for restoring from a backup file step by step
- The restore process is tested manually at least once before real users are onboarded

**Disaster Recovery**
- A documented procedure exists for rebuilding the entire production environment from scratch using only the repository and the latest database backup
- The procedure is tested end to end before go-live

---

That is the complete refined backlog. Here is the full feature index:

| # | Feature | Phase |
|---|---|---|
| 1 | Multi-Stage Dockerfiles | Phase 0 |
| 2 | Local Dev Environment | Phase 0 |
| 3 | Production Environment | Phase 0 |
| 4 | CI/CD Pipeline | Phase 0 |
| 5 | VPS Provisioning | Phase 0 |
| 6 | Pipeline Validation | Phase 0 |
| 7 | Authentication | Phase 1 |
| 8 | Client Workspaces | Phase 1 |
| 9 | Task Management | Phase 1 |
| 10 | Scrum Board View | Phase 1 |
| 11 | Advanced Filtering | Phase 1 |
| 12 | Dashboards | Phase 1 |
| 13 | Paste to Task | Phase 2 |
| 14 | Voice to Task | Phase 3 |
| 15 | Uptime Monitoring | Phase 4 |
| 16 | Metrics & Grafana | Phase 4 |
| 17 | Audit Log | Phase 4 |
| 18 | Error Tracking | Phase 4 |
| 19 | Performance Tuning | Phase 4 |
| 20 | Security Hardening | Phase 4 |
| 21 | Log Management | Phase 4 |
| 22 | Backup Strategy | Phase 4 |
