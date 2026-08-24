import type { TaskStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { utcDayStart } from '../lib/date';
import { TASK_STATUSES } from '../dtos/task.dto';

// Task counts for one client, the numbers the dashboards are built from
// (Feature 12). `byStatus` always states all four statuses, zeros included — a
// breakdown with a missing column would render as a gap rather than a zero.
export interface TaskStats {
  total: number;
  // Not-Done. The figure the client card has shown since Feature 8.
  open: number;
  done: number;
  // Past its due date and not yet Done. A finished task is never "overdue",
  // however late it was — matching how the list and board flag rows in red.
  overdue: number;
  byStatus: Record<TaskStatus, number>;
  // Done ÷ total × 100, rounded. Computed here rather than in the UI so the
  // card, the workspace header, and any future widget can't disagree about it.
  progress: number;
}

export function emptyStats(): TaskStats {
  return {
    total: 0,
    open: 0,
    done: 0,
    overdue: 0,
    byStatus: Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>,
    progress: 0
  };
}

// Counts for many clients in a fixed two queries, whatever the client count —
// `groupBy` aggregates in Postgres rather than pulling rows back to count them,
// and doing it for the whole set at once avoids the N+1 a per-card query would
// create.
//
// `clientIds` must already be ownership-checked by the caller (they come from a
// userId-scoped client query). This function never sees a userId, so it must
// never be handed ids from a request body.
export async function statsByClient(
  clientIds: string[]
): Promise<Map<string, TaskStats>> {
  const stats = new Map<string, TaskStats>(clientIds.map((id) => [id, emptyStats()]));
  if (clientIds.length === 0) return stats;

  const [statusRows, overdueRows] = await Promise.all([
    prisma.task.groupBy({
      by: ['clientId', 'status'],
      where: { clientId: { in: clientIds } },
      _count: { _all: true }
    }),
    prisma.task.groupBy({
      by: ['clientId'],
      where: {
        clientId: { in: clientIds },
        status: { not: 'DONE' },
        dueDate: { lt: utcDayStart() }
      },
      _count: { _all: true }
    })
  ]);

  for (const row of statusRows) {
    const entry = stats.get(row.clientId);
    if (!entry) continue; // a task whose client isn't in scope — ignore

    const count = row._count._all;
    entry.byStatus[row.status] = count;
    entry.total += count;
    if (row.status === 'DONE') entry.done += count;
    else entry.open += count;
  }

  for (const row of overdueRows) {
    const entry = stats.get(row.clientId);
    if (entry) entry.overdue = row._count._all;
  }

  // Progress needs the totals, so it's a second pass rather than accumulated.
  for (const entry of stats.values()) {
    entry.progress = entry.total === 0 ? 0 : Math.round((entry.done / entry.total) * 100);
  }

  return stats;
}

// One client's stats. Same ownership contract as above.
export async function statsForClient(clientId: string): Promise<TaskStats> {
  const stats = await statsByClient([clientId]);
  return stats.get(clientId) ?? emptyStats();
}
