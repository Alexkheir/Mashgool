import { WorkspaceClient } from '@/components/workspace-client';

// The per-client workspace route. In the App Router (Next 15+) `params` is async.
export default async function WorkspacePage({
  params
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <WorkspaceClient clientId={clientId} />;
}
