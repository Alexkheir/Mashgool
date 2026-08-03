import { SiteNavbar } from '@/components/site-navbar';
import { LoginForm } from '@/components/login-form';

// A branded emerald preview panel — a mock "board" that hints at the product
// while the real screenshot asset is pending.
function PreviewPanel() {
  return (
    <div className="relative hidden overflow-hidden rounded-3xl bg-brand-700 p-8 shadow-[var(--shadow-card-hover)] lg:block">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800" />
      {/* Concentric glow, echoing the reference hero art. */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -right-4 top-4 h-52 w-52 rounded-full bg-white/10" />

      <div className="relative flex h-full min-h-[34rem] flex-col justify-between">
        <div>
          <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90">
            Freelance workspace
          </span>
          <h2 className="mt-5 max-w-xs text-3xl font-semibold leading-tight text-white">
            Every client, every task — organized.
          </h2>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/70">
            Atomic task keys, a Scrum board, and AI-assisted capture from voice or paste.
          </p>
        </div>

        {/* A tiny stylized board of floating cards. */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'To Do', n: 4 },
            { label: 'In Progress', n: 2 },
            { label: 'Done', n: 7 }
          ].map((col) => (
            <div key={col.label} className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
              <div className="flex items-center justify-between text-[11px] font-medium text-white/80">
                <span>{col.label}</span>
                <span>{col.n}</span>
              </div>
              <div className="mt-2 space-y-2">
                <div className="h-6 rounded-lg bg-white/70" />
                <div className="h-6 rounded-lg bg-white/40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNavbar />

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-center gap-12 px-6 py-10 sm:px-10 lg:grid-cols-2 lg:gap-16">
        <div className="flex justify-center lg:justify-start">
          <LoginForm />
        </div>
        <PreviewPanel />
      </main>
    </div>
  );
}
