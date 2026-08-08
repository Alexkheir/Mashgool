'use client';

import { cn } from '@/lib/utils';
import { BoardIcon, ListIcon } from '@/components/ui/icons';
import { useUiStore, useViewMode } from '@/lib/ui-store';

// The board/list switch. It reads and writes the ui store directly rather than
// taking value+onChange props, because the choice is remembered per scope (a
// client workspace, or the dashboard) — see ui-store.
export function ViewToggle({ scope }: { scope: string }) {
  const mode = useViewMode(scope);
  const setViewMode = useUiStore((s) => s.setViewMode);

  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white p-0.5 shadow-sm"
    >
      <ToggleButton
        active={mode === 'board'}
        label="Board"
        onClick={() => setViewMode(scope, 'board')}
      >
        <BoardIcon className="h-4 w-4" />
      </ToggleButton>
      <ToggleButton
        active={mode === 'list'}
        label="List"
        onClick={() => setViewMode(scope, 'list')}
      >
        <ListIcon className="h-4 w-4" />
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  label,
  onClick,
  children
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
      )}
    >
      {children}
      {label}
    </button>
  );
}
