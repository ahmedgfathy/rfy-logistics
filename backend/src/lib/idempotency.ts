import type { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/error';

export async function readIdempotentResponse(
  db: Prisma.TransactionClient,
  companyId: string,
  key: string,
): Promise<unknown | null> {
  const record = await db.idempotencyRecord.findUnique({
    where: { companyId_key: { companyId, key } },
    select: { response: true },
  });
  return record?.response ?? null;
}

export async function saveIdempotentResponse(
  db: Prisma.TransactionClient,
  companyId: string,
  key: string,
  response: Prisma.InputJsonValue,
): Promise<void> {
  await db.idempotencyRecord.create({ data: { companyId, key, response } });
}

export function requireIdempotencyKey(req: { headers: Record<string, unknown> }): string {
  const value = req.headers['idempotency-key'];
  if (typeof value !== 'string' || value.trim().length < 8 || value.length > 128) {
    throw ApiError.badRequest('An Idempotency-Key header of 8-128 characters is required');
  }
  return value.trim();
}
