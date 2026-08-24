import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGroupBy = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({
  prisma: { task: { groupBy: mockGroupBy } }
}));

import { statsByClient, statsForClient, emptyStats } from './stats.service';

beforeEach(() => {
  vi.clearAllMocks();
  mockGroupBy.mockResolvedValue([]);
});

// The two groupBy calls, in the order the service issues them.
function mockCounts(
  statusRows: Array<{ clientId: string; status: string; _count: { _all: number } }>,
  overdueRows: Array<{ clientId: string; _count: { _all: number } }> = []
) {
  mockGroupBy.mockResolvedValueOnce(statusRows).mockResolvedValueOnce(overdueRows);
}

describe('emptyStats', () => {
  it('states all four statuses as zero, never omitting one', () => {
    // A missing status would render as a gap in the breakdown rather than a 0.
    expect(emptyStats().byStatus).toEqual({
      TODO: 0,
      IN_PROGRESS: 0,
      DONE: 0,
      BLOCKED: 0
    });
  });
});

describe('statsByClient', () => {
  it('issues no queries at all for an empty client list', async () => {
    const stats = await statsByClient([]);
    expect(stats.size).toBe(0);
    expect(mockGroupBy).not.toHaveBeenCalled();
  });

  it('counts totals, open, done and the per-status breakdown', async () => {
    mockCounts([
      { clientId: 'c1', status: 'TODO', _count: { _all: 5 } },
      { clientId: 'c1', status: 'BLOCKED', _count: { _all: 2 } },
      { clientId: 'c1', status: 'DONE', _count: { _all: 3 } }
    ]);

    const stats = (await statsByClient(['c1'])).get('c1')!;

    expect(stats.total).toBe(10);
    expect(stats.open).toBe(7); // everything not Done
    expect(stats.done).toBe(3);
    expect(stats.byStatus).toEqual({ TODO: 5, IN_PROGRESS: 0, DONE: 3, BLOCKED: 2 });
  });

  it('computes progress as done ÷ total, rounded', async () => {
    mockCounts([
      { clientId: 'c1', status: 'DONE', _count: { _all: 1 } },
      { clientId: 'c1', status: 'TODO', _count: { _all: 2 } }
    ]);
    expect((await statsByClient(['c1'])).get('c1')!.progress).toBe(33);
  });

  it('reports 0% progress rather than NaN for a client with no tasks', async () => {
    const stats = (await statsByClient(['c1'])).get('c1')!;
    expect(stats.progress).toBe(0);
    expect(stats.total).toBe(0);
  });

  it('excludes Done tasks from the overdue query', async () => {
    await statsByClient(['c1']);

    const overdueCall = mockGroupBy.mock.calls[1]![0];
    expect(overdueCall.where).toMatchObject({ status: { not: 'DONE' } });
    // The cutoff is midnight UTC today — a task due *today* is not yet overdue.
    expect(overdueCall.where.dueDate.lt.toISOString()).toBe(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`
    );
  });

  it('attaches the overdue count to the right client', async () => {
    mockCounts(
      [
        { clientId: 'c1', status: 'TODO', _count: { _all: 4 } },
        { clientId: 'c2', status: 'TODO', _count: { _all: 1 } }
      ],
      [{ clientId: 'c2', _count: { _all: 1 } }]
    );

    const stats = await statsByClient(['c1', 'c2']);
    expect(stats.get('c1')!.overdue).toBe(0);
    expect(stats.get('c2')!.overdue).toBe(1);
  });

  it('returns an entry for every requested client, including ones with no rows', async () => {
    mockCounts([{ clientId: 'c1', status: 'TODO', _count: { _all: 1 } }]);

    const stats = await statsByClient(['c1', 'c2', 'c3']);

    expect([...stats.keys()]).toEqual(['c1', 'c2', 'c3']);
    expect(stats.get('c3')).toMatchObject({ total: 0, progress: 0 });
  });

  it('ignores rows for a client outside the requested set', async () => {
    mockCounts([{ clientId: 'other', status: 'TODO', _count: { _all: 9 } }]);
    const stats = await statsByClient(['c1']);
    expect(stats.get('c1')!.total).toBe(0);
    expect(stats.has('other')).toBe(false);
  });

  it('scopes both queries to the requested clients', async () => {
    await statsByClient(['c1', 'c2']);
    for (const call of mockGroupBy.mock.calls) {
      expect(call[0].where).toMatchObject({ clientId: { in: ['c1', 'c2'] } });
    }
  });
});

describe('statsForClient', () => {
  it('returns the one client’s stats', async () => {
    mockCounts([{ clientId: 'c1', status: 'DONE', _count: { _all: 2 } }]);
    expect(await statsForClient('c1')).toMatchObject({ total: 2, done: 2, progress: 100 });
  });
});
