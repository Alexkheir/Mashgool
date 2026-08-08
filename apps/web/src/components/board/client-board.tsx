'use client';

import { BOARD_COLUMNS, type TaskStatus } from '@/dtos/task.dto';
import { boardKeys, useClientBoard, type BoardTask } from '@/lib/use-board';
import { hasActiveFilters, type TaskFilters } from '@/lib/filter-parser';
import { Button } from '@/components/ui/button';
import { PlusIcon } from '@/components/ui/icons';
import { NoResults } from '@/components/shared/no-results';
import { ScrumBoard } from './scrum-board';

interface ClientBoardProps {
  clientId: string;
  filters: TaskFilters;
  onClearFilters: () => void;
  onOpenTask: (task: BoardTask) => void;
  onAddTask: (status: TaskStatus) => void;
  onCreate: () => void;
}

// One workspace's tasks as a board. Fetches its own data so the query is only
// live while the board view is showing (the list view has its own endpoint).
export function ClientBoard({
  clientId,
  filters,
  onClearFilters,
  onOpenTask,
  onAddTask,
  onCreate
}: ClientBoardProps) {
  const { data: columns, isLoading, isError } = useClientBoard(clientId, filters, true);

  if (isLoading) return <p className="text-sm text-neutral-500">Loading board…</p>;
  if (isError) return <p className="text-sm text-red-600">Couldn’t load the board. Please refresh.</p>;
  if (!columns) return null;

  const isEmpty = BOARD_COLUMNS.every((status) => columns[status].length === 0);

  // An empty board means two different things, and the user needs to be told
  // which: nothing exists yet, or nothing matches what they typed.
  if (isEmpty && hasActiveFilters(filters)) {
    return <NoResults filters={filters} onClear={onClearFilters} />;
  }

  if (isEmpty) {
    return (
      <div className="animate-[rise-in] rounded-2xl border border-dashed border-neutral-300 bg-white/50 p-12 text-center">
        <p className="text-sm text-neutral-600">No tasks in this workspace yet.</p>
        <Button className="mt-5" onClick={onCreate}>
          <PlusIcon className="h-4 w-4" />
          Create the first task
        </Button>
      </div>
    );
  }

  return (
    <ScrumBoard
      columns={columns}
      queryKey={boardKeys.client(clientId, filters)}
      onOpenTask={onOpenTask}
      onAddTask={onAddTask}
    />
  );
}
