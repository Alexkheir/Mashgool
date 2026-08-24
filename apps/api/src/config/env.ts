import { z } from 'zod';

// Environment variables validated once, at startup. If anything required is
// missing or malformed the process exits immediately rather than booting into
// a half-working state (a CLAUDE.md rule).
//
// This schema grows per feature: Feature 7 (auth) added the JWT and Google
// blocks, Feature 13 the AI block. OPENAI_API_KEY / SENTRY_DSN and friends
// follow when their features land, so the app isn't forced to carry secrets
// before any of the code that uses them exists.
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

  // ─── AI (Feature 13) ──────────────────────────────────────────────────────
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
  CLAUDE_API_KEY: z.string().min(1)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
