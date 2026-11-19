import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from './error';

interface Schemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/**
 * Validates and REPLACES req.body / req.params / req.query with parsed output.
 * Express 4 exposes req.query as a getter, so a validated copy is stored on
 * res.locals to avoid mutating the read-only accessor.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) res.locals.query = schemas.query.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new ApiError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields', error.flatten().fieldErrors));
        return;
      }
      next(error);
    }
  };
}
