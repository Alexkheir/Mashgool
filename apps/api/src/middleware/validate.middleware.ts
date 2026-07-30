import { NextFunction, Request, Response } from 'express';
import { ZodType } from 'zod';

// A generic body validator. Given a Zod DTO it parses `req.body`, and on failure
// short-circuits with a 400 listing the offending fields — the route handler is
// never reached. On success it replaces `req.body` with the *parsed* data, so
// downstream code gets trimmed/coerced values and (because our DTOs are
// `.strict()`) can trust that no unknown fields slipped through (mass-assignment
// defence). Used on every route that accepts a request body.
export function validate(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: result.error.flatten().fieldErrors
      });
    }

    req.body = result.data;
    next();
  };
}
