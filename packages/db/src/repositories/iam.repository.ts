import { and, asc, count, eq, gt, inArray, isNull, ne, sql as dsql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { IamRepository, CreateSessionInput, CreateUserInput, AuditInput, UserAdminView, UserRecord, AuthPrincipal, UserStatus } from '@qc/domain';
import type * as Schema from '../schema/index';
import { auditLogs, crushers, sessions, userCrusherScopes, users } from '../schema/index';

function mapUser(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    passwordHash: row.passwordHash,
    role: row.role,
    vendorId: row.vendorId,
    status: row.status,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    passwordChangedAt: row.passwordChangedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createIamRepository(db: PostgresJsDatabase<typeof Schema>): IamRepository {
  async function getCrusherIds(userId: string): Promise<string[]> {
    const rows = await db
      .select({ crusherId: userCrusherScopes.crusherId })
      .from(userCrusherScopes)
      .innerJoin(crushers, eq(crushers.id, userCrusherScopes.crusherId))
      .where(and(eq(userCrusherScopes.userId, userId), eq(crushers.active, true)));
    return rows.map((row) => row.crusherId);
  }

  async function toAdminView(user: typeof users.$inferSelect): Promise<UserAdminView> {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      vendorId: user.vendorId,
      status: user.status,
      crusherIds: await getCrusherIds(user.id),
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  return {
    async countUsers() {
      const [row] = await db.select({ value: count() }).from(users);
      return Number(row?.value ?? 0);
    },

    async findUserByUsername(username) {
      const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      return row ? mapUser(row) : null;
    },

    async findUserById(userId) {
      const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return row ? mapUser(row) : null;
    },

    async listUsers() {
      const rows = await db.select().from(users).orderBy(asc(users.username));
      return Promise.all(rows.map(toAdminView));
    },

    async createUser(input: CreateUserInput) {
      return db.transaction(async (tx) => {
        const [created] = await tx.insert(users).values({
          username: input.username,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          role: input.role,
          vendorId: input.vendorId,
        }).returning();
        if (!created) throw new Error('Failed to create user');
        if (input.crusherIds.length) {
          await tx.insert(userCrusherScopes).values(
            input.crusherIds.map((crusherId) => ({ userId: created.id, crusherId })),
          );
        }
        const scopeRows = input.crusherIds.length
          ? await tx.select({ crusherId: userCrusherScopes.crusherId }).from(userCrusherScopes).where(eq(userCrusherScopes.userId, created.id))
          : [];
        return {
          id: created.id,
          username: created.username,
          displayName: created.displayName,
          role: created.role,
          vendorId: created.vendorId,
          status: created.status,
          crusherIds: scopeRows.map((x) => x.crusherId),
          failedLoginCount: created.failedLoginCount,
          lockedUntil: created.lockedUntil,
          lastLoginAt: created.lastLoginAt,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      });
    },

    async replaceUserCrusherScopes(userId, crusherIds) {
      await db.transaction(async (tx) => {
        await tx.delete(userCrusherScopes).where(eq(userCrusherScopes.userId, userId));
        if (crusherIds.length) {
          await tx.insert(userCrusherScopes).values(crusherIds.map((crusherId) => ({ userId, crusherId })));
        }
      });
    },

    async updateUserAccess(userId, displayName, role, vendorId, crusherIds) {
      return db.transaction(async (tx) => {
        const [updated] = await tx.update(users).set({ displayName, role, vendorId, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
        if (!updated) return null;
        await tx.delete(userCrusherScopes).where(eq(userCrusherScopes.userId, userId));
        if (crusherIds.length) await tx.insert(userCrusherScopes).values(crusherIds.map((crusherId) => ({ userId, crusherId })));
        return {
          id: updated.id,
          username: updated.username,
          displayName: updated.displayName,
          role: updated.role,
          vendorId: updated.vendorId,
          status: updated.status,
          crusherIds,
          failedLoginCount: updated.failedLoginCount,
          lockedUntil: updated.lockedUntil,
          lastLoginAt: updated.lastLoginAt,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };
      });
    },

    async updateUserStatus(userId, status: UserStatus) {
      const [updated] = await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
      return updated ? toAdminView(updated) : null;
    },

    async updateUserPassword(userId, passwordHash) {
      const now = new Date();
      const [updated] = await db.update(users).set({
        passwordHash,
        passwordChangedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: now,
      }).where(eq(users.id, userId)).returning();
      return updated ? toAdminView(updated) : null;
    },

    async updateUserScopes(userId, vendorId, crusherIds) {
      return db.transaction(async (tx) => {
        const [updated] = await tx.update(users).set({ vendorId, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
        if (!updated) return null;
        await tx.delete(userCrusherScopes).where(eq(userCrusherScopes.userId, userId));
        if (crusherIds.length) await tx.insert(userCrusherScopes).values(crusherIds.map((crusherId) => ({ userId, crusherId })));
        return {
          id: updated.id,
          username: updated.username,
          displayName: updated.displayName,
          role: updated.role,
          vendorId: updated.vendorId,
          status: updated.status,
          crusherIds,
          failedLoginCount: updated.failedLoginCount,
          lockedUntil: updated.lockedUntil,
          lastLoginAt: updated.lastLoginAt,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };
      });
    },

    async recordLoginFailure(userId, maxFailures, lockedUntil) {
      const [updated] = await db.update(users).set({
        failedLoginCount: dsql`${users.failedLoginCount} + 1`,
        lockedUntil: dsql`CASE WHEN ${users.failedLoginCount} + 1 >= ${maxFailures} THEN ${lockedUntil} ELSE ${users.lockedUntil} END`,
        updatedAt: new Date(),
      }).where(eq(users.id, userId)).returning();
      return updated ? mapUser(updated) : null;
    },

    async recordLoginSuccess(userId, at) {
      const [updated] = await db.update(users).set({
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: at,
        updatedAt: at,
      }).where(eq(users.id, userId)).returning();
      return updated ? mapUser(updated) : null;
    },

    async createSession(input: CreateSessionInput) {
      const [created] = await db.insert(sessions).values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      }).returning({ id: sessions.id, expiresAt: sessions.expiresAt });
      if (!created) throw new Error('Failed to create session');
      return created;
    },

    async findPrincipalByTokenHash(tokenHash, now) {
      const [row] = await db.select({
        sessionId: sessions.id,
        sessionExpiresAt: sessions.expiresAt,
        sessionLastSeenAt: sessions.lastSeenAt,
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        vendorId: users.vendorId,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
      }).from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
          eq(users.status, 'ACTIVE'),
        ))
        .limit(1);
      if (!row) return null;
      const crusherIds = await getCrusherIds(row.userId);
      const principal: AuthPrincipal = {
        sessionId: row.sessionId,
        userId: row.userId,
        username: row.username,
        displayName: row.displayName,
        role: row.role,
        vendorId: row.vendorId,
        status: row.status,
        crusherIds,
        lastLoginAt: row.lastLoginAt,
        sessionExpiresAt: row.sessionExpiresAt,
        sessionLastSeenAt: row.sessionLastSeenAt,
      };
      return principal;
    },

    async touchSession(sessionId, at) {
      await db.update(sessions).set({ lastSeenAt: at }).where(eq(sessions.id, sessionId));
    },

    async revokeSession(sessionId, at) {
      await db.update(sessions).set({ revokedAt: at }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    },

    async revokeAllUserSessions(userId, at, exceptSessionId) {
      const predicate = exceptSessionId
        ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, exceptSessionId))
        : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
      await db.update(sessions).set({ revokedAt: at }).where(predicate);
    },

    async appendAudit(input: AuditInput) {
      await db.insert(auditLogs).values({
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRoleSnapshot,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        beforeJson: input.beforeJson,
        afterJson: input.afterJson,
        reason: input.reason,
        requestId: input.requestId,
      });
    },
  };
}
