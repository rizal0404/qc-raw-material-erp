import { z } from 'zod';
export const OperationDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type OperationDate = z.infer<typeof OperationDateSchema>;

// Backward-compatible semantic alias used by API contracts.
export const IsoDateSchema = OperationDateSchema;
