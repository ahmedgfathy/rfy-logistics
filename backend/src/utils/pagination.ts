export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(query: Record<string, unknown>, defaultLimit = 20): Pagination {
  const rawPage = Number(query.page ?? 1);
  const rawLimit = Number(query.limit ?? defaultLimit);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : defaultLimit;
  return { page, limit, skip: (page - 1) * limit };
}

export function paginationMeta(total: number, { page, limit }: Pagination) {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}
