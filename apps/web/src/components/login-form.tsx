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
      <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
        Welcome to Mashgool
        <span className="mt-2 block text-2xl font-medium text-neutral-400 sm:text-3xl">
          Your freelance task assistant
        </span>
      </h1>

      <div className="mt-10">
        {/* The one live control: a full-page navigation to the API, which
            redirects on to Google's consent screen. v1 auth is Google-only. */}
        <a
          href={apiUrl('/api/v1/auth/google')}
          className="flex w-full items-center justify-center gap-3 rounded-full border border-neutral-200 bg-white px-6 py-3.5 text-sm font-medium text-neutral-900 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]"
        >
          <GoogleIcon className="h-5 w-5" />
          Continue with Google
        </a>
      </div>

      <p className="mt-8 max-w-sm text-sm leading-relaxed text-neutral-400">
        By continuing, you agree to the <LegalLink>Terms of Use</LegalLink>,{' '}
        <LegalLink>Privacy Notice</LegalLink>, and <LegalLink>Cookie Notice</LegalLink>.
      </p>
    </div>
  );
}
