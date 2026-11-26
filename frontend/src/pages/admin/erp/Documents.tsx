import { useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, Pencil, RotateCcw, Upload, X } from 'lucide-react';
import { API_BASE, api, ApiError } from '../../../lib/api';
import { AdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Field';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDateTime } from '../../../lib/utils';

const categories = ['COMMERCIAL_INVOICE', 'PACKING_LIST', 'BILL_OF_LADING', 'AIR_WAYBILL', 'CERTIFICATE_OF_ORIGIN', 'ACI_RECEIPT', 'CUSTOMS_DECLARATION', 'DUTY_PAYMENT', 'INSPECTION_REPORT', 'INSURANCE', 'OTHER'] as const;
const relatedTypes = ['SHIPMENT', 'DECLARATION', 'QUOTE'] as const;
const pageSize = 25;

type DocumentCategory = typeof categories[number];
type DocumentRelatedType = typeof relatedTypes[number];

interface DocumentRow {
  id: string;
  category: DocumentCategory;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'ACTIVE' | 'ARCHIVED';
  archivedAt: string | null;
  createdAt: string;
  shipments: Array<{ shipmentId: string }>;
  declarations: Array<{ declarationId: string }>;
  quotes: Array<{ quoteId: string }>;
}

interface DocumentLink {
  relatedType: DocumentRelatedType;
  relatedId: string;
}

interface DocumentForm extends DocumentLink {
  category: DocumentCategory;
  fileName: string;
}

interface DocumentPayload {
  category: DocumentCategory;
  fileName: string;
  relatedType?: DocumentRelatedType;
  relatedId?: string;
}

interface DocumentFilters {
  category: DocumentCategory | '';
  relatedType: DocumentRelatedType | '';
  relatedId: string;
  status: 'ACTIVE' | 'ARCHIVED' | '';
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

function documentLink(document: DocumentRow): DocumentLink | null {
  const shipmentId = document.shipments[0]?.shipmentId;
  if (shipmentId) return { relatedType: 'SHIPMENT', relatedId: shipmentId };
  const declarationId = document.declarations[0]?.declarationId;
  if (declarationId) return { relatedType: 'DECLARATION', relatedId: declarationId };
  const quoteId = document.quotes[0]?.quoteId;
  return quoteId ? { relatedType: 'QUOTE', relatedId: quoteId } : null;
}

function documentToForm(document: DocumentRow): DocumentForm {
  const link = documentLink(document);
  return {
    category: document.category,
    fileName: document.fileName,
    relatedType: link?.relatedType ?? 'SHIPMENT',
    relatedId: link?.relatedId ?? '',
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function DocumentEditor({ initial, pending, onCancel, onSubmit }: {
  initial: DocumentRow;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: DocumentPayload) => void;
}) {
  const [form, setForm] = useState<DocumentForm>(() => documentToForm(initial));
  const [formError, setFormError] = useState<string | null>(null);
  const original = documentLink(initial);
  const relationChanged = form.relatedType !== (original?.relatedType ?? 'SHIPMENT') || form.relatedId.trim() !== (original?.relatedId ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.fileName.trim()) {
      setFormError('File name is required.');
      return;
    }
    if (relationChanged && !form.relatedId.trim()) {
      setFormError('A related record ID is required when changing the entity link.');
      return;
    }
    setFormError(null);
    const body: DocumentPayload = { category: form.category, fileName: form.fileName.trim() };
    if (relationChanged) {
      body.relatedType = form.relatedType;
      body.relatedId = form.relatedId.trim();
    }
    onSubmit(body);
  };

  return (
    <form onSubmit={submit}>
      {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminField label="File name *"><Input required maxLength={255} value={form.fileName} onChange={(event) => setForm({ ...form, fileName: event.target.value })} /></AdminField>
        <AdminField label="Category"><Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as DocumentCategory })}>{categories.map((category) => <option key={category} value={category}>{category.replace(/_/g, ' ')}</option>)}</Select></AdminField>
        <AdminField label="Related record type"><Select value={form.relatedType} onChange={(event) => setForm({ ...form, relatedType: event.target.value as DocumentRelatedType })}>{relatedTypes.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}</Select></AdminField>
        <AdminField label="Related record ID *"><Input required={relationChanged} value={form.relatedId} onChange={(event) => setForm({ ...form, relatedId: event.target.value })} placeholder="UUID" dir="ltr" /></AdminField>
      </div>
      <p className="border-t border-steel-200 px-5 py-3 text-xs text-steel-500">Corrections do not replace the stored file or change its checksum, storage reference or audit history.</p>
      <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4">
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save corrections'}</Button>
      </div>
    </form>
  );
}

export default function Documents() {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [uploadRelatedType, setUploadRelatedType] = useState<DocumentRelatedType>('SHIPMENT');
  const [uploadRelatedId, setUploadRelatedId] = useState('');
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('OTHER');
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<DocumentRow | null>(null);
  const [filters, setFilters] = useState<DocumentFilters>({ category: '', relatedType: '', relatedId: '', status: '' });
  const [relatedIdInput, setRelatedIdInput] = useState('');
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const query = useQuery({
    queryKey: ['erp', 'documents', 'list', filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (filters.category) params.set('category', filters.category);
      if (filters.relatedType) params.set('relatedType', filters.relatedType);
      if (filters.relatedId) params.set('relatedId', filters.relatedId);
      if (filters.status) params.set('status', filters.status);
      const response = await api.get<DocumentRow[]>(`/erp/documents?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });
  const meta = query.data?.meta;

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('file', file as File);
      form.append('category', uploadCategory);
      form.append('relatedType', uploadRelatedType);
      form.append('relatedId', uploadRelatedId);
      return api.postForm('/erp/documents', form);
    },
    onSuccess: async () => {
      setFeedback({ kind: 'success', text: 'Document uploaded.' });
      setFile(null);
      setUploadRelatedId('');
      setShowUpload(false);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'documents'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: errorMessage(error, 'Upload failed.') }),
  });

  const correct = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DocumentPayload }) => api.patch<DocumentRow>(`/erp/documents/${id}`, body),
    onSuccess: async () => {
      setFeedback({ kind: 'success', text: 'Document metadata and link corrected. The stored file was not changed.' });
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'documents'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: errorMessage(error, 'Could not correct the document.') }),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.patch(`/erp/documents/${id}/archive`, {}),
    onSuccess: async () => {
      setFeedback({ kind: 'success', text: 'Document archived. Its file, checksum and audit history were retained.' });
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'documents'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: errorMessage(error, 'Could not archive the document.') }),
  });

  const restore = useMutation({
    mutationFn: (id: string) => api.patch(`/erp/documents/${id}/restore`, {}),
    onSuccess: async () => {
      setFeedback({ kind: 'success', text: 'Document restored. Its file, checksum and archive audit history were retained.' });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'documents'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: errorMessage(error, 'Could not restore the document.') }),
  });

  const mutationPending = upload.isPending || correct.isPending || archive.isPending || restore.isPending;

  const updateFilters = (patch: Partial<DocumentFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
    setEditing(null);
  };

  const submitRelatedFilter = (event: FormEvent) => {
    event.preventDefault();
    updateFilters({ relatedId: relatedIdInput.trim() });
  };

  const clearFilters = () => {
    setRelatedIdInput('');
    updateFilters({ category: '', relatedType: '', relatedId: '', status: '' });
  };

  const changePage = (nextPage: number) => setPage(nextPage);

  const download = async (document: DocumentRow) => {
    try {
      const response = await fetch(`${API_BASE}/erp/documents/${document.id}/download`, { credentials: 'include' });
      if (!response.ok) {
        setFeedback({ kind: 'error', text: 'Document download failed.' });
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = document.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setFeedback({ kind: 'error', text: 'Document download failed.' });
    }
  };

  return (
    <AdminPage title="Document vault" description="Commercial, transport, ACI and customs evidence linked to operational records." actions={<Button variant="onlight" disabled={mutationPending} onClick={() => { setShowUpload((value) => !value); setEditing(null); setFeedback(null); }} icon={<Upload className="h-4 w-4" />}>{showUpload ? 'Close form' : 'Upload document'}</Button>}>
      {feedback ? <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${feedback.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-brand-200 bg-brand-50 text-brand-800'}`}>{feedback.text}</div> : null}
      {showUpload ? (
        <Panel title="Upload document">
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <AdminField label="Related record type"><Select value={uploadRelatedType} onChange={(event) => setUploadRelatedType(event.target.value as DocumentRelatedType)}>{relatedTypes.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}</Select></AdminField>
            <AdminField label="Record ID *"><Input value={uploadRelatedId} onChange={(event) => setUploadRelatedId(event.target.value)} placeholder="UUID" dir="ltr" /></AdminField>
            <AdminField label="Category"><Select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value as DocumentCategory)}>{categories.map((category) => <option key={category} value={category}>{category.replace(/_/g, ' ')}</option>)}</Select></AdminField>
            <AdminField label="File *"><Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></AdminField>
          </div>
          <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4"><Button type="button" variant="ghost" disabled={upload.isPending} onClick={() => setShowUpload(false)}>Cancel</Button><Button type="button" disabled={upload.isPending || !file || !uploadRelatedId} onClick={() => upload.mutate()}>{upload.isPending ? 'Uploading…' : 'Upload'}</Button></div>
        </Panel>
      ) : null}

      {editing ? (
        <Panel title={`Correct ${editing.fileName}`} actions={<Button variant="ghost" size="sm" icon={<X className="h-4 w-4" />} disabled={correct.isPending} onClick={() => setEditing(null)}>Close</Button>}>
          <DocumentEditor key={editing.id} initial={editing} pending={correct.isPending} onCancel={() => setEditing(null)} onSubmit={(body) => correct.mutate({ id: editing.id, body })} />
        </Panel>
      ) : null}

      <Panel>
        <form role="search" onSubmit={submitRelatedFilter} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-[13rem_13rem_11rem_minmax(14rem,1fr)_auto]">
          <AdminField label="Category"><Select value={filters.category} onChange={(event) => updateFilters({ category: event.target.value as DocumentCategory | '' })}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{category.replace(/_/g, ' ')}</option>)}</Select></AdminField>
          <AdminField label="Related type"><Select value={filters.relatedType} onChange={(event) => updateFilters({ relatedType: event.target.value as DocumentRelatedType | '' })}><option value="">All types</option>{relatedTypes.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}</Select></AdminField>
          <AdminField label="Status"><Select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value as 'ACTIVE' | 'ARCHIVED' | '' })}><option value="">All statuses</option><option value="ACTIVE">ACTIVE</option><option value="ARCHIVED">ARCHIVED</option></Select></AdminField>
          <AdminField label="Related record ID"><Input value={relatedIdInput} onChange={(event) => setRelatedIdInput(event.target.value)} placeholder="UUID" dir="ltr" /></AdminField>
          <div className="flex items-end gap-2"><Button type="submit" variant="secondary">Filter</Button><Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button></div>
        </form>
        <div className="flex items-center justify-between gap-3 border-b border-steel-100 px-4 py-2 text-xs text-steel-500"><span aria-live="polite">{meta ? `${meta.total} document${meta.total === 1 ? '' : 's'}` : 'Documents'}</span>{query.isFetching && !query.isLoading ? <Spinner label="Refreshing…" /> : null}</div>
        {query.isLoading ? <div className="p-8"><Spinner label="Loading documents…" /></div> : query.isError ? (
          <div className="space-y-3 p-6" role="alert"><p className="text-sm font-semibold text-red-700">Documents could not be loaded.</p><p className="text-sm text-steel-500">{errorMessage(query.error, 'Please try again.')}</p><Button variant="onlight" size="sm" onClick={() => void query.refetch()}>Retry</Button></div>
        ) : (
          <Table><thead><tr><Th>Document</Th><Th>Category</Th><Th>Linked record</Th><Th>Uploaded</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>
            {!query.data?.rows.length ? <EmptyRow colSpan={6} message="No documents match these filters." /> : query.data.rows.map((document) => {
              const linked = documentLink(document);
              return <tr key={document.id}>
                <Td className="font-semibold text-navy-800">{document.fileName}<span className="block text-[0.7rem] font-normal text-steel-400">{Math.ceil(document.sizeBytes / 1024)} KB</span></Td>
                <Td>{document.category.replace(/_/g, ' ')}</Td>
                <Td>{linked ? <>{linked.relatedType}<span className="block break-all font-mono text-[0.65rem] text-steel-400">{linked.relatedId}</span></> : '—'}</Td>
                <Td>{formatDateTime(document.createdAt, 'en')}</Td>
                <Td><StatusPill status={document.status} label={document.status} />{document.archivedAt ? <span className="mt-1 block text-[0.65rem] text-steel-400">Archived {formatDateTime(document.archivedAt, 'en')}</span> : null}</Td>
                <Td><div className="flex flex-wrap gap-2">
                  {document.status === 'ACTIVE' ? <button type="button" onClick={() => void download(document)} className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline"><Download className="h-3.5 w-3.5" />Download</button> : null}
                  <Button type="button" variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} disabled={mutationPending} onClick={() => { setEditing(document); setShowUpload(false); setFeedback(null); }}>Correct</Button>
                  {document.status === 'ACTIVE' ? <Button type="button" variant="ghost" size="sm" icon={<Archive className="h-4 w-4" />} disabled={mutationPending} onClick={() => { if (window.confirm(`Archive ${document.fileName}? The file will no longer be downloadable.`)) archive.mutate(document.id); }}>Archive</Button> : <Button type="button" variant="onlight" size="sm" icon={<RotateCcw className="h-4 w-4" />} disabled={mutationPending} onClick={() => restore.mutate(document.id)}>Restore</Button>}
                </div></Td>
              </tr>;
            })}
          </tbody></Table>
        )}
      </Panel>

      {meta ? (
        <nav aria-label="Document pagination" className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-steel-500">Page {meta.page} of {meta.pages}</span>
          <div className="flex gap-2"><Button variant="onlight" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => changePage(page - 1)}>Previous</Button><Button variant="onlight" size="sm" disabled={page >= meta.pages || query.isFetching} onClick={() => changePage(page + 1)}>Next</Button></div>
        </nav>
      ) : null}
    </AdminPage>
  );
}
