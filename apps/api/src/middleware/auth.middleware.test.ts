import { describe, expect, it, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock Prisma so no real database is touched.
const { mockFindUnique } = vi.hoisted(() => ({ mockFindUnique: vi.fn() }));
vi.mock('../lib/prisma', () => ({
  prisma: { user: { findUnique: mockFindUnique } }
}));

import { requireAuth } from './auth.middleware';
import { env } from '../config/env';

function signToken(userId: string, email = 'user@example.com') {
  return jwt.sign({ userId, email }, env.JWT_SECRET);
}

function makeReqRes(cookies: Record<string, string>) {
  const req = { cookies } as unknown as Parameters<typeof requireAuth>[0];
  const res = {} as Parameters<typeof requireAuth>[1];
  const next = vi.fn();
  return { req, res, next };
}

describe('requireAuth', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  it('rejects with 401 when no token cookie is present', async () => {
    const { req, res, next } = makeReqRes({});
    await expect(requireAuth(req, res, next)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Authentication required'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the token is malformed or signed with a different secret', async () => {
    const { req, res, next } = makeReqRes({ token: 'not-a-real-jwt' });
    await expect(requireAuth(req, res, next)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired session'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the token is valid but the user no longer exists', async () => {
    mockFindUnique.mockResolvedValue(null);
    const { req, res, next } = makeReqRes({ token: signToken('missing-user') });
    await expect(requireAuth(req, res, next)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired session'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the user and calls next on a valid session', async () => {
    const user = { id: 'u1', email: 'user@example.com', name: 'User', avatarUrl: null };
    mockFindUnique.mockResolvedValue(user);
    const { req, res, next } = makeReqRes({ token: signToken('u1') });

    await requireAuth(req, res, next);

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(req.user).toEqual(user);
    expect(next).toHaveBeenCalledOnce();
  });
});
