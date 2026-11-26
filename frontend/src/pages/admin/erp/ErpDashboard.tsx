import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import type { ErpDashboardData } from '../../../features/erp/types';
import { AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Spinner, StatePanel } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDateTime } from '../../../lib/utils';

const currency = (value: string | number, code: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: code }).format(Number(value));

export default function ErpDashboard() {
  const query = useQuery({
    queryKey: ['erp', 'dashboard'],
    queryFn: async () => (await api.get<ErpDashboardData>('/erp/dashboard')).data,
  });

  if (query.isLoading) return <Spinner label="Loading ERP overview…" />;
  if (query.isError || !query.data) return <StatePanel title="ERP overview unavailable" body="Check the API connection and try again." />;

  const { totals, recentShipments, recentQuotes, recentInvoices } = query.data;
  const cards = [
    ['Active customers', totals.customers],
    ['Open quotations', totals.openQuotes],
    ['Active bookings', totals.activeBookings],
    ['Active shipments', totals.activeShipments],
    ['Open customs files', totals.openCustoms],
    ['Open tasks', totals.openTasks],
    ['Overdue tasks', totals.overdueTasks],
  ] as const;

  return (
    <AdminPage title="ERP overview" description="Sales, operations, customs and finance in one operational view.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-steel-200 bg-white p-5 shadow-soft">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-steel-500">{label}</p>
            <p className="mt-2 text-3xl font-extrabold text-navy-800">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-steel-500">Accounts receivable</p>
          <p className="mt-2 text-2xl font-extrabold text-navy-800">{currency(totals.receivables, 'EGP')}</p>
          <Link to="/admin/erp/invoices" className="mt-3 inline-block text-sm font-bold text-brand-700 hover:underline">Open invoices</Link>
        </div>
        <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-steel-500">Accounts payable</p>
          <p className="mt-2 text-2xl font-extrabold text-navy-800">{currency(totals.payables, 'EGP')}</p>
          <Link to="/admin/erp/bills" className="mt-3 inline-block text-sm font-bold text-brand-700 hover:underline">Open bills</Link>
        </div>
      </div>

      <Panel title="Recent shipments">
        <Table>
          <thead><tr><Th>Tracking</Th><Th>Route</Th><Th>Status</Th><Th>Updated</Th></tr></thead>
          <tbody>
            {recentShipments.length ? recentShipments.map((shipment) => (
              <tr key={shipment.id}>
                <Td><Link className="font-mono font-bold text-brand-700" to={`/admin/erp/shipments?selected=${shipment.id}`}>{shipment.trackingNumber}</Link></Td>
                <Td>{shipment.originPort} → {shipment.destinationPort}</Td>
                <Td><StatusPill status={shipment.status} label={shipment.status.replace(/_/g, ' ')} /></Td>
                <Td>{formatDateTime(shipment.updatedAt, 'en')}</Td>
              </tr>
            )) : <EmptyRow colSpan={4} message="No shipments yet." />}
          </tbody>
        </Table>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Recent quotations">
          <Table>
            <thead><tr><Th>Number</Th><Th>Customer</Th><Th>Status</Th></tr></thead>
            <tbody>
              {recentQuotes.length ? recentQuotes.map((quote) => (
                <tr key={quote.id}><Td className="font-mono">{quote.number}</Td><Td>{quote.customer.nameEn}</Td><Td><StatusPill status={quote.status} label={quote.status} /></Td></tr>
              )) : <EmptyRow colSpan={3} message="No quotations yet." />}
            </tbody>
          </Table>
        </Panel>
        <Panel title="Recent invoices">
          <Table>
            <thead><tr><Th>Number</Th><Th>Customer</Th><Th>Balance</Th><Th>Status</Th></tr></thead>
            <tbody>
              {recentInvoices.length ? recentInvoices.map((invoice) => (
                <tr key={invoice.id}><Td className="font-mono">{invoice.number}</Td><Td>{invoice.customer.nameEn}</Td><Td>{currency(invoice.balance, invoice.currency)}</Td><Td><StatusPill status={invoice.status} label={invoice.status.replace(/_/g, ' ')} /></Td></tr>
              )) : <EmptyRow colSpan={4} message="No invoices yet." />}
            </tbody>
          </Table>
        </Panel>
      </div>
    </AdminPage>
  );
}
