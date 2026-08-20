import type { Role } from '@qc/contracts';
import type { AuthPrincipal, UserAdminView, UserRecord, UserStatus } from './types';

export interface CreateSessionInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  vendorId: string | null;
  crusherIds: string[];
}

export interface AuditInput {
  actorUserId?: string | undefined;
  actorRoleSnapshot?: string | undefined;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: unknown | undefined;
  afterJson?: unknown | undefined;
  reason?: string | undefined;
  requestId?: string | undefined;
}

export interface IamRepository {
  countUsers(): Promise<number>;
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findUserById(userId: string): Promise<UserRecord | null>;
  listUsers(): Promise<UserAdminView[]>;
  createUser(input: CreateUserInput): Promise<UserAdminView>;
  replaceUserCrusherScopes(userId: string, crusherIds: string[]): Promise<void>;
  updateUserAccess(userId: string, displayName: string, role: Role, vendorId: string | null, crusherIds: string[]): Promise<UserAdminView | null>;
  updateUserStatus(userId: string, status: UserStatus): Promise<UserAdminView | null>;
  updateUserPassword(userId: string, passwordHash: string): Promise<UserAdminView | null>;
  updateUserScopes(userId: string, vendorId: string | null, crusherIds: string[]): Promise<UserAdminView | null>;
  recordLoginFailure(userId: string, maxFailures: number, lockedUntil: Date): Promise<UserRecord | null>;
  recordLoginSuccess(userId: string, at: Date): Promise<UserRecord | null>;
  createSession(input: CreateSessionInput): Promise<{ id: string; expiresAt: Date }>;
  findPrincipalByTokenHash(tokenHash: string, now: Date): Promise<AuthPrincipal | null>;
  touchSession(sessionId: string, at: Date): Promise<void>;
  revokeSession(sessionId: string, at: Date): Promise<void>;
  revokeAllUserSessions(userId: string, at: Date, exceptSessionId?: string | undefined): Promise<void>;
  appendAudit(input: AuditInput): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export interface SessionTokenCodec {
  generate(): string;
  hash(rawToken: string): string;
}
