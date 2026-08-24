'use client';

import { cn } from '@/lib/utils';
import { BOARD_COLUMNS, COLUMN_META, STATUS_META, type TaskStatus } from '@/dtos/task.dto';
import type { TaskStats } from '@/lib/use-clients';
import { filtersToQuery, type TaskFilters } from '@/lib/filter-parser';
import type { FilterQuery } from '@/lib/filter-store';

// The status breakdown shown above both dashboards (Feature 12): one tile per
// status, plus overdue and progress. Counts come from the client list / client
// detail, which every task mutation already invalidates — so they update as
// tasks are created, edited and deleted without any extra plumbing.
//
// When a `filter` is supplied the tiles become toggles, wired straight into the
// Feature 11 filter bar. That is what makes overdue work "surfaced prominently":
// the count is not just a number, it is the way in. Without a filter bar on
// screen there is nothing for a click to do, so the tiles render inert instead
// of lying about being interactive.
interface StatsBarProps {
  stats: TaskStats;
  filter?: FilterQuery;
}

export function StatsBar({ stats, filter }: StatsBarProps) {
  const active = filter?.filters ?? {};

  // A tile writes a new query rather than mutating filter state directly, so the
  // bar's text, the URL and the results can never disagree.
  function applyFilters(next: TaskFilters) {
    filter?.apply(filtersToQuery(next));
  }

  function toggleStatus(status: TaskStatus) {
    const current = active.status ?? [];
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];

    // A key lookup answers a different question entirely, so picking a status
    // replaces it rather than trying to combine the two.
    const { taskKey: _taskKey, ...rest } = active;
    applyFilters({ ...rest, status: next });
  }

  function toggleDue(due: 'today' | 'this-week') {
    const { taskKey: _taskKey, due: currentDue, ...rest } = active;
    applyFilters(currentDue === due ? rest : { ...rest, due });
  }

  const interactive = Boolean(filter);

  return (
    <div className="mb-6 flex flex-wrap items-stretch gap-2">
      {BOARD_COLUMNS.map((status) => (
        <StatTile
          key={status}
          label={STATUS_META[status].label}
          value={stats.byStatus[status]}
          dot={COLUMN_META[status].dot}
          selected={(active.status ?? []).includes(status)}
          onClick={interactive ? () => toggleStatus(status) : undefined}
        />
      ))}

      <StatTile
        label="Overdue"
        value={stats.overdue}
        dot="bg-red-500"
        tone={stats.overdue > 0 ? 'danger' : undefined}
        selected={false}
        // Overdue isn't a filter field of its own — the closest honest match is
        // "due this week", which is where the late work sits.
        onClick={undefined}
      />

      {interactive && (
        <div className="flex items-center gap-2">
          <DueButton
            label="Due today"
            selected={active.due === 'today'}
            onClick={() => toggleDue('today')}
          />
          <DueButton
            label="This week"
            selected={active.due === 'this-week'}
            onClick={() => toggleDue('this-week')}
          />
        </div>
      )}

      <ProgressTile progress={stats.progress} done={stats.done} total={stats.total} />
    </div>
  );
}

function StatTile({
  label,
  value,
  dot,
  selected,
  tone,
  onClick
}: {
  label: string;
  value: number;
  dot: string;
  selected: boolean;
  tone?: 'danger';
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', dot)} />
        <span
          className={cn(
            'text-xs font-medium',
            tone === 'danger' && value > 0 ? 'text-red-600' : 'text-neutral-500'
          )}
        >
          {label}
        </span>
      </span>
      <span
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums',
          tone === 'danger' && value > 0 ? 'text-red-600' : 'text-neutral-900'
        )}
      >
        {value}
      </span>
    </>
  );

  const shell = cn(
    'flex min-w-24 flex-col rounded-xl border bg-surface px-3.5 py-2.5 text-left shadow-[var(--shadow-card)] transition',
    selected ? 'border-brand-400 ring-1 ring-brand-200' : 'border-neutral-200/80'
  );

  if (!onClick) {
    return <div className={shell}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        shell,
        'hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50'
      )}
    >
      {content}
    </button>
  );
}

function DueButton({
  label,
  selected,
  onClick
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-3.5 py-2 text-xs font-medium shadow-sm transition',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
        selected
          ? 'border-brand-500 bg-brand-600 text-white'
          : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
      )}
    >
      {label}
    </button>
  );
}

function ProgressTile({
  progress,
  done,
  total
}: {
  progress: number;
  done: number;
  total: number;
}) {
  return (
    <div className="flex min-w-40 flex-1 flex-col justify-center rounded-xl border border-neutral-200/80 bg-surface px-3.5 py-2.5 shadow-[var(--shadow-card)]">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-neutral-500">Progress</span>
        <span className="text-xs font-medium text-neutral-500 tabular-nums">
          {done}/{total} done
        </span>
      </div>
      <ProgressBar progress={progress} className="mt-2" />
    </div>
  );
}

// Shared with the client card so the dashboard and the cards render progress
// identically.
export function ProgressBar({
  progress,
  className
}: {
  progress: number;
  className?: string;
}) {
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-neutral-100', className)}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Tasks complete"
    >
      <div
        className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
