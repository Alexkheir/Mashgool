'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authQueryKey, logout, useAuth } from '@/lib/use-auth';

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
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  if (isError) {
    return <p className="text-sm text-red-600">Couldn’t load your session. Please try again.</p>;
  }

  if (!user) {
    return null; // redirecting to /login
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <div className="flex items-center gap-4">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-lg font-medium text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-medium text-neutral-950">{user.name}</p>
          <p className="text-sm text-neutral-500">{user.email}</p>
        </div>
      </div>

      <p className="mt-6 text-sm text-neutral-500">
        You’re signed in. The real dashboard arrives in a later feature — this is a
        placeholder to prove the auth session works end to end.
      </p>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-6 w-full rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
      >
        Log out
      </button>
    </div>
  );
}
