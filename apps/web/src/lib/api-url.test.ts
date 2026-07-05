import { describe, expect, it } from 'vitest';
import { apiUrl } from './api-url';

describe('apiUrl', () => {
  it('appends the path to the base URL', () => {
    expect(apiUrl('/api/v1/health')).toMatch(/^https?:\/\/.+\/api\/v1\/health$/);
  });

  it('adds a leading slash when the path has none', () => {
    expect(apiUrl('api/v1/health').endsWith('/api/v1/health')).toBe(true);
  });

  it('never produces a double slash at the boundary', () => {
    expect(apiUrl('/api/v1/health')).not.toMatch(/[^:]\/\//);
  });
});
