import { AppError } from '../../middleware/error.middleware';
import { writeAuditLog } from '../audit.service';
import { utcDayStart } from '../../lib/date';
import { getExtractionProvider } from './registry';
import {
  AiProviderError,
  type AiFailureKind,
  type ExtractedTask,
  type TaskExtractionProvider
} from './types';

// Paste-to-task extraction (Feature 13). The business layer: it owns the
// user-facing contract, the audit trail, and the translation of provider
// failures into HTTP, and knows nothing about which vendor is configured.

export interface ExtractionResponse {
  extraction: ExtractedTask;
  // Echoed back so the audit trail and the UI agree on what produced this, and
  // so a support question ("why was this due date wrong?") can name the model.
  provider: { id: string; model: string };
}

// A provider failure is not the user's fault, and the client can act on the
// difference: a 429 is worth retrying shortly, a 503 is worth retrying at all,
// a 502 means retrying the same text will fail the same way.
const STATUS_BY_KIND: Record<AiFailureKind, number> = {
  // An operator misconfiguration. Deliberately surfaced as a generic 503 rather
  // than a 401 — a 401 here would be read by the frontend's auth handling as
  // "your session expired" and bounce the user to the login page.
  auth: 503,
  rate_limit: 429,
  timeout: 504,
  unavailable: 503,
  invalid_output: 502
};

const MESSAGE_BY_KIND: Record<AiFailureKind, string> = {
  auth: 'AI extraction is temporarily unavailable. Please try again shortly.',
  rate_limit: 'The AI service is busy right now. Please try again in a moment.',
  timeout: 'AI extraction took too long. Please try again.',
  unavailable: 'AI extraction is temporarily unavailable. Please try again shortly.',
  invalid_output: 'Could not read a task from that message. Try rephrasing, or create the task manually.'
};

// `provider` is injectable so tests can drive the service with a fake instead of
// reaching the network — the registry's real provider is the default.
export async function extractTaskFromText(
  userId: string,
  text: string,
  provider: TaskExtractionProvider = getExtractionProvider()
): Promise<ExtractionResponse> {
  // The same UTC day-start the due-date guard, the `due=today` filter and the
  // overdue cutoff use (lib/date.ts), so a date the model resolves to "today"
  // is the same "today" the task DTO will accept.
  const today = utcDayStart().toISOString().slice(0, 10);

  let extraction: ExtractedTask;
  try {
    extraction = await provider.extractTask({ text, today });
  } catch (error) {
    if (error instanceof AiProviderError) {
      // The full cause is logged here and nowhere else — the client gets the
      // mapped message only, never a vendor's error text or our credentials.
      console.error('AI extraction failed', {
        providerId: error.providerId,
        kind: error.kind,
        message: error.message,
        cause: error.cause instanceof Error ? error.cause.message : undefined
      });
      throw new AppError(STATUS_BY_KIND[error.kind], MESSAGE_BY_KIND[error.kind]);
    }
    throw error;
  }

  // Audit records the *outcome*, never the input. `text` is a private client
  // message and must not reach the log — only its length, as a usage signal
  // (CLAUDE.md: "never log raw AI input content").
  writeAuditLog({
    userId,
    action: 'AI_EXTRACTION_TRIGGERED',
    description: extraction.hasActionableTask
      ? 'Extracted a task from pasted text'
      : 'Pasted text contained no actionable task',
    metadata: {
      via: 'paste',
      providerId: provider.id,
      model: provider.model,
      inputLength: text.length,
      hasActionableTask: extraction.hasActionableTask,
      // Which fields came back populated, and how sure the model was — enough to
      // audit extraction quality over time without storing anyone's message.
      fields: {
        title: extraction.title !== null,
        description: extraction.description !== null,
        dueDate: extraction.dueDate !== null,
        priority: extraction.priority
      },
      confidence: extraction.confidence
    }
  });

  return {
    extraction,
    provider: { id: provider.id, model: provider.model }
  };
}
