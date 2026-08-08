import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Mirrors apps/api/eslint.config.mjs: a leading underscore means
      // "intentionally unused", and siblings dropped via object rest (the
      // destructure-to-omit pattern, used when removing one filter from a set)
      // aren't unused variables at all.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
    }
  }
);
