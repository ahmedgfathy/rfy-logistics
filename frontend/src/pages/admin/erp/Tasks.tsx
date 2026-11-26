import { useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Plus, X } from 'lucide-react';
import { api, ApiError } from '../../../lib/api';
import { AdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Field';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDateTime } from '../../../lib/utils';

type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  relatedType: string;
  relatedId: string;
  assignedTo: { id: string; name: string; email: string } | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface TaskFilters {
  status: TaskStatus | '';
  relatedType: string;
  relatedId: string;
  assignedToId: string;
}

interface TaskForm {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  relatedType: string;
  relatedId: string;
  assignedToId: string;
  status: TaskStatus;
}

interface TaskPayload {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  relatedType: string;
  relatedId: string;
  assignedToId: string | null;
}

type TaskUpdatePayload = Partial<TaskPayload> & { status?: TaskStatus };

const relatedTypes = ['SHIPMENT', 'CUSTOMS_FILE', 'QUOTE', 'BOOKING', 'INVOICE', 'BILL'];
const statuses: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'];
const priorities: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const pageSize = 25;

function emptyTask(): TaskForm {
  return { title: '', description: '', priority: 'MEDIUM', dueDate: '', relatedType: 'SHIPMENT', relatedId: '', assignedToId: '', status: 'OPEN' };
}

function taskToForm(task: TaskRow): TaskForm {
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '',
    relatedType: task.relatedType,
    relatedId: task.relatedId,
    assignedToId: task.assignedTo?.id ?? '',
    status: task.status,
  };
}

function taskPayload(form: TaskForm): TaskPayload {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    priority: form.priority,
    dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
    relatedType: form.relatedType,
    relatedId: form.relatedId.trim(),
    assignedToId: form.assignedToId || null,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function TaskEditor({ initial, users, usersLoading, usersUnavailable, pending, submitLabel, onCancel, onSubmit }: {
  initial?: TaskRow;
  users: UserOption[];
  usersLoading: boolean;
  usersUnavailable: boolean;
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (body: TaskUpdatePayload) => void;
}) {
  const [form, setForm] = useState<TaskForm>(() => initial ? taskToForm(initial) : emptyTask());
  const [formError, setFormError] = useState<string | null>(null);
  const currentAssigneeMissing = Boolean(!usersLoading && initial?.assignedTo && !users.some((user) => user.id === initial.assignedTo?.id));
  const assigneeOptions = currentAssigneeMissing && initial?.assignedTo
    ? [...users, { id: initial.assignedTo.id, name: initial.assignedTo.name, email: initial.assignedTo.email }]
    : users;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.relatedId.trim()) {
      setFormError('Title and related record ID are required.');
      return;
    }
    setFormError(null);
    const { assignedToId, ...fields } = taskPayload(form);
    const body: TaskUpdatePayload = fields;
    if (!initial || assignedToId !== (initial.assignedTo?.id ?? null)) body.assignedToId = assignedToId;
    if (initial) body.status = form.status;
    onSubmit(body);
  };

  return (
    <form onSubmit={submit}>
      {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
      {usersUnavailable ? <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">Active users could not be loaded. You can keep the current assignment or leave this task unassigned.</p> : null}
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <AdminField label="Title *"><Input required maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></AdminField>
        <AdminField label="Related type"><Select value={form.relatedType} onChange={(event) => setForm({ ...form, relatedType: event.target.value })}>{relatedTypes.map((type) => <option key={type}>{type}</option>)}</Select></AdminField>
        <AdminField label="Related record ID *"><Input required value={form.relatedId} onChange={(event) => setForm({ ...form, relatedId: event.target.value })} dir="ltr" /></AdminField>
        <AdminField label="Priority"><Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</Select></AdminField>
        <AdminField label="Due date"><Input type="datetime-local" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></AdminField>
        <AdminField label="Assigned to">
          <Select value={form.assignedToId} disabled={usersLoading} onChange={(event) => setForm({ ...form, assignedToId: event.target.value })}>
            <option value="">{usersLoading ? 'Loading active users…' : 'Unassigned'}</option>
            {assigneeOptions.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email}){currentAssigneeMissing && user.id === initial?.assignedTo?.id ? ' — inactive or unavailable' : ''}</option>)}
          </Select>
        </AdminField>
        {initial ? <AdminField label="Status"><Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</Select></AdminField> : null}
        <AdminField label="Description" className="sm:col-span-2 lg:col-span-3"><Textarea rows={3} maxLength={4000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></AdminField>
      </div>
      <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4">
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  );
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilters>({ status: '', relatedType: '', relatedId: '', assignedToId: '' });
  const [relatedIdInput, setRelatedIdInput] = useState('');
  const [page, setPage] = useState(1);
  const usersQuery = useQuery({
    queryKey: ['erp', 'tasks', 'assignees'],
    queryFn: async () => (await api.get<UserOption[]>('/erp/tasks/assignees')).data,
    staleTime: 30000,
  });
  const query = useQuery({
    queryKey: ['erp', 'tasks', 'list', filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (filters.status) params.set('status', filters.status);
      if (filters.relatedType) params.set('relatedType', filters.relatedType);
      if (filters.relatedId) params.set('relatedId', filters.relatedId);
      if (filters.assignedToId) params.set('assignedToId', filters.assignedToId);
      const response = await api.get<TaskRow[]>(`/erp/tasks?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });
  const selected = query.data?.rows.find((task) => task.id === selectedId);
  const meta = query.data?.meta;

  const create = useMutation({
    mutationFn: (body: TaskPayload) => api.post('/erp/tasks', body),
    onSuccess: async () => {
      setFeedback('Task created.');
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'tasks'] });
    },
    onError: (error) => setFeedback(errorMessage(error, 'Could not create task.')),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TaskUpdatePayload }) => api.patch(`/erp/tasks/${id}`, body),
    onSuccess: async () => {
      setFeedback('Task updated.');
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'tasks'] });
    },
    onError: (error) => setFeedback(errorMessage(error, 'Could not update task.')),
  });

  const closeSelection = () => {
    setSelectedId(null);
    setEditing(false);
  };

  const updateFilters = (patch: Partial<TaskFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
    closeSelection();
  };

  const openTask = (id: string) => {
    setSelectedId(id);
    setEditing(false);
    setFeedback(null);
  };

  const submitRelatedFilter = (event: FormEvent) => {
    event.preventDefault();
    updateFilters({ relatedId: relatedIdInput.trim() });
  };

  const clearFilters = () => {
    setRelatedIdInput('');
    updateFilters({ status: '', relatedType: '', relatedId: '', assignedToId: '' });
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    closeSelection();
  };

  const editorProps = {
    users: usersQuery.data ?? [],
    usersLoading: usersQuery.isLoading,
    usersUnavailable: usersQuery.isError,
  };

  return (
    <AdminPage title="Tasks" description="Create, assign, view, edit and cancel follow-ups across shipments, customs files, quotations and finance." actions={<Button variant="onlight" disabled={create.isPending || update.isPending} onClick={() => { setShowCreate((value) => !value); setFeedback(null); }} icon={<Plus className="h-4 w-4" />}>{showCreate ? 'Close form' : 'New task'}</Button>}>
      {feedback ? <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800" role="status">{feedback}</div> : null}
      {showCreate ? <Panel title="Create task"><TaskEditor {...editorProps} pending={create.isPending} submitLabel="Create task" onCancel={() => setShowCreate(false)} onSubmit={(body) => create.mutate(body as TaskPayload)} /></Panel> : null}
      <Panel>
        <form role="search" onSubmit={submitRelatedFilter} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-[10rem_12rem_14rem_minmax(14rem,1fr)_auto]">
          <AdminField label="Status">
            <Select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value as TaskStatus | '' })}>
              <option value="">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
          </AdminField>
          <AdminField label="Related type">
            <Select value={filters.relatedType} onChange={(event) => updateFilters({ relatedType: event.target.value })}>
              <option value="">All types</option>
              {relatedTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
          </AdminField>
          <AdminField label="Assigned to">
            <Select value={filters.assignedToId} disabled={usersQuery.isLoading} onChange={(event) => updateFilters({ assignedToId: event.target.value })}>
              <option value="">{usersQuery.isLoading ? 'Loading users…' : 'Anyone'}</option>
              {(usersQuery.data ?? []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select>
          </AdminField>
          <AdminField label="Related record ID"><Input value={relatedIdInput} onChange={(event) => setRelatedIdInput(event.target.value)} placeholder="UUID" dir="ltr" /></AdminField>
          <div className="flex items-end gap-2"><Button type="submit" variant="secondary">Filter</Button><Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button></div>
        </form>
        <div className="flex items-center justify-between gap-3 border-b border-steel-100 px-4 py-2 text-xs text-steel-500">
          <span aria-live="polite">{meta ? `${meta.total} task${meta.total === 1 ? '' : 's'}` : 'Tasks'}</span>
          {query.isFetching && !query.isLoading ? <Spinner label="Refreshing…" /> : null}
        </div>
        {query.isLoading ? <div className="p-8"><Spinner label="Loading tasks…" /></div> : query.isError ? (
          <div className="space-y-3 p-6" role="alert"><p className="text-sm font-semibold text-red-700">Tasks could not be loaded.</p><p className="text-sm text-steel-500">{errorMessage(query.error, 'Please try again.')}</p><Button variant="onlight" size="sm" onClick={() => void query.refetch()}>Retry</Button></div>
        ) : (
          <Table><thead><tr><Th>Task</Th><Th>Related</Th><Th>Priority</Th><Th>Due</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>
            {!query.data?.rows.length ? <EmptyRow colSpan={6} message="No tasks match these filters." /> : query.data.rows.map((task) => <tr key={task.id} className="hover:bg-steel-50/60">
              <Td><span className="font-semibold text-navy-800">{task.title}</span>{task.description ? <span className="mt-1 block text-xs text-steel-500">{task.description}</span> : null}{task.assignedTo ? <span className="mt-1 block text-[0.7rem] text-steel-400">Assigned to {task.assignedTo.name}</span> : null}</Td>
              <Td>{task.relatedType}<span className="block font-mono text-[0.65rem] text-steel-400">{task.relatedId}</span></Td>
              <Td><StatusPill status={task.priority} label={task.priority} /></Td>
              <Td>{task.dueDate ? formatDateTime(task.dueDate, 'en') : '—'}</Td>
              <Td><Select aria-label={`Status for ${task.title}`} value={task.status} disabled={update.isPending} onChange={(event) => update.mutate({ id: task.id, body: { status: event.target.value as TaskStatus } })}>{statuses.map((status) => <option key={status}>{status}</option>)}</Select></Td>
              <Td><div className="flex flex-wrap gap-2"><Button type="button" variant="onlight" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => openTask(task.id)}>View</Button><Button type="button" variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => { openTask(task.id); setEditing(true); }}>Edit</Button></div></Td>
            </tr>)}
          </tbody></Table>
        )}
      </Panel>

      {meta ? (
        <nav aria-label="Task pagination" className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-steel-500">Page {meta.page} of {meta.pages}</span>
          <div className="flex gap-2"><Button variant="onlight" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => changePage(page - 1)}>Previous</Button><Button variant="onlight" size="sm" disabled={page >= meta.pages || query.isFetching} onClick={() => changePage(page + 1)}>Next</Button></div>
        </nav>
      ) : null}

      {selected ? (
        <Panel title={selected.title} actions={<Button variant="ghost" size="sm" icon={<X className="h-4 w-4" />} onClick={closeSelection}>Close</Button>}>
          {editing ? <TaskEditor key={selected.id} {...editorProps} initial={selected} pending={update.isPending} submitLabel="Save task" onCancel={() => setEditing(false)} onSubmit={(body) => update.mutate({ id: selected.id, body })} /> : (
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2"><StatusPill status={selected.status} label={selected.status} /><StatusPill status={selected.priority} label={selected.priority} /><Button variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit task</Button></div>
              {selected.description ? <p className="whitespace-pre-line text-sm text-steel-600">{selected.description}</p> : null}
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-xs text-steel-400">Related type</dt><dd className="mt-1 font-semibold">{selected.relatedType}</dd></div>
                <div><dt className="text-xs text-steel-400">Related ID</dt><dd className="mt-1 break-all font-mono text-xs">{selected.relatedId}</dd></div>
                <div><dt className="text-xs text-steel-400">Due</dt><dd className="mt-1 font-semibold">{selected.dueDate ? formatDateTime(selected.dueDate, 'en') : '—'}</dd></div>
                <div><dt className="text-xs text-steel-400">Assigned to</dt><dd className="mt-1 font-semibold">{selected.assignedTo?.name ?? 'Unassigned'}{selected.assignedTo ? <span className="block text-xs font-normal text-steel-500">{selected.assignedTo.email}</span> : null}</dd></div>
              </dl>
            </div>
          )}
        </Panel>
      ) : null}
    </AdminPage>
  );
}
