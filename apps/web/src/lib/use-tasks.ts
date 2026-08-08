'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult
} from '@tanstack/react-query';
import { request } from './use-clients';
import { clientKeys } from './use-clients';
import type { CreateTaskInput, UpdateTaskInput, TaskStatus, SortField } from '@/dtos/task.dto';

// The server's public task shape. Dates arrive as ISO strings over JSON.
export interface Task {
  id: string;
  clientId: string;
  taskKey: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: TaskStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  boardOrder: number;
  creationMethod: 'MANUAL' | 'PASTE_TO_TASK' | 'VOICE_TO_TASK';
  createdAt: string;
  updatedAt: string;
}

export interface TasksPage {
  tasks: Task[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TaskListParams {
  page: number;
  sortBy: SortField;
  order?: 'asc' | 'desc';
}

// Keys are arrays and invalidation depends on their consistency (CLAUDE.md). The
// list key carries the params object so each page/sort combination is cached
// distinctly; every mutation invalidates the whole `['tasks']` subtree.
export const taskKeys = {
  all: ['tasks'] as const,
  list: (clientId: string, params: TaskListParams) =>
    ['tasks', clientId, params] as const
};

// ─── Query ─────────────────────────────────────────────────────────────────────

export function useTasks(
  clientId: string,
  params: TaskListParams
): UseQueryResult<TasksPage> {
  const search = new URLSearchParams({
    page: String(params.page),
    sortBy: params.sortBy,
    ...(params.order ? { order: params.order } : {})
  });
  return useQuery({
    queryKey: taskKeys.list(clientId, params),
    queryFn: () =>
      request<TasksPage>(`/api/v1/clients/${clientId}/tasks?${search.toString()}`),
    // Keep the previous page visible while the next one loads — no flash of empty.
    placeholderData: keepPreviousData
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────────

// A task mutation ripples through three caches: the task lists, the board (the
// same tasks grouped into columns), and the client list (which carries the
// open-task count). The board key is spelled out rather than imported from
// use-board — that module imports `taskKeys` from here, and a shared literal
// avoids a circular import for the sake of one constant. It must stay in step
// with `boardKeys.all`.
function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: taskKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['board'] }),
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
    ]);
}

export function useCreateTask(clientId: string) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      request<{ task: Task }>(`/api/v1/clients/${clientId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(input)
      }).then((d) => d.task),
    onSuccess: invalidate
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      request<{ task: Task }>(`/api/v1/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input)
      }).then((d) => d.task),
    onSuccess: invalidate
  });
}

export function useChangeTaskStatus() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      request<{ task: Task }>(`/api/v1/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      }).then((d) => d.task),
    onSuccess: invalidate
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/api/v1/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate
  });
}
