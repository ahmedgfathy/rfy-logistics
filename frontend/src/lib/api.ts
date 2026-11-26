export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface FieldErrors {
  error?: { code?: string; message?: string; details?: Record<string, string[]> };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network unavailable. Please check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const body = (payload ?? {}) as FieldErrors;
    throw new ApiError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? 'Something went wrong. Please try again.',
      body.error?.details,
    );
  }

  return payload as T;
}

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export const api = {
  get: <T>(path: string) => request<Envelope<T>>(path),
  post: <T>(path: string, body?: unknown, headers?: HeadersInit) =>
    request<Envelope<T>>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers }),
  postForm: <T>(path: string, form: FormData, headers?: HeadersInit) =>
    request<Envelope<T>>(path, { method: 'POST', body: form, headers }),
  patch: <T>(path: string, body: unknown, headers?: HeadersInit) =>
    request<Envelope<T>>(path, { method: 'PATCH', body: JSON.stringify(body), headers }),
  delete: <T>(path: string, headers?: HeadersInit) => request<Envelope<T>>(path, { method: 'DELETE', headers }),
};
