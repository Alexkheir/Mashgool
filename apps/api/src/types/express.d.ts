import type { User } from '@prisma/client';

// requireAuth attaches the authenticated user to the request. Declaring it here
// makes `req.user` typed everywhere (controllers, the error handler) instead of
// `any`. Optional because it's only present on routes behind requireAuth.
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
