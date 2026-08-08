import { describe, it, expect, vi, beforeEach } from 'vitest';

// Drive Prisma, the audit writer, and the task-key generator entirely through
// mocks — no DB, no side effects. `$transaction` hands its callback a tx client
// backed by the *same* task mocks as the top-level client, so an assertion reads
// the same whether the service ran the query inside a transaction or outside it.
const {
  mockClientFindFirst,
  mockTaskFindFirst,
  mockTaskFindMany,
  mockTaskCount,
  mockTaskCreate,
  mockTaskUpdate,
  mockTaskDelete,
  mockTaskAggregate
} = vi.hoisted(() => ({
  mockClientFindFirst: vi.fn(),
  mockTaskFindFirst: vi.fn(),
  mockTaskFindMany: vi.fn(),
  mockTaskCount: vi.fn(),
  mockTaskCreate: vi.fn(),
  mockTaskUpdate: vi.fn(),
  mockTaskDelete: vi.fn(),
  mockTaskAggregate: vi.fn()
}));
const mockWriteAuditLog = vi.hoisted(() => vi.fn());
const mockGenerateTaskKey = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => {
  const task = {
    findFirst: mockTaskFindFirst,
    findMany: mockTaskFindMany,
    count: mockTaskCount,
    create: mockTaskCreate,
    update: mockTaskUpdate,
    delete: mockTaskDelete,
    aggregate: mockTaskAggregate
  };
  return {
    prisma: {
      client: { findFirst: mockClientFindFirst },
      task,
      $transaction: (fn: (tx: unknown) => unknown) => Promise.resolve(fn({ task }))
    }
  };
});

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
  // Every write path that places a card in a column asks for the column's
  // current max boardOrder; default to an empty column unless a test says else.
  mockTaskAggregate.mockResolvedValue({ _max: { boardOrder: null } });
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
      expect.objectContaining({ where: { AND: [{ clientId: CLIENT }] }, skip: 20, take: 20 })
    );
    expect(result).toMatchObject({ page: 2, pageSize: 20, total: 23, totalPages: 2 });
    expect(result.tasks).toHaveLength(1);
  });

  it('applies filters to the list as well as the board', async () => {
    mockClientFindFirst.mockResolvedValue({ id: CLIENT });
    mockTaskCount.mockResolvedValue(1);
    mockTaskFindMany.mockResolvedValue([fakeTask()]);

    await taskService.listTasks(USER, CLIENT, {
      page: 1,
      sortBy: 'createdAt',
      priority: ['URGENT', 'HIGH']
    });

    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ clientId: CLIENT }, { AND: [{ priority: { in: ['URGENT', 'HIGH'] } }] }]
        }
      })
    );
    // The count must see the same filter, or pagination lies about the total.
    expect(mockTaskCount).toHaveBeenCalledWith({
      where: { AND: [{ clientId: CLIENT }, { AND: [{ priority: { in: ['URGENT', 'HIGH'] } }] }] }
    });
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

    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'DONE', boardOrder: 0 }
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TASK_STATUS_CHANGED',
        metadata: expect.objectContaining({ from: 'TODO', to: 'DONE' })
      })
    );
  });

  it('appends the card to the bottom of the destination column', async () => {
    mockTaskFindFirst.mockResolvedValue(fakeTask({ status: 'TODO' }));
    mockTaskAggregate.mockResolvedValue({ _max: { boardOrder: 4 } });
    mockTaskUpdate.mockResolvedValue(fakeTask({ status: 'DONE' }));

    await taskService.changeTaskStatus(USER, 't1', 'DONE');

    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'DONE', boardOrder: 5 }
    });
  });
});

describe('buildFilterWhere', () => {
  it('returns undefined when nothing is filtered', () => {
    expect(taskService.buildFilterWhere({})).toBeUndefined();
  });

  it('ANDs every active filter together', () => {
    const where = taskService.buildFilterWhere({
      status: ['TODO', 'BLOCKED'],
      priority: ['URGENT'],
      client: 'brand'
    });

    expect(where).toEqual({
      AND: [
        { status: { in: ['TODO', 'BLOCKED'] } },
        { priority: { in: ['URGENT'] } },
        { client: { name: { contains: 'brand', mode: 'insensitive' } } }
      ]
    });
  });

  it('matches a task key exactly, not as a search', () => {
    expect(taskService.buildFilterWhere({ taskKey: 'BS-12' })).toEqual({
      AND: [{ taskKey: 'BS-12' }]
    });
  });

  it('scopes due=today to a single UTC day', () => {
    const where = taskService.buildFilterWhere({ due: 'today' });
    const range = (where!.AND as Array<{ dueDate: { gte: Date; lt: Date } }>)[0]!.dueDate;

    expect(range.gte.toISOString()).toBe(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    expect(range.lt.getTime() - range.gte.getTime()).toBe(86_400_000);
  });

  it('scopes due=this-week to the Monday–Sunday week containing today', () => {
    const where = taskService.buildFilterWhere({ due: 'this-week' });
    const range = (where!.AND as Array<{ dueDate: { gte: Date; lt: Date } }>)[0]!.dueDate;

    expect(range.lt.getTime() - range.gte.getTime()).toBe(7 * 86_400_000);
    expect(range.gte.getUTCDay()).toBe(1); // starts on a Monday
    // Today falls inside the window — including earlier days of this week, which
    // is deliberate (they're still this week's work).
    expect(range.gte.getTime()).toBeLessThanOrEqual(Date.now());
    expect(range.lt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('getClientBoard / getGlobalBoard', () => {
  it('returns all four columns, empty ones included', async () => {
    mockClientFindFirst.mockResolvedValue({ id: CLIENT });
    mockTaskFindMany.mockResolvedValue([]);

    const columns = await taskService.getClientBoard(USER, CLIENT, {});

    expect(Object.keys(columns).sort()).toEqual(
      ['BLOCKED', 'DONE', 'IN_PROGRESS', 'TODO'].sort()
    );
    expect(columns.TODO).toEqual([]);
    // One query per column, each capped and ordered by manual board order.
    expect(mockTaskFindMany).toHaveBeenCalledTimes(4);
    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ boardOrder: 'asc' }, { createdAt: 'desc' }],
        take: 200
      })
    );
  });

  it('attaches the owning client to every card', async () => {
    mockClientFindFirst.mockResolvedValue({ id: CLIENT });
    const client = { id: CLIENT, name: 'Brand Studio', shortCode: 'BS', color: '#4A90D9' };
    mockTaskFindMany.mockResolvedValue([{ ...fakeTask(), client }]);

    const columns = await taskService.getClientBoard(USER, CLIENT, {});

    expect(columns.TODO[0]).toMatchObject({ taskKey: 'BS-1', client });
  });

  it('returns 404 for a client the user does not own', async () => {
    mockClientFindFirst.mockResolvedValue(null);
    await expect(taskService.getClientBoard(USER, 'other', {})).rejects.toMatchObject({
      statusCode: 404
    });
    expect(mockTaskFindMany).not.toHaveBeenCalled();
  });

  it('scopes the global board to the user and skips archived workspaces', async () => {
    mockTaskFindMany.mockResolvedValue([]);

    await taskService.getGlobalBoard(USER, {});

    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ client: { userId: USER, isArchived: false } }, { status: 'TODO' }] }
      })
    );
  });

  it('ANDs a status filter with each column, leaving excluded columns empty', async () => {
    mockClientFindFirst.mockResolvedValue({ id: CLIENT });
    mockTaskFindMany.mockResolvedValue([]);

    await taskService.getClientBoard(USER, CLIENT, { status: ['BLOCKED'] });

    // The DONE column still runs, with both conditions — so it returns nothing
    // rather than being dropped from the board.
    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { clientId: CLIENT },
            { status: 'DONE' },
            { AND: [{ status: { in: ['BLOCKED'] } }] }
          ]
        }
      })
    );
  });
});

describe('moveTask', () => {
  it('inserts the card at the requested index and renumbers the column', async () => {
    mockTaskFindFirst.mockResolvedValue(fakeTask({ status: 'TODO' }));
    // Destination column without the moved card: a, b, c at 0, 1, 2.
    mockTaskFindMany.mockResolvedValue([
      { id: 'a', boardOrder: 0 },
      { id: 'b', boardOrder: 1 },
      { id: 'c', boardOrder: 2 }
    ]);
    mockTaskUpdate.mockResolvedValue(fakeTask({ status: 'IN_PROGRESS', boardOrder: 1 }));

    await taskService.moveTask(USER, 't1', { status: 'IN_PROGRESS', position: 1 });

    // 'a' already sits at index 0, so it is left alone; t1 takes 1 (plus the new
    // status), pushing b → 2 and c → 3.
    expect(mockTaskUpdate).toHaveBeenCalledTimes(3);
    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { boardOrder: 1, status: 'IN_PROGRESS' }
    });
    expect(mockTaskUpdate).toHaveBeenCalledWith({ where: { id: 'b' }, data: { boardOrder: 2 } });
    expect(mockTaskUpdate).toHaveBeenCalledWith({ where: { id: 'c' }, data: { boardOrder: 3 } });
  });

  it('excludes the moved card from the destination column it is reordering within', async () => {
    mockTaskFindFirst.mockResolvedValue(fakeTask({ status: 'TODO' }));
    mockTaskFindMany.mockResolvedValue([]);
    mockTaskUpdate.mockResolvedValue(fakeTask());

    await taskService.moveTask(USER, 't1', { status: 'TODO', position: 0 });

    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: CLIENT, status: 'TODO', id: { not: 't1' } }
      })
    );
  });

  it('clamps a position past the end of the column instead of failing', async () => {
    mockTaskFindFirst.mockResolvedValue(fakeTask({ status: 'TODO' }));
    mockTaskFindMany.mockResolvedValue([{ id: 'a', boardOrder: 0 }]);
    mockTaskUpdate.mockResolvedValue(fakeTask({ status: 'DONE' }));

    await taskService.moveTask(USER, 't1', { status: 'DONE', position: 99 });

    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { boardOrder: 1, status: 'DONE' }
    });
  });

  it('audits a column change but stays silent on a same-column reorder', async () => {
    mockTaskFindFirst.mockResolvedValue(fakeTask({ status: 'TODO' }));
    mockTaskFindMany.mockResolvedValue([]);
    mockTaskUpdate.mockResolvedValue(fakeTask({ status: 'TODO' }));

    await taskService.moveTask(USER, 't1', { status: 'TODO', position: 0 });
    expect(mockWriteAuditLog).not.toHaveBeenCalled();

    mockTaskUpdate.mockResolvedValue(fakeTask({ status: 'BLOCKED' }));
    await taskService.moveTask(USER, 't1', { status: 'BLOCKED', position: 0 });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TASK_STATUS_CHANGED',
        metadata: expect.objectContaining({ from: 'TODO', to: 'BLOCKED', via: 'board' })
      })
    );
  });

  it('returns 404 and never writes when the task is not owned', async () => {
    mockTaskFindFirst.mockResolvedValue(null);
    await expect(
      taskService.moveTask(USER, 't1', { status: 'DONE', position: 0 })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
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
