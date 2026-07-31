'use client';

import { cn } from '@/lib/utils';
import {
  PRIORITY_META,
  STATUS_META,
  formatDueDate,
  isOverdue
} from '@/dtos/task.dto';
import type { Task } from '@/lib/use-tasks';

interface TaskRowProps {
  task: Task;
  onEdit: () => void;
  onToggleDone: () => void;
  onDelete: () => void;
  busy?: boolean;
}

// A small text action, matching the client card's footer buttons.
function RowAction({
  label,
  onClick,
  danger,
  disabled
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'rounded px-2 py-1 text-xs font-medium transition disabled:opacity-50',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-neutral-600 hover:bg-neutral-100'
      )}
    >
      {label}
    </button>
  );
}

export function TaskRow({ task, onEdit, onToggleDone, onDelete, busy }: TaskRowProps) {
  const overdue = isOverdue(task.dueDate);
  const done = task.status === 'DONE';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
      className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
    >
      <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs font-medium text-neutral-600">
        {task.taskKey}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium text-neutral-950', done && 'text-neutral-400 line-through')}>
          {task.title}
        </p>
        {task.description && (
          <p className="mt-0.5 truncate text-xs text-neutral-500">{task.description}</p>
        )}
      </div>

      {task.dueDate && (
        <span
          className={cn(
            'shrink-0 text-xs font-medium',
            overdue && !done ? 'text-red-600' : 'text-neutral-500'
          )}
          title={overdue && !done ? 'Overdue' : undefined}
        >
          {formatDueDate(task.dueDate)}
        </span>
      )}

      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
          PRIORITY_META[task.priority].badge
        )}
      >
        {PRIORITY_META[task.priority].label}
      </span>

      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
          STATUS_META[task.status].badge
        )}
      >
        {STATUS_META[task.status].label}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {!done && <RowAction label="✓ Done" onClick={onToggleDone} disabled={busy} />}
        <RowAction label="Edit" onClick={onEdit} />
        <RowAction label="Delete" onClick={onDelete} danger />
      </div>
    </div>
  );
}
