'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreateTaskDto,
  TASK_PRIORITIES,
  PRIORITY_META,
  dateInputToIso,
  todayDateInput,
  type CreateTaskInput,
  type CreationMethod,
  type TaskPriority
} from '@/dtos/task.dto';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/use-clients';
import { useCreateTask } from '@/lib/use-tasks';
import { type ExtractedTask, type FieldConfidence } from '@/lib/use-ai';
import { Button } from '@/components/ui/button';
import { inputClass } from './field-styles';

// The last step of both AI paths (Features 13 and 14): what the model made of
// the input, laid out as an editable form, with nothing saved until the user
// says so.
//
// Shared deliberately. Paste and voice differ in how they *produce* an
// extraction; once they have one, reviewing it is the same job, and a second
// copy of this form would be where the two quietly drifted apart.

interface TaskReviewStepProps {
  extraction: ExtractedTask;
  clientId: string;
  // The text the extraction came from, shown alongside so the user can check the
  // result against its source. Labelled per path — "Original message" for a
  // paste, "Transcript" for a voice note.
  sourceLabel: string;
  sourceText: string;
  // Provenance recorded on the task, so the workspace and the audit log can tell
  // an AI-created task from a typed one, and which path made it.
  creationMethod: Extract<CreationMethod, 'PASTE_TO_TASK' | 'VOICE_TO_TASK'>;
  // Returns to the step that produced the extraction, keeping its input intact.
  onBack: () => void;
  onClose: () => void;
}

export function TaskReviewStep({
  extraction,
  clientId,
  sourceLabel,
  sourceText,
  creationMethod,
  onBack,
  onClose
}: TaskReviewStepProps) {
  const router = useRouter();
  const createTask = useCreateTask(clientId);

  // Seeded once, from the extraction this component was mounted with, and freely
  // editable after. The parent only renders this step when it has an extraction,
  // so a new one arrives as a fresh mount rather than as a prop change to
  // reconcile.
  const [title, setTitle] = useState(extraction.title ?? '');
  const [description, setDescription] = useState(extraction.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(extraction.priority ?? 'MEDIUM');
  const [due, setDue] = useState(
    // A due date the model resolved to a day that has already passed would be
    // rejected by the create DTO, so it is dropped rather than carried into a
    // form that cannot be submitted. Rare, but a stale relative date ("by
    // Monday", said a week ago) produces exactly that.
    extraction.dueDate && extraction.dueDate >= todayDateInput() ? extraction.dueDate : ''
  );

  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSave() {
    setSaveError(null);
    setFieldErrors({});

    const raw: CreateTaskInput = {
      title: title.trim(),
      priority,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(dateInputToIso(due) ? { dueDate: dateInputToIso(due) } : {}),
      creationMethod
    };

    const parsed = CreateTaskDto.safeParse(raw);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors(
        Object.fromEntries(
          Object.entries(flat)
            .filter(([, v]) => v?.length)
            .map(([k, v]) => [k, v![0]])
        )
      );
      return;
    }

    createTask.mutate(parsed.data, {
      onSuccess: (task) => {
        onClose();
        // Land on the new task's workspace with it briefly highlighted, so the
        // user sees where their note ended up rather than being dropped into a
        // list and left to find it.
        router.push(`/dashboard/clients/${clientId}?highlight=${task.id}`);
      },
      onError: (err) =>
        setSaveError(
          err instanceof ApiError ? err.message : 'Could not save the task. Please try again.'
        )
    });
  }

  return (
    <div className="space-y-4">
      {/* The source stays visible through the whole review so the user can check
          the extraction against it without going back a step. */}
      <details className="rounded-lg border border-neutral-200 bg-neutral-50" open>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-neutral-600">
          {sourceLabel}
        </summary>
        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-sm text-neutral-700">
          {sourceText}
        </p>
      </details>

      <Field label="Title" confidence={extraction.confidence.title} error={fieldErrors.title}>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" confidence={extraction.confidence.priority}>
          <select
            className={inputClass}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Due date"
          optional
          confidence={extraction.confidence.dueDate}
          error={fieldErrors.dueDate}
        >
          <input
            type="date"
            className={inputClass}
            value={due}
            min={todayDateInput()}
            onChange={(e) => setDue(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description" optional>
        <textarea
          className={cn(inputClass, 'min-h-16 resize-y')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <div className="flex items-center justify-end gap-2 pt-2">
        {/* Back keeps the input that produced this — only the extraction is
            discarded, and re-running produces a fresh one. */}
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onSave} disabled={!title.trim() || createTask.isPending}>
          {createTask.isPending ? 'Saving…' : 'Save task'}
        </Button>
      </div>
    </div>
  );
}

// A labelled field that flags low model confidence. The flag is advisory —
// purely a visual prompt to look, never a reason the form can't be submitted
// (a Feature 13 rule: "flagged fields do not block saving").
function Field({
  label,
  optional,
  confidence,
  error,
  children
}: {
  label: string;
  optional?: boolean;
  confidence?: FieldConfidence | null;
  error?: string;
  children: React.ReactNode;
}) {
  const uncertain = confidence === 'low';
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-neutral-800">
        {label}
        {optional && <span className="font-normal text-neutral-400">(optional)</span>}
        {uncertain && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase">
            Check
          </span>
        )}
      </label>
      <div className={cn(uncertain && 'rounded-lg ring-2 ring-amber-200')}>{children}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
