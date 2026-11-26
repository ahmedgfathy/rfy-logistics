import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: { db: { url: env.DATABASE_URL } },
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
