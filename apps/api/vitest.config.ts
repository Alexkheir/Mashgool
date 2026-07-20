import { defineConfig } from 'vitest/config';

// Dummy but structurally-valid env for the test process. env.ts validates these
// at import time and exits if any are missing, so tests must supply them. These
// are not secrets — they only need to satisfy the Zod schema.
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/mashgool_test',
      JWT_SECRET: 'test-secret-value-that-is-at-least-32-characters',
      JWT_EXPIRES_IN: '7d',
      GOOGLE_CLIENT_ID: 'test-google-client-id',
      GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:4000/api/v1/auth/google/callback',
      ALLOWED_ORIGIN: 'http://localhost:3000'
    }
  }
});
