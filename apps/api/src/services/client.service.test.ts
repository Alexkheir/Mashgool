import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// Drive Prisma and the audit writer entirely through mocks — no DB, no side
// effects. The real `Prisma` namespace is still imported so we can construct a
// genuine PrismaClientKnownRequestError the service's `instanceof` check accepts.
const { mockFindFirst, mockFindMany, mockCreate, mockUpdate, mockDelete, mockTaskGroupBy } =
  vi.hoisted(() => ({
    mockFindFirst: vi.fn(),
    mockFindMany: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockDelete: vi.fn(),
    mockTaskGroupBy: vi.fn()
  }));
const mockWriteAuditLog = vi.hoisted(() => vi.fn());

// `task.groupBy` backs the stats the read endpoints attach (Feature 12); the
// stats service itself is exercised in stats.service.test.ts.
vi.mock('../lib/prisma', () => ({
  prisma: {
    client: {
      findFirst: mockFindFirst,
      findMany: mockFindMany,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete
    },
    task: { groupBy: mockTaskGroupBy }
  }
}));

vi.mock('./audit.service', () => ({ writeAuditLog: mockWriteAuditLog }));

import * as clientService from './client.service';

const USER = 'user-1';

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    userId: USER,
    name: 'Brand Studio',
    shortCode: 'BS',
    description: null,
    color: '#4A90D9',
    isArchived: false,
    taskCounter: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides
  };
}

function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no tasks anywhere, so stats come back zeroed unless a test says else.
  mockTaskGroupBy.mockResolvedValue([]);
});

describe('createClient', () => {
  it('creates a client and returns only whitelisted fields', async () => {
    mockCreate.mockResolvedValue(fakeClient());

    const result = await clientService.createClient(USER, {
      name: 'Brand Studio',
      shortCode: 'BS'
    });

    // Internal columns must never leak to the API surface.
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('taskCounter');
    expect(result).toMatchObject({ id: 'c1', shortCode: 'BS', color: '#4A90D9' });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLIENT_CREATED', entityId: 'c1' })
    );
  });

  it('omits color so the DB default applies when none is given', async () => {
    mockCreate.mockResolvedValue(fakeClient());
    await clientService.createClient(USER, { name: 'Brand Studio', shortCode: 'BS' });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ color: expect.anything() })
    });
  });

  it('maps a duplicate name to a 409', async () => {
    mockCreate.mockRejectedValue(p2002(['user_id', 'name']));
    await expect(
      clientService.createClient(USER, { name: 'Brand Studio', shortCode: 'BS' })
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('name') });
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it('maps a duplicate short code to a 409 naming the code', async () => {
    mockCreate.mockRejectedValue(p2002(['user_id', 'short_code']));
    await expect(
      clientService.createClient(USER, { name: 'Brand Studio', shortCode: 'BS' })
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('BS') });
  });
});

describe('getClient / ownership scoping', () => {
  it('returns 404 when the client is not owned by the user', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(clientService.getClient(USER, 'other')).rejects.toMatchObject({
      statusCode: 404
    });
  });

  it('scopes findFirst to both id and userId', async () => {
    mockFindFirst.mockResolvedValue(fakeClient());
    await clientService.getClient(USER, 'c1');
    expect(mockFindFirst).toHaveBeenCalledWith({ where: { id: 'c1', userId: USER } });
  });
});

describe('listClients', () => {
  it('lists only the user\'s active (non-archived) clients', async () => {
    mockFindMany.mockResolvedValue([fakeClient()]);
    await clientService.listClients(USER);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER, isArchived: false } })
    );
  });

  it('attaches task stats to every client in the list', async () => {
    mockFindMany.mockResolvedValue([fakeClient()]);
    mockTaskGroupBy
      // status breakdown
      .mockResolvedValueOnce([
        { clientId: 'c1', status: 'TODO', _count: { _all: 3 } },
        { clientId: 'c1', status: 'DONE', _count: { _all: 1 } }
      ])
      // overdue
      .mockResolvedValueOnce([{ clientId: 'c1', _count: { _all: 2 } }]);

    const [client] = await clientService.listClients(USER);

    expect(client!.stats).toMatchObject({
      total: 4,
      open: 3,
      done: 1,
      overdue: 2,
      progress: 25
    });
    expect(client!.stats.byStatus).toEqual({
      TODO: 3,
      IN_PROGRESS: 0,
      DONE: 1,
      BLOCKED: 0
    });
  });

  it('zeroes stats for a client with no tasks rather than omitting them', async () => {
    mockFindMany.mockResolvedValue([fakeClient()]);
    const [client] = await clientService.listClients(USER);
    expect(client!.stats).toMatchObject({ total: 0, open: 0, overdue: 0, progress: 0 });
  });
});

describe('updateClient', () => {
  it('rejects with 404 before touching update when not owned', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      clientService.updateClient(USER, 'c1', { name: 'New' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('maps a rename collision to a 409', async () => {
    mockFindFirst.mockResolvedValue(fakeClient());
    mockUpdate.mockRejectedValue(p2002(['user_id', 'name']));
    await expect(
      clientService.updateClient(USER, 'c1', { name: 'Taken' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('archiveClient', () => {
  it('is idempotent — does not update an already-archived client', async () => {
    mockFindFirst.mockResolvedValue(fakeClient({ isArchived: true }));
    const result = await clientService.archiveClient(USER, 'c1');
    expect(result.isArchived).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('archives an active client and writes an audit entry', async () => {
    mockFindFirst.mockResolvedValue(fakeClient({ isArchived: false }));
    mockUpdate.mockResolvedValue(fakeClient({ isArchived: true }));
    await clientService.archiveClient(USER, 'c1');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { isArchived: true }
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLIENT_ARCHIVED' })
    );
  });
});

describe('deleteClient', () => {
  it('deletes an owned client and logs it', async () => {
    mockFindFirst.mockResolvedValue(fakeClient());
    mockDelete.mockResolvedValue(fakeClient());
    await clientService.deleteClient(USER, 'c1');
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLIENT_DELETED' })
    );
  });

  it('returns 404 and never deletes when not owned', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(clientService.deleteClient(USER, 'c1')).rejects.toMatchObject({
      statusCode: 404
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
