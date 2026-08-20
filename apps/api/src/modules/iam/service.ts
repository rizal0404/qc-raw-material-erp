import type { Role } from '@qc/contracts';
import type { AuthPrincipal, IamRepository, PasswordHasher, SessionTokenCodec, UserAdminView } from '@qc/domain';
import { AppError, conflict, notFound, unauthorized } from '../../lib/errors';

export interface AuthServiceOptions {
  repository: IamRepository;
  passwordHasher: PasswordHasher;
  tokenCodec: SessionTokenCodec;
  sessionTtlMs: number;
  maxLoginFailures: number;
  loginLockMs: number;
  sessionTouchIntervalMs: number;
}

export interface LoginInput {
  username: string;
  password: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
  requestId?: string | undefined;
}

export interface CreateManagedUserInput {
  username: string;
  displayName: string;
  password: string;
  role: Role;
  vendorId: string | null;
  crusherIds: string[];
  actor: AuthPrincipal;
  requestId?: string | undefined;
}

function canonicalUsername(value: string): string {
  return value.trim().toLowerCase();
}

function assertUserScope(role: Role, vendorId: string | null, crusherIds: string[]) {
  if (role === 'VENDOR' && !vendorId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'vendorId wajib untuk role VENDOR.');
  }
  if (role !== 'VENDOR' && vendorId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'vendorId hanya digunakan untuk role VENDOR pada MVP.');
  }
  if (role !== 'CRUSHER_OPERATOR' && crusherIds.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'crusherIds hanya digunakan untuk CRUSHER_OPERATOR pada MVP.');
  }
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function createAuthService(options: AuthServiceOptions) {
  const { repository, passwordHasher, tokenCodec } = options;

  return {
    async login(input: LoginInput) {
      const username = canonicalUsername(input.username);
      const user = await repository.findUserByUsername(username);
      const now = new Date();

      if (!user) {
        await repository.appendAudit({
          action: 'LOGIN_FAILED_UNKNOWN_USER',
          entityType: 'USER',
          entityId: username || 'unknown',
          reason: 'INVALID_CREDENTIALS',
          requestId: input.requestId,
        });
        throw unauthorized('INVALID_CREDENTIALS', 'Username atau password tidak valid.');
      }

      if (user.status !== 'ACTIVE') {
        await repository.appendAudit({
          actorUserId: user.id,
          actorRoleSnapshot: user.role,
          action: 'LOGIN_BLOCKED_DEACTIVATED',
          entityType: 'USER',
          entityId: user.id,
          requestId: input.requestId,
        });
        throw new AppError(403, 'USER_DEACTIVATED', 'Akun dinonaktifkan. Hubungi administrator.');
      }

      if (user.lockedUntil && user.lockedUntil > now) {
        throw new AppError(423, 'AUTH_LOCKED', 'Akun sementara dikunci akibat percobaan login gagal.', {
          lockedUntil: user.lockedUntil.toISOString(),
        });
      }

      let valid = false;
      try {
        valid = await passwordHasher.verify(user.passwordHash, input.password);
      } catch {
        valid = false;
      }

      if (!valid) {
        const lockedUntil = new Date(now.getTime() + options.loginLockMs);
        const updated = await repository.recordLoginFailure(user.id, options.maxLoginFailures, lockedUntil);
        await repository.appendAudit({
          actorUserId: user.id,
          actorRoleSnapshot: user.role,
          action: 'LOGIN_FAILED',
          entityType: 'USER',
          entityId: user.id,
          afterJson: { failedLoginCount: updated?.failedLoginCount ?? user.failedLoginCount + 1, lockedUntil: updated?.lockedUntil?.toISOString() ?? null },
          reason: 'INVALID_CREDENTIALS',
          requestId: input.requestId,
        });
        throw unauthorized('INVALID_CREDENTIALS', 'Username atau password tidak valid.');
      }

      const loggedInUser = await repository.recordLoginSuccess(user.id, now);
      if (!loggedInUser) throw new AppError(500, 'AUTH_USER_UPDATE_FAILED', 'Gagal memperbarui status login.');

      const rawToken = tokenCodec.generate();
      const expiresAt = new Date(now.getTime() + options.sessionTtlMs);
      const createdSession = await repository.createSession({
        userId: user.id,
        tokenHash: tokenCodec.hash(rawToken),
        expiresAt,
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      });
      const principal = await repository.findPrincipalByTokenHash(tokenCodec.hash(rawToken), now);
      if (!principal) throw new AppError(500, 'AUTH_SESSION_CREATE_FAILED', 'Sesi gagal dibuat.');

      await repository.appendAudit({
        actorUserId: user.id,
        actorRoleSnapshot: user.role,
        action: 'LOGIN_SUCCESS',
        entityType: 'SESSION',
        entityId: createdSession.id,
        requestId: input.requestId,
      });

      return { rawToken, principal };
    },

    async authenticate(rawToken: string | undefined): Promise<AuthPrincipal> {
      if (!rawToken) throw unauthorized();
      const principal = await repository.findPrincipalByTokenHash(tokenCodec.hash(rawToken), new Date());
      if (!principal) throw unauthorized('AUTH_EXPIRED', 'Sesi tidak valid atau telah berakhir.');
      return principal;
    },

    async touchSession(principal: AuthPrincipal) {
      const now = new Date();
      // Repository does not expose lastSeen to the principal; touching once per authenticated request is
      // deliberately kept out of the hot path for now. Callers can opt-in where meaningful.
      await repository.touchSession(principal.sessionId, now);
    },

    async logout(principal: AuthPrincipal, requestId?: string) {
      const now = new Date();
      await repository.revokeSession(principal.sessionId, now);
      await repository.appendAudit({
        actorUserId: principal.userId,
        actorRoleSnapshot: principal.role,
        action: 'LOGOUT',
        entityType: 'SESSION',
        entityId: principal.sessionId,
        requestId,
      });
    },

    async logoutAll(principal: AuthPrincipal, requestId?: string) {
      const now = new Date();
      await repository.revokeAllUserSessions(principal.userId, now);
      await repository.appendAudit({
        actorUserId: principal.userId,
        actorRoleSnapshot: principal.role,
        action: 'LOGOUT_ALL',
        entityType: 'USER',
        entityId: principal.userId,
        requestId,
      });
    },

    async changePassword(principal: AuthPrincipal, currentPassword: string, newPassword: string, requestId?: string) {
      const user = await repository.findUserById(principal.userId);
      if (!user) throw notFound('User tidak ditemukan.');
      if (!(await passwordHasher.verify(user.passwordHash, currentPassword))) {
        throw unauthorized('INVALID_CURRENT_PASSWORD', 'Password saat ini tidak valid.');
      }
      if (currentPassword === newPassword) {
        throw new AppError(400, 'PASSWORD_REUSE', 'Password baru harus berbeda dari password saat ini.');
      }
      const passwordHash = await passwordHasher.hash(newPassword);
      await repository.updateUserPassword(user.id, passwordHash);
      await repository.revokeAllUserSessions(user.id, new Date());
      await repository.appendAudit({
        actorUserId: principal.userId,
        actorRoleSnapshot: principal.role,
        action: 'PASSWORD_CHANGED',
        entityType: 'USER',
        entityId: user.id,
        requestId,
      });
    },

    async listUsers(): Promise<UserAdminView[]> {
      return repository.listUsers();
    },

    async createManagedUser(input: CreateManagedUserInput) {
      const username = canonicalUsername(input.username);
      assertUserScope(input.role, input.vendorId, input.crusherIds);
      const existing = await repository.findUserByUsername(username);
      if (existing) throw conflict('USERNAME_EXISTS', 'Username sudah digunakan.');
      const passwordHash = await passwordHasher.hash(input.password);
      const created = await repository.createUser({
        username,
        displayName: input.displayName.trim(),
        passwordHash,
        role: input.role,
        vendorId: input.vendorId,
        crusherIds: dedupe(input.crusherIds),
      });
      await repository.appendAudit({
        actorUserId: input.actor.userId,
        actorRoleSnapshot: input.actor.role,
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: created.id,
        afterJson: { username: created.username, role: created.role, vendorId: created.vendorId, crusherIds: created.crusherIds, status: created.status },
        requestId: input.requestId,
      });
      return created;
    },

    async updateManagedUser(actor: AuthPrincipal, userId: string, displayName: string, role: Role, vendorId: string | null, crusherIds: string[], reason: string, requestId?: string) {
      const before = (await repository.listUsers()).find((user) => user.id === userId);
      if (!before) throw notFound('User tidak ditemukan.');
      const scopes = dedupe(crusherIds);
      assertUserScope(role, vendorId, scopes);
      const updated = await repository.updateUserAccess(userId, displayName.trim(), role, vendorId, scopes);
      if (!updated) throw notFound('User tidak ditemukan.');
      await repository.revokeAllUserSessions(userId, new Date(), actor.userId === userId ? actor.sessionId : undefined);
      await repository.appendAudit({
        actorUserId: actor.userId,
        actorRoleSnapshot: actor.role,
        action: 'USER_ACCESS_UPDATED',
        entityType: 'USER',
        entityId: userId,
        beforeJson: { displayName: before.displayName, role: before.role, vendorId: before.vendorId, crusherIds: before.crusherIds },
        afterJson: { displayName: updated.displayName, role: updated.role, vendorId: updated.vendorId, crusherIds: updated.crusherIds },
        reason,
        requestId,
      });
      return updated;
    },

    async setUserStatus(actor: AuthPrincipal, userId: string, status: 'ACTIVE' | 'DEACTIVATED', reason: string, requestId?: string) {
      if (actor.userId === userId && status === 'DEACTIVATED') {
        throw new AppError(400, 'SELF_DEACTIVATION_BLOCKED', 'Administrator tidak dapat menonaktifkan akun yang sedang digunakan.');
      }
      const before = await repository.findUserById(userId);
      if (!before) throw notFound('User tidak ditemukan.');
      const updated = await repository.updateUserStatus(userId, status);
      if (!updated) throw notFound('User tidak ditemukan.');
      if (status === 'DEACTIVATED') await repository.revokeAllUserSessions(userId, new Date());
      await repository.appendAudit({
        actorUserId: actor.userId,
        actorRoleSnapshot: actor.role,
        action: 'USER_STATUS_CHANGED',
        entityType: 'USER',
        entityId: userId,
        beforeJson: { status: before.status },
        afterJson: { status },
        reason,
        requestId,
      });
      return updated;
    },

    async resetUserPassword(actor: AuthPrincipal, userId: string, newPassword: string, reason: string, requestId?: string) {
      const user = await repository.findUserById(userId);
      if (!user) throw notFound('User tidak ditemukan.');
      const passwordHash = await passwordHasher.hash(newPassword);
      const updated = await repository.updateUserPassword(userId, passwordHash);
      if (!updated) throw notFound('User tidak ditemukan.');
      await repository.revokeAllUserSessions(userId, new Date());
      await repository.appendAudit({
        actorUserId: actor.userId,
        actorRoleSnapshot: actor.role,
        action: 'USER_PASSWORD_RESET',
        entityType: 'USER',
        entityId: userId,
        reason,
        requestId,
      });
      return updated;
    },

    async updateUserScopes(actor: AuthPrincipal, userId: string, vendorId: string | null, crusherIds: string[], reason: string, requestId?: string) {
      const user = await repository.findUserById(userId);
      if (!user) throw notFound('User tidak ditemukan.');
      assertUserScope(user.role, vendorId, crusherIds);
      const updated = await repository.updateUserScopes(userId, vendorId, dedupe(crusherIds));
      if (!updated) throw notFound('User tidak ditemukan.');
      await repository.revokeAllUserSessions(userId, new Date());
      await repository.appendAudit({
        actorUserId: actor.userId,
        actorRoleSnapshot: actor.role,
        action: 'USER_SCOPE_CHANGED',
        entityType: 'USER',
        entityId: userId,
        beforeJson: { vendorId: user.vendorId },
        afterJson: { vendorId: updated.vendorId, crusherIds: updated.crusherIds },
        reason,
        requestId,
      });
      return updated;
    },

    async bootstrapAdmin(username: string, displayName: string, password: string) {
      if ((await repository.countUsers()) > 0) {
        throw conflict('BOOTSTRAP_NOT_ALLOWED', 'Bootstrap hanya dapat dilakukan saat tabel users masih kosong.');
      }
      const passwordHash = await passwordHasher.hash(password);
      const created = await repository.createUser({
        username: canonicalUsername(username),
        displayName: displayName.trim(),
        passwordHash,
        role: 'SUPERVISOR_ADMIN',
        vendorId: null,
        crusherIds: [],
      });
      await repository.appendAudit({
        actorUserId: created.id,
        actorRoleSnapshot: created.role,
        action: 'BOOTSTRAP_ADMIN_CREATED',
        entityType: 'USER',
        entityId: created.id,
      });
      return created;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
