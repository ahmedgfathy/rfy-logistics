import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { AdminUser } from '../../types';
import { AdminField, AdminPage, Panel, Table, Td, Th, EmptyRow } from '../../components/admin/ui';
import { Input, Select } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { formatDateTime } from '../../lib/utils';

export function Users() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'EDITOR' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await api.get<AdminUser[]>('/admin/users')).data,
  });

  const mutation = useMutation({
    mutationFn: async () => api.post('/admin/users', form),
    onSuccess: async () => {
      setSuccess('User created.');
      setError(null);
      setForm({ name: '', email: '', password: '', role: 'EDITOR' });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (requestError) => {
      setSuccess(null);
      setError(requestError instanceof ApiError ? requestError.message : 'Could not create the user.');
    },
  });

  return (
    <AdminPage title="Users" description="Staff accounts with dashboard access. Administrators can manage users.">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Accounts">
            {isLoading ? (
              <div className="p-6"><Spinner label="Loading users…" /></div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Last sign-in</Th>
                  </tr>
                </thead>
                <tbody>
                  {!data?.length ? (
                    <EmptyRow colSpan={4} message="No users found." />
                  ) : (
                    data.map((user) => (
                      <tr key={user.id} className="hover:bg-steel-50/60">
                        <Td className="font-semibold text-navy-800">{user.name}</Td>
                        <Td className="text-[0.78rem]">{user.email}</Td>
                        <Td>
                          <span className={`rounded-full px-2 py-0.5 text-[0.66rem] font-bold uppercase ${user.role === 'ADMIN' ? 'bg-brand-50 text-brand-700' : 'bg-steel-100 text-steel-600'}`}>
                            {user.role}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap text-[0.75rem]">{formatDateTime(user.lastLoginAt ?? null, 'en')}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>

        <Panel title="Add a user">
          <div className="space-y-4 p-5">
            {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
            {success ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{success}</p> : null}

            <AdminField label="Full name">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </AdminField>
            <AdminField label="Email">
              <Input type="email" dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </AdminField>
            <AdminField label="Temporary password">
              <Input type="password" dir="ltr" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              <p className="field-help">At least 10 characters, including a letter and a number.</p>
            </AdminField>
            <AdminField label="Role">
              <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="EDITOR">Editor</option>
                <option value="ADMIN">Administrator</option>
              </Select>
            </AdminField>

            <Button
              className="w-full"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.name || !form.email || form.password.length < 10}
              icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
            >
              {mutation.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </div>
        </Panel>
      </div>
    </AdminPage>
  );
}
