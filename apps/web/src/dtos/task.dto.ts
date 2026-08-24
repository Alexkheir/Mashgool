import { z } from 'zod';

// Frontend copy of the task DTOs + the display metadata the UI needs (labels,
// badge colors, board columns). Kept separate from the API's copy (the two apps
// share no code package). The server re-validates everything — this exists for
// instant form feedback and a single source of truth for how a status/priority
// looks. Enum *values* must match the API (apps/api/src/dtos/task.dto.ts).

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const CREATION_METHODS = ['MANUAL', 'PASTE_TO_TASK', 'VOICE_TO_TASK'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type CreationMethod = (typeof CREATION_METHODS)[number];

// Human label + badge classes per status. `badge` is a full Tailwind class set so
// the same chip renders identically wherever a status appears.
export const STATUS_META: Record<TaskStatus, { label: string; badge: string }> = {
  TODO: { label: 'To Do', badge: 'bg-neutral-100 text-neutral-700' },
  IN_PROGRESS: { label: 'In Progress', badge: 'bg-blue-100 text-blue-700' },
  BLOCKED: { label: 'Blocked', badge: 'bg-red-100 text-red-700' },
  DONE: { label: 'Done', badge: 'bg-green-100 text-green-700' }
};

export const PRIORITY_META: Record<TaskPriority, { label: string; badge: string }> = {
  LOW: { label: 'Low', badge: 'bg-neutral-100 text-neutral-600' },
  MEDIUM: { label: 'Medium', badge: 'bg-sky-100 text-sky-700' },
  HIGH: { label: 'High', badge: 'bg-amber-100 text-amber-800' },
  URGENT: { label: 'Urgent', badge: 'bg-red-100 text-red-700' }
};

// The board's four columns, in the order the spec fixes them (Feature 10):
// To Do · In Progress · Blocked · Done. Deliberately *not* the same order as
// TASK_STATUSES — that list mirrors the database enum, whose order drives
// priority-style sorting on the server and must not be reshuffled for display.
export const BOARD_COLUMNS = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;

// Per-column accent used for the header dot and count chip. Derived from the
// same palette as STATUS_META so a card's badge and its column agree.
export const COLUMN_META: Record<TaskStatus, { dot: string; count: string }> = {
  TODO: { dot: 'bg-neutral-400', count: 'bg-neutral-100 text-neutral-600' },
  IN_PROGRESS: { dot: 'bg-blue-500', count: 'bg-blue-100 text-blue-700' },
  BLOCKED: { dot: 'bg-red-500', count: 'bg-red-100 text-red-700' },
  DONE: { dot: 'bg-green-500', count: 'bg-green-100 text-green-700' }
};

// Sort options offered in the list toolbar (Feature 9 "Sort Tasks").
export const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Newest' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'priority', label: 'Priority' }
] as const;

export type SortField = (typeof SORT_OPTIONS)[number]['value'];

// A due date is a deadline, so it may not be a day that has already passed. Must
// mirror the API's rule (apps/api/src/dtos/task.dto.ts). `null` (clearing it)
// passes, since nullable short-circuits the refine. Day-granular, UTC-anchored.
const dueDate = z.iso
  .datetime({ offset: true })
  .refine((iso) => iso.slice(0, 10) >= new Date().toISOString().slice(0, 10), {
    message: 'Due date cannot be in the past'
  });

// Matches the API's CreateTaskDto. `dueDate` is the ISO-8601 string the form
// builds from its date input; `null`/absent means no due date.
export const CreateTaskDto = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(500),
    description: z.string().trim().max(5000).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    dueDate: dueDate.nullable().optional(),
    // Provenance — set to PASTE_TO_TASK when the create came out of the AI
    // review step (Feature 13). Absent means MANUAL, the server's default.
    creationMethod: z.enum(CREATION_METHODS).optional()
  })
  .strict();

export const UpdateTaskDto = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(500).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    dueDate: dueDate.nullable().optional()
  })
  .strict();

export type CreateTaskInput = z.infer<typeof CreateTaskDto>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskDto>;

// ─── Date helpers (kept next to the DTO since they bridge form ↔ API shapes) ───

// A `<input type="date">` yields `YYYY-MM-DD`; the API wants a full ISO datetime.
// We anchor it to midnight UTC so the calendar day is preserved regardless of the
// viewer's timezone (due dates are day-granular in this app).
export function dateInputToIso(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

// Today as `YYYY-MM-DD` (UTC) — the `min` for the due-date picker, so past days
// can't be chosen in the first place. The DTO refine is still the real guard.
export function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

// The inverse: an ISO string (or null) → the `YYYY-MM-DD` a date input expects.
export function isoToDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

// True when a task's due date is before today (UTC day) — drives the red flag.
export function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  const today = new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10) < today;
}

// Friendly short date for cards/rows, e.g. "15 Aug". Returns '' for no date.
export function formatDueDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  });
}
