import { z } from 'zod';

// The API speaks the same uppercase enum values Prisma stores — no lowercase
// alias layer. The frontend keeps its own copy of these lists and maps them to
// display labels / colors (DTOs are duplicated per app — see CLAUDE.md).
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const CREATION_METHODS = ['MANUAL', 'PASTE_TO_TASK', 'VOICE_TO_TASK'] as const;

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
    dueDate: dueDate.nullable().optional(),
    // How this task came to exist — manual form, paste-to-task, voice-to-task.
    // Client-supplied, unlike every other server-owned field, because the review
    // step of the AI flows saves through this same endpoint: the user edits the
    // extraction and then creates an ordinary task from it, so nothing on the
    // server still knows the text was extracted rather than typed.
    //
    // Safe to accept because it is *provenance, not authority*: it grants no
    // access, gates no behaviour, and is only ever read as a label on the task
    // and in the audit trail. A client that lies mislabels its own task.
    creationMethod: z.enum(CREATION_METHODS).optional()
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

// The one-click status change (mark Done). Kept separate from the general PATCH
// so it maps to its own audit action (TASK_STATUS_CHANGED).
export const ChangeStatusDto = z
  .object({
    status: z.enum(TASK_STATUSES)
  })
  .strict();

// A board drag-and-drop (Feature 10). One drop expresses *both* facts at once —
// which column the card landed in and where in that column — so they travel in a
// single request and are applied in one transaction. `position` is the 0-based
// index the card should occupy in the destination column *after* the move; the
// service clamps it to the column's length, so an out-of-range index appends
// rather than failing (a drop is a gesture, not a precise coordinate).
export const MoveTaskDto = z
  .object({
    status: z.enum(TASK_STATUSES),
    position: z.number().int().min(0)
  })
  .strict();

// ─── Filters (Feature 11) ────────────────────────────────────────────────────
//
// The filter bar's parsed query arrives as ordinary query params. An *absent*
// param and an *empty* one mean the same thing — no filter — so empty strings
// are normalised away before validation rather than failing as "not one of the
// allowed values".
function optionalParam<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

// Multi-value filters travel comma-separated (`status=TODO,BLOCKED`) because a
// query string has no native list type. Values are upper-cased first so the bar
// can accept the lowercase spellings the spec uses (`status = blocked`).
function csvEnum<T extends readonly [string, ...string[]]>(values: T) {
  return optionalParam(
    z
      .string()
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      )
      .pipe(z.array(z.enum(values)).min(1))
  );
}

// `SHORTCODE-N`, case-insensitive. The short code is 2–5 letters *or digits*
// (see client.dto.ts) — the tech-spec sample's `[A-Z]{2,5}` would reject the
// perfectly legal code `A1`.
export const TASK_KEY_PATTERN = /^[A-Z0-9]{2,5}-\d+$/i;

// The filter fields shared by the list and both boards, so one filter bar drives
// every view and there is a single definition of what a filter may contain.
const taskFilterFields = {
  // Partial, case-insensitive match on the client's name (spec: "partial match
  // supported"). Only meaningful on the global board, but harmless elsewhere.
  client: optionalParam(z.string().trim().min(1).max(100)),
  status: csvEnum(TASK_STATUSES),
  priority: csvEnum(TASK_PRIORITIES),
  due: optionalParam(z.enum(['today', 'this-week'])),
  // An exact task-key lookup. Normalised to upper case so `bs-12` finds `BS-12`.
  taskKey: optionalParam(
    z
      .string()
      .trim()
      .regex(TASK_KEY_PATTERN, 'Not a valid task key')
      .transform((v) => v.toUpperCase())
  )
};

// List query params arrive as strings, so page is coerced. Sort is limited to
// the three fields the spec allows; direction is optional and defaults per-field
// in the service. Not `.strict()` — unknown query params (e.g. a cache-buster)
// are ignored rather than rejected.
export const ListTasksQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  sortBy: z.enum(['dueDate', 'priority', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).optional(),
  ...taskFilterFields
});

// The board takes the same filters but none of the list's paging/sorting — its
// shape is fixed (four columns, manual order).
export const BoardQueryDto = z.object(taskFilterFields);

export type CreateTaskInput = z.infer<typeof CreateTaskDto>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskDto>;
export type ChangeStatusInput = z.infer<typeof ChangeStatusDto>;
export type MoveTaskInput = z.infer<typeof MoveTaskDto>;
export type ListTasksQuery = z.infer<typeof ListTasksQueryDto>;
export type TaskFilters = z.infer<typeof BoardQueryDto>;
