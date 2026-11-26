import { prisma } from './prisma';
import { ApiError } from '../middleware/error';

export async function defaultCompanyId(): Promise<string> {
  const company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!company) throw ApiError.badRequest('ERP reference data has not been seeded');
  return company.id;
}
