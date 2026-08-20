import type { ApiError } from '@qc/contracts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const error = (data ?? {}) as Partial<ApiError>;
    const clientError = new ApiClientError(
      response.status,
      error.code ?? 'HTTP_ERROR',
      error.message ?? `HTTP ${response.status}`,
      error.requestId,
      error.details,
    );
    if (response.status === 401 && path !== '/auth/login' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qc:auth-expired'));
    }
    throw clientError;
  }
  return data as T;
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiClientError && ['AUTH_REQUIRED', 'AUTH_EXPIRED'].includes(error.code);
}
