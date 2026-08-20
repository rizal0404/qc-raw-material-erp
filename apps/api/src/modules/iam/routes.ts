import type { FastifyInstance } from 'fastify';
import {
  ChangePasswordRequestSchema,
  CreateUserRequestSchema,
  LoginRequestSchema,
  ResetUserPasswordRequestSchema,
  UpdateUserAccessRequestSchema,
  UpdateUserScopesRequestSchema,
  UpdateUserStatusRequestSchema,
} from '@qc/contracts';
import type { UserAdminView, AuthPrincipal } from '@qc/domain';
import type { AppConfig } from '../../config';
import { AppError } from '../../lib/errors';
import type { AuthService } from './service';
import type { MasterService } from '../master/service';

function authUser(principal: AuthPrincipal) {
  return {
    id: principal.userId,
    username: principal.username,
    displayName: principal.displayName,
    role: principal.role,
    status: principal.status,
    vendorId: principal.vendorId,
    crusherIds: principal.crusherIds,
    lastLoginAt: principal.lastLoginAt?.toISOString() ?? null,
  };
}

function adminUser(user: UserAdminView) {
  return {
    ...user,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function cookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    path: '/',
    maxAge: Math.floor(config.auth.sessionTtlMs / 1000),
    ...(config.auth.cookieDomain ? { domain: config.auth.cookieDomain } : {}),
  } as const;
}

export async function registerIamRoutes(app: FastifyInstance, config: AppConfig, authService: AuthService, masterService?: MasterService) {
  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Payload login tidak valid.', { issues: parsed.error.issues });
    const result = await authService.login({
      ...parsed.data,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });
    reply.setCookie(config.auth.cookieName, result.rawToken, cookieOptions(config));
    return { ok: true as const, user: authUser(result.principal), session: { expiresAt: result.principal.sessionExpiresAt.toISOString() } };
  });

  app.get('/auth/me', { preHandler: app.auth.requireAuth }, async (request) => {
    const principal = request.principal!;
    return { ok: true as const, user: authUser(principal), session: { expiresAt: principal.sessionExpiresAt.toISOString() } };
  });

  app.get('/auth/session', async (request) => {
    try {
      const principal = await authService.authenticate(request.cookies[config.auth.cookieName]);
      return {
        ok: true as const,
        authenticated: true as const,
        user: authUser(principal),
        session: { expiresAt: principal.sessionExpiresAt.toISOString() },
      };
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 401) {
        return { ok: true as const, authenticated: false as const, user: null, session: null };
      }
      throw error;
    }
  });

  app.post('/auth/logout', { preHandler: app.auth.requireAuth }, async (request, reply) => {
    await authService.logout(request.principal!, request.id);
    reply.clearCookie(config.auth.cookieName, cookieOptions(config));
    return { ok: true as const };
  });

  app.post('/auth/logout-all', { preHandler: app.auth.requireAuth }, async (request, reply) => {
    await authService.logoutAll(request.principal!, request.id);
    reply.clearCookie(config.auth.cookieName, cookieOptions(config));
    return { ok: true as const };
  });

  app.post('/auth/change-password', { preHandler: app.auth.requireAuth }, async (request, reply) => {
    const parsed = ChangePasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Payload password tidak valid.', { issues: parsed.error.issues });
    await authService.changePassword(request.principal!, parsed.data.currentPassword, parsed.data.newPassword, request.id);
    reply.clearCookie(config.auth.cookieName, cookieOptions(config));
    return { ok: true as const, reauthenticationRequired: true };
  });

  app.get('/iam/users', { preHandler: app.auth.requireRoles('SUPERVISOR_ADMIN') }, async () => {
    const users = await authService.listUsers();
    return { ok: true as const, users: users.map(adminUser) };
  });

  app.post('/iam/users', { preHandler: app.auth.requireRoles('SUPERVISOR_ADMIN') }, async (request) => {
    const parsed = CreateUserRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Payload user tidak valid.', { issues: parsed.error.issues });
    if (masterService) await masterService.validateIamScope(parsed.data.role, parsed.data.vendorId ?? null, parsed.data.crusherIds);
    const user = await authService.createManagedUser({
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      password: parsed.data.password,
      role: parsed.data.role,
      vendorId: parsed.data.vendorId ?? null,
      crusherIds: parsed.data.crusherIds,
      actor: request.principal!,
      requestId: request.id,
    });
    return { ok: true as const, user: adminUser(user) };
  });

  app.patch('/iam/users/:userId', { preHandler: app.auth.requireRoles('SUPERVISOR_ADMIN') }, async (request) => {
    const userId = (request.params as { userId?: string }).userId;
    if (!userId) throw new AppError(400, 'VALIDATION_ERROR', 'userId wajib.');
    const parsed = UpdateUserAccessRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Payload user tidak valid.', { issues: parsed.error.issues });
    if (masterService) await masterService.validateIamScope(parsed.data.role, parsed.data.vendorId ?? null, parsed.data.crusherIds);
    const user = await authService.updateManagedUser(
      request.principal!,
      userId,
      parsed.data.displayName,
      parsed.data.role,
      parsed.data.vendorId ?? null,
      parsed.data.crusherIds,
      parsed.data.reason,
      request.id,
    );
    return { ok: true as const, user: adminUser(user) };
  });

  app.patch('/iam/users/:userId/status', { preHandler: app.auth.requireRoles('SUPERVISOR_ADMIN') }, async (request) => {
    const userId = (request.params as { userId?: string }).userId;
    if (!userId) throw new AppError(400, 'VALIDATION_ERROR', 'userId wajib.');
    const parsed = UpdateUserStatusRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Payload status tidak valid.', { issues: parsed.error.issues });
    const user = await authService.setUserStatus(request.principal!, userId, parsed.data.status, parsed.data.reason, request.id);
    return { ok: true as const, user: adminUser(user) };
  });

  app.post('/iam/users/:userId/reset-password', { preHandler: app.auth.requireRoles('SUPERVISOR_ADMIN') }, async (request) => {
    const userId = (request.params as { userId?: string }).userId;
    if (!userId) throw new AppError(400, 'VALIDATION_ERROR', 'userId wajib.');
    const parsed = ResetUserPasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Payload password tidak valid.', { issues: parsed.error.issues });
    const user = await authService.resetUserPassword(request.principal!, userId, parsed.data.newPassword, parsed.data.reason, request.id);
    return { ok: true as const, user: adminUser(user) };
  });

  app.patch('/iam/users/:userId/scopes', { preHandler: app.auth.requireRoles('SUPERVISOR_ADMIN') }, async (request) => {
    const userId = (request.params as { userId?: string }).userId;
    if (!userId) throw new AppError(400, 'VALIDATION_ERROR', 'userId wajib.');
    const parsed = UpdateUserScopesRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Payload scope tidak valid.', { issues: parsed.error.issues });
    const user = await authService.updateUserScopes(
      request.principal!,
      userId,
      parsed.data.vendorId ?? null,
      parsed.data.crusherIds,
      parsed.data.reason,
      request.id,
    );
    return { ok: true as const, user: adminUser(user) };
  });
}
