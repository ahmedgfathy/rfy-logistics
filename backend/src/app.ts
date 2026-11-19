import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { allowedOrigins, isProduction } from './config/env';
import { apiRoutes } from './routes';
import { attachUser } from './middleware/auth';
import { ApiError, errorHandler, notFoundHandler } from './middleware/error';
import { globalLimiter } from './middleware/rateLimit';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false, // API only; the frontend sets its own policy
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(ApiError.forbidden('Origin not allowed'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  if (!isProduction) {
    app.use(morgan('dev'));
  }

  // Reject state-changing requests that come from a foreign browser origin.
  app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const origin = req.headers.origin;
    if (isMutation && origin && !allowedOrigins.includes(origin)) {
      next(ApiError.forbidden('Request origin is not allowed'));
      return;
    }
    next();
  });

  app.use('/api', globalLimiter);
  app.use('/api', attachUser);

  app.get('/api/v1/health', async (_req: Request, res: Response) => {
    let database = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch (error) {
      logger.error('Health check database probe failed', { message: (error as Error).message });
    }
    const healthy = database === 'up';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service: 'marsa-logistics-api',
      version: '1.0.0',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
