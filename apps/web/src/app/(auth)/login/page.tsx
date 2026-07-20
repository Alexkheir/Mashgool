import { SiteNavbar } from '@/components/site-navbar';
import { LoginForm } from '@/components/login-form';

// Placeholder for the animated product image. A dark rounded panel stands in
// until the real asset is added.
function PreviewPanel() {
  return (
    <div className="relative hidden overflow-hidden rounded-3xl bg-neutral-900 lg:block">
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-900 to-black" />
      <div className="relative flex h-full min-h-[32rem] items-center justify-center">
        <span className="text-sm font-medium tracking-wide text-neutral-500">
          Product preview
        </span>
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
