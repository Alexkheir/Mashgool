'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useArchiveClient,
  useArchivedClients,
  useClients,
  useDeleteClient,
  useUnarchiveClient,
  sumStats,
  type Client
} from '@/lib/use-clients';
import { StatsBar } from '@/components/dashboard/stats-bar';
import { cn } from '@/lib/utils';
import { GLOBAL_SCOPE, useUiStore, useViewMode } from '@/lib/ui-store';
import { useFilterQuery } from '@/lib/filter-store';
import { useDeleteTask, type Task } from '@/lib/use-tasks';
import { FilterBar } from '@/components/shared/filter-bar';
import { ClientForm } from './client-form';
import { ClientCard } from './client-card';
import { GlobalBoard } from '@/components/board/global-board';
import { TaskForm } from '@/components/tasks/task-form';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ViewToggle } from '@/components/ui/view-toggle';
import { PlusIcon } from '@/components/ui/icons';

export function ClientsView() {
  const router = useRouter();
  const { data: clients, isLoading, isError } = useClients();
  const activeClientId = useUiStore((s) => s.activeClientId);
  const setActiveClient = useUiStore((s) => s.setActiveClient);

  // The dashboard shows either the workspace grid or one board spanning every
  // workspace (Feature 10 "Global Board View"). The dashboard isn't a client, so
  // its choice is stored under the reserved global scope.
  const viewMode = useViewMode(GLOBAL_SCOPE);
  const filter = useFilterQuery(GLOBAL_SCOPE);

  // Selecting a client opens its workspace; we also record it as active so the
  // choice persists (ui.store) for future navigation.
  function openClient(client: Client) {
    setActiveClient(client.id);
    router.push(`/dashboard/clients/${client.id}`);
  }

  const archiveClient = useArchiveClient();
  const unarchiveClient = useUnarchiveClient();
  const deleteClient = useDeleteClient();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Tasks opened from the global board — the dashboard edits and deletes them in
  // place rather than sending the user into the workspace first.
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const deleteTask = useDeleteTask();

  const archivedQuery = useArchivedClients(showArchived);

  function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    deleteClient.mutate(id, {
      onSuccess: () => {
        if (activeClientId === id) setActiveClient(null);
        setDeleting(null);
      }
    });
  }

  function confirmDeleteTask() {
    if (!deletingTask) return;
    deleteTask.mutate(deletingTask.id, { onSuccess: () => setDeletingTask(null) });
  }

  // The global figures are the per-client ones added up — no second endpoint,
  // and no way for the dashboard and the cards to disagree.
  const totals = sumStats(clients ?? []);
  const boardView = viewMode === 'board';

  return (
    <section
      className={cn(
        'mx-auto w-full px-5 py-8 sm:px-8 sm:py-10',
        // The board needs the wider column its four cards live in.
        boardView ? 'max-w-7xl' : 'max-w-6xl'
      )}
    >
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {clients && clients.length > 0
              ? `${clients.length} workspace${clients.length === 1 ? '' : 's'} · ${totals.open} open task${totals.open === 1 ? '' : 's'}`
              : 'Each client is a workspace with its own task keys.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle scope={GLOBAL_SCOPE} />
          <Button onClick={() => setCreating(true)}>
            <PlusIcon className="h-4 w-4" />
            New client
          </Button>
        </div>
      </header>

      {/* The breakdown spans every workspace and is shown in both modes. Its
          tiles are only *interactive* on the board, where there are tasks (and a
          filter bar) for a click to act on — in grid mode they are plain stats
          rather than buttons that would appear to do nothing. */}
      {clients && clients.length > 0 && (
        <StatsBar stats={totals} filter={boardView ? filter : undefined} />
      )}

      {/* The filter bar belongs to the board: the grid below it shows *clients*,
          not tasks, so status/priority/due have nothing to act on there. */}
      {boardView && (
        <>
          <FilterBar filter={filter} showClientHint />
          <GlobalBoard
            filters={filter.filters}
            onClearFilters={filter.clear}
            onOpenTask={setEditingTask}
          />
        </>
      )}

      {!boardView && isLoading && <p className="text-sm text-neutral-500">Loading clients…</p>}
      {!boardView && isError && (
        <p className="text-sm text-red-600">Couldn’t load your clients. Please refresh.</p>
      )}

      {!boardView && clients && clients.length === 0 && (
        <div className="animate-[rise-in] rounded-2xl border border-dashed border-neutral-300 bg-white/50 p-12 text-center">
          <p className="text-sm text-neutral-600">You don’t have any clients yet.</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-neutral-400">
            A client is a workspace — its tasks get their own keys like{' '}
            <span className="font-mono text-neutral-500">BS-1</span>.
          </p>
          <Button className="mt-5" onClick={() => setCreating(true)}>
            <PlusIcon className="h-4 w-4" />
            Create your first client
          </Button>
        </div>
      )}

      {!boardView && clients && clients.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              isActive={activeClientId === client.id}
              onSelect={() => openClient(client)}
              onEdit={() => setEditing(client)}
              onArchive={() => archiveClient.mutate(client.id)}
              onDelete={() => setDeleting(client)}
            />
          ))}
        </div>
      )}

      {/* Archived clients are hidden by default (Feature 8 spec). Archived
          workspaces are absent from the board, so the section goes with the grid. */}
      <div className={cn('mt-10', boardView && 'hidden')}>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          {showArchived ? '▾ Hide archived' : '▸ Show archived'}
        </button>

        {showArchived && (
          <div className="mt-4">
            {archivedQuery.isLoading && (
              <p className="text-sm text-neutral-500">Loading archived…</p>
            )}
            {archivedQuery.data && archivedQuery.data.length === 0 && (
              <p className="text-sm text-neutral-400">No archived clients.</p>
            )}
            {archivedQuery.data && archivedQuery.data.length > 0 && (
              <div className="grid grid-cols-1 gap-4 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
                {archivedQuery.data.map((client) => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    isActive={false}
                    onSelect={() => undefined}
                    onUnarchive={() => unarchiveClient.mutate(client.id)}
                    onDelete={() => setDeleting(client)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create / edit share one form component, keyed so state resets per client. */}
      {creating && <ClientForm open onClose={() => setCreating(false)} />}
      {editing && (
        <ClientForm key={editing.id} open client={editing} onClose={() => setEditing(null)} />
      )}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete client?"
      >
        <p className="text-sm text-neutral-600">
          Deleting <span className="font-medium text-neutral-900">{deleting?.name}</span>{' '}
          permanently removes the client and <strong>all of its tasks</strong>. This
          can’t be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleteClient.isPending}>
            {deleteClient.isPending ? 'Deleting…' : 'Delete client'}
          </Button>
        </div>
      </Modal>

      {/* A card opened from the global board. Its client comes from the task
          itself, since the board spans every workspace. */}
      {editingTask && (
        <TaskForm
          key={editingTask.id}
          open
          clientId={editingTask.clientId}
          task={editingTask}
          onDelete={() => {
            setDeletingTask(editingTask);
            setEditingTask(null);
          }}
          onClose={() => setEditingTask(null)}
        />
      )}

      <Modal
        open={Boolean(deletingTask)}
        onClose={() => setDeletingTask(null)}
        title="Delete task?"
      >
        <p className="text-sm text-neutral-600">
          Deleting{' '}
          <span className="font-medium text-neutral-900">
            {deletingTask?.taskKey} — {deletingTask?.title}
          </span>{' '}
          is permanent, and its key is retired for good. This can’t be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeletingTask(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDeleteTask} disabled={deleteTask.isPending}>
            {deleteTask.isPending ? 'Deleting…' : 'Delete task'}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
