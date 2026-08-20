import { z } from 'zod';
import { RoleSchema, UserStatusSchema } from './auth';

export const UserListItemSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  role: RoleSchema,
  vendorId: z.string().uuid().nullable(),
  status: UserStatusSchema,
  crusherIds: z.array(z.string().uuid()),
  failedLoginCount: z.number().int().nonnegative(),
  lockedUntil: z.string().datetime().nullable(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UserListResponseSchema = z.object({
  ok: z.literal(true),
  users: z.array(UserListItemSchema),
});

export const CreateUserRequestSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  displayName: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(256),
  role: RoleSchema,
  vendorId: z.string().uuid().nullable().optional(),
  crusherIds: z.array(z.string().uuid()).default([]),
});


export const UpdateUserAccessRequestSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  role: RoleSchema,
  vendorId: z.string().uuid().nullable().optional(),
  crusherIds: z.array(z.string().uuid()),
  reason: z.string().trim().min(3).max(500),
});

export const UpdateUserStatusRequestSchema = z.object({
  status: UserStatusSchema,
  reason: z.string().trim().min(3).max(500),
});

export const ResetUserPasswordRequestSchema = z.object({
  newPassword: z.string().min(12).max(256),
  reason: z.string().trim().min(3).max(500),
});

export const UpdateUserScopesRequestSchema = z.object({
  vendorId: z.string().uuid().nullable().optional(),
  crusherIds: z.array(z.string().uuid()),
  reason: z.string().trim().min(3).max(500),
});

export const UserMutationResponseSchema = z.object({
  ok: z.literal(true),
  user: UserListItemSchema,
});

export type UserListItem = z.infer<typeof UserListItemSchema>;
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
export type UpdateUserAccessRequest = z.infer<typeof UpdateUserAccessRequestSchema>;
export type UpdateUserStatusRequest = z.infer<typeof UpdateUserStatusRequestSchema>;
export type ResetUserPasswordRequest = z.infer<typeof ResetUserPasswordRequestSchema>;
export type UpdateUserScopesRequest = z.infer<typeof UpdateUserScopesRequestSchema>;
