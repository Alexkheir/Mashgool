import { z } from 'zod';

// The API speaks the same uppercase enum values Prisma stores — no lowercase
// alias layer. The frontend keeps its own copy of these lists and maps them to
// display labels / colors (DTOs are duplicated per app — see CLAUDE.md).
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

// True when an ISO datetime's calendar day is today (UTC) or later. Due dates are
// day-granular and UTC-anchored throughout the app, so we compare date parts.
function isNotPast(iso: string): boolean {
  return iso.slice(0, 10) >= new Date().toISOString().slice(0, 10);
}

// An ISO-8601 datetime string with a timezone offset (the frontend sends UTC,
// e.g. `2026-08-15T00:00:00.000Z`). The service converts it to a Date; storing
// it nullable lets the user clear a previously-set due date. A due date is a
// deadline, so it may not be set to a day that has already passed — `null`
// (clearing it) still passes, since nullable short-circuits the refine.
const dueDate = z.iso
  .datetime({ offset: true })
  .refine(isNotPast, { message: 'Due date cannot be in the past' });

// `.strict()` rejects unknown keys outright (mass-assignment defence). `taskKey`,
// `status` and every server-owned field are intentionally uncreatable here — a
// new task's key is generated server-side and it always starts in TODO.
export const CreateTaskDto = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(500),
    description: z.string().trim().max(5000).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    // Board columns pre-set the status of tasks created from them (Feature 10),
    // so a create may carry an initial status; it defaults to TODO otherwise.
    status: z.enum(TASK_STATUSES).optional(),
    dueDate: dueDate.nullable().optional()
  })
  .strict();

// Every field optional — a PATCH touches only what it names. `taskKey` is absent
// on purpose (immutable, structurally uneditable). The refine blocks a no-op
// empty PATCH. `null` on a nullable field clears it; omitting it leaves it as-is.
export const UpdateTaskDto = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(500).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    dueDate: dueDate.nullable().optional()
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update'
  });

// The one-click status change (mark Done, or a board drop). Kept separate from
// the general PATCH so it maps to its own audit action (TASK_STATUS_CHANGED).
export const ChangeStatusDto = z
  .object({
    status: z.enum(TASK_STATUSES)
  })
  .strict();

// List query params arrive as strings, so page is coerced. Sort is limited to
// the three fields the spec allows; direction is optional and defaults per-field
// in the service. Not `.strict()` — unknown query params (e.g. a cache-buster)
// are ignored rather than rejected.
export const ListTasksQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  sortBy: z.enum(['dueDate', 'priority', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).optional()
});

export type CreateTaskInput = z.infer<typeof CreateTaskDto>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskDto>;
export type ChangeStatusInput = z.infer<typeof ChangeStatusDto>;
export type ListTasksQuery = z.infer<typeof ListTasksQueryDto>;
