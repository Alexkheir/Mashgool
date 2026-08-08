'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useClient } from '@/lib/use-clients';
import { useDeleteTask, type Task } from '@/lib/use-tasks';
import { useViewMode } from '@/lib/ui-store';
import { useFilterQuery } from '@/lib/filter-store';
import type { TaskStatus } from '@/dtos/task.dto';
import { TaskList } from './task-list';
import { TaskForm } from './task-form';
import { ClientBoard } from '@/components/board/client-board';
import { FilterBar } from '@/components/shared/filter-bar';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ViewToggle } from '@/components/ui/view-toggle';
import { PlusIcon, ChevronLeftIcon } from '@/components/ui/icons';

// A client workspace. The header, the create/edit/delete modals and the view
// toggle live here; the board and the list are interchangeable bodies beneath
// them, so switching views never disturbs an open dialog or the task being
// edited. The chosen view is remembered per workspace (ui-store, keyed by id).
export function TasksView({ clientId }: { clientId: string }) {
  const client = useClient(clientId);
  const viewMode = useViewMode(clientId);
  // Scoped to this workspace, so each client keeps its own filters, and they
  // survive a board/list toggle but not navigating away (Feature 11 spec).
  const filter = useFilterQuery(clientId);

  const deleteTask = useDeleteTask();

  const [creating, setCreating] = useState<{ status?: TaskStatus } | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  function confirmDelete() {
    if (!deleting) return;
    deleteTask.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        All clients
      </Link>

      <header className="mt-4 mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {client.data && (
            <span
              aria-hidden="true"
              className="h-9 w-9 shrink-0 rounded-xl ring-2 ring-white"
              style={{ backgroundColor: client.data.color }}
            />
          )}
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900">
              <span className="truncate">{client.data?.name ?? 'Workspace'}</span>
              {client.data && (
                <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-xs font-medium text-neutral-500">
                  {client.data.shortCode}
                </span>
              )}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle scope={clientId} />
          <Button onClick={() => setCreating({})}>
            <PlusIcon className="h-4 w-4" />
            New task
          </Button>
        </div>
      </header>

      {/* Persistent across both views — the bar sits above the switch, so a
          filter carries over when the user toggles board ↔ list. */}
      <FilterBar filter={filter} />

      {viewMode === 'board' ? (
        <ClientBoard
          clientId={clientId}
          filters={filter.filters}
          onClearFilters={filter.clear}
          onOpenTask={setEditing}
          // The "+" on a column creates a task already in that column's status.
          onAddTask={(status) => setCreating({ status })}
          onCreate={() => setCreating({})}
        />
      ) : (
        <TaskList
          clientId={clientId}
          filters={filter.filters}
          onClearFilters={filter.clear}
          onEdit={setEditing}
          onDelete={setDeleting}
          onCreate={() => setCreating({})}
        />
      )}

      {creating && (
        <TaskForm
          open
          clientId={clientId}
          initialStatus={creating.status}
          onClose={() => setCreating(null)}
        />
      )}
      {editing && (
        <TaskForm
          key={editing.id}
          open
          clientId={editing.clientId}
          task={editing}
          onDelete={() => {
            // The board opens tasks in the same form the list edits them in, so
            // delete is reachable from both without a second dialog per view.
            setDeleting(editing);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete task?">
        <p className="text-sm text-neutral-600">
          Deleting{' '}
          <span className="font-medium text-neutral-900">
            {deleting?.taskKey} — {deleting?.title}
          </span>{' '}
          is permanent, and its key is retired for good. This can’t be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleteTask.isPending}>
            {deleteTask.isPending ? 'Deleting…' : 'Delete task'}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
