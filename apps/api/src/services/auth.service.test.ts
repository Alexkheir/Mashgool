import { describe, expect, it, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Control Google's OAuth client and Prisma without any network or DB.
const { mockGetToken, mockVerifyIdToken, mockGenerateAuthUrl, mockUpsert } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockVerifyIdToken: vi.fn(),
  mockGenerateAuthUrl: vi.fn(),
  mockUpsert: vi.fn()
}));

vi.mock('google-auth-library', () => ({
  // Regular function (not arrow) so `new OAuth2Client()` can construct it.
  OAuth2Client: vi.fn(function () {
    return {
      getToken: mockGetToken,
      verifyIdToken: mockVerifyIdToken,
      generateAuthUrl: mockGenerateAuthUrl
    };
  })
}));

vi.mock('../lib/prisma', () => ({
  prisma: { user: { upsert: mockUpsert } }
}));

import {
  authenticateWithGoogle,
  getGoogleAuthUrl,
  issueSessionToken
} from './auth.service';
import { env } from '../config/env';

function mockGoogleProfile(payload: Record<string, unknown>) {
  mockGetToken.mockResolvedValue({ tokens: { id_token: 'fake-id-token' } });
  mockVerifyIdToken.mockResolvedValue({ getPayload: () => payload });
}

describe('auth.service', () => {
  beforeEach(() => {
    mockGetToken.mockReset();
    mockVerifyIdToken.mockReset();
    mockUpsert.mockReset();
  });

  describe('getGoogleAuthUrl', () => {
    it('delegates to the OAuth client with the expected scopes', () => {
      mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?...');
      const url = getGoogleAuthUrl();
      expect(url).toContain('accounts.google.com');
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({ scope: ['openid', 'email', 'profile'] })
      );
    });
  });

  describe('authenticateWithGoogle', () => {
    it('upserts on the immutable google id and refreshes cached profile fields', async () => {
      mockGoogleProfile({
        sub: 'google-123',
        email: 'jane@example.com',
        name: 'Jane Doe',
        picture: 'https://img/jane.png'
      });
      const dbUser = { id: 'u1', googleId: 'google-123', email: 'jane@example.com', name: 'Jane Doe', avatarUrl: 'https://img/jane.png' };
      mockUpsert.mockResolvedValue(dbUser);

      const result = await authenticateWithGoogle('auth-code');

      expect(mockGetToken).toHaveBeenCalledWith('auth-code');
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { googleId: 'google-123' },
        create: {
          googleId: 'google-123',
          email: 'jane@example.com',
          name: 'Jane Doe',
          avatarUrl: 'https://img/jane.png'
        },
        update: {
          email: 'jane@example.com',
          name: 'Jane Doe',
          avatarUrl: 'https://img/jane.png'
        }
      });
      expect(result).toEqual(dbUser);
    });

    it('falls back to email for name and null for a missing avatar', async () => {
      mockGoogleProfile({ sub: 'google-456', email: 'no-name@example.com' });
      mockUpsert.mockResolvedValue({ id: 'u2' });

      await authenticateWithGoogle('code');

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ name: 'no-name@example.com', avatarUrl: null })
        })
      );
    });

    it('rejects with 401 when Google returns no id_token', async () => {
      mockGetToken.mockResolvedValue({ tokens: {} });
      await expect(authenticateWithGoogle('code')).rejects.toMatchObject({ statusCode: 401 });
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('rejects with 401 when the verified payload lacks sub or email', async () => {
      mockGoogleProfile({ sub: 'google-789' }); // no email
      await expect(authenticateWithGoogle('code')).rejects.toMatchObject({ statusCode: 401 });
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('issueSessionToken', () => {
    it('signs a verifiable JWT carrying userId and email', () => {
      const token = issueSessionToken({ id: 'u1', email: 'jane@example.com' });
      const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string; email: string };
      expect(decoded.userId).toBe('u1');
      expect(decoded.email).toBe('jane@example.com');
    });
  });
});
