import { describe, it, expect, vi } from 'vitest';
import { generateTaskKey } from './task-key.service';

// generateTaskKey takes a transaction client and issues one raw statement, so the
// test just hands it a fake tx whose $queryRaw returns the RETURNING rows.
function fakeTx(rows: unknown) {
  return { $queryRaw: vi.fn().mockResolvedValue(rows) } as never;
}

describe('generateTaskKey', () => {
  it('builds the key from the atomically-returned counter and short code', async () => {
    const key = await generateTaskKey(fakeTx([{ task_counter: 7, short_code: 'BS' }]), 'c1');
    expect(key).toBe('BS-7');
  });

  it('throws 404 when the client row is gone (empty RETURNING)', async () => {
    await expect(generateTaskKey(fakeTx([]), 'c1')).rejects.toMatchObject({ statusCode: 404 });
  });
});
