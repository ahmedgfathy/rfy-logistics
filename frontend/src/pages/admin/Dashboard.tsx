import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Inbox, MessageSquare, PackageSearch, Quote } from 'lucide-react';
import { api } from '../../lib/api';
import type { DashboardStats } from '../../types';
import { AdminPage, Panel, Table, Td, Th, EmptyRow } from '../../components/admin/ui';
import { Spinner, StatePanel } from '../../components/ui/Spinner';
import { StatusPill } from '../../components/ui/StatusPill';
import { formatDateTime } from '../../lib/utils';

export function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get<DashboardStats>('/admin/stats')).data,
  });

  const cards = [
    { label: 'Quote requests', value: data?.totals.totalQuotes, icon: Quote, tone: 'bg-brand-50 text-brand-700', href: '/admin/quotes' },
    { label: 'New / unreviewed', value: data?.totals.newQuotes, icon: Inbox, tone: 'bg-amber-500/10 text-amber-700', href: '/admin/quotes?status=NEW' },
    { label: 'Open messages', value: data?.totals.openContacts, icon: MessageSquare, tone: 'bg-ocean-300/20 text-ocean-600', href: '/admin/contacts' },
    { label: 'Active shipments', value: data?.totals.shipmentsInTransit, icon: PackageSearch, tone: 'bg-emerald-50 text-emerald-700', href: '/admin/shipments' },
  ];

  return (
    <AdminPage title="Operations dashboard" description="Live overview of enquiries, quotations and shipments.">
      {isLoading ? (
        <Spinner label="Loading dashboard…" />
      ) : isError || !data ? (
        <StatePanel title="Dashboard unavailable" body="Could not load statistics. Refresh to try again." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.label}
                to={card.href}
                className="group rounded-2xl border border-steel-200 bg-white p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-start justify-between">
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${card.tone}`}>
                    <card.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-steel-300 transition-colors group-hover:text-brand-600" aria-hidden="true" />
                </div>
                <p className="mt-4 text-[1.7rem] font-extrabold leading-none text-navy-800">{card.value ?? 0}</p>
                <p className="mt-1.5 text-[0.78rem] font-semibold text-steel-500">{card.label}</p>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Quotes by status" className="lg:col-span-1">
              <ul className="divide-y divide-steel-100">
                {data.quotesByStatus.length === 0 ? (
                  <li className="px-5 py-6 text-sm text-steel-400">No quote requests yet.</li>
                ) : (
                  data.quotesByStatus.map((row) => (
                    <li key={row.status} className="flex items-center justify-between gap-3 px-5 py-3">
                      <StatusPill status={row.status} label={row.status.replace(/_/g, ' ')} />
                      <span className="text-sm font-bold text-navy-800">{row.count}</span>
                    </li>
                  ))
                )}
              </ul>
            </Panel>

            <Panel title="Latest quote requests" className="lg:col-span-2">
              <Table>
                <thead>
                  <tr>
                    <Th>Reference</Th>
                    <Th>Customer</Th>
                    <Th>Destination</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentQuotes.length === 0 ? (
                    <EmptyRow colSpan={4} message="No quote requests yet." />
                  ) : (
                    data.recentQuotes.map((quote) => (
                      <tr key={quote.id} className="hover:bg-steel-50/60">
                        <Td>
                          <Link to={`/admin/quotes/${quote.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                            {quote.reference}
                          </Link>
                          <span className="mt-0.5 block text-[0.7rem] text-steel-400">{formatDateTime(quote.createdAt, 'en')}</span>
                        </Td>
                        <Td>
                          <span className="font-semibold text-navy-800">{quote.fullName}</span>
                          {quote.companyName ? <span className="block text-[0.72rem] text-steel-400">{quote.companyName}</span> : null}
                        </Td>
                        <Td>{quote.destinationCountry}</Td>
                        <Td><StatusPill status={quote.status} label={quote.status.replace(/_/g, ' ')} /></Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Panel>
          </div>

          <Panel title="Latest messages">
            <Table>
              <thead>
                <tr>
                  <Th>From</Th>
                  <Th>Subject</Th>
                  <Th>Received</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentContacts.length === 0 ? (
                  <EmptyRow colSpan={4} message="No messages yet." />
                ) : (
                  data.recentContacts.map((message) => (
                    <tr key={message.id} className="hover:bg-steel-50/60">
                      <Td className="font-semibold text-navy-800">{message.fullName}</Td>
                      <Td>{message.subject}</Td>
                      <Td>{formatDateTime(message.createdAt, 'en')}</Td>
                      <Td><StatusPill status={message.status} label={message.status.replace(/_/g, ' ')} /></Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Panel>
        </>
      )}
    </AdminPage>
  );
}
