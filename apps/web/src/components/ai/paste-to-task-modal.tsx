'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreateTaskDto,
  TASK_PRIORITIES,
  PRIORITY_META,
  dateInputToIso,
  todayDateInput,
  type CreateTaskInput,
  type TaskPriority
} from '@/dtos/task.dto';
import { cn } from '@/lib/utils';
import { ApiError, type Client } from '@/lib/use-clients';
import { useCreateTask } from '@/lib/use-tasks';
import { useExtractTask, type ExtractedTask, type FieldConfidence } from '@/lib/use-ai';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

// Paste-to-task (Feature 13). Two steps in one modal: paste a client message,
// then review what the AI made of it before anything is saved.
//
// The steps are deliberately separate — the extraction is a suggestion, not a
// result. Nothing is written until the user accepts it, and everything on the
// review step is editable, so a wrong title or an invented due date costs an
// edit rather than a wrong task.

type Step = 'input' | 'review';

interface PasteToTaskModalProps {
  open: boolean;
  onClose: () => void;
  // Active clients, for the destination dropdown.
  clients: Client[];
  // Pre-selected when opened from inside a workspace; absent on the global
  // dashboard, where the user picks.
  initialClientId?: string;
}

const inputClass =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20';

export function PasteToTaskModal({
  open,
  onClose,
  clients,
  initialClientId
}: PasteToTaskModalProps) {
  const router = useRouter();
  const extract = useExtractTask();

  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [clientId, setClientId] = useState(initialClientId ?? '');
  const [extraction, setExtraction] = useState<ExtractedTask | null>(null);

  // Review-step fields, seeded from the extraction and freely editable after.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [due, setDue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const createTask = useCreateTask(clientId);

  // Reset on open so a second use never inherits the first one's message,
  // extraction, or error. The workspace's pre-selected client is re-applied.
  useEffect(() => {
    if (!open) return;
    setStep('input');
    setText('');
    setClientId(initialClientId ?? '');
    setExtraction(null);
    setSaveError(null);
    setFieldErrors({});
    extract.reset();
    // Keyed only on opening. `extract` is deliberately not a dependency: React
    // Query hands back a new mutation object on every state change, so including
    // it would re-run this reset mid-flight — wiping the user's text the instant
    // the extraction started.
  }, [open, initialClientId]);

  function onExtract() {
    if (!clientId || !text.trim()) return;
    extract.mutate(text, {
      onSuccess: ({ extraction: result }) => {
        setExtraction(result);
        // An empty result keeps the user on the input step with their text
        // intact — the "no task found" notice renders there, next to the
        // textarea they'd need to edit anyway.
        if (!result.hasActionableTask) return;

        setTitle(result.title ?? '');
        setDescription(result.description ?? '');
        setPriority(result.priority ?? 'MEDIUM');
        // A due date the model resolved to a day that has already passed would
        // be rejected by the create DTO, so it is dropped rather than carried
        // into a form that cannot be submitted. Rare, but a stale relative date
        // ("by Monday" pasted a week late) produces exactly that.
        setDue(result.dueDate && result.dueDate >= todayDateInput() ? result.dueDate : '');
        setStep('review');
      }
    });
  }

  function onSave() {
    setSaveError(null);
    setFieldErrors({});

    const raw: CreateTaskInput = {
      title: title.trim(),
      priority,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(dateInputToIso(due) ? { dueDate: dateInputToIso(due) } : {}),
      // Marks the task as AI-extracted, so the workspace and the audit log can
      // tell it apart from one typed by hand.
      creationMethod: 'PASTE_TO_TASK'
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
        // user sees where their paste ended up rather than being dropped into a
        // list and left to find it.
        router.push(`/dashboard/clients/${clientId}?highlight=${task.id}`);
      },
      onError: (err) =>
        setSaveError(
          err instanceof ApiError ? err.message : 'Could not save the task. Please try again.'
        )
    });
  }

  const noTaskFound = extraction !== null && !extraction.hasActionableTask;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'input' ? 'Paste to task' : 'Review extracted task'}
    >
      {step === 'input' ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">Client</label>
            <select
              className={inputClass}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.shortCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-neutral-800">Client message</label>
              {text && (
                <button
                  type="button"
                  onClick={() => setText('')}
                  className="text-xs font-medium text-neutral-500 transition hover:text-neutral-800"
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              className={cn(inputClass, 'min-h-40 resize-y')}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                // Editing the message invalidates the previous verdict — clear
                // the "no task found" notice rather than leaving it contradicting
                // text the user has already changed.
                if (extraction) setExtraction(null);
              }}
              placeholder="Paste the WhatsApp message here — English or Arabic…"
              autoFocus
            />
          </div>

          {noTaskFound && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <p className="font-medium">No task found in that message.</p>
              <p className="mt-0.5 text-amber-800">
                It reads as a note rather than a request. Try pasting a different part of the
                conversation, or create the task yourself.
              </p>
            </div>
          )}

          {extract.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              <p>
                {extract.error instanceof ApiError
                  ? extract.error.message
                  : 'Extraction failed. Please try again.'}
              </p>
              {/* The message is still in the textarea — retrying costs a click. */}
              <p className="mt-0.5 text-red-700">Your message is still here — try again.</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onExtract} disabled={!clientId || !text.trim() || extract.isPending}>
              {extract.isPending ? 'Extracting…' : 'Extract task'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* The original stays visible through the whole review so the user can
              check the extraction against the source without going back. */}
          <details className="rounded-lg border border-neutral-200 bg-neutral-50" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-neutral-600">
              Original message
            </summary>
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-sm text-neutral-700">
              {text}
            </p>
          </details>

          <Field label="Title" confidence={extraction?.confidence.title} error={fieldErrors.title}>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority" confidence={extraction?.confidence.priority}>
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
              confidence={extraction?.confidence.dueDate}
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
            {/* Back keeps the message and the client selection — only the
                extraction is discarded, and re-running produces a fresh one. */}
            <Button variant="ghost" onClick={() => setStep('input')}>
              Back
            </Button>
            <Button onClick={onSave} disabled={!title.trim() || createTask.isPending}>
              {createTask.isPending ? 'Saving…' : 'Save task'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
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
