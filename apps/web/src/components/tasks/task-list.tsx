'use client';

import { useEffect, useState } from 'react';
import { SORT_OPTIONS, type SortField } from '@/dtos/task.dto';
import { useTasks, useChangeTaskStatus, type Task } from '@/lib/use-tasks';
import { hasActiveFilters, type TaskFilters } from '@/lib/filter-parser';
import { Button } from '@/components/ui/button';
import { PlusIcon } from '@/components/ui/icons';
import { NoResults } from '@/components/shared/no-results';
import { TaskRow } from './task-row';

interface TaskListProps {
  clientId: string;
  filters: TaskFilters;
  onClearFilters: () => void;
  // A task to flag briefly — the one paste-to-task just created (Feature 13).
  highlightId?: string | null;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onCreate: () => void;
}

// The list half of a workspace: sortable, paginated rows. Extracted from
// TasksView when the board arrived (Feature 10) so the two views are siblings —
// the workspace header, the create/edit/delete modals, and the view toggle live
// in the parent and are shared by both.
export function TaskList({
  clientId,
  filters,
  onClearFilters,
  highlightId,
  onEdit,
  onDelete,
  onCreate
}: TaskListProps) {
  // Sort field is chosen here; the server applies a sensible default direction
  // per field (soonest-due, highest-priority, newest-created). Changing the sort
  // resets pagination to page 1 (Feature 9 spec).
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, isPlaceholderData } = useTasks(clientId, {
    page,
    sortBy,
    filters
  });
  const changeStatus = useChangeTaskStatus();

  // "Pagination resets to page 1 when filters or sort order change" — the sort
  // path does it inline; filters arrive as a prop, so they need an effect.
  // Without this, filtering while on page 3 shows an empty page.
  useEffect(() => {
    setPage(1);
  }, [filters]);

  function onSortChange(value: SortField) {
    setSortBy(value);
    setPage(1);
  }

  const tasks = data?.tasks ?? [];
  const filtered = hasActiveFilters(filters);

  return (
    <>
      {/* Toolbar: task total + sort. */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {data ? `${data.total} task${data.total === 1 ? '' : 's'}` : ' '}
        </p>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Sort
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortField)}
            className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-brand-400"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && <p className="text-sm text-neutral-500">Loading tasks…</p>}
      {isError && <p className="text-sm text-red-600">Couldn’t load tasks. Please refresh.</p>}

      {data && tasks.length === 0 && filtered && (
        <NoResults filters={filters} onClear={onClearFilters} />
      )}

      {data && tasks.length === 0 && !filtered && (
        <div className="animate-[rise-in] rounded-2xl border border-dashed border-neutral-300 bg-white/50 p-12 text-center">
          <p className="text-sm text-neutral-600">No tasks in this workspace yet.</p>
          <Button className="mt-5" onClick={onCreate}>
            <PlusIcon className="h-4 w-4" />
            Create the first task
          </Button>
        </div>
      )}

      {tasks.length > 0 && (
        <div className={isPlaceholderData ? 'space-y-2 opacity-60' : 'space-y-2'}>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              highlighted={task.id === highlightId}
              busy={changeStatus.isPending}
              onEdit={() => onEdit(task)}
              onToggleDone={() => changeStatus.mutate({ id: task.id, status: 'DONE' })}
              onDelete={() => onDelete(task)}
            />
          ))}
        </div>
      )}

      {/* Pagination — only when there's more than one page. */}
      {data && data.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ← Prev
          </Button>
          <span className="text-neutral-500">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => (data && p < data.totalPages ? p + 1 : p))}
            disabled={page >= data.totalPages}
          >
            Next →
          </Button>
        </div>
      )}
    </>
  );
}
