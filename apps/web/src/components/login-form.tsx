import { apiUrl } from '@/lib/api-url';
import { GoogleIcon } from './google-icon';

// Placeholder legal links — real pages get wired up later.
function LegalLink({ children }: { children: string }) {
  return (
    <a href="#" className="underline underline-offset-2 hover:text-neutral-700">
      {children}
    </a>
  );
}

export function LoginForm() {
  return (
    <div className="w-full max-w-md">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Welcome to Mashgool
        <span className="mt-1 block text-neutral-400">Your freelance task assistant</span>
      </h1>

      <div className="mt-10 space-y-4">
        {/* The one live control: a full-page navigation to the API, which
            redirects on to Google's consent screen. */}
        <a
          href={apiUrl('/api/v1/auth/google')}
          className="flex w-full items-center justify-center gap-3 rounded-full border border-neutral-300 bg-white px-6 py-3.5 text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50"
        >
          <GoogleIcon className="h-5 w-5" />
          Continue with Google
        </a>

        <div className="flex items-center justify-center">
          <span className="text-sm text-neutral-400">or</span>
        </div>

        {/* Placeholder — v1 auth is Google-only. Kept for design parity. */}
        <input
          type="email"
          disabled
          placeholder="you@example.com"
          aria-label="Email address (coming soon)"
          className="w-full cursor-not-allowed rounded-full border border-neutral-300 bg-white px-6 py-3.5 text-sm text-neutral-900 placeholder:text-neutral-400"
        />
        <button
          type="button"
          disabled
          title="Email sign-in coming soon"
          className="w-full cursor-not-allowed rounded-full bg-neutral-900 px-6 py-3.5 text-sm font-medium text-white opacity-90"
        >
          Continue with email
        </button>
      </div>

      <p className="mt-8 max-w-sm text-sm leading-relaxed text-neutral-400">
        By signing up, you agree to the <LegalLink>Terms of Use</LegalLink>,{' '}
        <LegalLink>Privacy Notice</LegalLink>, and <LegalLink>Cookie Notice</LegalLink>.
      </p>
    </div>
  );
}
