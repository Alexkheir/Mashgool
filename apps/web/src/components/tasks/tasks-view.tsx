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
    <section className="mx-auto w-full max-w-5xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        ← All clients
      </Link>

      <header className="mt-4 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {client.data && (
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: client.data.color }}
            />
          )}
          <h1 className="text-2xl font-semibold text-neutral-950">
            {client.data?.name ?? 'Workspace'}
          </h1>
          {client.data && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-xs font-medium text-neutral-600">
              {client.data.shortCode}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          New task
        </button>
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
            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-950 outline-none focus:border-neutral-900"
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
        <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center">
          <p className="text-sm text-neutral-600">No tasks in this workspace yet.</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Create the first task
          </button>
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
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-full border border-neutral-300 px-4 py-1.5 font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-neutral-500">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => (data && p < data.totalPages ? p + 1 : p))}
            disabled={page >= data.totalPages}
            className="rounded-full border border-neutral-300 px-4 py-1.5 font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40"
          >
            Next →
          </button>
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
          <button
            type="button"
            onClick={() => setDeleting(null)}
            className="rounded-full px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleteTask.isPending}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {deleteTask.isPending ? 'Deleting…' : 'Delete task'}
          </button>
        </div>
      </Modal>
    </section>
  );
}
