import { createContext, useContext } from 'react';
import type { MaterialKind } from '@qc/contracts';
import { useQuery } from '@tanstack/react-query';
import { masterLookupsFor } from '../qc/qc-api';
import { materialNames } from './workflow';

export const MaterialContext = createContext<MaterialKind>('LS');
export const useMaterial = () => useContext(MaterialContext);
export function useMaterialLookups() {
  const kind = useMaterial();
  return useQuery({ queryKey: ['lookups', 'master', kind], queryFn: () => masterLookupsFor(kind), staleTime: 300_000 });
}
export function MaterialBadge() {
  const kind = useMaterial();
  return <span className={`material-badge material-${kind.toLowerCase()}`}><span aria-hidden="true" />{materialNames[kind]}</span>;
}
