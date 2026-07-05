'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-url';

type Status = 'checking' | 'ok' | 'down';

const LABELS: Record<Status, string> = {
  checking: 'Checking API…',
  ok: 'API is reachable ✓',
  down: 'API is unreachable ✗'
};

const COLORS: Record<Status, string> = {
  checking: '#8a8a8a',
  ok: '#1a7f37',
  down: '#c0392b'
};

export function ApiStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    fetch(apiUrl('/api/v1/health'))
      .then((res) => setStatus(res.ok ? 'ok' : 'down'))
      .catch(() => setStatus('down'));
  }, []);

  return <p style={{ color: COLORS[status] }}>{LABELS[status]}</p>;
}
