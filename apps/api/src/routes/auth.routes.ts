import { Router } from 'express';
import {
  getMe,
  googleCallback,
  googleRedirect,
  logout
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

export const authRouter = Router();

// Public — starting and completing the OAuth handshake happens before a session
// exists, so these cannot be behind requireAuth.
authRouter.get('/google', googleRedirect);
authRouter.get('/google/callback', googleCallback);

// Protected — require a valid session cookie.
authRouter.get('/me', requireAuth, getMe);
authRouter.post('/logout', requireAuth, logout);
