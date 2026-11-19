import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { AdminService } from '../../types';
import { AdminPage, Panel } from '../../components/admin/ui';
import { Textarea } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';

export function Content() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<Record<string, { excerptEn: string; excerptAr: string }>>({});

  const servicesQuery = useQuery({
    queryKey: ['admin', 'services'],
    queryFn: async () => (await api.get<AdminService[]>('/admin/services')).data,
  });

  const updateService = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.patch(`/admin/services/${id}`, payload),
    onSuccess: async () => {
      setFeedback('Service updated.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'services'] });
      await queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (error) => setFeedback(error instanceof ApiError ? error.message : 'Could not update the service.'),
  });

  return (
    <AdminPage title="Services" description="Manage the public service catalogue.">
      {feedback ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800" role="status">{feedback}</div>
      ) : null}

      <Panel title="Service catalogue">
        {servicesQuery.isLoading ? (
          <div className="p-6"><Spinner label="Loading services…" /></div>
        ) : (
          <div className="divide-y divide-steel-100">
            {servicesQuery.data?.map((service) => {
              const draft = editingService[service.id] ?? { excerptEn: service.excerptEn, excerptAr: service.excerptAr };
              return (
                <div key={service.id} className="grid gap-3 p-5 lg:grid-cols-12 lg:items-start">
                  <div className="lg:col-span-3">
                    <p className="text-[0.88rem] font-bold text-navy-800">{service.titleEn}</p>
                    <p className="mt-0.5 text-[0.75rem] text-steel-400">{service.titleAr}</p>
                    <p className="mt-1 font-mono text-[0.68rem] text-steel-400">/{service.slug}</p>
                  </div>
                  <div className="space-y-2 lg:col-span-6">
                    <Textarea
                      rows={2}
                      value={draft.excerptEn}
                      onChange={(event) => setEditingService({ ...editingService, [service.id]: { ...draft, excerptEn: event.target.value } })}
                      aria-label={`English excerpt for ${service.titleEn}`}
                    />
                    <Textarea
                      rows={2}
                      dir="rtl"
                      value={draft.excerptAr}
                      onChange={(event) => setEditingService({ ...editingService, [service.id]: { ...draft, excerptAr: event.target.value } })}
                      aria-label={`Arabic excerpt for ${service.titleEn}`}
                    />
                  </div>
                  <div className="flex flex-col items-start gap-2 lg:col-span-3 lg:items-end">
                    <label className="flex items-center gap-2 text-[0.78rem] text-steel-600">
                      <input
                        type="checkbox"
                        checked={service.isActive}
                        onChange={(event) => updateService.mutate({ id: service.id, payload: { isActive: event.target.checked } })}
                        className="h-4 w-4 rounded border-steel-400 text-brand-600"
                      />
                      Visible on site
                    </label>
                    <Button
                      variant="onlight"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => updateService.mutate({ id: service.id, payload: { excerptEn: draft.excerptEn, excerptAr: draft.excerptAr } })}
                      disabled={updateService.isPending}
                    >
                      Save text
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </AdminPage>
  );
}
