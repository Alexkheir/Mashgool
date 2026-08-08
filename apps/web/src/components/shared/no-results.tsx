'use client';

import { Button } from '@/components/ui/button';
import type { TaskFilters } from '@/lib/filter-parser';

// The empty state for "your filters matched nothing" — distinct from "you have
// no tasks yet", because the fix is completely different. A task-key lookup gets
// its own wording: the user asked for one specific task by name, so "no tasks
// match your filters" would read as a non-answer.
export function NoResults({
  filters,
  onClear
}: {
  filters: TaskFilters;
  onClear: () => void;
}) {
  return (
    <div className="animate-[rise-in] rounded-2xl border border-dashed border-neutral-300 bg-white/50 p-12 text-center">
      {filters.taskKey ? (
        <>
          <p className="text-sm text-neutral-600">
            No task with the key{' '}
            <span className="font-mono font-medium text-neutral-900">{filters.taskKey}</span>.
          </p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-neutral-400">
            Check the short code and number — keys are never reused, so a deleted
            task&rsquo;s key stays empty.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-600">No tasks match these filters.</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-neutral-400">
            Try removing one, or clear them all to see everything again.
          </p>
        </>
      )}
      <Button variant="secondary" className="mt-5" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
