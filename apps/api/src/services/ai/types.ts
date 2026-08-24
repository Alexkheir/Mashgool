import { TASK_PRIORITIES } from '../../dtos/task.dto';

// The provider-agnostic contract for AI task extraction (Feature 13).
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

export interface ExtractionRequest {
  // The raw pasted message. English, Arabic, or a mix of both.
  text: string;
  // Today's date (`YYYY-MM-DD`, UTC), passed in rather than read inside the
  // provider so relative-date conversion is deterministic and testable — a test
  // can pin "today" instead of depending on when it runs.
  today: string;
}

// The port. One capability, one interface: a future transcription provider
// (Feature 14, Whisper) is a *sibling* port rather than another method here, so
// a vendor that only does one of the two can implement only what it offers.
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
  | 'invalid_output';

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
