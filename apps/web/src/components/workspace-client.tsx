'use client';

import { AppFrame } from '@/components/app-frame';
import { TasksView } from '@/components/tasks/tasks-view';

// A single client workspace: the task list for one client inside the shared app
// shell (auth guard + header from AppFrame).
export function WorkspaceClient({ clientId }: { clientId: string }) {
  return (
    <AppFrame>
      <TasksView clientId={clientId} />
    </AppFrame>
  );
}
