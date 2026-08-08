'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult
} from '@tanstack/react-query';
import { request, clientKeys } from './use-clients';
import { taskKeys, type Task } from './use-tasks';
import type { TaskStatus } from '@/dtos/task.dto';
import { filtersToSearchParams, type TaskFilters } from './filter-parser';

// A board card is a task plus the workspace it belongs to. The global board needs
// that (four columns hold cards from every client), and the per-client board gets
// the same shape so one card component serves both.
export interface BoardTask extends Task {
  client: { id: string; name: string; shortCode: string; color: string };
}

// The server always states all four columns, empty ones included — an empty
// column still has to render and accept drops.
export type BoardColumns = Record<TaskStatus, BoardTask[]>;

// Board data is its own cache subtree, not a slice of `['tasks']`: it is grouped,
// unpaginated, and unsorted by the list's sort field, so the two views can't share
// an entry. Mutations invalidate both.
//
// The active filters are part of the key (Feature 11) — a filtered board is a
// different result set, and caching it under the same key as the unfiltered one
// would show stale cards for a moment on every filter change.
export const boardKeys = {
  all: ['board'] as const,
  global: (filters: TaskFilters = {}) => ['board', 'global', filters] as const,
  // Client ids are UUIDs, so this can never collide with the 'global' key.
  client: (clientId: string, filters: TaskFilters = {}) =>
    ['board', clientId, filters] as const
};

export type BoardQueryKey =
  | ReturnType<typeof boardKeys.global>
  | ReturnType<typeof boardKeys.client>;

// ─── Queries ──────────────────────────────────────────────────────────────────

function boardSearch(filters: TaskFilters): string {
  const search = new URLSearchParams(filtersToSearchParams(filters)).toString();
  return search ? `?${search}` : '';
}

export function useClientBoard(
  clientId: string,
  filters: TaskFilters,
  enabled: boolean
): UseQueryResult<BoardColumns> {
  return useQuery({
    queryKey: boardKeys.client(clientId, filters),
    enabled, // only fetch while the board view is actually showing
    queryFn: async () => {
      const data = await request<{ columns: BoardColumns }>(
        `/api/v1/clients/${clientId}/tasks/board${boardSearch(filters)}`
      );
      return data.columns;
    }
  });
}

export function useGlobalBoard(
  filters: TaskFilters,
  enabled: boolean
): UseQueryResult<BoardColumns> {
  return useQuery({
    queryKey: boardKeys.global(filters),
    enabled,
    queryFn: async () => {
      const data = await request<{ columns: BoardColumns }>(
        `/api/v1/tasks/board${boardSearch(filters)}`
      );
      return data.columns;
    }
  });
}

// ─── Move (drag and drop) ─────────────────────────────────────────────────────

interface MoveVariables {
  taskId: string;
  status: TaskStatus;
  position: number;
  // The board exactly as it should look once the drop lands. The drag handler has
  // already computed it to render the move, so we reuse it as the optimistic
  // cache value instead of re-deriving the same splice here.
  columns: BoardColumns;
}

// A drop must feel instant — the card stays where it was dropped while the request
// is in flight, and snaps back only if the server rejects it. `queryKey` is the
// board being dragged on (per-client or global), so the same hook serves both.
export function useMoveTask(queryKey: BoardQueryKey) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, status, position }: MoveVariables) =>
      request<{ task: Task }>(`/api/v1/tasks/${taskId}/order`, {
        method: 'PATCH',
        body: JSON.stringify({ status, position })
      }).then((d) => d.task),

    onMutate: async ({ columns }) => {
      // Stop an in-flight refetch from landing on top of the optimistic value.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BoardColumns>(queryKey);
      queryClient.setQueryData<BoardColumns>(queryKey, columns);
      return { previous };
    },

    onError: (_err, _vars, context) => {
      // Put the board back exactly as it was — the card returns to its old column.
      if (context?.previous) {
        queryClient.setQueryData<BoardColumns>(queryKey, context.previous);
      }
    },

    onSettled: () => {
      // A move changes board order, the list view's ordering, and (across columns)
      // a client's open-task count, so all three subtrees refetch.
      void queryClient.invalidateQueries({ queryKey: boardKeys.all });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: clientKeys.all });
    }
  });
}
