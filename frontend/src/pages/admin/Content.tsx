import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { AdminNewsArticle, AdminService } from '../../types';
import { AdminField, AdminPage, Panel, Table, Td, Th, EmptyRow } from '../../components/admin/ui';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { formatDateTime } from '../../lib/utils';

const emptyArticle = {
  slug: '',
  titleEn: '',
  titleAr: '',
  excerptEn: '',
  excerptAr: '',
  bodyEn: '',
  bodyAr: '',
  category: 'Insights',
  isPublished: 'false',
};

export function Content() {
  const [tab, setTab] = useState<'news' | 'services'>('news');
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyArticle });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<Record<string, { excerptEn: string; excerptAr: string }>>({});

  const newsQuery = useQuery({
    queryKey: ['admin', 'news'],
    queryFn: async () => (await api.get<AdminNewsArticle[]>('/admin/news')).data,
  });

  const servicesQuery = useQuery({
    queryKey: ['admin', 'services'],
    queryFn: async () => (await api.get<AdminService[]>('/admin/services')).data,
  });

  const createNews = useMutation({
    mutationFn: async () => api.post('/admin/news', { ...form, isPublished: form.isPublished === 'true' }),
    onSuccess: async () => {
      setFeedback('Article saved as a draft. Publish it when the content is approved.');
      setForm({ ...emptyArticle });
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'news'] });
      await queryClient.invalidateQueries({ queryKey: ['news'] });
    },
    onError: (error) => setFeedback(error instanceof ApiError ? error.message : 'Could not save the article.'),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      api.patch(`/admin/news/${id}`, { isPublished }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'news'] });
      await queryClient.invalidateQueries({ queryKey: ['news'] });
    },
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
    <AdminPage title="Content" description="Manage news articles and the public service catalogue.">
      <div className="flex gap-2">
        {(['news', 'services'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-lg px-4 py-2 text-[0.82rem] font-bold capitalize transition-colors ${
              tab === value ? 'bg-brand-600 text-white' : 'bg-white text-steel-600 hover:bg-steel-100'
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {feedback ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800" role="status">{feedback}</div>
      ) : null}

      {tab === 'news' ? (
        <>
          <div className="flex justify-end">
            <Button variant="onlight" onClick={() => setShowForm((open) => !open)} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
              New article
            </Button>
          </div>

          {showForm ? (
            <Panel title="New article">
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <AdminField label="Slug *">
                  <Input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') })} dir="ltr" placeholder="egypt-customs-aci-guide" />
                </AdminField>
                <AdminField label="Category">
                  <Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                    {['Insights', 'Customs', 'Shipping', 'Company news'].map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </Select>
                </AdminField>
                <AdminField label="Title (English) *">
                  <Input value={form.titleEn} onChange={(event) => setForm({ ...form, titleEn: event.target.value })} />
                </AdminField>
                <AdminField label="Title (Arabic) *">
                  <Input value={form.titleAr} onChange={(event) => setForm({ ...form, titleAr: event.target.value })} dir="rtl" />
                </AdminField>
                <AdminField label="Excerpt (English) *">
                  <Textarea rows={2} value={form.excerptEn} onChange={(event) => setForm({ ...form, excerptEn: event.target.value })} />
                </AdminField>
                <AdminField label="Excerpt (Arabic) *">
                  <Textarea rows={2} value={form.excerptAr} onChange={(event) => setForm({ ...form, excerptAr: event.target.value })} dir="rtl" />
                </AdminField>
                <AdminField label="Body (English) *">
                  <Textarea rows={6} value={form.bodyEn} onChange={(event) => setForm({ ...form, bodyEn: event.target.value })} />
                </AdminField>
                <AdminField label="Body (Arabic) *">
                  <Textarea rows={6} value={form.bodyAr} onChange={(event) => setForm({ ...form, bodyAr: event.target.value })} dir="rtl" />
                </AdminField>
                <AdminField label="Publish now">
                  <Select value={form.isPublished} onChange={(event) => setForm({ ...form, isPublished: event.target.value })}>
                    <option value="false">Save as draft</option>
                    <option value="true">Publish immediately</option>
                  </Select>
                </AdminField>
              </div>
              <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4">
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button
                  onClick={() => createNews.mutate()}
                  disabled={createNews.isPending || !form.slug || !form.titleEn || !form.titleAr || !form.bodyEn || !form.bodyAr}
                >
                  {createNews.isPending ? 'Saving…' : 'Save article'}
                </Button>
              </div>
            </Panel>
          ) : null}

          <Panel title="Articles">
            {newsQuery.isLoading ? (
              <div className="p-6"><Spinner label="Loading articles…" /></div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Title</Th>
                    <Th>Category</Th>
                    <Th>Updated</Th>
                    <Th>Status</Th>
                    <Th><span className="sr-only">Publish</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {!newsQuery.data?.length ? (
                    <EmptyRow colSpan={5} message="No articles yet. Create the first draft." />
                  ) : (
                    newsQuery.data.map((article) => (
                      <tr key={article.id} className="hover:bg-steel-50/60">
                        <Td>
                          <span className="font-semibold text-navy-800">{article.titleEn}</span>
                          <span className="block font-mono text-[0.7rem] text-steel-400">/{article.slug}</span>
                        </Td>
                        <Td>{article.category}</Td>
                        <Td className="whitespace-nowrap text-[0.75rem]">{formatDateTime(article.publishedAt ?? article.createdAt, 'en')}</Td>
                        <Td>
                          <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase ${article.isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-steel-100 text-steel-500'}`}>
                            {article.isPublished ? 'Published' : 'Draft'}
                          </span>
                        </Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => togglePublish.mutate({ id: article.id, isPublished: !article.isPublished })}
                            className="text-[0.75rem] font-bold text-brand-700 hover:underline"
                          >
                            {article.isPublished ? 'Unpublish' : 'Publish'}
                          </button>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            )}
          </Panel>
        </>
      ) : (
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
      )}
    </AdminPage>
  );
}
