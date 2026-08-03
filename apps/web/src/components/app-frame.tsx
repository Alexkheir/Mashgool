'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authQueryKey, logout, useAuth } from '@/lib/use-auth';
import { AppSidebar, Avatar } from '@/components/app-sidebar';
import { LogoMark, LogoutIcon } from '@/components/ui/icons';

// The signed-in app shell: a client-side auth guard wrapping the two-part layout
// — the persistent sidebar (desktop) and the main content column. A compact top
// bar stands in for the sidebar on mobile so identity + logout stay reachable.
export function AppFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useAuth();

  // The edge middleware only checks that a cookie exists. If the session is
  // actually invalid (/auth/me answered 401 → null), send the user to log in.
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  async function handleLogout() {
    await logout();
    await queryClient.invalidateQueries({ queryKey: authQueryKey });
    router.replace('/login');
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-neutral-500">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-red-600">Couldn’t load your session. Please try again.</p>
      </div>
    );
  }

  if (!user) {
    return null; // redirecting to /login
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <AppSidebar user={user} onLogout={handleLogout} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only top bar (the sidebar is hidden below md). */}
        <header className="flex items-center justify-between border-b border-neutral-200/70 bg-sidebar px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <LogoMark className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white" />
            <span className="text-sm font-semibold text-neutral-900">Mashgool</span>
          </div>
          <div className="flex items-center gap-2">
            <Avatar user={user} />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            >
              <LogoutIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
