import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { TASK_PRIORITIES } from '../../../dtos/task.dto';
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from '../prompt';
import {
  AiProviderError,
  type ExtractedTask,
  type ExtractionRequest,
  type TaskExtractionProvider
} from '../types';

// The Anthropic (Claude) implementation of TaskExtractionProvider.
//
// This is the ONLY file in the codebase that imports `@anthropic-ai/sdk`. Every
// vendor concept — model ids, message turns, SDK error classes — is confined
// here and translated at the boundary into the app's own types. An OpenAI or
// Google sibling implements the same interface and nothing upstream changes.

const PROVIDER_ID = 'anthropic';

const confidence = z.enum(['high', 'low']).nullable();

// The response schema, enforced by the API rather than hoped for in a prompt.
// The model is constrained to emit exactly this shape, which removes the entire
// class of failure the tech spec's `JSON.parse(content.text)` was exposed to:
// prose around the JSON, markdown fences, a trailing comma, a hallucinated
// field, a priority spelled "Medium".
//
// Structured outputs need a model that supports them — Sonnet 5 and later, not
// the spec's `claude-sonnet-4-6`. That is why the default model moved forward a
// generation; see registry.ts.
const ExtractionSchema = z.object({
  hasActionableTask: z.boolean(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  // Constrained to a calendar day so the service never has to parse a datetime
  // or a phrase back out of this field.
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  priority: z.enum(TASK_PRIORITIES).nullable(),
  confidence: z.object({
    title: confidence,
    dueDate: confidence,
    priority: confidence
  })
});

export interface AnthropicProviderConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

// Translates an SDK failure into the app's vocabulary. Ordered most-specific
// first, as the SDK's class hierarchy requires — `APIConnectionError` extends
// `APIError` in the TypeScript SDK, so checking the base class first would
// swallow connection failures into the generic branch.
function toProviderError(error: unknown): AiProviderError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiProviderError('auth', 'AI provider rejected our credentials', PROVIDER_ID, error);
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiProviderError('auth', 'AI provider denied access to this model', PROVIDER_ID, error);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError('rate_limit', 'AI provider rate limit reached', PROVIDER_ID, error);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiProviderError('timeout', 'AI provider timed out', PROVIDER_ID, error);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiProviderError('unavailable', 'Could not reach the AI provider', PROVIDER_ID, error);
  }
  if (error instanceof Anthropic.APIError) {
    return new AiProviderError('unavailable', 'AI provider returned an error', PROVIDER_ID, error);
  }
  return new AiProviderError('unavailable', 'AI extraction failed', PROVIDER_ID, error);
}

export function createAnthropicProvider(config: AnthropicProviderConfig): TaskExtractionProvider {
  const client = new Anthropic({
    apiKey: config.apiKey,
    // Milliseconds in the TypeScript SDK (seconds in Python — an easy trap).
    // This is per *attempt*, not per call.
    timeout: config.timeoutMs,
    // One retry rather than the SDK default of two. The SDK retries timeouts and
    // 5xx, so worst-case wall clock is timeoutMs × 2 (~40s at the default) —
    // deliberately bounded low because extraction sits in front of a user
    // watching a spinner against a 5-second target, and a third attempt would
    // cost more in waiting than it recovers.
    maxRetries: 1
  });

  return {
    id: PROVIDER_ID,
    model: config.model,

    async extractTask(request: ExtractionRequest): Promise<ExtractedTask> {
      let parsed: z.infer<typeof ExtractionSchema> | null;

      try {
        const response = await client.messages.parse({
          model: config.model,
          // The response is a handful of short fields; the cap exists to bound a
          // runaway, not to shape the answer.
          max_tokens: 1024,
          // Framed by source: the same rules, but a transcript is introduced
          // as the user’s own dictation rather than a third party’s message.
          system: buildExtractionSystemPrompt(request.source),
          output_config: { format: zodOutputFormat(ExtractionSchema) },
          messages: [{ role: 'user', content: buildExtractionUserPrompt(request) }]
        });

        // A refusal returns a normal 200 with no schema-conforming content, so
        // it must be checked before reading the parsed output.
        if (response.stop_reason === 'refusal') {
          throw new AiProviderError(
            'invalid_output',
            'AI provider declined to process this message',
            PROVIDER_ID
          );
        }

        parsed = response.parsed_output;
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        throw toProviderError(error);
      }

      // `parsed_output` is null when the model hit the token cap mid-object or
      // otherwise failed to satisfy the schema.
      if (!parsed) {
        throw new AiProviderError(
          'invalid_output',
          'AI provider returned no usable extraction',
          PROVIDER_ID
        );
      }

      return normalise(parsed);
    }
  };
}

// The schema guarantees the shape but not the *coherence* of the answer: a model
// can legally return `hasActionableTask: false` alongside a populated title, or
// claim a task with no title at all. Both are contradictions the rest of the app
// should never have to reason about, so they are resolved once, here.
function normalise(parsed: z.infer<typeof ExtractionSchema>): ExtractedTask {
  const empty: ExtractedTask = {
    hasActionableTask: false,
    title: null,
    description: null,
    dueDate: null,
    priority: null,
    confidence: { title: null, dueDate: null, priority: null }
  };

  const title = parsed.title?.trim() || null;
  // A task with no title is not a task we can save — the title is the one
  // required field on a create — so it collapses to the not-a-task result and
  // the user gets the "no task found" path rather than an unsavable form.
  if (!parsed.hasActionableTask || !title) return empty;

  const description = parsed.description?.trim() || null;

  return {
    hasActionableTask: true,
    title,
    description,
    dueDate: parsed.dueDate,
    // A missing priority defaults to MEDIUM (a Feature 13 rule), marked low
    // confidence because nothing in the message supported it.
    priority: parsed.priority ?? 'MEDIUM',
    confidence: {
      title: parsed.confidence.title ?? 'low',
      // Confidence on an absent field is meaningless — null it rather than
      // reporting "high confidence" about a due date that was never extracted.
      dueDate: parsed.dueDate ? (parsed.confidence.dueDate ?? 'low') : null,
      priority: parsed.priority ? (parsed.confidence.priority ?? 'low') : 'low'
    }
  };
}
