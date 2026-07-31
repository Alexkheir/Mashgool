import { describe, it, expect, vi, beforeEach } from 'vitest';

// Drive Prisma, the audit writer, and the task-key generator entirely through
// mocks — no DB, no side effects. `$transaction` is stubbed to invoke its
// callback with a tx object exposing the one method createTask uses.
const {
  mockClientFindFirst,
  mockTaskFindFirst,
  mockTaskFindMany,
  mockTaskCount,
  mockTaskCreate,
  mockTaskUpdate,
  mockTaskDelete
} = vi.hoisted(() => ({
  mockClientFindFirst: vi.fn(),
  mockTaskFindFirst: vi.fn(),
  mockTaskFindMany: vi.fn(),
  mockTaskCount: vi.fn(),
  mockTaskCreate: vi.fn(),
  mockTaskUpdate: vi.fn(),
  mockTaskDelete: vi.fn()
}));
const mockWriteAuditLog = vi.hoisted(() => vi.fn());
const mockGenerateTaskKey = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({
  prisma: {
    client: { findFirst: mockClientFindFirst },
    task: {
      findFirst: mockTaskFindFirst,
      findMany: mockTaskFindMany,
      count: mockTaskCount,
      update: mockTaskUpdate,
      delete: mockTaskDelete
    },
    // Interactive transaction: hand the callback a tx that can create a task.
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn({ task: { create: mockTaskCreate } }))
  }
}));

vi.mock('./audit.service', () => ({ writeAuditLog: mockWriteAuditLog }));
vi.mock('./task-key.service', () => ({ generateTaskKey: mockGenerateTaskKey }));

import * as taskService from './task.service';

const USER = 'user-1';
const CLIENT = 'c1';

function fakeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    clientId: CLIENT,
    taskKey: 'BS-1',
    title: 'Design the logo',
    description: null,
    notes: null,
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate: null,
    boardOrder: 0,
    creationMethod: 'MANUAL',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTask', () => {
  it('generates a key inside the transaction and writes an audit entry', async () => {
    mockClientFindFirst.mockResolvedValue({ id: CLIENT });
    mockGenerateTaskKey.mockResolvedValue('BS-1');
    mockTaskCreate.mockResolvedValue(fakeTask());

    const result = await taskService.createTask(USER, CLIENT, { title: 'Design the logo' });

    expect(mockGenerateTaskKey).toHaveBeenCalledWith(
      expect.anything(), // the tx client
      CLIENT
    );
    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ taskKey: 'BS-1', clientId: CLIENT }) })
    );
    expect(result).toMatchObject({ taskKey: 'BS-1', status: 'TODO' });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TASK_CREATED', entityId: 't1' })
    );
  });

  it('omits priority/status when absent so the schema defaults apply', async () => {
    mockClientFindFirst.mockResolvedValue({ id: CLIENT });
    mockGenerateTaskKey.mockResolvedValue('BS-1');
    mockTaskCreate.mockResolvedValue(fakeTask());

    await taskService.createTask(USER, CLIENT, { title: 'x' });

    const data = mockTaskCreate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('priority');
    expect(data).not.toHaveProperty('status');
  });

  it('rejects with 404 and never generates a key when the client is not owned', async () => {
    mockClientFindFirst.mockResolvedValue(null);

    await expect(
      taskService.createTask(USER, 'other', { title: 'x' })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(mockGenerateTaskKey).not.toHaveBeenCalled();
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });
});

describe('listTasks', () => {
  it('scopes ownership, paginates, and reports totals', async () => {
    mockClientFindFirst.mockResolvedValue({ id: CLIENT });
    mockTaskCount.mockResolvedValue(23);
    mockTaskFindMany.mockResolvedValue([fakeTask()]);

    const result = await taskService.listTasks(USER, CLIENT, {
      page: 2,
      sortBy: 'createdAt'
    });

    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: CLIENT }, skip: 20, take: 20 })
    );
    expect(result).toMatchObject({ page: 2, pageSize: 20, total: 23, totalPages: 2 });
    expect(result.tasks).toHaveLength(1);
  });

  it('sorts due dates ascending with nulls last by default', async () => {
    mockClientFindFirst.mockResolvedValue({ id: CLIENT });
    mockTaskCount.mockResolvedValue(0);
    mockTaskFindMany.mockResolvedValue([]);

    await taskService.listTasks(USER, CLIENT, { page: 1, sortBy: 'dueDate' });

    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }]
      })
    );
  });

  it('returns 404 when the client is not owned', async () => {
    mockClientFindFirst.mockResolvedValue(null);
    await expect(
      taskService.listTasks(USER, 'other', { page: 1, sortBy: 'createdAt' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockTaskFindMany).not.toHaveBeenCalled();
  });
});

describe('getTask / ownership scoping', () => {
  it('looks a task up through its client relation', async () => {
    mockTaskFindFirst.mockResolvedValue(fakeTask());
    await taskService.getTask(USER, 't1');
    expect(mockTaskFindFirst).toHaveBeenCalledWith({
      where: { id: 't1', client: { userId: USER } }
    });
  });

  it('returns 404 for a task the user does not own', async () => {
    mockTaskFindFirst.mockResolvedValue(null);
    await expect(taskService.getTask(USER, 't1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateTask', () => {
  it('rejects with 404 before touching update when not owned', async () => {
    mockTaskFindFirst.mockResolvedValue(null);
    await expect(
      taskService.updateTask(USER, 't1', { title: 'New' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it('clears the due date when passed null and logs the changed fields', async () => {
    mockTaskFindFirst.mockResolvedValue(fakeTask());
    mockTaskUpdate.mockResolvedValue(fakeTask());

    await taskService.updateTask(USER, 't1', { dueDate: null });

    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { dueDate: null }
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TASK_UPDATED' })
    );
  });
});

describe('changeTaskStatus', () => {
  it('is a no-op (no write) when the status is unchanged', async () => {
    mockTaskFindFirst.mockResolvedValue(fakeTask({ status: 'DONE' }));
    const result = await taskService.changeTaskStatus(USER, 't1', 'DONE');
    expect(result.status).toBe('DONE');
    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it('updates and logs a real status change with from/to', async () => {
    mockTaskFindFirst.mockResolvedValue(fakeTask({ status: 'TODO' }));
    mockTaskUpdate.mockResolvedValue(fakeTask({ status: 'DONE' }));

    await taskService.changeTaskStatus(USER, 't1', 'DONE');

    expect(mockTaskUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'DONE' } });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TASK_STATUS_CHANGED',
        metadata: expect.objectContaining({ from: 'TODO', to: 'DONE' })
      })
    );
  });
});

describe('deleteTask', () => {
  it('deletes an owned task and logs it', async () => {
    mockTaskFindFirst.mockResolvedValue(fakeTask());
    mockTaskDelete.mockResolvedValue(fakeTask());
    await taskService.deleteTask(USER, 't1');
    expect(mockTaskDelete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TASK_DELETED' })
    );
  });

  it('returns 404 and never deletes when not owned', async () => {
    mockTaskFindFirst.mockResolvedValue(null);
    await expect(taskService.deleteTask(USER, 't1')).rejects.toMatchObject({ statusCode: 404 });
    expect(mockTaskDelete).not.toHaveBeenCalled();
  });
});
