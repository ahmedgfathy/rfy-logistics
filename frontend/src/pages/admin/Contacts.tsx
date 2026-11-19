import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Mail } from 'lucide-react';
import { api } from '../../lib/api';
import type { ContactMessage } from '../../types';
import { AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../components/admin/ui';
import { Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { StatusPill } from '../../components/ui/StatusPill';
import { formatDateTime } from '../../lib/utils';

const STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED'] as const;

export function Contacts() {
  const [filter, setFilter] = useState('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'contacts', filter],
    queryFn: async () => {
      const params = filter === 'ALL' ? '' : `?status=${filter}`;
      return (await api.get<ContactMessage[]>(`/contact${params}`)).data;
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => api.patch(`/contact/${id}/status`, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'contacts'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  return (
    <AdminPage title="Messages" description="Enquiries submitted through the contact form.">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onChange={(event) => setFilter(event.target.value)} className="w-auto min-w-[11rem]" aria-label="Filter messages">
          <option value="ALL">All messages</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <span className="text-xs font-semibold text-steel-500">{data?.length ?? 0} messages</span>
      </div>

      <Panel>
        {isLoading ? (
          <div className="p-8"><Spinner label="Loading messages…" /></div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>From</Th>
                <Th>Subject</Th>
                <Th>Received</Th>
                <Th>Status</Th>
                <Th><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {!data?.length ? (
                <EmptyRow colSpan={5} message="No messages match this filter." />
              ) : (
                data.map((message) => (
                  <>
                    <tr key={message.id} className="hover:bg-steel-50/60">
                      <Td>
                        <span className="font-semibold text-navy-800">{message.fullName}</span>
                        <span className="block text-[0.72rem] text-steel-400">{message.email}</span>
                      </Td>
                      <Td>
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === message.id ? null : message.id)}
                          className="flex items-center gap-1.5 text-start font-semibold text-brand-700 hover:underline"
                        >
                          {message.subject}
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded === message.id ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </button>
                      </Td>
                      <Td className="whitespace-nowrap text-[0.75rem] text-steel-500">{formatDateTime(message.createdAt, 'en')}</Td>
                      <Td><StatusPill status={message.status} label={message.status.replace(/_/g, ' ')} /></Td>
                      <Td>
                        <Select
                          value={message.status}
                          onChange={(event) => mutation.mutate({ id: message.id, status: event.target.value })}
                          className="w-auto py-1.5 text-xs"
                          aria-label={`Change status for ${message.subject}`}
                        >
                          {STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </Select>
                      </Td>
                    </tr>
                    {expanded === message.id ? (
                      <tr key={`${message.id}-detail`} className="bg-steel-50/60">
                        <td colSpan={5} className="border-b border-steel-100 px-5 py-4">
                          <div className="whitespace-pre-line text-[0.85rem] leading-relaxed text-steel-700">{message.message}</div>
                          <div className="mt-3 flex flex-wrap gap-4 text-[0.75rem] text-steel-500">
                            {message.phone ? <span dir="ltr">{message.phone}</span> : null}
                            {message.company ? <span>{message.company}</span> : null}
                            <a href={`mailto:${message.email}`} className="inline-flex items-center gap-1 font-semibold text-brand-700">
                              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                              Reply by email
                            </a>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Panel>
    </AdminPage>
  );
}
