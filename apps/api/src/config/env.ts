import { z } from 'zod';

// Environment variables validated once, at startup. If anything required is
// missing or malformed the process exits immediately rather than booting into
// a half-working state (a CLAUDE.md rule).
//
// This schema grows per feature — it currently validates only what Feature 7
// (auth) needs. CLAUDE_API_KEY / OPENAI_API_KEY / SENTRY_DSN and friends are
// added when their features land, so the app isn't forced to carry AI/monitoring
// secrets before any of that code exists.
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
  ALLOWED_ORIGIN: z.string().url()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
