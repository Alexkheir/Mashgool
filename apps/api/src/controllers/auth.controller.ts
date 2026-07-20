import { CookieOptions, Request, Response } from 'express';
import type { User } from '@prisma/client';
import {
  authenticateWithGoogle,
  getGoogleAuthUrl,
  issueSessionToken
} from '../services/auth.service';
import { AppError } from '../middleware/error.middleware';
import { env } from '../config/env';

const COOKIE_NAME = 'token';

// Shared cookie settings. `secure` only in production because browsers reject
// Secure cookies over plain http (local dev). maxAge is omitted when clearing.
function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };
}

// The public shape of a user — an explicit contract, so internal columns can be
// added to the model without silently leaking into API responses.
function toUserResponse(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl
  };
}

// GET /auth/google — kick off the flow by redirecting to Google's consent screen.
export function googleRedirect(_req: Request, res: Response) {
  res.redirect(getGoogleAuthUrl());
}

// GET /auth/google/callback — Google redirects here with ?code=. Exchange it,
// set the session cookie, then send the browser to the app.
export async function googleCallback(req: Request, res: Response) {
  const { code } = req.query;
  if (typeof code !== 'string' || code.length === 0) {
    throw new AppError(400, 'Missing authorization code');
  }

  const user = await authenticateWithGoogle(code);
  const token = issueSessionToken(user);

  res.cookie(COOKIE_NAME, token, sessionCookieOptions());
  res.redirect(`${env.ALLOWED_ORIGIN}/dashboard`);
}

// GET /auth/me — requireAuth has already loaded the user; just return it.
export function getMe(req: Request, res: Response) {
  res.status(200).json({ user: toUserResponse(req.user!) });
}

// POST /auth/logout — clear the cookie. Options (minus maxAge) must match how it
// was set or the browser won't remove it.
export function logout(_req: Request, res: Response) {
  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(COOKIE_NAME, clearOptions);
  res.status(200).json({ message: 'Logged out' });
}
