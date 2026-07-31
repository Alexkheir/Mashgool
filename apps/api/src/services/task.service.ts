import { Prisma, type Task } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { writeAuditLog } from './audit.service';
import { generateTaskKey } from './task-key.service';
import type { CreateTaskInput, UpdateTaskInput, ListTasksQuery } from '../dtos/task.dto';

// A fixed page size for task lists (see Feature 9 "Pagination"). Kept server-side
// so the client can't ask for an unbounded page.
const PAGE_SIZE = 20;

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
  const where: Prisma.TaskWhereInput = { clientId };

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
    return tx.task.create({
      data: {
        clientId,
        taskKey,
        title: input.title,
        description: input.description ?? null,
        notes: input.notes ?? null,
        // Omit optionals when absent so the schema defaults (MEDIUM / TODO) apply.
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.status ? { status: input.status } : {}),
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
      priority: task.priority
    }
  });

  return toTaskResponse(task);
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput
): Promise<TaskResponse> {
  await findOwnedTaskOrThrow(userId, taskId);

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      // `null` clears the due date; a string sets it; `undefined` leaves it be.
      ...(input.dueDate !== undefined
        ? { dueDate: input.dueDate === null ? null : new Date(input.dueDate) }
        : {})
    }
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

  const task = await prisma.task.update({
    where: { id: taskId },
    data: { status }
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
