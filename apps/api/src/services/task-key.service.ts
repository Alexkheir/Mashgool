import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';

// Task-key generation must be atomic: two tasks created at the same instant for
// the same client must never receive the same number.
//
// This runs a SINGLE statement — an atomic increment that RETURNs the new value
// in the same round-trip. Postgres takes a row-level lock on the client row for
// the increment, so a concurrent create for the same client blocks until this
// transaction commits and then reads the *next* number. There is no read-back
// after the write, so there is no window in which two callers could observe the
// same counter.
//
// (The tech-spec sample did `$executeRaw` — which returns only a row *count* —
// followed by a separate `findUnique`; that second read re-opens the very race
// the atomic UPDATE closes. We use `$queryRaw ... RETURNING` instead, per the
// invariant described in CLAUDE.md.)
//
// Always call this inside a transaction, passing that transaction's client, so
// the counter increment and the task insert commit or roll back together — a
// failed insert must not burn a task number (numbers are never reused).
export async function generateTaskKey(
  tx: Prisma.TransactionClient,
  clientId: string
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ task_counter: number; short_code: string }>>`
    UPDATE clients
    SET task_counter = task_counter + 1
    WHERE id = ${clientId}
    RETURNING task_counter, short_code
  `;

  const row = rows[0];
  if (!row) {
    // The client vanished between the ownership check and here — treat as absent.
    throw new AppError(404, 'Client not found');
  }

  return `${row.short_code}-${row.task_counter}`;
}
