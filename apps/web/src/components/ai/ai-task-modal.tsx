'use client';

import { useEffect, useState } from 'react';
import type { Client } from '@/lib/use-clients';
import type { ExtractedTask } from '@/lib/use-ai';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { inputClass } from './field-styles';
import { PasteStep } from './paste-step';
import { VoiceStep } from './voice-step';
import { TaskReviewStep } from './task-review-step';

// The AI entry point: one modal, two ways in (Features 13 and 14).
//
// Voice is a tab here rather than a second modal, per Feature 14 ("accessible
// from the same entry point as paste-to-task, presented as a tab or toggle").
// The shell owns what the two paths share — which client the task lands in, and
// the review-and-save step they both end at — so the difference between them is
// exactly one thing: how the extraction was produced.

export type AiTaskMode = 'paste' | 'voice';

interface AiTaskModalProps {
  open: boolean;
  onClose: () => void;
  // Active clients, for the destination dropdown.
  clients: Client[];
  // Pre-selected when opened from inside a workspace; absent on the global
  // dashboard, where the user picks.
  initialClientId?: string;
  initialMode?: AiTaskMode;
}

const MODE_META: Record<
  AiTaskMode,
  { tab: string; title: string; sourceLabel: string; creationMethod: 'PASTE_TO_TASK' | 'VOICE_TO_TASK' }
> = {
  paste: {
    tab: 'Paste',
    title: 'Paste to task',
    sourceLabel: 'Original message',
    creationMethod: 'PASTE_TO_TASK'
  },
  voice: {
    tab: 'Voice',
    title: 'Voice to task',
    sourceLabel: 'Transcript',
    creationMethod: 'VOICE_TO_TASK'
  }
};

export function AiTaskModal({
  open,
  onClose,
  clients,
  initialClientId,
  initialMode = 'paste'
}: AiTaskModalProps) {
  const [mode, setMode] = useState<AiTaskMode>(initialMode);
  const [clientId, setClientId] = useState(initialClientId ?? '');
  // Present exactly when the review step should be showing: the extraction and
  // the text it came from, kept together so the review can never display one
  // path's fields beside the other path's source.
  const [result, setResult] = useState<{ extraction: ExtractedTask; sourceText: string } | null>(
    null
  );

  // Reset on open so a second use never inherits the first one's input,
  // extraction, or tab. The workspace's pre-selected client is re-applied.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setClientId(initialClientId ?? '');
    setResult(null);
  }, [open, initialClientId, initialMode]);

  const meta = MODE_META[mode];
  const reviewing = result !== null;

  function switchMode(next: AiTaskMode) {
    if (next === mode) return;
    // Switching tabs abandons whatever the other path had in flight. Each step
    // owns its own input, so unmounting it is what clears the recorder's stream
    // and the pasted text — a half-finished take must not survive into a paste.
    setMode(next);
    setResult(null);
  }

  return (
    <Modal open={open} onClose={onClose} title={reviewing ? 'Review extracted task' : meta.title}>
      {reviewing ? (
        <TaskReviewStep
          extraction={result.extraction}
          clientId={clientId}
          sourceLabel={meta.sourceLabel}
          sourceText={result.sourceText}
          creationMethod={meta.creationMethod}
          // Back returns to a fresh input step. The extraction is discarded; the
          // user's message or recording is not theirs to lose silently, so each
          // step keeps its own.
          onBack={() => setResult(null)}
          onClose={onClose}
        />
      ) : (
        <div className="space-y-4">
          {/* One tab strip, two ways to describe the same job. */}
          <div
            role="tablist"
            aria-label="How to create the task"
            className="flex gap-1 rounded-full bg-neutral-100 p-1"
          >
            {(Object.keys(MODE_META) as AiTaskMode[]).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => switchMode(value)}
                className={cn(
                  'flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                  mode === value
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-800'
                )}
              >
                {MODE_META[value].tab}
              </button>
            ))}
          </div>

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

          {mode === 'paste' ? (
            <PasteStep
              clientSelected={Boolean(clientId)}
              onCancel={onClose}
              onExtracted={(extraction, sourceText) => setResult({ extraction, sourceText })}
            />
          ) : (
            <VoiceStep
              clientSelected={Boolean(clientId)}
              onCancel={onClose}
              onExtracted={(extraction, sourceText) => setResult({ extraction, sourceText })}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
