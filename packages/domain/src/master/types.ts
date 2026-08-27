import type { EquipmentType, MaterialKind } from '@qc/contracts';

export interface ListFilter {
  search?: string | undefined;
  active?: boolean | undefined;
  limit: number;
  offset: number;
}

export interface VendorRecord {
  id: string; code: string; name: string; aliases: string[]; contactEmail: string | null; active: boolean; materialKinds: MaterialKind[]; createdAt: Date; updatedAt: Date;
}
export interface PlantRecord {
  id: string; code: string; name: string; active: boolean; materialKinds: MaterialKind[]; createdAt: Date; updatedAt: Date;
}
export interface CrusherRecord {
  id: string; code: string; name: string; materialKind: MaterialKind; plantId: string | null;
  plantCode: string | null; plantName: string | null; active: boolean; createdAt: Date; updatedAt: Date;
}
export interface EquipmentRecord {
  id: string; vendorId: string; vendorCode: string; vendorName: string; type: EquipmentType; unitNo: string;
  brand: string | null; model: string | null; aliases: string[]; active: boolean; materialKinds: MaterialKind[]; createdAt: Date; updatedAt: Date;
}
export interface SourceRecord {
  id: string; code: string; name: string; block: string | null; materialCategory: string; materialKind: MaterialKind;
  aliases: string[]; active: boolean; createdAt: Date; updatedAt: Date;
}
export interface PileRecord {
  id: string; code: string; name: string; materialKind: MaterialKind; plantId: string | null;
  plantCode: string | null; plantName: string | null; className: string | null; active: boolean; createdAt: Date; updatedAt: Date;
}
export interface ShiftRecord {
  code: string; name: string; startTime: string; endTime: string; crossesMidnight: boolean; active: boolean;
}

export interface AuditWriteInput {
  actorUserId: string | null;
  actorRoleSnapshot?: string | null | undefined;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason?: string | null | undefined;
  requestId?: string | undefined;
}
