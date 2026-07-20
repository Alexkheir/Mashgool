import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AppError } from './error.middleware';

interface SessionPayload {
  userId: string;
  email: string;
}

// Runs before every protected controller. Reads the JWT from the HTTP-only
// cookie, verifies its signature/expiry, then loads the user from the DB and
// attaches it to req.user. Any failure is a 401 with the *same* message —
// invalid token and unknown user are deliberately indistinguishable so we never
// reveal whether an account exists.
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    throw new AppError(401, 'Authentication required');
  }

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as SessionPayload;
  } catch {
    throw new AppError(401, 'Invalid or expired session');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    throw new AppError(401, 'Invalid or expired session');
  }

  req.user = user;
  next();
}
