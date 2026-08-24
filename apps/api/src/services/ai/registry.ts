import { env } from '../../config/env';
import { createAnthropicProvider } from './providers/anthropic.provider';
import type { TaskExtractionProvider } from './types';

// Which vendor serves AI extraction, resolved from configuration at first use.
//
// This is the single swap point. Moving Mashgool to a different provider is:
//   1. add `providers/<vendor>.provider.ts` implementing TaskExtractionProvider
//   2. add its id to AI_PROVIDERS and a row to `factories` below
//   3. set AI_EXTRACTION_PROVIDER=<vendor> in the environment
// No service, controller, route, DTO, or frontend file changes — none of them
// import a provider, only the port.

export const AI_PROVIDERS = ['anthropic'] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

// A factory per vendor rather than eagerly-built instances: only the configured
// provider is ever constructed, so an unused vendor's credentials do not need to
// be present for the API to boot.
const factories: Record<AiProviderId, () => TaskExtractionProvider> = {
  anthropic: () =>
    createAnthropicProvider({
      apiKey: env.CLAUDE_API_KEY,
      model: env.AI_EXTRACTION_MODEL,
      timeoutMs: env.AI_REQUEST_TIMEOUT_MS
    })
};

let cached: TaskExtractionProvider | undefined;

// Built once and reused — each provider wraps an SDK client with its own
// connection pool, so rebuilding per request would discard keep-alive sockets
// and add a TLS handshake to a call already racing a 5-second target.
export function getExtractionProvider(): TaskExtractionProvider {
  cached ??= factories[env.AI_EXTRACTION_PROVIDER]();
  return cached;
}
