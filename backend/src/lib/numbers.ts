import { Prisma } from '@prisma/client';

export async function nextNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  key: string,
  prefix: string,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const rows = await tx.$queryRaw<Array<{ current: number }>>(Prisma.sql`
    INSERT INTO "NumberSequence" ("id", "companyId", "key", "prefix", "year", "current", "updatedAt")
    VALUES (gen_random_uuid(), CAST(${companyId} AS uuid), ${key}, ${prefix}, ${year}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("companyId", "key", "year")
    DO UPDATE SET "current" = "NumberSequence"."current" + 1, "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "current"
  `);
  return `${prefix}-${year}-${String(rows[0].current).padStart(6, '0')}`;
}
