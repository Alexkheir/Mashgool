'use client';

import { cn } from '@/lib/utils';
import type { Client } from '@/lib/use-clients';
import { ProgressBar } from '@/components/dashboard/stats-bar';

interface ClientCardProps {
  client: Client;
  isActive: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
}

// A small text action shown in the card footer. Stops propagation so clicking an
// action doesn't also fire the card's select handler.
function CardAction({
  label,
  onClick,
  danger
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'rounded px-2 py-1 text-xs font-medium transition hover:bg-neutral-100',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-neutral-600'
      )}
    >
      {label}
    </button>
  );
}

export function ClientCard({
  client,
  isActive,
  onSelect,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete
}: ClientCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group flex flex-col rounded-2xl border bg-surface p-5 text-left shadow-[var(--shadow-card)] transition duration-200',
        'hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        isActive ? 'border-brand-300 ring-1 ring-brand-200' : 'border-neutral-200/80'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="h-8 w-8 shrink-0 rounded-lg ring-2 ring-white"
            style={{ backgroundColor: client.color }}
          />
          <h3 className="truncate font-semibold text-neutral-900">{client.name}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-xs font-medium text-neutral-500">
          {client.shortCode}
        </span>
      </div>

      {client.description && (
        <p className="mt-3 line-clamp-2 text-sm text-neutral-500">{client.description}</p>
      )}

      {/* Progress (Feature 12) — pushed to the bottom by mt-auto so cards of
          differing description length still line their footers up. */}
      <div className="mt-auto pt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-medium text-neutral-500">
            {client.stats.done}/{client.stats.total} done
          </span>
          <span className="font-semibold text-neutral-700 tabular-nums">
            {client.stats.progress}%
          </span>
        </div>
        <ProgressBar progress={client.stats.progress} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                client.stats.open > 0 ? 'bg-brand-500' : 'bg-neutral-300'
              )}
            />
            {client.stats.open} open {client.stats.open === 1 ? 'task' : 'tasks'}
          </span>
          {/* Only shown when there is something to worry about — a permanent
              "0 overdue" would dilute the signal it exists to carry. */}
          {client.stats.overdue > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
              {client.stats.overdue} overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onEdit && <CardAction label="Edit" onClick={onEdit} />}
          {onArchive && <CardAction label="Archive" onClick={onArchive} />}
          {onUnarchive && <CardAction label="Unarchive" onClick={onUnarchive} />}
          <CardAction label="Delete" onClick={onDelete} danger />
        </div>
      </div>
    </div>
  );
}
