import { NextFunction, Request, Response } from 'express';

// Thrown by services (and middleware) for expected, user-facing failures. The
// global handler below turns it into a clean JSON response with its status.
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Last middleware in the chain. Express routes a thrown/rejected error here
// (Express 5 forwards async rejections automatically). Operational AppErrors
// surface their message; anything else is logged server-side and returned as a
// generic 500 — stack traces never reach the client. Sentry reporting is added
// in Feature 18.
//
// `next` is unused but required: Express only recognises a function with four
// parameters as an error handler.
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  console.error({
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    error: err.message,
    stack: err.stack
  });

  return res.status(500).json({
    message: 'Something went wrong. Please try again.'
  });
}
