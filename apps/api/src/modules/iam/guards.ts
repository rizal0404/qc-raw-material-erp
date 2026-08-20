import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@qc/contracts';
import { canAccessCrusher, canAccessVendor, hasRole } from '@qc/domain';
import { forbidden } from '../../lib/errors';
import type { AppConfig } from '../../config';
import type { AuthService } from './service';

export function createAuthGuards(authService: AuthService, config: AppConfig) {
  const requireAuth = async (request: FastifyRequest, _reply: FastifyReply) => {
    const rawToken = request.cookies[config.auth.cookieName];
    request.principal = await authService.authenticate(rawToken);
    if (Date.now() - request.principal.sessionLastSeenAt.getTime() >= config.auth.sessionTouchIntervalMs) {
      await authService.touchSession(request.principal);
      request.principal.sessionLastSeenAt = new Date();
    }
  };

  return {
    requireAuth,

    requireRoles(...roles: Role[]) {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        await requireAuth(request, reply);
        if (!request.principal || !hasRole(request.principal, roles)) throw forbidden();
      };
    },

    requireVendorScope(vendorId: string, request: FastifyRequest) {
      if (!request.principal || !canAccessVendor(request.principal, vendorId)) throw forbidden('Vendor berada di luar scope user.');
    },

    requireCrusherScope(crusherId: string, request: FastifyRequest) {
      if (!request.principal || !canAccessCrusher(request.principal, crusherId)) throw forbidden('Crusher berada di luar scope user.');
    },
  };
}

export type AuthGuards = ReturnType<typeof createAuthGuards>;
