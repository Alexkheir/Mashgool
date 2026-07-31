---
name: feature-wrapup
description: >-
  Produce Mashgool's standard documentation set when a feature or task is
  finished. Use whenever a unit of work is complete and verified (tests/lint/build
  green) and it's time to write it up — e.g. "document this feature", "update the
  learning docs", "wrap up", or right before committing a completed feature. Writes
  the learning deep-dive, the journal entry, the README index row, a PROGRESS.md
  entry, and a memory note — all in the house style, covering DTOs, data entities,
  file-by-file responsibilities, and where each sub-task is implemented.
---

# Feature wrap-up — documentation set

Run this the moment a feature or task is **done and verified** (green
lint/tests/build), before or as part of committing. It exists so every feature is
documented with the same shape and depth, and so you can always find *what each
file does* and *where each sub-task is implemented*.

## Preconditions

- The work is complete and verified. If lint/tests/build haven't been run, run
  them first — don't document unverified work as done.
- You know the feature's number and name (from `Project_phases.md`).

## Produce these five artifacts, in order

### 1. Learning deep-dive — `learning/<phase>-feature-<NN>-<slug>.md`  ⟵ most important
`learning/` is **gitignored — personal study material, never pushed.** Match the
existing files exactly (read the previous feature's doc first). Follow this
section structure (same as `learning/README.md` documents):

1. **One-paragraph summary** — what the feature does, plain words.
2. **The mental model** — the 3–4 big ideas that hold it together.
3. **The data model / schema & migration (in detail)** — the new **data
   entities** (Prisma models), every field and why, the **enums**, indexes,
   relations/back-relations, and exactly how the migration was generated
   (throwaway Postgres on :5433 → `migrate dev` → tear down; the `.sql` is the
   durable artifact) and how to apply it in dev (`migrate deploy`).
4. **The trickiest invariant** — if the feature has one (atomic keys, ownership,
   immutability), give it its own section, including any tech-spec sample bug you
   deliberately avoided (spec code is illustrative — follow intent).
5. **The full flow** — a real user action from first click to DB and back,
   naming the real files at each hop.
6. **Tracing a call through the files** — the routing/dispatch chain with real
   file paths; a dispatch table of all endpoints; 2–3 worked end-to-end traces.
7. **Every moving part** — a backend table and a frontend table: each file, what
   it holds, and *why it's written that way*. **Always call out the DTOs**
   (`Create*Dto`/`Update*Dto`, `.strict()`, what's absent and why) **and the data
   entities**.
8. **The invariants** and **Gotchas & current limitations** (what's deliberately
   deferred to which later feature, dev-run caveats, etc.).

Write it so someone could understand the feature *without reading the source
first*. Reference real file paths (`apps/api/src/...`, `apps/web/src/...`).

### 2. Journal entry — append to `learning/journal.md`
A dated `## Phase X · Feature NN — <Name> (YYYY-MM-DD)` block: **What** (1
paragraph + link to the deep-dive), **Why the shape it has** (the key decisions),
**Reusable lessons**, and **Deferred** (what moved to later features). Keep it
tighter than the deep-dive.

### 3. README index row — `learning/README.md`
Add one row to the Index table linking the new deep-dive.

### 4. PROGRESS.md entry (committed — this one is public)
Prepend a dated `## Phase X Feature NN (<name>) — YYYY-MM-DD` block at the top.
Keep it factual and brief (the CLAUDE.md rule): what was built (backend/frontend
one line each, naming models/endpoints/DTOs/migration), key decisions, the local
run command, and a one-line **Next:**. Do **not** let entries grow verbose.

### 5. Memory note
Create/update `<memory-dir>/feature-<NN>-<slug>.md` (`type: project`) capturing
the non-obvious, durable facts (decisions, gotchas, what's deferred) — not what
the code/git already says. Add a one-line pointer to `MEMORY.md`. Update the
previous feature's memory "Next:" pointer if needed.

## House-style rules (don't break these)

- **Never push `learning/` or memory** — both are local/personal (gitignored).
  Only `PROGRESS.md` and (if desired) this skill are committed.
- Convert relative dates to absolute (use the session's current date).
- Prefer *why* over *what*; reference real file paths; keep tables scannable.
- Cross-link: the deep-dive, journal, and memory should reference each other and
  the previous feature's docs.

## After writing

Report the file list to the user. Commit/push only when the user asks
(feature-branch workflow: PRs into `main`, no direct commits). `PROGRESS.md` is
committed with the feature; `learning/` and memory stay local.
