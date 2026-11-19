import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { AdminUser } from '../../types';
import { AdminLayout } from './AdminLayout';
import { Login } from './Login';
import { Dashboard } from './Dashboard';
import { Quotes } from './Quotes';
import { QuoteDetail } from './QuoteDetail';
import { Contacts } from './Contacts';
import { Shipments } from './Shipments';
import { Content } from './Content';
import { Users } from './Users';

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
      return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
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
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
