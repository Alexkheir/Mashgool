'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/use-clients';
import { useStructureTask, useTranscribe, type ExtractedTask } from '@/lib/use-ai';
import { formatSeconds, MAX_RECORDING_SECONDS, useRecorder } from '@/lib/use-recorder';
import { ACCEPT_ATTRIBUTE, ACCEPTED_EXTENSIONS, rejectAudioFile } from '@/lib/audio-upload';
import { Button } from '@/components/ui/button';
import { inputClass } from './field-styles';

// Voice-to-task's input half (Feature 14): capture audio, transcribe it, let the
// user fix the transcript, then structure it into task fields.
//
// Two API calls with an editing step wedged between them, which is the whole
// reason the pipeline is split server-side. Whisper mishears names and numbers;
// structuring a wrong transcript would produce a confidently wrong task, and the
// user would have to fix it *after* it existed. Here they fix the sentence
// instead, before anything is extracted from it.

type SubStep = 'capture' | 'transcript';

interface VoiceStepProps {
  clientSelected: boolean;
  onCancel: () => void;
  onExtracted: (extraction: ExtractedTask, sourceText: string) => void;
}

export function VoiceStep({ clientSelected, onCancel, onExtracted }: VoiceStepProps) {
  const recorder = useRecorder();
  const transcribe = useTranscribe();
  const structure = useStructureTask();

  const [subStep, setSubStep] = useState<SubStep>('capture');
  const [upload, setUpload] = useState<{ file: File; url: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [emptyResult, setEmptyResult] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The uploaded file's playback URL is ours to release; the recorder owns its
  // own.
  useEffect(() => {
    return () => {
      if (upload) URL.revokeObjectURL(upload.url);
    };
  }, [upload]);

  // Whichever source the user chose. Only one can exist at a time — picking a
  // file clears the take, and recording clears the file.
  const audio = recorder.recording?.blob ?? upload?.file ?? null;
  const audioUrl = recorder.recording?.url ?? upload?.url ?? null;

  function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Let the same file be picked again after a removal — without this the input
    // holds the old value and firing no change event.
    event.target.value = '';
    if (!file) return;

    // Checked before anything is uploaded or processed (a Feature 14 rule), so a
    // wrong file costs a message rather than a round trip.
    const reason = rejectAudioFile(file);
    setUploadError(reason);
    if (reason) return;

    recorder.discard();
    transcribe.reset();
    setUpload({ file, url: URL.createObjectURL(file) });
  }

  function removeUpload() {
    if (upload) URL.revokeObjectURL(upload.url);
    setUpload(null);
    setUploadError(null);
    transcribe.reset();
  }

  function onTranscribe() {
    if (!audio) return;
    transcribe.mutate(audio, {
      onSuccess: ({ transcript: text }) => {
        setTranscript(text);
        setSubStep('transcript');
      }
    });
  }

  function onStructure() {
    if (!transcript.trim()) return;
    setEmptyResult(false);
    structure.mutate(transcript.trim(), {
      onSuccess: ({ extraction }) => {
        if (!extraction.hasActionableTask) {
          setEmptyResult(true);
          return;
        }
        onExtracted(extraction, transcript.trim());
      }
    });
  }

  const busy = transcribe.isPending || structure.isPending;

  return (
    <div className="space-y-4">
      <Steps subStep={subStep} transcribing={transcribe.isPending} structuring={structure.isPending} />

      {subStep === 'capture' ? (
        <div className="space-y-4">
          {!recorder.supported && (
            <Notice tone="neutral">
              This browser can&apos;t record audio. Upload an audio file instead.
            </Notice>
          )}

          {recorder.supported && !recorder.recording && !upload && (
            <RecordPanel recorder={recorder} />
          )}

          {audioUrl && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-neutral-600">
                <span>
                  {recorder.recording
                    ? `Recording · ${formatSeconds(recorder.recording.seconds)}`
                    : upload?.file.name}
                </span>
                <button
                  type="button"
                  onClick={recorder.recording ? recorder.discard : removeUpload}
                  className="text-neutral-500 transition hover:text-neutral-800"
                  disabled={busy}
                >
                  {recorder.recording ? 'Discard & re-record' : 'Remove'}
                </button>
              </div>
              {/* Playback before submitting — and it stays available through the
                  transcript step, so a mishearing can be checked against what was
                  actually said. */}
              <audio controls src={audioUrl} className="w-full" />
            </div>
          )}

          {recorder.autoStopped && (
            <Notice tone="neutral">
              Recording stopped at the {MAX_RECORDING_SECONDS}-second limit.
            </Notice>
          )}

          {recorder.error && (
            <Notice tone="error">
              {recorder.error.message}
              {recorder.error.kind === 'permission' && (
                <>
                  {' '}
                  Allow microphone access for this site in your browser&apos;s address bar, then try
                  again — or upload an audio file instead.
                </>
              )}
            </Notice>
          )}

          {uploadError && <Notice tone="error">{uploadError}</Notice>}

          {transcribe.isError && (
            <Notice tone="error">
              {transcribe.error instanceof ApiError
                ? transcribe.error.message
                : 'Transcription failed. Please try again.'}{' '}
              {/* The audio is still in memory — retrying costs a click, not
                  another take (a Feature 14 rule). */}
              Your recording is still here — try again.
            </Notice>
          )}

          {!upload && recorder.status !== 'recording' && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-medium text-neutral-500 underline-offset-2 transition hover:text-neutral-800 hover:underline"
                disabled={busy}
              >
                {recorder.recording ? 'Or upload a file instead' : 'Upload an audio file'}
              </button>
              <p className="mt-1 text-[11px] text-neutral-400">
                {ACCEPTED_EXTENSIONS.join(', ')} · up to 25MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                onChange={onFilePicked}
                className="hidden"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={onTranscribe}
              disabled={!clientSelected || !audio || recorder.status === 'recording' || busy}
            >
              {transcribe.isPending ? 'Transcribing…' : 'Transcribe'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {audioUrl && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <p className="mb-2 text-xs font-medium text-neutral-600">Your recording</p>
              <audio controls src={audioUrl} className="w-full" />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">Transcript</label>
            <textarea
              className={cn(inputClass, 'min-h-32 resize-y')}
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                if (emptyResult) setEmptyResult(false);
              }}
              autoFocus
            />
            <p className="mt-1 text-xs text-neutral-500">
              Fix anything that was misheard before it becomes a task.
            </p>
          </div>

          {emptyResult && (
            <Notice tone="warning">
              <span className="font-medium">No task found in that note.</span> It reads as a thought
              rather than something to do — try rewording the transcript, or create the task
              yourself.
            </Notice>
          )}

          {structure.isError && (
            <Notice tone="error">
              {structure.error instanceof ApiError
                ? structure.error.message
                : 'Structuring failed. Please try again.'}{' '}
              {/* Retrying re-runs only the second call — the transcript is right
                  here and the recording never has to be made again. */}
              Your transcript is still here — try again.
            </Notice>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setSubStep('capture');
                setEmptyResult(false);
                structure.reset();
              }}
              disabled={busy}
            >
              Back
            </Button>
            <Button onClick={onStructure} disabled={!transcript.trim() || busy}>
              {structure.isPending ? 'Structuring…' : 'Structure task'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// The record button and, while a take is running, the live timer and the pulsing
// indicator that says the microphone is actually open.
function RecordPanel({ recorder }: { recorder: ReturnType<typeof useRecorder> }) {
  const isRecording = recorder.status === 'recording';
  const remaining = MAX_RECORDING_SECONDS - recorder.seconds;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 py-6">
      <button
        type="button"
        onClick={isRecording ? recorder.stop : recorder.start}
        disabled={recorder.status === 'requesting'}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full text-white shadow-sm transition',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2',
          isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700',
          recorder.status === 'requesting' && 'cursor-not-allowed opacity-60'
        )}
      >
        {isRecording ? (
          <span className="h-5 w-5 rounded-sm bg-white" />
        ) : (
          <MicIcon className="h-7 w-7" />
        )}
      </button>

      {isRecording ? (
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
          </span>
          <span className="tabular-nums">
            {formatSeconds(recorder.seconds)} / {formatSeconds(MAX_RECORDING_SECONDS)}
          </span>
          {/* A quiet warning as the cap approaches, so the auto-stop is never a
              surprise. */}
          {remaining <= 10 && <span className="text-neutral-500">{remaining}s left</span>}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">
          {recorder.status === 'requesting'
            ? 'Waiting for microphone access…'
            : `Record a note — up to ${MAX_RECORDING_SECONDS} seconds`}
        </p>
      )}
    </div>
  );
}

// The two-step progress flow the spec asks for, so the wait reads as "step 1 of
// 2" rather than one opaque spinner that sometimes takes twice as long — and so
// a slow structuring call doesn't look like the transcription hanging.
function Steps({
  subStep,
  transcribing,
  structuring
}: {
  subStep: SubStep;
  transcribing: boolean;
  structuring: boolean;
}) {
  const done = subStep === 'transcript';

  return (
    <div className="space-y-2">
      <ol className="flex items-center gap-2 text-xs font-medium">
        <StepPill index={1} label="Transcribe" active={!done} busy={transcribing} done={done} />
        <span className="h-px flex-1 bg-neutral-200" />
        <StepPill index={2} label="Structure" active={done} busy={structuring} done={false} />
      </ol>
      {(transcribing || structuring) && (
        <p className="text-xs text-neutral-500">
          {transcribing ? 'Transcribing your note…' : 'Structuring your task…'}
        </p>
      )}
    </div>
  );
}

function StepPill({
  index,
  label,
  active,
  busy,
  done
}: {
  index: number;
  label: string;
  active: boolean;
  busy: boolean;
  done: boolean;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 transition',
        busy && 'animate-pulse',
        done
          ? 'bg-brand-50 text-brand-700'
          : active
            ? 'bg-neutral-900 text-white'
            : 'bg-neutral-100 text-neutral-500'
      )}
    >
      <span className="tabular-nums">{done ? '✓' : index}</span>
      <span>{label}</span>
    </li>
  );
}

function Notice({
  tone,
  children
}: {
  tone: 'neutral' | 'warning' | 'error';
  children: React.ReactNode;
}) {
  const tones = {
    neutral: 'border-neutral-200 bg-neutral-50 text-neutral-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-800'
  };
  return (
    <div className={cn('rounded-lg border px-3 py-2.5 text-sm', tones[tone])}>{children}</div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}
