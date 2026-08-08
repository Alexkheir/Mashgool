'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { create } from 'zustand';
import { parseFilterQuery, type ParsedQuery } from './filter-parser';

// The `filter.store` from CLAUDE.md: active filters per workspace, keyed by
// client id or 'global'.
//
// It stores the **raw query text only**, not a parsed copy. The tech spec's
// sketch held both (`rawQuery` plus the extracted fields), which is two sources
// of truth that can disagree; parsing is cheap and pure, so the structured form
// is derived on read instead.
//
// Deliberately *not* persisted, unlike ui-store: the spec says filter state is
// cleared when the user navigates away from a workspace. Bookmarkability comes
// from the URL (`?q=`), not from localStorage.
interface FilterStore {
  queries: Record<string, string>;
  setQuery: (scope: string, raw: string) => void;
  clear: (scope: string) => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  queries: {},
  setQuery: (scope, raw) =>
    set((state) => ({ queries: { ...state.queries, [scope]: raw } })),
  clear: (scope) =>
    set((state) => {
      const { [scope]: _removed, ...rest } = state.queries;
      return { queries: rest };
    })
}));

export interface FilterQuery extends ParsedQuery {
  raw: string;
  apply: (raw: string) => void;
  clear: () => void;
}

// Binds one scope's filter state to the store *and* the URL. `?q=` is what makes
// a filtered view bookmarkable and shareable (spec), so it is written on every
// change with `replace` — a filter keystroke shouldn't add history entries you
// have to press Back through.
export function useFilterQuery(scope: string): FilterQuery {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = useFilterStore((s) => s.queries[scope] ?? '');
  const setQuery = useFilterStore((s) => s.setQuery);
  const clearScope = useFilterStore((s) => s.clear);

  const urlQuery = searchParams.get('q') ?? '';

  // Landing on a filtered URL (a bookmark, a shared link, a reload) seeds the
  // store. Guarded on the *current* store value read imperatively, so this can't
  // fight a user edit that has already emptied the box.
  useEffect(() => {
    if (urlQuery && !useFilterStore.getState().queries[scope]) {
      setQuery(scope, urlQuery);
    }
  }, [urlQuery, scope, setQuery]);

  // "Filter state is cleared when the user navigates away from the workspace."
  // Switching between board and list doesn't unmount this, so the filter
  // survives a view toggle — which is the other half of the same spec bullet.
  useEffect(() => () => clearScope(scope), [scope, clearScope]);

  const apply = useCallback(
    (next: string) => {
      setQuery(scope, next);

      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) params.set('q', next.trim());
      else params.delete('q');

      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [scope, setQuery, searchParams, router, pathname]
  );

  const parsed = useMemo(() => parseFilterQuery(raw), [raw]);

  return {
    raw,
    ...parsed,
    apply,
    clear: useCallback(() => apply(''), [apply])
  };
}
