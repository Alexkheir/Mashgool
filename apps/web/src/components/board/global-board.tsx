'use client';

import { BOARD_COLUMNS } from '@/dtos/task.dto';
import { boardKeys, useGlobalBoard, type BoardTask } from '@/lib/use-board';
import { hasActiveFilters, type TaskFilters } from '@/lib/filter-parser';
import { NoResults } from '@/components/shared/no-results';
import { ScrumBoard } from './scrum-board';

interface GlobalBoardProps {
  filters: TaskFilters;
  onClearFilters: () => void;
  onOpenTask: (task: BoardTask) => void;
}

// Every active workspace's tasks in one set of four columns. Cards name their
// client (colour dot + name) because a column here mixes workspaces.
//
// There is no per-column "+" button, unlike the per-client board: a new task has
// to belong to a workspace, and a column on the global board doesn't identify
// one. Creating still happens from inside a workspace.
export function GlobalBoard({ filters, onClearFilters, onOpenTask }: GlobalBoardProps) {
  const { data: columns, isLoading, isError } = useGlobalBoard(filters, true);

  if (isLoading) return <p className="text-sm text-neutral-500">Loading board…</p>;
  if (isError) return <p className="text-sm text-red-600">Couldn’t load the board. Please refresh.</p>;
  if (!columns) return null;

  const isEmpty = BOARD_COLUMNS.every((status) => columns[status].length === 0);

  if (isEmpty && hasActiveFilters(filters)) {
    return <NoResults filters={filters} onClear={onClearFilters} />;
  }

  if (isEmpty) {
    return (
      <div className="animate-[rise-in] rounded-2xl border border-dashed border-neutral-300 bg-white/50 p-12 text-center">
        <p className="text-sm text-neutral-600">No tasks across your workspaces yet.</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-neutral-400">
          Open a client to add the first one — tasks live inside a workspace.
        </p>
      </div>
    );
  }

  return (
    <ScrumBoard
      columns={columns}
      queryKey={boardKeys.global(filters)}
      showClient
      onOpenTask={onOpenTask}
    />
  );
}
