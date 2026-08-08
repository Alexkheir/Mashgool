'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { BOARD_COLUMNS, type TaskStatus } from '@/dtos/task.dto';
import { useMoveTask, type BoardColumns, type BoardQueryKey, type BoardTask } from '@/lib/use-board';
import { BoardCardBody } from './board-card';
import { BoardColumn } from './board-column';

interface ScrumBoardProps {
  columns: BoardColumns;
  // Which board's cache a drop should write to (per-client or global).
  queryKey: BoardQueryKey;
  showClient?: boolean;
  onOpenTask: (task: BoardTask) => void;
  // Per-client boards can create into a column; the global board can't (there is
  // no single workspace for the new task to belong to).
  onAddTask?: (status: TaskStatus) => void;
}

// Which column an id belongs to. `over.id` is either a card id or — when the
// cursor is over a column's empty space — the column's own droppable id, which is
// the status string.
function findColumn(columns: BoardColumns, id: UniqueIdentifier): TaskStatus | null {
  const asStatus = BOARD_COLUMNS.find((status) => status === id);
  if (asStatus) return asStatus;
  return BOARD_COLUMNS.find((status) => columns[status].some((t) => t.id === id)) ?? null;
}

export function ScrumBoard({
  columns: serverColumns,
  queryKey,
  showClient,
  onOpenTask,
  onAddTask
}: ScrumBoardProps) {
  const move = useMoveTask(queryKey);

  // The board renders from local state during a drag so cards can follow the
  // cursor across columns before anything is persisted. Outside a drag, the
  // server (via the query cache) is the source of truth and overwrites it — which
  // is also how a rejected move snaps the card back to where it came from.
  const [columns, setColumns] = useState(serverColumns);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  // Where the card started, so a drag that ends where it began writes nothing.
  const [origin, setOrigin] = useState<{ status: TaskStatus; index: number } | null>(null);

  useEffect(() => {
    if (!activeId) setColumns(serverColumns);
  }, [serverColumns, activeId]);

  const sensors = useSensors(
    // A small activation distance is what lets a card be both clickable and
    // draggable: a press that doesn't travel 6px opens the task instead.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeTask = activeId
    ? BOARD_COLUMNS.flatMap((s) => columns[s]).find((t) => t.id === activeId)
    : undefined;

  function cancelDrag() {
    setActiveId(null);
    setOrigin(null);
    setColumns(serverColumns); // the card returns to its original position
  }

  function handleDragStart({ active }: DragStartEvent) {
    const status = findColumn(columns, active.id);
    if (!status) return;
    setActiveId(active.id);
    setOrigin({ status, index: columns[status].findIndex((t) => t.id === active.id) });
  }

  // Fires continuously while dragging. Only cross-column movement is handled
  // here — reordering *within* a column is left to the sortable strategy and
  // settled on drop, which keeps the preview from thrashing under the cursor.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findColumn(columns, active.id);
    const to = findColumn(columns, over.id);
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const source = prev[from];
      const activeIndex = source.findIndex((t) => t.id === active.id);
      if (activeIndex < 0) return prev;

      const target = prev[to];
      const overIndex = target.findIndex((t) => t.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : target.length;
      const task = { ...source[activeIndex]!, status: to };

      return {
        ...prev,
        [from]: source.filter((t) => t.id !== active.id),
        [to]: [...target.slice(0, insertAt), task, ...target.slice(insertAt)]
      };
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const startedAt = origin;
    setOrigin(null);

    // Dropped outside any column — put everything back.
    if (!over) {
      setColumns(serverColumns);
      return;
    }

    const status = findColumn(columns, over.id);
    if (!status) {
      setColumns(serverColumns);
      return;
    }

    const items = columns[status];
    const oldIndex = items.findIndex((t) => t.id === active.id);
    if (oldIndex < 0) {
      setColumns(serverColumns);
      return;
    }

    // Within a column, the drop lands on the card it was released over; released
    // over the column itself, it goes to the end.
    const overIndex = items.findIndex((t) => t.id === over.id);
    const newIndex = overIndex >= 0 ? overIndex : items.length - 1;
    const next =
      oldIndex === newIndex
        ? columns
        : { ...columns, [status]: arrayMove(items, oldIndex, newIndex) };

    const position = next[status].findIndex((t) => t.id === active.id);
    setColumns(next);

    // A drag that ends where it started is not a change worth a request.
    if (startedAt && startedAt.status === status && startedAt.index === position) return;

    move.mutate({ taskId: String(active.id), status, position, columns: next });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={cancelDrag}
    >
      {/* Columns sit side by side and scroll horizontally on narrow screens; from
          lg up they share the width evenly and only their contents scroll. */}
      <div className="flex h-[calc(100vh-17rem)] min-h-96 gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMNS.map((status) => (
          <div key={status} className="flex w-68 shrink-0 flex-col lg:w-auto lg:flex-1">
            <BoardColumn
              status={status}
              tasks={columns[status]}
              showClient={showClient}
              onOpenTask={onOpenTask}
              onAddTask={onAddTask ? () => onAddTask(status) : undefined}
            />
          </div>
        ))}
      </div>

      {/* The card under the cursor, rendered outside the columns so it isn't
          clipped by a column's own scroll container. */}
      <DragOverlay>
        {activeTask && <BoardCardBody task={activeTask} showClient={showClient} overlay />}
      </DragOverlay>
    </DndContext>
  );
}
