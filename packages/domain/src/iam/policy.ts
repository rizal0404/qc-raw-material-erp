import type { Role } from '@qc/contracts';
import type { AuthPrincipal } from './types';

export function hasRole(principal: AuthPrincipal, allowedRoles: readonly Role[]): boolean {
  return allowedRoles.includes(principal.role);
}

export function canAccessVendor(principal: AuthPrincipal, vendorId: string): boolean {
  if (principal.role === 'SUPERVISOR_ADMIN' || principal.role === 'QC_ANALYST') return true;
  if (principal.role === 'VENDOR') return principal.vendorId === vendorId;
  return false;
}

export function canAccessCrusher(principal: AuthPrincipal, crusherId: string): boolean {
  if (principal.role === 'SUPERVISOR_ADMIN' || principal.role === 'QC_ANALYST') return true;
  if (principal.role === 'CRUSHER_OPERATOR') return principal.crusherIds.includes(crusherId);
  return false;
}
