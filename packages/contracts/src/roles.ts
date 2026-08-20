export const roles = ['VENDOR', 'CRUSHER_OPERATOR', 'QC_ANALYST', 'SUPERVISOR_ADMIN'] as const;
export type Role = (typeof roles)[number];
