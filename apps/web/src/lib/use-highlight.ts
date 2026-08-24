'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// How long a freshly-created task stays highlighted. Long enough to catch the
// eye after a route change, short enough not to linger as if it meant something
// permanent.
const HIGHLIGHT_MS = 2600;

// Reads `?highlight=<taskId>` and reports it for a moment, then forgets it.
//
// Paste-to-task navigates to the workspace after saving (Feature 13: "the new
// task visible and highlighted briefly"). The task id travels in the URL because
// the destination is a fresh route — component state doesn't survive the
// navigation, and a store would leave the flag set for any later visit.
//
// The param is stripped as soon as it is read, so a refresh, a bookmark, or a
// back-navigation doesn't re-fire a highlight for a task created minutes ago.
export function useHighlightedTask(): string | null {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const id = params.get('highlight');

  const [active, setActive] = useState<string | null>(null);

  // Consume the param: record what to highlight, then strip it from the URL.
  useEffect(() => {
    if (!id) return;
    setActive(id);

    // Drop `highlight` while preserving everything else — the workspace also
    // keeps its filter query in the URL (`?q=`, Feature 11), and rewriting to a
    // bare pathname here would silently clear the user's active filters.
    const rest = new URLSearchParams(params.toString());
    rest.delete('highlight');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [id, pathname, router, params]);

  // Expire it. Deliberately a separate effect keyed on `active`, not on `id`:
  // the effect above removes the param, which drives `id` back to null on the
  // very next render. A single combined effect would therefore tear down its own
  // timer one tick after starting it, and the highlight would never clear.
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setActive(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [active]);

  return active;
}
