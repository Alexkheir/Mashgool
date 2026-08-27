import OpenAI, { toFile } from 'openai';
import {
  AiProviderError,
  type TranscriptionProvider,
  type TranscriptionRequest,
  type TranscriptionResult
} from '../types';

// The OpenAI (Whisper) implementation of TranscriptionProvider.
//
// This is the ONLY file in the codebase that imports `openai`, exactly as
// `anthropic.provider.ts` is the only one that imports `@anthropic-ai/sdk`.
// Every vendor concept — model ids, upload helpers, SDK error classes — is
// confined here and translated at the boundary into the app's own types. That
// two different vendors now serve the two AI capabilities, with no file outside
// `providers/` naming either of them, is the payoff of the Feature 13 port.

const PROVIDER_ID = 'openai';

export interface OpenAiProviderConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

// Translates an SDK failure into the app's vocabulary. Ordered most-specific
// first, as the SDK's class hierarchy requires — `APIConnectionTimeoutError`
// extends `APIConnectionError` extends `APIError`, so checking a base class
// first would swallow the specific cases into the generic branch.
function toProviderError(error: unknown): AiProviderError {
  if (error instanceof OpenAI.AuthenticationError) {
    return new AiProviderError('auth', 'Transcription provider rejected our credentials', PROVIDER_ID, error);
  }
  if (error instanceof OpenAI.PermissionDeniedError) {
    return new AiProviderError('auth', 'Transcription provider denied access to this model', PROVIDER_ID, error);
  }
  if (error instanceof OpenAI.RateLimitError) {
    // Also how an exhausted quota arrives (`insufficient_quota` is a 429), which
    // is fine: both mean "not now, try again later", which is what a 429 tells
    // the client.
    return new AiProviderError('rate_limit', 'Transcription provider rate limit reached', PROVIDER_ID, error);
  }
  // A 400 or 422 from Whisper means it could not decode what we sent — a
  // truncated recording, or a container whose declared type was a lie. Our own
  // DTO already refused the formats we know we cannot use, so anything reaching
  // here is a file problem the user can fix by recording again.
  if (error instanceof OpenAI.BadRequestError || error instanceof OpenAI.UnprocessableEntityError) {
    return new AiProviderError('invalid_input', 'Transcription provider could not read the audio', PROVIDER_ID, error);
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AiProviderError('timeout', 'Transcription provider timed out', PROVIDER_ID, error);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AiProviderError('unavailable', 'Could not reach the transcription provider', PROVIDER_ID, error);
  }
  if (error instanceof OpenAI.APIError) {
    return new AiProviderError('unavailable', 'Transcription provider returned an error', PROVIDER_ID, error);
  }
  return new AiProviderError('unavailable', 'Transcription failed', PROVIDER_ID, error);
}

export function createOpenAiProvider(config: OpenAiProviderConfig): TranscriptionProvider {
  const client = new OpenAI({
    apiKey: config.apiKey,
    // Milliseconds. This is per *attempt*, not per call, and is set from a
    // separate env var to the extraction timeout: uploading and transcribing a
    // minute of audio is a fundamentally slower operation than a short text
    // completion, and holding both to the same deadline would either cut
    // transcription off or let extraction hang.
    timeout: config.timeoutMs,
    // One retry rather than the SDK default of two. A retry re-uploads the whole
    // file, so the third attempt would cost another full upload on top of a wait
    // the user is already watching; the UI lets them retry by hand instead,
    // without re-recording (a Feature 14 rule).
    maxRetries: 1
  });

  return {
    id: PROVIDER_ID,
    model: config.model,

    async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
      try {
        // Whisper infers the container format from the file name's extension, so
        // the upload's own name is carried through rather than replaced with a
        // generic one — send `blob` and a valid recording is rejected as an
        // unknown format.
        const file = await toFile(request.audio.data, request.audio.filename, {
          type: request.audio.mimeType
        });

        const response = await client.audio.transcriptions.create({
          file,
          model: config.model,
          // `json` rather than the spec sample's `text`: it returns the same
          // transcript in a typed object instead of a bare string, so an empty
          // result is an empty *field* rather than an empty response body that
          // has to be distinguished from a failed read.
          response_format: 'json',
          // Omitted entirely when we have no hint. Whisper detects the language
          // itself, which is what makes one recorder work for both English and
          // Arabic (a Feature 14 rule) — pinning a wrong language here would
          // make it *translate* rather than transcribe.
          ...(request.language ? { language: request.language } : {})
        });

        // An empty transcript is not an error: silence and background noise both
        // produce one legitimately. It is returned as-is and the service decides
        // what to tell the user.
        return { text: response.text ?? '' };
      } catch (error) {
        throw toProviderError(error);
      }
    }
  };
}
