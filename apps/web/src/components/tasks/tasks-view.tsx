'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SORT_OPTIONS, type SortField } from '@/dtos/task.dto';
import { useClient } from '@/lib/use-clients';
import {
  useTasks,
  useChangeTaskStatus,
  useDeleteTask,
  type Task
} from '@/lib/use-tasks';
import { TaskRow } from './task-row';
import { TaskForm } from './task-form';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { PlusIcon, ChevronLeftIcon } from '@/components/ui/icons';

export function TasksView({ clientId }: { clientId: string }) {
  const client = useClient(clientId);

  // Sort field is chosen here; the server applies a sensible default direction
  // per field (soonest-due, highest-priority, newest-created). Changing the sort
  // resets pagination to page 1 (Feature 9 spec).
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, isPlaceholderData } = useTasks(clientId, { page, sortBy });

  const changeStatus = useChangeTaskStatus();
  const deleteTask = useDeleteTask();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  function onSortChange(value: SortField) {
    setSortBy(value);
    setPage(1);
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteTask.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }

  const tasks = data?.tasks ?? [];

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
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
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className="h-4 w-4" />
          New task
        </Button>
      </header>

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
      {isError && (
        <p className="text-sm text-red-600">Couldn’t load tasks. Please refresh.</p>
      )}

      {data && tasks.length === 0 && (
        <div className="animate-[rise-in] rounded-2xl border border-dashed border-neutral-300 bg-white/50 p-12 text-center">
          <p className="text-sm text-neutral-600">No tasks in this workspace yet.</p>
          <Button className="mt-5" onClick={() => setCreating(true)}>
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
              busy={changeStatus.isPending}
              onEdit={() => setEditing(task)}
              onToggleDone={() => changeStatus.mutate({ id: task.id, status: 'DONE' })}
              onDelete={() => setDeleting(task)}
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

      {creating && <TaskForm open clientId={clientId} onClose={() => setCreating(false)} />}
      {editing && (
        <TaskForm
          key={editing.id}
          open
          clientId={clientId}
          task={editing}
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
