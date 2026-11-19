import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Vercel's Prisma Postgres integration injects an accelerated `prisma://`
  // URL as DATABASE_URL. A plain PrismaClient cannot use it, so when the
  // integration also provides DIRECT_URL we connect with that instead.
  DIRECT_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_SITE_URL: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('/app/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(8),
  ADMIN_EMAIL: z.string().email().default('admin@marsa-demo.local'),
  ADMIN_PASSWORD: z.string().min(8).default('ChangeMe!2026'),
  ADMIN_NAME: z.string().default('Operations Administrator'),
  SEED_DEMO_DATA: z.string().default('true'),
  CARRIER_API_URL: z.string().url().optional(),
  CARRIER_API_KEY: z.string().optional(),
  NOTIFY_WEBHOOK_URL: z.string().url().optional(),
  RATE_LIMIT_DISABLED: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast: a misconfigured server must never start with weak defaults.
  console.error('[config] Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;
const databaseUrl =
  data.DATABASE_URL.startsWith('prisma://') && data.DIRECT_URL
    ? data.DIRECT_URL
    : data.DATABASE_URL;

export const env = { ...data, DATABASE_URL: databaseUrl };

export const isProduction = env.NODE_ENV === 'production';
export const isDemoSeedEnabled = env.SEED_DEMO_DATA !== 'false';
export const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
