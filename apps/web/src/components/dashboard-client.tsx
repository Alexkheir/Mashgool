'use client';

import { AppFrame } from '@/components/app-frame';
import { ClientsView } from '@/components/clients/clients-view';

// The dashboard is the client grid inside the shared app shell (auth guard +
// header live in AppFrame).
export function DashboardClient() {
  return (
    <AppFrame>
      <ClientsView />
    </AppFrame>
  );
}
