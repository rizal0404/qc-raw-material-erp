import { describe, expect, it } from 'vitest';
import type { AuthPrincipal, AuditInput, CreateSessionInput, CreateUserInput, IamRepository, UserAdminView, UserRecord, UserStatus } from '@qc/domain';
import { createAuthService } from './service';

class FakeRepo implements IamRepository {
  user: UserRecord | null = {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'tester',
    displayName: 'Tester',
    passwordHash: 'valid-hash',
    role: 'QC_ANALYST',
    vendorId: null,
    status: 'ACTIVE',
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: new Date('2026-08-19T00:00:00Z'),
    createdAt: new Date('2026-08-19T00:00:00Z'),
    updatedAt: new Date('2026-08-19T00:00:00Z'),
  };
  audits: AuditInput[] = [];
  sessions = new Map<string, AuthPrincipal>();

  async countUsers() { return this.user ? 1 : 0; }
  async findUserByUsername(username: string) { return this.user?.username === username ? this.user : null; }
  async findUserById(userId: string) { return this.user?.id === userId ? this.user : null; }
  async listUsers(): Promise<UserAdminView[]> { return []; }
  async createUser(_input: CreateUserInput): Promise<UserAdminView> { throw new Error('not used'); }
  async replaceUserCrusherScopes() {}
  async updateUserAccess(): Promise<UserAdminView | null> { return null; }
  async updateUserStatus(_userId: string, _status: UserStatus): Promise<UserAdminView | null> { return null; }
  async updateUserPassword(): Promise<UserAdminView | null> { return null; }
  async updateUserScopes(): Promise<UserAdminView | null> { return null; }
  async recordLoginFailure(_userId: string, maxFailures: number, lockedUntil: Date) {
    if (!this.user) return null;
    this.user.failedLoginCount += 1;
    if (this.user.failedLoginCount >= maxFailures) this.user.lockedUntil = lockedUntil;
    return this.user;
  }
  async recordLoginSuccess(_userId: string, at: Date) {
    if (!this.user) return null;
    this.user.failedLoginCount = 0;
    this.user.lockedUntil = null;
    this.user.lastLoginAt = at;
    return this.user;
  }
  async createSession(input: CreateSessionInput) { return { id: '22222222-2222-4222-8222-222222222222', expiresAt: input.expiresAt }; }
  async findPrincipalByTokenHash(tokenHash: string) {
    if (!this.user || tokenHash !== 'hashed-token') return null;
    return {
      sessionId: '22222222-2222-4222-8222-222222222222',
      userId: this.user.id,
      username: this.user.username,
      displayName: this.user.displayName,
      role: this.user.role,
      vendorId: this.user.vendorId,
      status: this.user.status,
      crusherIds: [],
      lastLoginAt: this.user.lastLoginAt,
      sessionExpiresAt: new Date(Date.now() + 60_000),
      sessionLastSeenAt: new Date(),
    } satisfies AuthPrincipal;
  }
  async touchSession() {}
  async revokeSession() {}
  async revokeAllUserSessions() {}
  async appendAudit(input: AuditInput) { this.audits.push(input); }
}

function createService(repo: FakeRepo, passwordValid = true) {
  return createAuthService({
    repository: repo,
    passwordHasher: {
      hash: async (password) => `hash:${password}`,
      verify: async () => passwordValid,
    },
    tokenCodec: {
      generate: () => 'raw-token',
      hash: () => 'hashed-token',
    },
    sessionTtlMs: 8 * 60 * 60 * 1000,
    maxLoginFailures: 5,
    loginLockMs: 15 * 60 * 1000,
    sessionTouchIntervalMs: 5 * 60 * 1000,
  });
}

describe('IAM auth service', () => {
  it('creates an opaque session after valid credentials', async () => {
    const repo = new FakeRepo();
    const result = await createService(repo).login({ username: 'TESTER', password: 'correct-password' });
    expect(result.rawToken).toBe('raw-token');
    expect(result.principal.username).toBe('tester');
    expect(repo.user?.failedLoginCount).toBe(0);
    expect(repo.audits.some((x) => x.action === 'LOGIN_SUCCESS')).toBe(true);
  });

  it('locks account on the configured failure threshold', async () => {
    const repo = new FakeRepo();
    repo.user!.failedLoginCount = 4;
    await expect(createService(repo, false).login({ username: 'tester', password: 'wrong-password' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(repo.user?.failedLoginCount).toBe(5);
    expect(repo.user?.lockedUntil).toBeInstanceOf(Date);
  });

  it('blocks deactivated users before password verification', async () => {
    const repo = new FakeRepo();
    repo.user!.status = 'DEACTIVATED';
    await expect(createService(repo).login({ username: 'tester', password: 'correct-password' })).rejects.toMatchObject({ code: 'USER_DEACTIVATED' });
  });
});
