import { z } from 'zod';

// Environment variables validated once, at startup. If anything required is
// missing or malformed the process exits immediately rather than booting into
// a half-working state (a CLAUDE.md rule).
//
// This schema grows per feature: Feature 7 (auth) added the JWT and Google
// blocks, Feature 13 the AI extraction block, Feature 14 transcription.
// SENTRY_DSN and friends follow when their features land, so the app isn't
// forced to carry secrets before any of the code that uses them exists.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000').transform(Number),

  DATABASE_URL: z.string().url(),

  // Session JWT. Secret must be long enough to be meaningfully unguessable.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Google OAuth 2.0 credentials (from the Google Cloud Console).
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),

  // Frontend origin — also where we send the browser after a successful login,
  // and the allowed CORS origin for credentialed requests.
  ALLOWED_ORIGIN: z.string().url(),

  // ─── AI extraction (Feature 13) ───────────────────────────────────────────
  //
  // Which vendor serves task extraction, and on which model. Both are config
  // rather than constants so a model upgrade or a provider switch is a redeploy,
  // not a code change (see services/ai/registry.ts).
  AI_EXTRACTION_PROVIDER: z.enum(['anthropic']).default('anthropic'),
  // Structured outputs — the API-enforced response schema extraction relies on —
  // require Sonnet 5 or later. The tech spec named `claude-sonnet-4-6`, which
  // predates that support; Sonnet 5 is its direct successor at the same tier.
  AI_EXTRACTION_MODEL: z.string().min(1).default('claude-sonnet-5'),
  // Hard ceiling on one provider call. The product target is under 5 seconds;
  // this is the give-up point well past it, so a stalled provider surfaces as a
  // clean 504 instead of a request that hangs until the proxy kills it.
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  // Anthropic API key. Named CLAUDE_API_KEY to match the tech spec, the compose
  // files, and the GitHub secret that already carries it.
  CLAUDE_API_KEY: z.string().min(1),

  // ─── AI transcription (Feature 14) ────────────────────────────────────────
  //
  // A separate provider from extraction, and separately configured: the two
  // capabilities are different ports (services/ai/types.ts) served by different
  // vendors, and nothing about the app requires them to be the same company.
  AI_TRANSCRIPTION_PROVIDER: z.enum(['openai']).default('openai'),
  // The tech spec's model, and still the right default: whisper-1 is the
  // cheapest of OpenAI's transcription models and handles Arabic, which is what
  // Feature 14 needs it for.
  AI_TRANSCRIPTION_MODEL: z.string().min(1).default('whisper-1'),
  // Transcription gets its own, much longer deadline than extraction. It uploads
  // a file before any work starts, and a minute of audio takes meaningfully
  // longer to process than a short completion; holding it to
  // AI_REQUEST_TIMEOUT_MS would abort perfectly healthy transcriptions. Kept
  // under nginx's 120s proxy_read_timeout (docker/nginx) so a stall surfaces as
  // our own clean 504 rather than the proxy's error page.
  AI_TRANSCRIPTION_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),

  // OpenAI API key, for Whisper. Required like every other secret: the API
  // refuses to boot without it rather than failing at the first voice note.
  OPENAI_API_KEY: z.string().min(1)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
