import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(createApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(createApp()).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
  });
});
