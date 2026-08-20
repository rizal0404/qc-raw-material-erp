import { queryOptions } from '@tanstack/react-query';
import type { Crusher, Equipment, EquipmentLookupResponse, MasterLookupResponse, Pile, Plant, Source, Vendor } from '@qc/contracts';
import { apiFetch } from '../../lib/api-client';

export type MasterEntity = 'vendors' | 'plants' | 'crushers' | 'equipment' | 'sources' | 'piles';
export type MasterEntityItem = Vendor | Plant | Crusher | Equipment | Source | Pile;
export interface ListResponse<T> { ok: true; items: T[]; total: number }
export interface MutationResponse<T> { ok: true; item: T }

export const masterKeys = {
  all: ['master'] as const,
  list: (entity: MasterEntity, filters: string) => ['master', entity, filters] as const,
  lookups: ['master', 'lookups'] as const,
  equipmentLookup: (vendorId?: string, type?: string) => ['master', 'lookups', 'equipment', vendorId ?? '', type ?? ''] as const,
};

export function masterLookupQueryOptions() {
  return queryOptions({ queryKey: masterKeys.lookups, queryFn: () => apiFetch<MasterLookupResponse>('/lookups/master'), staleTime: 5 * 60_000 });
}
export function equipmentLookupQueryOptions(vendorId?: string, type?: 'AM' | 'AA') {
  const params = new URLSearchParams();
  if (vendorId) params.set('vendorId', vendorId);
  if (type) params.set('type', type);
  const suffix = params.toString();
  return queryOptions({ queryKey: masterKeys.equipmentLookup(vendorId, type), queryFn: () => apiFetch<EquipmentLookupResponse>(`/lookups/equipment${suffix ? `?${suffix}` : ''}`), staleTime: 60_000 });
}

export async function listMaster<T>(entity: MasterEntity, params: URLSearchParams): Promise<ListResponse<T>> {
  return apiFetch<ListResponse<T>>(`/${entity}?${params.toString()}`);
}
export async function createMaster<T>(entity: MasterEntity, payload: unknown): Promise<MutationResponse<T>> {
  return apiFetch<MutationResponse<T>>(`/${entity}`, { method: 'POST', body: JSON.stringify(payload) });
}
export async function updateMaster<T>(entity: MasterEntity, id: string, payload: unknown): Promise<MutationResponse<T>> {
  return apiFetch<MutationResponse<T>>(`/${entity}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
