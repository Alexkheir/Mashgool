'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult
} from '@tanstack/react-query';
import { apiUrl } from './api-url';
import type { CreateClientInput, UpdateClientInput } from '@/dtos/client.dto';

// The server's public client shape. Dates arrive as ISO strings over JSON.
export interface Client {
  id: string;
  name: string;
  shortCode: string;
  description: string | null;
  color: string;
  isArchived: boolean;
  openTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

// React Query keys are arrays, and invalidation depends on their consistency
// (a CLAUDE.md convention). Every client mutation invalidates `all` so lists
// refetch; the archived list shares the `['clients', ...]` prefix.
export const clientKeys = {
  all: ['clients'] as const,
  active: ['clients', 'active'] as const,
  archived: ['clients', 'archived'] as const,
  detail: (id: string) => ['clients', id] as const
};

// Thrown on a non-2xx response, carrying the server's status + message so forms
// can surface, e.g., the 409 "Short code is already in use" verbatim.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Exported so sibling hook modules (e.g. use-tasks) share one fetch wrapper —
// the same credentials, JSON handling, and ApiError semantics.
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (data as { message?: string } | null)?.message ?? 'Something went wrong.';
    const fieldErrors = (data as { errors?: Record<string, string[]> } | null)?.errors;
    throw new ApiError(res.status, message, fieldErrors);
  }

  return data as T;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useClients(): UseQueryResult<Client[]> {
  return useQuery({
    queryKey: clientKeys.active,
    queryFn: async () => {
      const data = await request<{ clients: Client[] }>('/api/v1/clients');
      return data.clients;
    }
  });
}

// A single client by id — used by the workspace header (name, color, short code)
// when the list isn't already cached (e.g. deep-linking to a workspace URL).
export function useClient(id: string): UseQueryResult<Client> {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: async () => {
      const data = await request<{ client: Client }>(`/api/v1/clients/${id}`);
      return data.client;
    }
  });
}

export function useArchivedClients(enabled: boolean): UseQueryResult<Client[]> {
  return useQuery({
    queryKey: clientKeys.archived,
    enabled, // only fetch when the archived section is actually opened
    queryFn: async () => {
      const data = await request<{ clients: Client[] }>('/api/v1/clients/archived');
      return data.clients;
    }
  });
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

// One invalidation used by every mutation — refetch anything under ['clients'].
function useInvalidateClients() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: clientKeys.all });
}

export function useCreateClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (input: CreateClientInput) =>
      request<{ client: Client }>('/api/v1/clients', {
        method: 'POST',
        body: JSON.stringify(input)
      }).then((d) => d.client),
    onSuccess: invalidate
  });
}

export function useUpdateClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClientInput }) =>
      request<{ client: Client }>(`/api/v1/clients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input)
      }).then((d) => d.client),
    onSuccess: invalidate
  });
}

export function useArchiveClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ client: Client }>(`/api/v1/clients/${id}/archive`, { method: 'POST' }),
    onSuccess: invalidate
  });
}

export function useUnarchiveClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ client: Client }>(`/api/v1/clients/${id}/unarchive`, { method: 'POST' }),
    onSuccess: invalidate
  });
}

export function useDeleteClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (id: string) =>
      request<void>(`/api/v1/clients/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate
  });
}
