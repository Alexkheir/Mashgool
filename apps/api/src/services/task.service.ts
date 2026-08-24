import { Prisma, type Task } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { utcDayStart } from '../lib/date';
import { AppError } from '../middleware/error.middleware';
import { writeAuditLog } from './audit.service';
import { generateTaskKey } from './task-key.service';
import {
  TASK_STATUSES,
  type CreateTaskInput,
  type UpdateTaskInput,
  type ListTasksQuery,
  type MoveTaskInput,
  type TaskFilters
} from '../dtos/task.dto';

// A fixed page size for task lists (see Feature 9 "Pagination"). Kept server-side
// so the client can't ask for an unbounded page.
const PAGE_SIZE = 20;

// The board is not paginated — columns scroll (Feature 10) — so each column is
// capped instead. Per-column rather than per-board, so one enormous To Do can't
// starve the other three columns of rows.
const BOARD_COLUMN_LIMIT = 200;

// The public shape of a task — an explicit whitelist. There are no secret columns
// on a task today, but keeping the surface explicit means a future internal field
// can't leak into responses by accident (the same discipline as ClientResponse).
export interface TaskResponse {
  id: string;
  clientId: string;
  taskKey: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: Task['status'];
  priority: Task['priority'];
  dueDate: Date | null;
  boardOrder: number;
  creationMethod: Task['creationMethod'];
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedTasks {
  tasks: TaskResponse[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// A board card carries its client alongside the task. The global board *needs*
// it (cards from every workspace share four columns, so each one must show which
// client it belongs to); the per-client board gets the same shape so both boards
// render from one card component and one type.
export interface BoardTask extends TaskResponse {
  client: { id: string; name: string; shortCode: string; color: string };
}

// Keyed by status rather than a flat list: the board renders four fixed columns,
// and an empty column must still appear (and accept drops), so the server states
// every column explicitly instead of leaving the client to infer missing ones.
export type BoardColumns = Record<Task['status'], BoardTask[]>;

// The client shape selected onto every board card.
const boardClientSelect = {
  select: { id: true, name: true, shortCode: true, color: true }
} as const;

type TaskWithClient = Task & { client: BoardTask['client'] };

function toTaskResponse(task: Task): TaskResponse {
  return {
    id: task.id,
    clientId: task.clientId,
    taskKey: task.taskKey,
    title: task.title,
    description: task.description,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    boardOrder: task.boardOrder,
    creationMethod: task.creationMethod,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function toBoardTask(task: TaskWithClient): BoardTask {
  return { ...toTaskResponse(task), client: task.client };
}

// Confirms the client exists AND belongs to the user before we touch its tasks.
// Critical for creates: generateTaskKey increments a counter by clientId without
// re-checking ownership, so a non-owned client must be turned away (404, never
// 403 — CLAUDE.md) before we ever reach it.
async function assertClientOwned(userId: string, clientId: string): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, userId },
    select: { id: true }
  });
  if (!client) {
    throw new AppError(404, 'Client not found');
  }
}

// Ownership of a task is transitive through its client. The relation filter
// `client: { userId }` scopes the lookup so another user's task is simply "not
// found" — we never confirm its existence with a 403.
async function findOwnedTaskOrThrow(userId: string, taskId: string): Promise<Task> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, client: { userId } }
  });
  if (!task) {
    throw new AppError(404, 'Task not found');
  }
  return task;
}

// ─── Filters (Feature 11) ────────────────────────────────────────────────────

// `due = today` is the single calendar day. `due = this week` is the *calendar*
// week containing today, Monday through Sunday — not "the next seven days".
// Deliberate: a task that was due on Monday is still part of this week's work on
// Thursday, and dropping it would hide exactly the tasks the user is chasing.
function dueRange(due: NonNullable<TaskFilters['due']>): { gte: Date; lt: Date } {
  if (due === 'today') {
    return { gte: utcDayStart(), lt: utcDayStart(1) };
  }
  // getUTCDay is 0=Sunday; shift so Monday is 0.
  const daysSinceMonday = (new Date().getUTCDay() + 6) % 7;
  return { gte: utcDayStart(-daysSinceMonday), lt: utcDayStart(7 - daysSinceMonday) };
}

// Turns parsed filters into a Prisma `where`, or undefined when nothing is set.
// Returned as a *separate* clause rather than merged into the caller's `where`:
// every caller composes with `AND`, so a status filter can sit alongside the
// board's per-column status without one silently overwriting the other.
export function buildFilterWhere(filters: TaskFilters): Prisma.TaskWhereInput | undefined {
  const clauses: Prisma.TaskWhereInput[] = [];

  // A key lookup is an exact match — it surfaces one task, not a search result.
  if (filters.taskKey) clauses.push({ taskKey: filters.taskKey });
  if (filters.status?.length) clauses.push({ status: { in: filters.status } });
  if (filters.priority?.length) clauses.push({ priority: { in: filters.priority } });
  if (filters.client) {
    clauses.push({ client: { name: { contains: filters.client, mode: 'insensitive' } } });
  }
  if (filters.due) clauses.push({ dueDate: dueRange(filters.due) });

  if (clauses.length === 0) return undefined;
  return { AND: clauses };
}

// Absent an explicit direction, each sort field has a sensible default:
// soonest-due first, highest-priority first, newest-created first.
function defaultOrder(sortBy: ListTasksQuery['sortBy']): 'asc' | 'desc' {
  return sortBy === 'dueDate' ? 'asc' : 'desc';
}

function buildOrderBy(
  sortBy: ListTasksQuery['sortBy'],
  order: 'asc' | 'desc'
): Prisma.TaskOrderByWithRelationInput[] {
  // Tasks with no due date always sort to the bottom regardless of direction,
  // then fall back to newest-first so the order is deterministic. Priority sorts
  // by the enum's declared order (LOW→URGENT), so `desc` puts URGENT on top.
  if (sortBy === 'dueDate') {
    return [{ dueDate: { sort: order, nulls: 'last' } }, { createdAt: 'desc' }];
  }
  if (sortBy === 'priority') {
    return [{ priority: order }, { createdAt: 'desc' }];
  }
  return [{ createdAt: order }];
}

export async function listTasks(
  userId: string,
  clientId: string,
  query: ListTasksQuery
): Promise<PaginatedTasks> {
  await assertClientOwned(userId, clientId);

  const { page, sortBy } = query;
  const order = query.order ?? defaultOrder(sortBy);
  const filterWhere = buildFilterWhere(query);
  // Composed with AND rather than spread, so a filter clause can never collide
  // with the ownership scope it is being added to.
  const where: Prisma.TaskWhereInput = {
    AND: [{ clientId }, ...(filterWhere ? [filterWhere] : [])]
  };

  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: buildOrderBy(sortBy, order),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    })
  ]);

  return {
    tasks: tasks.map(toTaskResponse),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE))
  };
}

// ─── Board ───────────────────────────────────────────────────────────────────

// Cards within a column are ordered by `boardOrder` (manual drag order, lower
// first), then newest-first as a stable tiebreak — which is also the order tasks
// that predate the board carry, since they all sit at the default 0.
const BOARD_ORDER: Prisma.TaskOrderByWithRelationInput[] = [
  { boardOrder: 'asc' },
  { createdAt: 'desc' }
];

// One query per column rather than one query grouped in memory: it applies
// BOARD_COLUMN_LIMIT per column (so a huge backlog can't crowd out Done) and
// each query rides the `(client_id, status)` index the schema declares for
// exactly this view.
async function fetchColumns(
  scope: Prisma.TaskWhereInput,
  filters: TaskFilters
): Promise<BoardColumns> {
  const filterWhere = buildFilterWhere(filters);

  const columns = await Promise.all(
    TASK_STATUSES.map((status) =>
      prisma.task.findMany({
        // AND, not a spread: a `status` *filter* and the column's own status are
        // two different conditions on the same field. Both must hold, which is
        // what keeps a filtered board spread across the correct columns — the
        // columns the filter excludes simply come back empty.
        where: { AND: [scope, { status }, ...(filterWhere ? [filterWhere] : [])] },
        orderBy: BOARD_ORDER,
        take: BOARD_COLUMN_LIMIT,
        include: { client: boardClientSelect }
      })
    )
  );

  return Object.fromEntries(
    TASK_STATUSES.map((status, i) => [status, columns[i]!.map(toBoardTask)])
  ) as BoardColumns;
}

// The per-client board: every task in one workspace, grouped into four columns.
export async function getClientBoard(
  userId: string,
  clientId: string,
  filters: TaskFilters
): Promise<BoardColumns> {
  await assertClientOwned(userId, clientId);
  return fetchColumns({ clientId }, filters);
}

// The global board: the same four columns across every *active* workspace.
// Archived clients are excluded — an archived workspace is out of sight on the
// dashboard, so its tasks shouldn't reappear on the board next to live work.
export async function getGlobalBoard(
  userId: string,
  filters: TaskFilters
): Promise<BoardColumns> {
  return fetchColumns({ client: { userId, isArchived: false } }, filters);
}

// A drag-and-drop drop: move a task into `status` at `position` within that
// column. Both the column change and the reordering happen in one transaction so
// the board never observes a half-applied move.
//
// The whole destination column is renumbered 0..n-1 rather than nudging
// neighbours or leaving fractional gaps. Columns are bounded (BOARD_COLUMN_LIMIT)
// and a drag is a human-speed action, so the cost is irrelevant — and it keeps
// `boardOrder` values dense and self-healing: any drift from a past concurrent
// move is corrected the next time that column is touched.
export async function moveTask(
  userId: string,
  taskId: string,
  input: MoveTaskInput
): Promise<TaskResponse> {
  const existing = await findOwnedTaskOrThrow(userId, taskId);
  const { status, position } = input;

  const moved = await prisma.$transaction(async (tx) => {
    // The destination column as it will look *without* the moved card, so the
    // requested index lines up with what the user saw while dragging.
    const others = await tx.task.findMany({
      where: { clientId: existing.clientId, status, id: { not: taskId } },
      orderBy: BOARD_ORDER,
      select: { id: true, boardOrder: true }
    });

    // A drop past the end of a column (or a stale index) appends rather than 400s.
    const index = Math.min(position, others.length);
    const ordered = [
      ...others.slice(0, index).map((t) => t.id),
      taskId,
      ...others.slice(index).map((t) => t.id)
    ];

    let result: Task | undefined;
    // Sequential, not Promise.all: an interactive transaction runs on a single
    // connection, so parallel writes on `tx` would contend for it.
    for (const [order, id] of ordered.entries()) {
      if (id === taskId) {
        result = await tx.task.update({
          where: { id },
          data: { boardOrder: order, status }
        });
        continue;
      }
      // Skip rows already sitting at the right index — the common case is a
      // short move, so most of the column doesn't need writing at all.
      const current = others.find((t) => t.id === id);
      if (current?.boardOrder === order) continue;
      await tx.task.update({ where: { id }, data: { boardOrder: order } });
    }

    return result!;
  });

  // Only a column change is audit-worthy. Reordering cards inside a column is
  // presentation, not a change to the work, and logging every nudge would bury
  // the entries that matter.
  if (existing.status !== status) {
    writeAuditLog({
      userId,
      action: 'TASK_STATUS_CHANGED',
      entityType: 'TASK',
      entityId: moved.id,
      description: `Task ${moved.taskKey} moved ${existing.status} → ${status}`,
      metadata: { taskKey: moved.taskKey, from: existing.status, to: status, via: 'board' }
    });
  }

  return toTaskResponse(moved);
}

export async function getTask(userId: string, taskId: string): Promise<TaskResponse> {
  return toTaskResponse(await findOwnedTaskOrThrow(userId, taskId));
}

export async function createTask(
  userId: string,
  clientId: string,
  input: CreateTaskInput
): Promise<TaskResponse> {
  await assertClientOwned(userId, clientId);

  // Key generation (atomic counter increment) and the insert share one
  // transaction: if the insert fails, the counter rolls back so no number is
  // burned. The row-lock the increment takes also serialises concurrent creates
  // for this client, guaranteeing unique keys.
  const task = await prisma.$transaction(async (tx) => {
    const taskKey = await generateTaskKey(tx, clientId);

    // A new card lands at the bottom of its column on the board. The column is
    // whichever status the task starts in — TODO normally, or the column's own
    // status when it was created from a board "+" button.
    const status = input.status ?? 'TODO';
    const { _max } = await tx.task.aggregate({
      where: { clientId, status },
      _max: { boardOrder: true }
    });

    return tx.task.create({
      data: {
        clientId,
        taskKey,
        title: input.title,
        description: input.description ?? null,
        notes: input.notes ?? null,
        boardOrder: (_max.boardOrder ?? -1) + 1,
        // Omit optionals when absent so the schema defaults (MEDIUM / TODO /
        // MANUAL) apply.
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.creationMethod ? { creationMethod: input.creationMethod } : {}),
        dueDate: input.dueDate ? new Date(input.dueDate) : null
      }
    });
  });

  writeAuditLog({
    userId,
    action: 'TASK_CREATED',
    entityType: 'TASK',
    entityId: task.id,
    description: `Created task ${task.taskKey}: "${task.title}"`,
    metadata: {
      taskKey: task.taskKey,
      clientId,
      status: task.status,
      priority: task.priority,
      // Feature 17's audit UI reads this to distinguish typed tasks from
      // AI-extracted ones without joining back to the task row.
      creationMethod: task.creationMethod
    }
  });

  return toTaskResponse(task);
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput
): Promise<TaskResponse> {
  const existing = await findOwnedTaskOrThrow(userId, taskId);

  // Editing the status moves the card between board columns, so — as with the
  // one-click and drag paths — it takes a fresh position at the bottom of the
  // destination rather than keeping its old column's index.
  const movesColumn = input.status !== undefined && input.status !== existing.status;

  const task = await prisma.$transaction(async (tx) => {
    let boardOrder: number | undefined;
    if (movesColumn) {
      const { _max } = await tx.task.aggregate({
        where: { clientId: existing.clientId, status: input.status },
        _max: { boardOrder: true }
      });
      boardOrder = (_max.boardOrder ?? -1) + 1;
    }

    return tx.task.update({
      where: { id: taskId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(boardOrder !== undefined ? { boardOrder } : {}),
        // `null` clears the due date; a string sets it; `undefined` leaves it be.
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate === null ? null : new Date(input.dueDate) }
          : {})
      }
    });
  });

  writeAuditLog({
    userId,
    action: 'TASK_UPDATED',
    entityType: 'TASK',
    entityId: task.id,
    description: `Updated task ${task.taskKey}`,
    metadata: { taskKey: task.taskKey, fields: Object.keys(input) }
  });

  return toTaskResponse(task);
}

// The one-click status change (mark Done, or later a board drop). Separate from
// updateTask so it lands its own audit action and can be a no-op when unchanged.
export async function changeTaskStatus(
  userId: string,
  taskId: string,
  status: Task['status']
): Promise<TaskResponse> {
  const existing = await findOwnedTaskOrThrow(userId, taskId);
  if (existing.status === status) {
    return toTaskResponse(existing); // idempotent — nothing changed
  }

  // Changing status also changes which board column the card lives in, so it
  // takes a position at the bottom of the destination — otherwise it would keep
  // the `boardOrder` it held in its old column and land somewhere arbitrary.
  const task = await prisma.$transaction(async (tx) => {
    const { _max } = await tx.task.aggregate({
      where: { clientId: existing.clientId, status },
      _max: { boardOrder: true }
    });
    return tx.task.update({
      where: { id: taskId },
      data: { status, boardOrder: (_max.boardOrder ?? -1) + 1 }
    });
  });

  writeAuditLog({
    userId,
    action: 'TASK_STATUS_CHANGED',
    entityType: 'TASK',
    entityId: task.id,
    description: `Task ${task.taskKey} moved ${existing.status} → ${status}`,
    metadata: { taskKey: task.taskKey, from: existing.status, to: status }
  });

  return toTaskResponse(task);
}

// Permanent. The task's key is retired but never reused: the client's counter
// only ever increments, so the gap the deleted number leaves is never refilled.
export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const existing = await findOwnedTaskOrThrow(userId, taskId);

  await prisma.task.delete({ where: { id: taskId } });

  writeAuditLog({
    userId,
    action: 'TASK_DELETED',
    entityType: 'TASK',
    entityId: existing.id,
    description: `Deleted task ${existing.taskKey}: "${existing.title}"`,
    metadata: { taskKey: existing.taskKey, clientId: existing.clientId }
  });
}
