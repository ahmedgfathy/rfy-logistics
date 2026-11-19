import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../../lib/api';
import type { QuoteSummary } from '../../types';
import { AdminPage, Panel, Table, Td, Th, EmptyRow } from '../../components/admin/ui';
import { Input, Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { StatusPill } from '../../components/ui/StatusPill';
import { QUOTE_STATUSES } from '../../lib/site';
import { formatDateTime } from '../../lib/utils';

interface Meta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export function Quotes() {
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'quotes', status, search, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status !== 'ALL') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const response = await api.get<QuoteSummary[]>(`/quotes?${params.toString()}`);
      return { rows: response.data, meta: (response.meta ?? { total: 0, page: 1, limit: 20, pages: 1 }) as unknown as Meta };
    },
  });

  return (
    <AdminPage title="Quote requests" description="Every quotation request submitted through the website.">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search reference, name, email…"
            className="ps-9"
            aria-label="Search quote requests"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="w-auto min-w-[11rem]"
        >
          <option value="ALL">All statuses</option>
          {QUOTE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <span className="text-xs font-semibold text-steel-500">{data?.meta.total ?? 0} records</span>
      </div>

      <Panel>
        {isLoading ? (
          <div className="p-8"><Spinner label="Loading quote requests…" /></div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Customer</Th>
                <Th>Route</Th>
                <Th>Mode</Th>
                <Th>Received</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {!data?.rows.length ? (
                <EmptyRow colSpan={6} message="No quote requests match these filters." />
              ) : (
                data.rows.map((quote) => (
                  <tr key={quote.id} className="hover:bg-steel-50/60">
                    <Td>
                      <Link to={`/admin/quotes/${quote.id}`} className="font-mono text-[0.8rem] font-bold text-brand-700 hover:underline">
                        {quote.reference}
                      </Link>
                      {quote._count?.attachments ? (
                        <span className="ms-1.5 rounded bg-steel-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-steel-500">
                          {quote._count.attachments} file{quote._count.attachments > 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <span className="font-semibold text-navy-800">{quote.fullName}</span>
                      <span className="block text-[0.72rem] text-steel-400">{quote.companyName ?? quote.email}</span>
                    </Td>
                    <Td>
                      <span className="block">{quote.originCity} → {quote.destinationCity}</span>
                      <span className="block text-[0.72rem] text-steel-400">{quote.originCountry} → {quote.destinationCountry}</span>
                    </Td>
                    <Td>{quote.freightMode}</Td>
                    <Td className="whitespace-nowrap text-[0.75rem] text-steel-500">{formatDateTime(quote.createdAt, 'en')}</Td>
                    <Td><StatusPill status={quote.status} label={quote.status.replace(/_/g, ' ')} /></Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Panel>

      {data && data.meta.pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="btn-onlight px-3 py-1.5 text-xs"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="text-xs font-semibold text-steel-500">
            Page {data.meta.page} of {data.meta.pages}
          </span>
          <button
            type="button"
            className="btn-onlight px-3 py-1.5 text-xs"
            disabled={page >= data.meta.pages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </AdminPage>
  );
}
