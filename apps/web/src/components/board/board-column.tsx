'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { COLUMN_META, STATUS_META, type TaskStatus } from '@/dtos/task.dto';
import { PlusIcon } from '@/components/ui/icons';
import type { BoardTask } from '@/lib/use-board';
import { SortableBoardCard } from './board-card';

interface BoardColumnProps {
  status: TaskStatus;
  tasks: BoardTask[];
  showClient?: boolean;
  highlightId?: string | null;
  onOpenTask: (task: BoardTask) => void;
  // Absent on the global board, which has no single workspace to create in.
  onAddTask?: () => void;
}

export function BoardColumn({
  status,
  tasks,
  showClient,
  highlightId,
  onOpenTask,
  onAddTask
}: BoardColumnProps) {
  // The column itself is a drop target, not just the cards in it — that's what
  // makes an empty column (and the dead space below the last card) accept a drop.
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = COLUMN_META[status];

  return (
    <section className="flex min-h-0 w-full flex-col rounded-2xl bg-neutral-500/[0.04] p-2.5">
      <header className="flex items-center gap-2 px-1.5 pb-2.5">
        <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', meta.dot)} />
        <h3 className="text-sm font-semibold text-neutral-700">{STATUS_META[status].label}</h3>
        <span
          className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-medium', meta.count)}
          aria-label={`${tasks.length} tasks`}
        >
          {tasks.length}
        </span>
        {onAddTask && (
          <button
            type="button"
            onClick={onAddTask}
            aria-label={`New task in ${STATUS_META[status].label}`}
            className="ml-auto rounded-lg p-1 text-neutral-400 transition hover:bg-white hover:text-neutral-700"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}
      </header>

      {/* Each column scrolls on its own once its cards outgrow the board height. */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-0.5 transition-colors',
          isOver && 'bg-brand-500/[0.07]'
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableBoardCard
              key={task.id}
              task={task}
              showClient={showClient}
              highlighted={task.id === highlightId}
              onOpen={() => onOpenTask(task)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-neutral-400">
            {isOver ? 'Drop here' : 'Nothing here'}
          </p>
        )}
      </div>
    </section>
  );
}
