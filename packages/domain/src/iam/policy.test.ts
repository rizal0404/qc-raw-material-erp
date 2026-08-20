import { describe, expect, it } from 'vitest';
import type { AuthPrincipal } from './types';
import { canAccessCrusher, canAccessVendor } from './policy';

const base: AuthPrincipal = {
  sessionId: 's', userId: 'u', username: 'user', displayName: 'User', role: 'VENDOR', vendorId: 'vendor-a', status: 'ACTIVE', crusherIds: [], lastLoginAt: null, sessionExpiresAt: new Date(), sessionLastSeenAt: new Date(),
};

describe('IAM scope policy', () => {
  it('isolates vendor to its own vendor id', () => {
    expect(canAccessVendor(base, 'vendor-a')).toBe(true);
    expect(canAccessVendor(base, 'vendor-b')).toBe(false);
  });

  it('limits crusher operator to assigned crushers', () => {
    const operator = { ...base, role: 'CRUSHER_OPERATOR' as const, vendorId: null, crusherIds: ['crusher-1'] };
    expect(canAccessCrusher(operator, 'crusher-1')).toBe(true);
    expect(canAccessCrusher(operator, 'crusher-2')).toBe(false);
  });
});
