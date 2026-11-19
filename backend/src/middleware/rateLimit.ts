import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env';

const disabled = env.RATE_LIMIT_DISABLED === 'true' || env.NODE_ENV === 'test';

function create(options: Partial<Options>) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => disabled,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please try again later.' },
      });
    },
    ...options,
  });
}

export const globalLimiter = create({ windowMs: 15 * 60 * 1000, limit: 600 });
export const authLimiter = create({ windowMs: 15 * 60 * 1000, limit: 12 });
export const submissionLimiter = create({ windowMs: 60 * 60 * 1000, limit: 12 });
export const trackingLimiter = create({ windowMs: 10 * 60 * 1000, limit: 60 });
