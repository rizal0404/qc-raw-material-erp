import { z } from 'zod';
import { roles } from './roles';

export const RoleSchema = z.enum(roles);
export const UserStatusSchema = z.enum(['ACTIVE', 'DEACTIVATED']);

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(256),
});

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  role: RoleSchema,
  status: UserStatusSchema,
  vendorId: z.string().uuid().nullable(),
  crusherIds: z.array(z.string().uuid()),
  lastLoginAt: z.string().datetime().nullable(),
});

export const AuthMeResponseSchema = z.object({
  ok: z.literal(true),
  user: AuthUserSchema,
  session: z.object({
    expiresAt: z.string().datetime(),
  }),
});

export const AuthSessionResponseSchema = z.discriminatedUnion('authenticated', [
  AuthMeResponseSchema.extend({ authenticated: z.literal(true) }),
  z.object({
    ok: z.literal(true),
    authenticated: z.literal(false),
    user: z.null(),
    session: z.null(),
  }),
]);

export const LoginResponseSchema = AuthMeResponseSchema;
export const LogoutResponseSchema = z.object({ ok: z.literal(true) });

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(8).max(256),
  newPassword: z.string().min(12).max(256),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
