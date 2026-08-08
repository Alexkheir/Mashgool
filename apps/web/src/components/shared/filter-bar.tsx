'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { filtersToQuery, hasActiveFilters, toChips } from '@/lib/filter-parser';
import type { FilterQuery } from '@/lib/filter-store';
import { SearchIcon } from '@/components/ui/icons';

// The persistent filter bar, shown above both the board and the list in every
// workspace and on the global dashboard.
//
// The text box is a local draft, applied on submit — "filters apply instantly on
// submission" (spec), not on every keystroke, so a half-typed `status = bl`
// doesn't blank the view mid-word. The applied query is the store's; the draft
// re-syncs whenever that changes underneath us (a dismissed chip, Clear all, or
// landing on a bookmarked URL).
export function FilterBar({
  filter,
  // The global board can filter by client; a single workspace already is one.
  showClientHint
}: {
  filter: FilterQuery;
  showClientHint?: boolean;
}) {
  const [draft, setDraft] = useState(filter.raw);

  useEffect(() => {
    setDraft(filter.raw);
  }, [filter.raw]);

  const chips = toChips(filter.filters);
  const active = hasActiveFilters(filter.filters);
  const dirty = draft.trim() !== filter.raw.trim();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    filter.apply(draft);
  }

  return (
    <div className="mb-4">
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Escape abandons an unsubmitted edit rather than the applied filter.
              if (e.key === 'Escape') setDraft(filter.raw);
            }}
            aria-label="Filter tasks"
            placeholder={
              showClientHint
                ? 'BS-12, or client = Brand status = blocked'
                : 'BS-12, or status = blocked priority = urgent'
            }
            className="w-full rounded-full border border-neutral-200 bg-white py-2 pr-3 pl-9 text-sm text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        {dirty && (
          <button
            type="submit"
            className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            Apply
          </button>
        )}
        {active && (
          <button
            type="button"
            onClick={filter.clear}
            className="shrink-0 rounded-full px-3 py-2 text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
          >
            Clear all
          </button>
        )}
      </form>

      {filter.errors.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {filter.errors.map((error) => (
            <li key={error} className="text-xs text-red-600">
              {error}
            </li>
          ))}
        </ul>
      )}

      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              // Dismissing rebuilds the query from the remaining filters, so the
              // bar keeps showing a query that parses back to what's applied.
              onClick={() => filter.apply(filtersToQuery(chip.without))}
              className={cn(
                'group inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white',
                'py-1 pr-2 pl-2.5 text-xs font-medium text-neutral-600 shadow-sm transition',
                'hover:border-neutral-300 hover:text-neutral-900'
              )}
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label}
              <span
                aria-hidden="true"
                className="text-neutral-400 transition group-hover:text-neutral-700"
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
