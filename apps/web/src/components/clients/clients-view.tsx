'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useArchiveClient,
  useArchivedClients,
  useClients,
  useDeleteClient,
  useUnarchiveClient,
  type Client
} from '@/lib/use-clients';
import { useUiStore } from '@/lib/ui-store';
import { ClientForm } from './client-form';
import { ClientCard } from './client-card';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { PlusIcon } from '@/components/ui/icons';

export function ClientsView() {
  const router = useRouter();
  const { data: clients, isLoading, isError } = useClients();
  const activeClientId = useUiStore((s) => s.activeClientId);
  const setActiveClient = useUiStore((s) => s.setActiveClient);

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

  const totalOpen = clients?.reduce((sum, c) => sum + c.openTaskCount, 0) ?? 0;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {clients && clients.length > 0
              ? `${clients.length} workspace${clients.length === 1 ? '' : 's'} · ${totalOpen} open task${totalOpen === 1 ? '' : 's'}`
              : 'Each client is a workspace with its own task keys.'}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className="h-4 w-4" />
          New client
        </Button>
      </header>

      {isLoading && <p className="text-sm text-neutral-500">Loading clients…</p>}
      {isError && (
        <p className="text-sm text-red-600">Couldn’t load your clients. Please refresh.</p>
      )}

      {clients && clients.length === 0 && (
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

      {clients && clients.length > 0 && (
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

      {/* Archived clients are hidden by default (Feature 8 spec). */}
      <div className="mt-10">
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
    </section>
  );
}
