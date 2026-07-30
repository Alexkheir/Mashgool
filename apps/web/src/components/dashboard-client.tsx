'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authQueryKey, logout, useAuth } from '@/lib/use-auth';
import { ClientsView } from '@/components/clients/clients-view';

export function DashboardClient() {
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
    return <p className="p-6 text-sm text-neutral-500">Loading…</p>;
  }

  if (isError) {
    return (
      <p className="p-6 text-sm text-red-600">
        Couldn’t load your session. Please try again.
      </p>
    );
  }

  if (!user) {
    return null; // redirecting to /login
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-medium text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="leading-tight">
            <p className="text-sm font-medium text-neutral-950">{user.name}</p>
            <p className="text-xs text-neutral-500">{user.email}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
        >
          Log out
        </button>
      </header>

      <ClientsView />
    </div>
  );
}
