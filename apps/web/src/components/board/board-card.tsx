'use client';

import type { ComponentPropsWithRef, KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { PRIORITY_META, formatDueDate, isOverdue } from '@/dtos/task.dto';
import type { BoardTask } from '@/lib/use-board';

interface BoardCardProps {
  task: BoardTask;
  // The global board mixes workspaces, so each card names its client. The
  // per-client board doesn't — every card there belongs to the same one.
  showClient?: boolean;
  onOpen?: () => void;
}

type BoardCardBodyProps = Omit<BoardCardProps, 'onOpen'> &
  ComponentPropsWithRef<'div'> & {
    dragging?: boolean;
    overlay?: boolean;
  };

// The card's visual body, with no drag wiring. Rendered both in place (by
// SortableBoardCard) and inside the DragOverlay, so the card under the cursor and
// the card in the column are guaranteed to look identical.
export function BoardCardBody({
  task,
  showClient,
  dragging,
  overlay,
  className,
  ...rest
}: BoardCardBodyProps) {
  const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';

  return (
    <div
      {...rest}
      className={cn(
        'rounded-xl border border-neutral-200/80 bg-surface p-3 text-left shadow-[var(--shadow-card)]',
        'transition-shadow duration-200 hover:border-neutral-300 hover:shadow-[var(--shadow-card-hover)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        // While dragging, the original slot stays as a faint placeholder — the
        // "real" card is the one in the DragOverlay following the cursor.
        dragging && 'opacity-40',
        overlay ? 'rotate-2 cursor-grabbing shadow-[var(--shadow-card-hover)]' : 'cursor-grab',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-neutral-500">
          {task.taskKey}
        </span>
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium',
            PRIORITY_META[task.priority].badge
          )}
        >
          {PRIORITY_META[task.priority].label}
        </span>
      </div>

      <p
        className={cn(
          'mt-2 text-sm font-medium text-neutral-950',
          task.status === 'DONE' && 'text-neutral-400 line-through'
        )}
      >
        {task.title}
      </p>

      {(showClient || task.dueDate) && (
        <div className="mt-2.5 flex items-center gap-2">
          {showClient && (
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: task.client.color }}
              />
              <span className="truncate text-[11px] font-medium text-neutral-500">
                {task.client.name}
              </span>
            </span>
          )}
          {task.dueDate && (
            <span
              className={cn(
                'ml-auto shrink-0 text-[11px] font-medium',
                overdue ? 'text-red-600' : 'text-neutral-500'
              )}
              title={overdue ? 'Overdue' : undefined}
            >
              {formatDueDate(task.dueDate)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// A card in its column: draggable, sortable, and still clickable. The sensor's
// activation distance (see ScrumBoard) is what lets one element be both — a press
// that doesn't travel is a click, one that does starts a drag.
export function SortableBoardCard({ task, showClient, onOpen }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id
  });

  // dnd-kit's keyboard sensor listens on keydown (Space picks a card up), so our
  // "Enter opens the task" handler has to compose with it rather than replace it.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    listeners?.onKeyDown?.(event);
    if (event.key === 'Enter') {
      event.preventDefault();
      onOpen?.();
    }
  }

  return (
    <BoardCardBody
      task={task}
      showClient={showClient}
      dragging={isDragging}
      {...attributes}
      {...listeners}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    />
  );
}
