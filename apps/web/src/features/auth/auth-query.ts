import { queryOptions } from '@tanstack/react-query';
import type { AuthSessionResponse } from '@qc/contracts';
import { apiFetch } from '../../lib/api-client';

export const authQueryKey = ['auth', 'me'] as const;

export const authQueryOptions = queryOptions({
  queryKey: authQueryKey,
  queryFn: () => apiFetch<AuthSessionResponse>('/auth/session'),
  staleTime: 60_000,
  retry: false,
});
