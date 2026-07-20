import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';

// One OAuth2 client for the app. Constructing it makes no network calls — it
// just holds our credentials and knows where Google should redirect back to.
const oauthClient = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_CALLBACK_URL
});

// openid + email + profile is the minimum to identify a user and cache their
// display name/avatar. We ask for nothing we don't store.
const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

// Step 3 of the flow: the URL we bounce the browser to. `select_account` forces
// Google's account chooser instead of silently reusing the last session.
export function getGoogleAuthUrl(): string {
  return oauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'select_account'
  });
}

// Steps 5–6: trade the one-time `code` for tokens, then read the verified
// identity out of the id_token. verifyIdToken checks Google's signature and
// that the token was minted for *our* client id — so we never trust an
// unverified profile.
async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const { tokens } = await oauthClient.getToken(code);

  if (!tokens.id_token) {
    throw new AppError(401, 'Google did not return an identity token');
  }

  const ticket = await oauthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new AppError(401, 'Google profile is missing required fields');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    avatarUrl: payload.picture ?? null
  };
}

// Step 7: create the user on first sign-in, or refresh their cached
// name/email/avatar on return. Matched on the immutable Google id, never email
// (email could in principle change on the Google side).
export async function authenticateWithGoogle(code: string): Promise<User> {
  const profile = await exchangeCodeForProfile(code);

  return prisma.user.upsert({
    where: { googleId: profile.googleId },
    create: {
      googleId: profile.googleId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl
    },
    update: {
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl
    }
  });
}

// Step 8: mint the session JWT. Only userId + email travel in the token;
// everything else about the user is read fresh from the DB on each request.
export function issueSessionToken(user: Pick<User, 'id' | 'email'>): string {
  return jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
  });
}
