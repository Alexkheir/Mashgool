// Vitest global test setup (referenced by vitest.config.ts). The `/vitest`
// entrypoint registers jest-dom matchers (toBeInTheDocument, etc.) against
// vitest's own `expect` — the project doesn't enable vitest globals, so the
// default jest-dom entry (which assumes a global `expect`) can't be used.
import '@testing-library/jest-dom/vitest';
