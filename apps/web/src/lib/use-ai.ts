'use client';

import { useMutation } from '@tanstack/react-query';
import { request } from './use-clients';
import { MIME_BY_EXTENSION, uploadMimeType } from './audio-upload';
import type { TaskPriority } from '@/dtos/task.dto';

// The AI pipeline's client half (Features 13 and 14). Every call is a mutation
// rather than a query: each has a side effect (it spends money and writes an
// audit entry), each is triggered by an explicit user action, and none may be
// re-run automatically on a refocus or a retry the way a cached query would be.
//
// Three endpoints, not one, mirroring the server: paste extracts in a single
// step; voice transcribes, lets the user fix the transcript, then structures.

export type FieldConfidence = 'high' | 'low';

// Mirrors the API's ExtractedTask. Every field but the flag is nullable — the
// "no actionable task" answer populates none of them.
export interface ExtractedTask {
  hasActionableTask: boolean;
  title: string | null;
  description: string | null;
  // A calendar day, `YYYY-MM-DD`.
  dueDate: string | null;
  priority: TaskPriority | null;
  confidence: {
    title: FieldConfidence | null;
    dueDate: FieldConfidence | null;
    priority: FieldConfidence | null;
  };
}

export interface ExtractionResponse {
  extraction: ExtractedTask;
  provider: { id: string; model: string };
}

export function useExtractTask() {
  return useMutation({
    mutationFn: (text: string) =>
      request<ExtractionResponse>('/api/v1/ai/extract', {
        method: 'POST',
        body: JSON.stringify({ text })
      }),
    // No retry. A failed extraction returns the user to the input step with
    // their text intact (Feature 13: "can retry without re-entering text"), so
    // retrying is their decision — a silent retry would double the cost and the
    // wait without telling them anything.
    retry: false
  });
}

// ─── Voice to task (Feature 14) ──────────────────────────────────────────────

export interface TranscriptionResponse {
  transcript: string;
  provider: { id: string; model: string };
}

// The form field the audio travels under. The server names the same constant;
// they have to agree or every upload is a 400.
export const AUDIO_FIELD = 'audio';

// Step one: audio in, transcript out. The blob goes up as multipart rather than
// JSON — base64 in a JSON body would inflate it by a third and cost a copy at
// both ends for no benefit.
export function useTranscribe() {
  return useMutation({
    mutationFn: (audio: Blob) => {
      const { part, filename } = toUploadPart(audio);
      const form = new FormData();
      // A named part: multer needs one, and the browser only sends a filename
      // when it is given one explicitly for a bare Blob.
      form.append(AUDIO_FIELD, part, filename);
      return request<TranscriptionResponse>('/api/v1/ai/transcribe', {
        method: 'POST',
        body: form
      });
    },
    // No retry, for a stronger reason than extraction's: a retry re-uploads the
    // whole file. The UI offers a retry button that reuses the recording already
    // in memory, so the user never has to record again (a Feature 14 rule).
    retry: false
  });
}

// Step two: the transcript the user confirmed, structured into task fields by
// the same extraction that serves paste-to-task.
export function useStructureTask() {
  return useMutation({
    mutationFn: (transcript: string) =>
      request<ExtractionResponse>('/api/v1/ai/structure', {
        method: 'POST',
        body: JSON.stringify({ transcript })
      }),
    retry: false
  });
}

// Prepares the multipart part. Two things can be missing and both matter:
//
//   • A recorded blob has a type but no name — the server rebuilds the name it
//     sends to Whisper anyway, but multer wants a named part.
//   • An uploaded file has a name but sometimes no type: `File.type` is whatever
//     the OS says, and it is empty for an .m4a or .ogg with no registered
//     handler. The browser then sends `application/octet-stream`, which the API
//     refuses as an unsupported format — so the type is re-declared from the
//     extension, which is the one piece of truth we do have.
function toUploadPart(audio: Blob): { part: Blob; filename: string } {
  const name = audio instanceof File ? audio.name : '';
  const type = uploadMimeType(name, audio.type);

  return {
    // Re-wrapped only when the browser's own type is unusable — the copy costs a
    // second buffer of the file, so it is not done for the common case.
    part: audio.type.split(';')[0] === type ? audio : new Blob([audio], { type }),
    filename: name || `voice-note.${extensionFor(type)}`
  };
}

function extensionFor(mimeType: string): string {
  const match = Object.entries(MIME_BY_EXTENSION).find(([, value]) => value === mimeType);
  return match?.[0] ?? 'webm';
}
