# FreelanceFlow — Application Requirements Brief

**Version:** 1.0 — Initial Draft  
**Status:** In Review  

---

## What I Want to Build

I want to build a web application called FreelanceFlow. It is a task and client management tool built specifically for freelancers — people like designers, developers, writers, consultants, and marketers who manage multiple clients at the same time and communicate with them almost entirely through WhatsApp.

The core problem I am solving is this: freelancers receive all their work through informal messages and voice notes on WhatsApp. They have no structured system for capturing that work, tracking it, or making sure nothing falls through the cracks. Existing tools like Notion and Trello are too generic and require too much manual effort to set up and maintain. Most freelancers simply do not use them.

FreelanceFlow should feel fast, opinionated, and built around the way freelancers actually work. The AI layer is the core differentiator — instead of manually copying a WhatsApp message into a task manager, the freelancer pastes it or records a voice note and the app does the rest.

---

## Who Is This For

The primary user is a freelancer managing between two and ten active clients simultaneously. They are technically comfortable enough to use a web app but are not looking for enterprise complexity. Speed matters to them — they want to capture a task in under thirty seconds and move on. They communicate with clients primarily via WhatsApp and often receive work requests as informal messages or voice notes, sometimes in Arabic and sometimes in English.

For version one, this is a personal tool. One account, one person, their own clients and tasks. There is no team collaboration, no client-facing portal, and no sharing between users.

---

## Technology Stack

I have already decided on the technology stack. Please build the application using exactly these technologies and do not substitute anything without discussing it first.

- **Frontend:** Next.js with React and Tailwind CSS. Use shadcn/ui for components.
- **Backend:** Node.js with Express.js as a REST API.
- **Database:** PostgreSQL using Prisma as the ORM.
- **Authentication:** Google OAuth 2.0 with JWT tokens stored in HTTP-only cookies.
- **AI task parsing:** Anthropic Claude API using the `claude-sonnet-4-6` model.
- **AI transcription:** OpenAI Whisper API.
- **Containerization:** Docker with Docker Compose. The app must run in Docker both locally and in production.
- **Web server:** Nginx as a reverse proxy handling SSL termination.
- **CI/CD:** GitHub Actions for automated testing, building, and deployment.
- **Hosting:** A VPS on Hetzner or DigitalOcean. We may migrate to AWS later.
- **Monitoring:** Uptime Kuma for uptime checks, Prometheus and Grafana for application metrics.

---

## Infrastructure and Deployment Philosophy

This is important. I do not want Docker and CI/CD to be an afterthought. I want the infrastructure set up before any feature development begins so that from day one every merge to the main branch automatically deploys to production. This way each phase of development is always live and testable on a real server.

### Local Development

The local development environment must run entirely in Docker. Running a single command — `docker compose up` — should start the entire stack including the Next.js frontend, the Express API, a local PostgreSQL database, and Adminer for browsing the database. Developers should not need to install Node or PostgreSQL directly on their machine.

Code changes should reflect immediately without rebuilding the container. The local environment should feel fast and frictionless.

### Production Environment

The production environment also runs in Docker but with some important differences. In production there is no local database — I want to use a managed PostgreSQL service such as Supabase, Railway, or Neon. The managed provider handles backups, failover, and upgrades so I do not have to worry about database operations. The app connects to it via a connection string stored as an environment variable.

The production stack consists of the Next.js app, the Express API, and Nginx. Nginx handles all incoming traffic, terminates SSL, and routes requests to the correct service. Nothing is exposed directly to the internet except through Nginx on ports 80 and 443.

### Docker Image Strategy

There should be two Dockerfiles — one for the Next.js frontend called `Dockerfile.app` and one for the Express API called `Dockerfile.api`. Each uses multi-stage builds with a `dev` stage for local development and a `prod` stage for production. The `prod` stage should be as lean as possible — no dev dependencies, no source files, just the built output.

PostgreSQL and Nginx use their official images from Docker Hub. I do not need to build custom images for them. The Nginx configuration file lives in the repository and is mounted into the container at runtime so I can update it without rebuilding the image.

### CI/CD Pipeline

The pipeline runs on GitHub Actions and is triggered automatically on every push to the main branch. It must run in this exact order: run tests first, then build the production Docker images, then push them to GitHub Container Registry, then SSH into the VPS and deploy the new images. If any step fails the pipeline stops and the current production deployment is not affected.

Each image should be tagged with both `latest` and the Git commit SHA so I can identify exactly which version is running in production and roll back to any previous version if needed.

All secrets — API keys, database connection strings, SSH credentials — must be stored as GitHub Actions secrets. Nothing sensitive should ever appear in the codebase.

### Before Writing Any Features

Before any feature code is written I want to validate that the entire pipeline works end to end with a simple hello world application. I want to be able to push to main and see the hello world deploy live at the production domain over HTTPS. This proves the infrastructure is solid before we build anything on top of it.

---

## Features

### 1. Authentication

I want sign-in to be as simple as possible. Users sign in with their Google account — one click, no username or password to manage. After signing in the user lands on their dashboard. If it is their first time the app creates an account for them automatically.

Sessions should persist across browser sessions so users do not have to sign in every time they open the app. Session tokens should be stored in HTTP-only cookies for security. When a user logs out their session should be completely cleared and they should not be able to navigate back using the browser back button.

Every route in the app requires authentication. If someone tries to access any page without being signed in they should be redirected to the login page and then taken to the page they originally requested after they sign in.

---

### 2. Client Workspaces

Each client the freelancer works with gets their own workspace. A workspace is an isolated container — all tasks and notes inside it belong to that one client. This keeps everything clean and prevents cross-client confusion.

When creating a client the user provides a name and optionally a description and a color label for visual differentiation. The system should automatically suggest a short code for the client based on their initials — for example Brand Studio becomes `BS`. The user can override this suggestion but it must be between two and five uppercase characters and must be unique across all their clients. This short code is used as the prefix for all task keys and cannot be changed after the client is created.

Users should be able to edit a client's name, description, and color at any time. The short code cannot be edited. Clients can be archived — hidden from the active list without deleting any data — and unarchived at any time. Clients can also be permanently deleted but this permanently deletes all tasks inside that workspace too, so the user must confirm before it happens.

The client list should be visible in a sidebar or grid. Each client should show its name, short code, color label, and a count of open tasks. Archived clients are hidden from the main list by default.

---

### 3. Task Management

Tasks are the core unit of the product. Every task belongs to exactly one client workspace. Tasks have a title, an optional description, a status, a priority, an optional due date, and optional free-text notes.

#### Task Keys

Every task must be automatically assigned a unique key when it is created, regardless of whether it was created manually, via paste-to-task, or via voice-to-task. The key format is the client short code followed by a dash and an incrementing number — for example `BS-1`, `BS-2`, `BS-3`. Keys are immutable and are never reused even if the task is deleted. They are generated on the server.

#### Statuses and Priority

Tasks can have one of four statuses: To Do, In Progress, Done, or Blocked. Tasks can have one of four priority levels: Low, Medium, High, or Urgent. New tasks default to To Do and Medium priority unless the user specifies otherwise. Priority should be visually distinguishable in the task list and board view using color badges.

#### Due Dates

Due dates are optional. When set, tasks that are past their due date should be visually flagged in red. Tasks with no due date show no date indicator.

#### Creating Tasks

Users can create tasks manually from within a client workspace using a New Task button. They can also create tasks directly from the Scrum board by clicking a plus button in a specific column — the task is pre-assigned the status of that column. Tasks can also be created via AI from a pasted message or a voice note, which I will describe separately.

#### Editing and Deleting

Users can edit any field of a task inline or via a detail panel. The task key is displayed in the detail view and cannot be edited. Users can mark a task as done with a single click without opening the edit panel. Deleting a task requires a confirmation prompt and retires that task key permanently.

#### Sorting and Pagination

The task list can be sorted by due date, priority, or creation date. When there are many tasks the list should be paginated rather than infinite scroll — show a fixed number per page with previous and next controls and a display of the current page and total count.

---

### 4. Scrum Board View

Tasks should be viewable as a Scrum board as well as a list. The user can toggle between the two views at any time and the last selected view should be remembered for that workspace during the session.

The board shows four columns — one per status: To Do, In Progress, Blocked, Done. Each column shows its name and the count of tasks in it. Empty columns remain visible and continue to accept drops. Columns scroll independently when there are many cards.

Each task card on the board shows the task key, title, priority badge, and due date if set. Overdue tasks are flagged with a red due date. Clicking a card opens the full task detail panel.

Users can drag a task card from one column to another to change its status. The board updates immediately without a page reload. If the drag is cancelled the card returns to its original position. Within a column, cards can also be manually reordered by dragging and the order is persisted.

Each column should have a plus button that lets the user create a new task directly from the board. The new task is pre-assigned the status of that column.

WIP limits are not in scope for version one.

---

### 5. Advanced Filtering and Search

I want a filter bar on both the board view and the list view — in every client workspace and on the global dashboard. The filter bar should accept structured queries typed as free text.

Supported filters are: client name, status, priority, and due date. Multiple filters can be combined in one query and they work with AND logic by default. For example a query like `client = BrandStudio status = blocked priority = urgent` should show only tasks matching all three conditions.

Users should also be able to search directly for a task by its key — typing `BS-12` into the filter bar should immediately surface that specific task. Key lookup should be case-insensitive.

Active filters should be reflected in the URL so the user can bookmark or share a filtered view. Filter state should persist when the user switches between list and board view within the same workspace session. Filters should clear when the user navigates away from the workspace.

---

### 6. Dashboards

There are two dashboard contexts: a global dashboard and a per-client dashboard.

#### Global Dashboard

The global dashboard is where the user lands after signing in. It shows all active client workspaces as cards in a grid. Each card shows the client name, short code, color label, open task count, overdue task count, and a progress bar calculated as the percentage of tasks with status Done.

The global dashboard should also offer a full board view — the same four-column Scrum board but showing tasks from all clients together. Each task card on the global board should show which client it belongs to. The user can toggle between the card grid and the full board view.

#### Per-Client Dashboard

Each client workspace has its own dashboard showing only that client's tasks. It shows the task list and board view, a status breakdown with counts per status, and the count of overdue tasks. The same filter bar is available here.

#### Overdue and Upcoming

Overdue tasks should be visually flagged in red everywhere they appear. Users should be able to filter to show only tasks due today or only tasks due this week.

---

### 7. AI — Paste to Task

This is the first AI feature and the one I expect users to use most. The idea is simple: the freelancer copies a WhatsApp message from a client — something like *"Hey can you update the homepage banner by Thursday? Make it more modern, something that pops. Also need the logo in white version for the footer, nothing urgent on that one"* — pastes it into the app, and the app automatically creates a structured task from it.

The paste-to-task flow should be accessible from a clearly visible button on the global dashboard and from within any client workspace. When accessed from within a workspace that client should be pre-selected.

The user pastes their text into a large textarea. The textarea accepts both English and Arabic input. After selecting the client from a dropdown the user submits and the text is sent to the Claude API.

Claude should extract: a task title, a description, a due date if one is mentioned, and a suggested priority. Relative dates like "by Friday" or "next week" should be converted to absolute dates. If no due date is mentioned the field stays empty. If priority cannot be inferred it defaults to Medium.

After extraction the user sees a review screen showing all the extracted fields in an editable form. The original pasted text stays visible so the user can cross-reference. If Claude is uncertain about a particular field that field should be visually flagged to prompt the user to check it. Flagged fields do not block saving.

After the user confirms, the task is saved to the selected client workspace. The user is then taken to that workspace's board view with the new task visible and briefly highlighted. A success message confirms the task was created.

If the pasted text contains no actionable task Claude should say so and the user should see a message explaining that no task was found, with the option to try different text or switch to manual creation. If the API call fails the user should be able to retry without re-entering their text.

The entire extraction should complete in under five seconds.

---

### 8. AI — Voice to Task

Voice to task works the same as paste to task but the input is audio instead of text. The user records a voice note in the browser or uploads an audio file, it gets transcribed by Whisper, and then the transcript is passed to Claude for task extraction. The output and review flow are identical to paste to task.

Voice to task should appear as a tab or toggle alongside paste to task — not a separate page.

#### Recording

The user can record directly in the browser without installing anything. Recording starts on clicking a record button. A live timer shows elapsed time. A pulsing indicator confirms active recording. The user can stop at any time. Recording automatically stops at sixty seconds. The user can play back the recording before submitting and can discard and re-record at any time.

#### File Upload

As a fallback the user can upload an existing audio file. Accepted formats are `.mp3`, `.m4a`, `.wav`, and `.ogg`. The maximum file size is 25MB which is the Whisper API limit. This limit should be communicated clearly before upload. Unsupported formats should be rejected before any processing begins.

#### Transcription and Structuring

The audio is sent to OpenAI Whisper for transcription. After transcription the user sees the full transcript and can edit it before proceeding. This is important because Whisper is not perfect, especially with names or technical terms. The user confirms the transcript and then Claude structures it into a task using the same pipeline as paste to task.

The two steps — transcription and structuring — should be presented as a clear two-step progress flow, not a single opaque spinner. The user should know what is happening at each stage.

#### Arabic Support

Both Whisper and Claude support Arabic. The full pipeline — record, transcribe, extract, review, save — must work end to end in Arabic.

#### Error Handling

If the browser does not support audio recording the user should automatically see the file upload option instead. If microphone permission is denied the user should see a clear explanation of how to grant it. If Whisper fails the user can retry without re-recording. If Claude fails after a successful transcription the user can retry structuring from the transcript without starting over.

---

## Monitoring, Observability, and Hardening

Once the core features are built and deployed I want to harden the production environment properly. This is not optional — I want it done before any real users are onboarded.

### Uptime Monitoring

I want Uptime Kuma running on the VPS monitoring the frontend, the API health endpoint, and the SSL certificate. It should check every sixty seconds and alert me via email or Telegram when something goes down and again when it recovers. There should be a public status page showing uptime history. The Uptime Kuma dashboard itself should be password protected.

### Application Metrics

I want Prometheus scraping metrics from the Express API and Grafana displaying them. The API should expose a metrics endpoint with: request count per route and status code, request latency at the 50th, 95th, and 99th percentiles, active database connections, Claude API call count and response time, Whisper API call count and response time, and error rate per route.

Grafana dashboards should be stored as JSON files in the repository and provisioned automatically on startup so I never have to manually configure them after a deploy.

### Audit Log

I want an audit log that records every significant action in the application. Every entry should capture the timestamp, who did it, what they did, and which entity was affected. The audit log should be append-only — nothing in it can ever be edited or deleted.

Actions that should be logged include:

- Sign in and sign out
- Client created, edited, archived, unarchived, and deleted
- Task created (with the method — manual, paste, or voice), edited, deleted, and status changed
- AI extraction triggered — log that it happened but never log the raw message content
- Any failed authentication attempts

The audit log should be viewable from a dedicated section in the app. It shows entries in reverse chronological order. Each entry links to the affected entity if it still exists. It is paginated and filterable by date range, action type, and entity type. It is entirely read-only from the UI.

### Error Tracking

Both the frontend and the API should capture and report errors. On the frontend, unhandled JavaScript exceptions and failed API calls should be captured. On the backend, a global error handler middleware should catch all unhandled exceptions and log them with full context before returning a structured error response to the client. 500-level errors should trigger an alert. 400-level errors should be logged but not alert. The user should always see a friendly error message — never a raw stack trace.

### Security Hardening

Every API route must require authentication. Rate limiting must be applied to all routes with stricter limits on authentication and AI endpoints. The following HTTP security headers must be set on all responses: `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`. API keys must exist only as environment variables and must never appear in logs, responses, or the codebase.

### Performance

- Page load under two seconds on a standard connection
- AI paste-to-task completes in under five seconds
- Voice transcription plus structuring completes in under ten seconds for a thirty-second note
- Database queries must have appropriate indexes on `user_id`, `client_id`, `status`, `due_date`, and `task_key`
- Connection pooling must be configured via Prisma

### Log Management

Docker container logs should have rotation configured so they do not fill up the server disk. A weekly cron job should prune unused Docker images. Disk usage should be monitored and I want an alert when it exceeds eighty percent of capacity.

### Backups

The managed database provider handles automated backups. On top of that I want a nightly `pg_dump` uploaded to S3-compatible object storage with thirty days of retention. The backup restoration process must be documented step by step and tested manually before any real users are onboarded. There should also be a documented procedure for rebuilding the entire production environment from scratch using only the repository and the latest backup.

---

## What Is Out of Scope for Version One

To keep version one focused, the following are explicitly not being built. Do not design the architecture in a way that makes these impossible later, but do not build them now.

- Team collaboration — multiple users sharing workspaces
- Client-facing portal — sharing task status directly with clients
- Invoicing or billing
- Native mobile app
- WhatsApp Business API integration
- Email integration
- Google Calendar sync
- Time tracking
- Recurring tasks
- File attachments
- Arabic UI — the interface will be in English only for version one
- MFA — multi-factor authentication
- WIP limits on the Scrum board
- Multi-task extraction from a single pasted message

---

## Open Questions

These decisions need to be made before or during development.

- **Product name:** FreelanceFlow is a working title. A final name needs to be picked before buying a domain or setting up any accounts.
- **Hosting budget:** This determines VPS size and which managed database provider to use.
- **Managed database provider:** Supabase, Railway, and Neon are all options. A choice needs to be made before production setup begins.
- **Extraction confidence UX:** Should Claude surface a confidence score to the user or just flag uncertain fields visually without a score?

---

## Final Note

Build this as if you are a senior engineer who cares about the quality of the codebase. Write clean, readable code. Use environment variables for all configuration. Never hardcode secrets. Handle errors gracefully everywhere — the app should never crash or show a raw error to the user. Write the code in a way that makes it easy to add the out-of-scope features later without having to rewrite everything.

When in doubt about a decision, ask. I would rather answer a question upfront than debug a wrong assumption later.