import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { isProduction } from '../config/env';
import { logger } from '../lib/logger';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new ApiError(429, 'TOO_MANY_REQUESTS', message);
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} does not exist` },
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the highlighted fields',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'A record with these details already exists' },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      return;
    }
  }

  // multer file-size / type errors
  const maybeMulter = err as { code?: string; message?: string };
  if (maybeMulter?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'The uploaded file is too large' } });
    return;
  }
  if (maybeMulter?.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({ error: { code: 'INVALID_UPLOAD', message: 'Unexpected file field or too many files' } });
    return;
  }

  logger.error('Unhandled error', {
    path: req.originalUrl,
    method: req.method,
    message: maybeMulter?.message,
    stack: isProduction ? undefined : (err as Error)?.stack,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong on our side. Please try again shortly.',
    },
  });
}
