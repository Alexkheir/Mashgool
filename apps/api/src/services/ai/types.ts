import { TASK_PRIORITIES } from '../../dtos/task.dto';

// The provider-agnostic contracts for Mashgool's AI capabilities: task
// extraction (Feature 13) and speech transcription (Feature 14).
//
// Nothing in this file may reference Anthropic, OpenAI, Google, or any SDK. It
// describes *what* the app needs — "turn a client message into a structured
// task" — while `providers/` holds the vendor-specific code that satisfies it.
// Swapping vendors means writing one new file in `providers/` and changing an
// env var; no service, controller, route, or DTO changes.

// Per-field confidence. Claude/whichever model reports "low" when it inferred or
// guessed a value rather than reading it out of the message; the UI highlights
// those for review. Low confidence never blocks saving (a Feature 13 rule) — it
// is a prompt to look, not a validation failure.
export type FieldConfidence = 'high' | 'low';

// The priority vocabulary is the app's own (uppercase, matching the Prisma enum
// and every other API surface — see task.dto.ts). Providers translate their own
// output into this; the rest of the app never sees a vendor's spelling.
export type ExtractedPriority = (typeof TASK_PRIORITIES)[number];

// One extraction's result, in the app's vocabulary.
//
// Every field except `hasActionableTask` is nullable. The tech spec's sample
// interface typed `title: string` and `priority` non-null while its own prompt
// said "if there is no actionable task set hasActionableTask to false and all
// other fields to null" — a contradiction that would have made the not-a-task
// path unrepresentable. Nullable throughout resolves it.
export interface ExtractedTask {
  // False when the message contains nothing to do ("thanks!", "got it"). The UI
  // shows a "no task found" state and offers manual creation instead.
  hasActionableTask: boolean;
  title: string | null;
  description: string | null;
  // A calendar day, `YYYY-MM-DD`. Relative expressions in the message ("by
  // Friday", "بعد بكرة") are resolved against `ExtractionRequest.today`.
  dueDate: string | null;
  priority: ExtractedPriority | null;
  confidence: {
    title: FieldConfidence | null;
    dueDate: FieldConfidence | null;
    priority: FieldConfidence | null;
  };
}

// Where the text being extracted from came from. Both sources want the same
// fields out, but they are not the same kind of text: a paste is a third party
// writing to the user, a transcript is the user dictating to themselves. The
// prompt is framed accordingly (see prompt.ts) — that framing is also what
// decides whether the text may be read as direction or only as data.
export type ExtractionSource = 'paste' | 'voice';

export interface ExtractionRequest {
  // The text to extract from: a pasted client message, or a transcript the user
  // has confirmed. English, Arabic, or a mix of both.
  text: string;
  source: ExtractionSource;
  // Today's date (`YYYY-MM-DD`, UTC), passed in rather than read inside the
  // provider so relative-date conversion is deterministic and testable — a test
  // can pin "today" instead of depending on when it runs.
  today: string;
}

// The port. One capability, one interface: transcription (below) is a *sibling*
// port rather than another method here, so a vendor that only does one of the
// two can implement only what it offers — which is exactly how it turned out,
// with extraction on Anthropic and transcription on OpenAI at the same time.
export interface TaskExtractionProvider {
  // Identifies the vendor in audit metadata and error messages, e.g. 'anthropic'.
  readonly id: string;
  // The concrete model this instance calls, for audit metadata. Recorded so a
  // later "why did extraction quality change?" can be answered from the log.
  readonly model: string;
  extractTask(request: ExtractionRequest): Promise<ExtractedTask>;
}

// How an extraction failed, in terms the app cares about rather than a vendor's
// status codes. The service maps these to HTTP; providers never import AppError
// or know anything about HTTP.
export type AiFailureKind =
  // Bad or missing credentials — an operator misconfiguration, not a user error.
  | 'auth'
  // Provider rate limit or quota. Retryable after a wait.
  | 'rate_limit'
  // The request exceeded our own deadline.
  | 'timeout'
  // Provider 5xx, overload, or a network failure. Retryable.
  | 'unavailable'
  // The provider answered, but not in the shape the contract requires.
  | 'invalid_output'
  // The provider rejected what we sent as unprocessable — a corrupt or
  // undecodable audio file, say. The only kind here that is the *user's* to
  // fix, so the only one mapping to a 4xx other than 429.
  | 'invalid_input';

export class AiProviderError extends Error {
  constructor(
    public readonly kind: AiFailureKind,
    message: string,
    public readonly providerId: string,
    // Preserved for server-side logging only — never surfaced to the client.
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

// ─── Transcription (Feature 14) ───────────────────────────────────────────────
//
// The sibling port. Deliberately separate from TaskExtractionProvider: the two
// capabilities are served by different vendors today (Anthropic extracts, OpenAI
// transcribes) and a single interface carrying both would force each adapter to
// implement — or stub — a capability its vendor does not offer.

// The formats Mashgool accepts, as the audio DTO enforces them. Providers do not
// widen this: a vendor that accepts more is still only ever handed these.
export interface AudioInput {
  // The raw audio, held in memory. Bounded by the DTO's size cap, never written
  // to disk — a voice note is transient input, not an attachment we store.
  data: Buffer;
  // The upload's declared MIME type (`audio/webm`, `audio/mpeg`, …) and file
  // name. Whisper infers the container from the file name's extension, so it is
  // carried through rather than discarded.
  mimeType: string;
  filename: string;
}

export interface TranscriptionRequest {
  audio: AudioInput;
  // An optional BCP-47 hint (`en`, `ar`). Omitted means "detect the language",
  // which is the path Feature 14 uses — a bilingual user records in whichever
  // language the job is in, and the transcript comes back in that language.
  language?: string;
}

export interface TranscriptionResult {
  // What was said. May legitimately be empty — silence, or background noise
  // only — which the service turns into a user-facing "no speech detected"
  // rather than a provider failure, because nothing actually went wrong.
  text: string;
}

export interface TranscriptionProvider {
  // Identifies the vendor in audit metadata and error messages, e.g. 'openai'.
  readonly id: string;
  // The concrete model this instance calls, for audit metadata.
  readonly model: string;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}
