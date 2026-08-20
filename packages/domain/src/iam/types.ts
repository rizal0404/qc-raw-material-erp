import type { Role } from '@qc/contracts';

export type UserStatus = 'ACTIVE' | 'DEACTIVATED';

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  vendorId: string | null;
  status: UserStatus;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface AuthPrincipal {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
  role: Role;
  vendorId: string | null;
  status: UserStatus;
  crusherIds: string[];
  lastLoginAt: Date | null;
  sessionExpiresAt: Date;
  sessionLastSeenAt: Date;
}

export interface UserAdminView {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  vendorId: string | null;
  status: UserStatus;
  crusherIds: string[];
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
