import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { AdminUser } from '../../types';
import { AdminLayout } from './AdminLayout';
import { Login } from './Login';
import { Dashboard } from './Dashboard';
import { StatePanel } from '../../components/ui/Spinner';
import { Quotes } from './Quotes';
import { QuoteDetail } from './QuoteDetail';
import { Contacts } from './Contacts';
import { Shipments } from './Shipments';
import { Content } from './Content';
import { Users } from './Users';
import ErpDashboard from './erp/ErpDashboard';
import Partners from './erp/Partners';
import CommercialQuotes from './erp/Quotes';
import Bookings from './erp/Bookings';
import Documents from './erp/Documents';
import Tasks from './erp/Tasks';
import ErpShipments from './erp/Shipments';
import Customs from './erp/Customs';
import Invoices from './erp/Invoices';
import Bills from './erp/Bills';
import Payments from './erp/Payments';
import Accounting from './erp/Accounting';

export function useSession() {
  return useQuery({
    queryKey: ['admin', 'session'],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<AdminUser>('/auth/me')).data,
  });
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const session = useSession();

  if (session.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-steel-50 text-sm font-semibold text-steel-500">Checking session…</div>;
  }

  if (session.isError) {
    const error = session.error;
    const isUnauthorised = error instanceof ApiError && (error.status === 401 || error.status === 403);
    if (isUnauthorised) {
      return <Navigate to="/admin/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
    }
  }

  if (!session.data) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <AdminLayout user={session.data}>{children}</AdminLayout>;
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route
        index
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="erp"
        element={
          <RequireAuth>
            <ErpDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="erp/partners"
        element={
          <RequireAuth>
            <Partners />
          </RequireAuth>
        }
      />
      <Route
        path="erp/quotes"
        element={
          <RequireAuth>
            <CommercialQuotes />
          </RequireAuth>
        }
      />
      <Route
        path="erp/bookings"
        element={
          <RequireAuth>
            <Bookings />
          </RequireAuth>
        }
      />
      <Route
        path="erp/documents"
        element={
          <RequireAuth>
            <Documents />
          </RequireAuth>
        }
      />
      <Route
        path="erp/tasks"
        element={
          <RequireAuth>
            <Tasks />
          </RequireAuth>
        }
      />
      <Route
        path="erp/shipments"
        element={
          <RequireAuth>
            <ErpShipments />
          </RequireAuth>
        }
      />
      <Route
        path="erp/customs"
        element={
          <RequireAuth>
            <Customs />
          </RequireAuth>
        }
      />
      <Route
        path="erp/invoices"
        element={
          <RequireAuth>
            <Invoices />
          </RequireAuth>
        }
      />
      <Route
        path="erp/bills"
        element={
          <RequireAuth>
            <Bills />
          </RequireAuth>
        }
      />
      <Route
        path="erp/payments"
        element={
          <RequireAuth>
            <Payments />
          </RequireAuth>
        }
      />
      <Route
        path="erp/accounting"
        element={
          <RequireAuth>
            <Accounting />
          </RequireAuth>
        }
      />
      <Route
        path="quotes"
        element={
          <RequireAuth>
            <Quotes />
          </RequireAuth>
        }
      />
      <Route
        path="quotes/:id"
        element={
          <RequireAuth>
            <QuoteDetail />
          </RequireAuth>
        }
      />
      <Route
        path="contacts"
        element={
          <RequireAuth>
            <Contacts />
          </RequireAuth>
        }
      />
      <Route
        path="shipments"
        element={
          <RequireAuth>
            <Shipments />
          </RequireAuth>
        }
      />
      <Route
        path="content"
        element={
          <RequireAuth>
            <Content />
          </RequireAuth>
        }
      />
      <Route
        path="users"
        element={
          <RequireAuth>
            <Users />
          </RequireAuth>
        }
      />
      <Route
        path="erp/*"
        element={
          <RequireAuth>
            <StatePanel
              title="ERP page not found"
              body="This ERP link is invalid or belongs to an older version. Open the ERP overview and choose a module from the menu."
            />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
