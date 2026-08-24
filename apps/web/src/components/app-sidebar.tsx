'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useClients } from '@/lib/use-clients';
import type { AuthUser } from '@/lib/use-auth';
import {
  BoardIcon,
  HomeIcon,
  LogoMark,
  LogoutIcon,
  SearchIcon
} from '@/components/ui/icons';

// The persistent left navigation. Brand at the top, primary nav, then the list
// of client workspaces (searchable), and the signed-in user with logout pinned
// to the bottom. Active state is derived from the pathname so it stays correct
// on deep-links and reloads without any extra state.
interface AppSidebarProps {
  user: AuthUser;
  onLogout: () => void;
}

export function AppSidebar({ user, onLogout }: AppSidebarProps) {
  const pathname = usePathname();
  const { data: clients } = useClients();
  const [query, setQuery] = useState('');

  const onDashboard = pathname === '/dashboard';

  const visibleClients = (clients ?? []).filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-neutral-200/70 bg-sidebar md:flex">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <LogoMark />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-neutral-900">Mashgool</p>
          <p className="text-xs text-neutral-500">Freelance workspace</p>
        </div>
      </div>

      {/* Search — filters the workspace list below. */}
      <div className="px-3 pb-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspaces…"
            aria-label="Search workspaces"
            className="w-full rounded-xl border border-neutral-200 bg-white/70 py-2 pl-9 pr-3 text-sm text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-brand-400 focus:bg-white"
          />
        </div>
      </div>

      {/* Primary nav */}
      <nav className="px-3 pt-2">
        <NavItem href="/dashboard" active={onDashboard} icon={<HomeIcon className="h-[18px] w-[18px]" />}>
          Dashboard
        </NavItem>
      </nav>

      {/* Workspaces */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col px-3">
        <p className="flex items-center gap-2 px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          <BoardIcon className="h-3.5 w-3.5" />
          Workspaces
        </p>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
          {visibleClients.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-neutral-400">
              {clients && clients.length > 0 ? 'No matches' : 'No clients yet'}
            </p>
          )}
          {visibleClients.map((client) => {
            const active = pathname === `/dashboard/clients/${client.id}`;
            return (
              <Link
                key={client.id}
                href={`/dashboard/clients/${client.id}`}
                className={cn(
                  'group flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition',
                  active
                    ? 'bg-brand-50 font-medium text-brand-800'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                  style={{ backgroundColor: client.color }}
                />
                <span className="min-w-0 flex-1 truncate">{client.name}</span>
                {client.stats.open > 0 && (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
                      active ? 'bg-brand-100 text-brand-700' : 'bg-neutral-200/70 text-neutral-500'
                    )}
                  >
                    {client.stats.open}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* User + logout */}
      <div className="border-t border-neutral-200/70 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <Avatar user={user} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-neutral-900">{user.name}</p>
            <p className="truncate text-xs text-neutral-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
            className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <LogoutIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  icon,
  children
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition',
        active
          ? 'bg-neutral-900 text-white shadow-sm'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

export function Avatar({ user }: { user: AuthUser }) {
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}
