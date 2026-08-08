import { Suspense } from 'react';
import { DashboardClient } from '@/components/dashboard-client';

// The dashboard reads the filter query from the URL (`?q=`, Feature 11), and
// `useSearchParams` forces anything above it into client-side rendering. The
// Suspense boundary keeps that opt-out scoped to this subtree so the route can
// still be prerendered.
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardClient />
    </Suspense>
  );
}
