import { Suspense } from 'react';
import { WorkspaceClient } from '@/components/workspace-client';

// The per-client workspace route. In the App Router (Next 15+) `params` is async.
// The Suspense boundary is required because the view reads the filter query from
// the URL via `useSearchParams` (Feature 11).
export default async function WorkspacePage({
  params
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return (
    <Suspense fallback={null}>
      <WorkspaceClient clientId={clientId} />
    </Suspense>
  );
}
