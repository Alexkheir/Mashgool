import { AppError } from '../../middleware/error.middleware';
import { writeAuditLog } from '../audit.service';
import { getTranscriptionProvider } from './registry';
import { AiProviderError, type AiFailureKind, type AudioInput, type TranscriptionProvider } from './types';

// Voice-to-task transcription (Feature 14). The sibling of extraction.service:
// same shape, same responsibilities — user-facing contract, audit trail, and the
// translation of provider failures into HTTP — for the other AI capability.
//
// It stops at the transcript. Turning that transcript into task fields is a
// separate call the user makes *after* editing it (CLAUDE.md: the pipeline is
// split so the UI can show two-step progress and the user can correct the
// transcript in between), which is why nothing here touches extraction.

export interface TranscriptionResponse {
  transcript: string;
  provider: { id: string; model: string };
}

const STATUS_BY_KIND: Record<AiFailureKind, number> = {
  // As in extraction: an operator's bad key must not reach the browser as a 401,
  // which the frontend reads as "your session expired" and acts on by logging
  // the user out.
  auth: 503,
  rate_limit: 429,
  timeout: 504,
  unavailable: 503,
  invalid_output: 502,
  // The one failure the user can act on: the file itself could not be read.
  invalid_input: 400
};

const MESSAGE_BY_KIND: Record<AiFailureKind, string> = {
  auth: 'Transcription is temporarily unavailable. Please try again shortly.',
  rate_limit: 'The transcription service is busy right now. Please try again in a moment.',
  timeout: 'Transcription took too long. Please try again, or record a shorter note.',
  unavailable: 'Transcription is temporarily unavailable. Please try again shortly.',
  invalid_output: 'Transcription failed. Please try recording again.',
  invalid_input: "That audio file couldn't be read. Please try recording again, or upload a different file."
};

// Silence, a muted microphone, or thirty seconds of room noise all produce a
// well-formed empty transcript. Nothing failed, so it is not a provider error —
// but there is also nothing to structure, so it cannot be a 200 either. 422 says
// exactly that: the request was understood, the content was unprocessable.
const NO_SPEECH_MESSAGE =
  'No speech was detected in that recording. Please try again, and check your microphone is picking you up.';

// `provider` is injectable so tests can drive the service with a fake instead of
// uploading audio to a real API — the registry's real provider is the default.
export async function transcribeAudio(
  userId: string,
  audio: AudioInput,
  provider: TranscriptionProvider = getTranscriptionProvider()
): Promise<TranscriptionResponse> {
  let transcript: string;

  try {
    // No language hint: Whisper detects it, which is what lets one recorder
    // serve both English and Arabic notes (a Feature 14 rule).
    const result = await provider.transcribe({ audio });
    transcript = result.text.trim();
  } catch (error) {
    if (error instanceof AiProviderError) {
      // The full cause is logged here and nowhere else — the client gets the
      // mapped message only, never a vendor's error text or our credentials.
      console.error('Transcription failed', {
        providerId: error.providerId,
        kind: error.kind,
        message: error.message,
        cause: error.cause instanceof Error ? error.cause.message : undefined
      });
      throw new AppError(STATUS_BY_KIND[error.kind], MESSAGE_BY_KIND[error.kind]);
    }
    throw error;
  }

  // Audited whether or not there was speech: a run of empty transcripts is worth
  // being able to see, and it cost a paid API call either way.
  //
  // The transcript itself never reaches the log. It is the content of a private
  // voice note — the same rule as the pasted message in extraction, and if
  // anything a stricter one, since a spoken note is likelier to wander into
  // things the user never meant to write down.
  writeAuditLog({
    userId,
    action: 'AI_TRANSCRIPTION_TRIGGERED',
    description: transcript
      ? 'Transcribed a voice note'
      : 'Transcribed a voice note with no detectable speech',
    metadata: {
      via: 'voice',
      providerId: provider.id,
      model: provider.model,
      mimeType: audio.mimeType,
      // Size in, characters out — enough to spot "large file, empty transcript"
      // patterns later without storing a syllable of what was said.
      audioBytes: audio.data.byteLength,
      transcriptLength: transcript.length
    }
  });

  if (!transcript) throw new AppError(422, NO_SPEECH_MESSAGE);

  return { transcript, provider: { id: provider.id, model: provider.model } };
}
