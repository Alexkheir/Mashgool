import { describe, it, expect } from 'vitest';
import {
  CreateTaskDto,
  UpdateTaskDto,
  ChangeStatusDto,
  MoveTaskDto,
  ListTasksQueryDto
} from './task.dto';

// `YYYY-MM-DD` (UTC) offset from today by `deltaDays` — keeps the past/future
// due-date tests correct on any day they run.
function isoDay(deltaDays: number): string {
  return new Date(Date.now() + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

describe('CreateTaskDto', () => {
  it('accepts a minimal valid task (title only)', () => {
    const parsed = CreateTaskDto.parse({ title: 'Design the logo' });
    expect(parsed).toEqual({ title: 'Design the logo' });
  });

  it('requires a non-empty title', () => {
    expect(CreateTaskDto.safeParse({ title: '   ' }).success).toBe(false);
    expect(CreateTaskDto.safeParse({}).success).toBe(false);
  });

  it('rejects unknown fields (mass-assignment defence)', () => {
    // taskKey is server-generated and must never be settable by a client.
    expect(CreateTaskDto.safeParse({ title: 'x', taskKey: 'BS-99' }).success).toBe(false);
    expect(CreateTaskDto.safeParse({ title: 'x', boardOrder: 5 }).success).toBe(false);
  });

  it('rejects an off-list priority or status', () => {
    expect(CreateTaskDto.safeParse({ title: 'x', priority: 'CRITICAL' }).success).toBe(false);
    expect(CreateTaskDto.safeParse({ title: 'x', status: 'todo' }).success).toBe(false);
  });

  it('accepts a null description and a valid ISO due date', () => {
    const parsed = CreateTaskDto.parse({
      title: 'x',
      description: null,
      dueDate: '2026-08-15T00:00:00.000Z'
    });
    expect(parsed.description).toBeNull();
    expect(parsed.dueDate).toBe('2026-08-15T00:00:00.000Z');
  });

  it('rejects a non-ISO due date', () => {
    expect(CreateTaskDto.safeParse({ title: 'x', dueDate: 'next friday' }).success).toBe(false);
  });

  it('rejects a due date in the past', () => {
    const yesterday = `${isoDay(-1)}T00:00:00.000Z`;
    const result = CreateTaskDto.safeParse({ title: 'x', dueDate: yesterday });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.dueDate?.[0]).toMatch(/past/i);
    }
  });

  it('accepts a due date of today', () => {
    const today = `${isoDay(0)}T00:00:00.000Z`;
    expect(CreateTaskDto.safeParse({ title: 'x', dueDate: today }).success).toBe(true);
  });
});

describe('UpdateTaskDto', () => {
  it('rejects an empty patch', () => {
    expect(UpdateTaskDto.safeParse({}).success).toBe(false);
  });

  it('rejects an attempt to change the immutable task key', () => {
    expect(UpdateTaskDto.safeParse({ taskKey: 'BS-2' }).success).toBe(false);
  });

  it('allows clearing the due date with null', () => {
    expect(UpdateTaskDto.parse({ dueDate: null })).toEqual({ dueDate: null });
  });

  it('rejects moving the due date into the past', () => {
    const yesterday = `${isoDay(-1)}T00:00:00.000Z`;
    expect(UpdateTaskDto.safeParse({ dueDate: yesterday }).success).toBe(false);
  });
});

describe('ChangeStatusDto', () => {
  it('requires a valid status and nothing else', () => {
    expect(ChangeStatusDto.parse({ status: 'DONE' })).toEqual({ status: 'DONE' });
    expect(ChangeStatusDto.safeParse({ status: 'DONE', foo: 1 }).success).toBe(false);
    expect(ChangeStatusDto.safeParse({}).success).toBe(false);
  });
});

describe('MoveTaskDto', () => {
  it('accepts a destination column and a 0-based position', () => {
    expect(MoveTaskDto.parse({ status: 'IN_PROGRESS', position: 0 })).toEqual({
      status: 'IN_PROGRESS',
      position: 0
    });
  });

  it('requires both fields — a drop is meaningless without either', () => {
    expect(MoveTaskDto.safeParse({ status: 'DONE' }).success).toBe(false);
    expect(MoveTaskDto.safeParse({ position: 2 }).success).toBe(false);
  });

  it('rejects a negative or fractional position', () => {
    expect(MoveTaskDto.safeParse({ status: 'DONE', position: -1 }).success).toBe(false);
    expect(MoveTaskDto.safeParse({ status: 'DONE', position: 1.5 }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(
      MoveTaskDto.safeParse({ status: 'DONE', position: 0, clientId: 'c2' }).success
    ).toBe(false);
  });
});

describe('ListTasksQueryDto', () => {
  it('coerces the page string and applies defaults', () => {
    expect(ListTasksQueryDto.parse({ page: '3' })).toEqual({ page: 3, sortBy: 'createdAt' });
    expect(ListTasksQueryDto.parse({})).toEqual({ page: 1, sortBy: 'createdAt' });
  });

  it('rejects an unsupported sort field', () => {
    expect(ListTasksQueryDto.safeParse({ sortBy: 'title' }).success).toBe(false);
  });
});
