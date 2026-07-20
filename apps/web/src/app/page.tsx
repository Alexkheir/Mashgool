import { ApiStatus } from '@/components/ApiStatus';

export default function HomePage() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '40rem',
        margin: '15vh auto 0',
        padding: '0 1.5rem',
        textAlign: 'center'
      }}
    >
      <h1>Mashgool</h1>
      <p>Hello world — Phase 0 infrastructure validation- alex.</p>
      <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>
        Deploy marker: v2 — Feature 6 rollback drill (2026-07-20)
      </p>
      <ApiStatus />
    </main>
  );
}
