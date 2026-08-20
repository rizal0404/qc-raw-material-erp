import { z } from 'zod';

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
  time: z.string(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
