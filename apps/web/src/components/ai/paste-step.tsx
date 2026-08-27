'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/use-clients';
import { useExtractTask, type ExtractedTask } from '@/lib/use-ai';
import { Button } from '@/components/ui/button';
import { inputClass } from './field-styles';

// Paste-to-task's input step (Feature 13), unchanged in behaviour by Feature 14 —
// only lifted out of the modal so voice could become its sibling rather than a
// second modal.

interface PasteStepProps {
  // The destination client is chosen in the modal shell above; extraction is
  // pointless until one is picked, since the result has nowhere to be saved.
  clientSelected: boolean;
  onCancel: () => void;
  onExtracted: (extraction: ExtractedTask, sourceText: string) => void;
}

export function PasteStep({ clientSelected, onCancel, onExtracted }: PasteStepProps) {
  const extract = useExtractTask();
  const [text, setText] = useState('');
  // Held only for the "nothing here" verdict; a successful extraction is handed
  // straight up to the shell.
  const [emptyResult, setEmptyResult] = useState(false);

  function onExtract() {
    if (!clientSelected || !text.trim()) return;
    setEmptyResult(false);

    extract.mutate(text, {
      onSuccess: ({ extraction }) => {
        // An empty result keeps the user here with their text intact — the "no
        // task found" notice renders next to the textarea they'd need to edit
        // anyway.
        if (!extraction.hasActionableTask) {
          setEmptyResult(true);
          return;
        }
        onExtracted(extraction, text);
      }
    });
  }

  return (
    <div className="space-y-4">
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
            // Editing the message invalidates the previous verdict — clear the
            // "no task found" notice rather than leaving it contradicting text
            // the user has already changed.
            if (emptyResult) setEmptyResult(false);
          }}
          placeholder="Paste the WhatsApp message here — English or Arabic…"
          autoFocus
        />
      </div>

      {emptyResult && (
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
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onExtract} disabled={!clientSelected || !text.trim() || extract.isPending}>
          {extract.isPending ? 'Extracting…' : 'Extract task'}
        </Button>
      </div>
    </div>
  );
}
