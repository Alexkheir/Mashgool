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

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-950">Clients</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Each client is a workspace with its own task keys.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          New client
        </button>
      </header>

      {isLoading && <p className="text-sm text-neutral-500">Loading clients…</p>}
      {isError && (
        <p className="text-sm text-red-600">Couldn’t load your clients. Please refresh.</p>
      )}

      {clients && clients.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center">
          <p className="text-sm text-neutral-600">You don’t have any clients yet.</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Create your first client
          </button>
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
            disabled={deleteClient.isPending}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {deleteClient.isPending ? 'Deleting…' : 'Delete client'}
          </button>
        </div>
      </Modal>
    </section>
  );
}
