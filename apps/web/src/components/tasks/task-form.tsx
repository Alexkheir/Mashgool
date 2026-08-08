'use client';

import { useState, type FormEvent } from 'react';
import {
  CreateTaskDto,
  UpdateTaskDto,
  TASK_PRIORITIES,
  TASK_STATUSES,
  PRIORITY_META,
  STATUS_META,
  dateInputToIso,
  isoToDateInput,
  todayDateInput,
  type CreateTaskInput,
  type UpdateTaskInput,
  type TaskStatus
} from '@/dtos/task.dto';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/use-clients';
import { useCreateTask, useUpdateTask, type Task } from '@/lib/use-tasks';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface TaskFormProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  // Present → edit that task; absent → create a new one.
  task?: Task;
  // Pre-selected status for a brand-new task (e.g. created from a board column,
  // Feature 10). Ignored in edit mode.
  initialStatus?: TaskStatus;
  // When editing, offers delete from inside the form. The board has no per-card
  // action buttons (a card is a drag handle), so this is how a task opened from
  // a board gets deleted. The parent still owns the confirmation dialog.
  onDelete?: () => void;
}

const inputClass =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20';

export function TaskForm({
  open,
  onClose,
  clientId,
  task,
  initialStatus,
  onDelete
}: TaskFormProps) {
  const isEdit = Boolean(task);
  const createTask = useCreateTask(clientId);
  const updateTask = useUpdateTask();

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 'MEDIUM');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? initialStatus ?? 'TODO');
  const [due, setDue] = useState(isoToDateInput(task?.dueDate ?? null));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const pending = createTask.isPending || updateTask.isPending;

  function fail(err: unknown) {
    if (err instanceof ApiError && err.fieldErrors) {
      setFieldErrors(flattenFirst(err.fieldErrors));
    } else if (err instanceof ApiError) {
      setFormError(err.message);
    } else {
      setFormError('Something went wrong. Please try again.');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    if (isEdit && task) {
      // Only send changed fields — a PATCH touches what it names. Empty text
      // clears a nullable field (→ null).
      const input: UpdateTaskInput = {};
      if (title.trim() !== task.title) input.title = title.trim();
      if (priority !== task.priority) input.priority = priority;
      if (status !== task.status) input.status = status;

      const nextDesc = description.trim();
      if (nextDesc !== (task.description ?? '')) input.description = nextDesc || null;
      const nextNotes = notes.trim();
      if (nextNotes !== (task.notes ?? '')) input.notes = nextNotes || null;

      const nextDue = dateInputToIso(due);
      if (isoToDateInput(nextDue) !== isoToDateInput(task.dueDate)) input.dueDate = nextDue;

      if (Object.keys(input).length === 0) {
        onClose();
        return;
      }

      const parsed = UpdateTaskDto.safeParse(input);
      if (!parsed.success) {
        setFieldErrors(flattenFirst(parsed.error.flatten().fieldErrors));
        return;
      }
      updateTask.mutate({ id: task.id, input: parsed.data }, { onSuccess: onClose, onError: fail });
      return;
    }

    const raw: CreateTaskInput = {
      title: title.trim(),
      priority,
      ...(status !== 'TODO' ? { status } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(dateInputToIso(due) ? { dueDate: dateInputToIso(due) } : {})
    };
    const parsed = CreateTaskDto.safeParse(raw);
    if (!parsed.success) {
      setFieldErrors(flattenFirst(parsed.error.flatten().fieldErrors));
      return;
    }
    createTask.mutate(parsed.data, { onSuccess: onClose, onError: fail });
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit ${task!.taskKey}` : 'New task'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Title</label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Design the new landing page"
            autoFocus
          />
          {fieldErrors.title && <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">Priority</label>
            <select
              className={inputClass}
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">
              Due date <span className="font-normal text-neutral-400">(optional)</span>
            </label>
            <input
              type="date"
              className={inputClass}
              value={due}
              min={todayDateInput()}
              onChange={(e) => setDue(e.target.value)}
            />
            {fieldErrors.dueDate && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.dueDate}</p>
            )}
          </div>
        </div>

        {/* Status is set on creation (defaults To Do) but only chosen explicitly
            when editing an existing task. */}
        {isEdit && (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">Status</label>
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">
            Description <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            className={cn(inputClass, 'min-h-16 resize-y')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs doing…"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">
            Notes <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            className={cn(inputClass, 'min-h-16 resize-y')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Extra context, links…"
          />
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="mr-auto rounded px-2 py-1 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete
            </button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Zod's fieldErrors gives string[] per field; show one line per field.
function flattenFirst(
  fieldErrors: Record<string, string[] | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) out[key] = messages[0];
  }
  return out;
}
