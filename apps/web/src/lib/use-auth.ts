'use client';

import { useQuery } from '@tanstack/react-query';
import { apiUrl } from './api-url';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export const authQueryKey = ['auth', 'me'] as const;

// credentials: 'include' sends the HTTP-only session cookie (cross-origin in
// dev, same-origin in prod). A 401 is a normal "not signed in" answer, not an
// error, so it resolves to null rather than throwing.
async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(apiUrl('/api/v1/auth/me'), { credentials: 'include' });

  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to load session');

  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

export function useAuth() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: fetchCurrentUser
  });
}

export async function logout(): Promise<void> {
  await fetch(apiUrl('/api/v1/auth/logout'), {
    method: 'POST',
    credentials: 'include'
  });
}
