import type { EquipmentType, MaterialKind } from '@qc/contracts';
import type {
  AuditWriteInput, CrusherRecord, EquipmentRecord, ListFilter, PileRecord, PlantRecord, ShiftRecord, SourceRecord, VendorRecord,
} from './types';

export interface MasterRepository {
  listVendors(filter: ListFilter & { materialKind?: MaterialKind | undefined }): Promise<{ items: VendorRecord[]; total: number }>;
  findVendorById(id: string): Promise<VendorRecord | null>;
  findVendorByCode(code: string): Promise<VendorRecord | null>;
  findVendorByAlias(normalizedAlias: string): Promise<VendorRecord | null>;
  createVendor(input: { code: string; name: string; aliases: string[]; contactEmail: string | null; materialKinds: MaterialKind[] }): Promise<VendorRecord>;
  updateVendor(id: string, patch: Partial<{ code: string; name: string; aliases: string[]; contactEmail: string | null; active: boolean; materialKinds: MaterialKind[] }>): Promise<VendorRecord | null>;

  listPlants(filter: ListFilter & { materialKind?: MaterialKind | undefined }): Promise<{ items: PlantRecord[]; total: number }>;
  findPlantById(id: string): Promise<PlantRecord | null>;
  findPlantByCode(code: string): Promise<PlantRecord | null>;
  createPlant(input: { code: string; name: string; materialKinds: MaterialKind[] }): Promise<PlantRecord>;
  updatePlant(id: string, patch: Partial<{ code: string; name: string; active: boolean; materialKinds: MaterialKind[] }>): Promise<PlantRecord | null>;

  listCrushers(filter: ListFilter & { materialKind?: MaterialKind | undefined; plantId?: string | undefined }): Promise<{ items: CrusherRecord[]; total: number }>;
  findCrusherById(id: string): Promise<CrusherRecord | null>;
  findCrusherByCode(code: string): Promise<CrusherRecord | null>;
  createCrusher(input: { code: string; name: string; materialKind: MaterialKind; plantId: string | null }): Promise<CrusherRecord>;
  updateCrusher(id: string, patch: Partial<{ code: string; name: string; materialKind: MaterialKind; plantId: string | null; active: boolean }>): Promise<CrusherRecord | null>;

  listEquipment(filter: ListFilter & { vendorId?: string | undefined; type?: EquipmentType | undefined; materialKind?: MaterialKind | undefined }): Promise<{ items: EquipmentRecord[]; total: number }>;
  findEquipmentById(id: string): Promise<EquipmentRecord | null>;
  findEquipmentByBusinessKey(vendorId: string, type: EquipmentType, unitNo: string): Promise<EquipmentRecord | null>;
  createEquipment(input: { vendorId: string; type: EquipmentType; unitNo: string; brand: string | null; model: string | null; aliases: string[]; materialKinds: MaterialKind[] }): Promise<EquipmentRecord>;
  updateEquipment(id: string, patch: Partial<{ vendorId: string; type: EquipmentType; unitNo: string; brand: string | null; model: string | null; aliases: string[]; active: boolean; materialKinds: MaterialKind[] }>): Promise<EquipmentRecord | null>;

  listSources(filter: ListFilter & { materialKind?: MaterialKind | undefined; materialCategory?: string | undefined }): Promise<{ items: SourceRecord[]; total: number }>;
  findSourceById(id: string): Promise<SourceRecord | null>;
  findSourceByCode(code: string, materialKind?: MaterialKind): Promise<SourceRecord | null>;
  createSource(input: { code: string; name: string; block: string | null; materialCategory: string; materialKind: MaterialKind; aliases: string[] }): Promise<SourceRecord>;
  updateSource(id: string, patch: Partial<{ code: string; name: string; block: string | null; materialCategory: string; materialKind: MaterialKind; aliases: string[]; active: boolean }>): Promise<SourceRecord | null>;

  listPiles(filter: ListFilter & { materialKind?: MaterialKind | undefined; plantId?: string | undefined }): Promise<{ items: PileRecord[]; total: number }>;
  findPileById(id: string): Promise<PileRecord | null>;
  findPileByCode(code: string, materialKind?: MaterialKind): Promise<PileRecord | null>;
  createPile(input: { code: string; name: string; materialKind: MaterialKind; plantId: string | null; className: string | null }): Promise<PileRecord>;
  updatePile(id: string, patch: Partial<{ code: string; name: string; materialKind: MaterialKind; plantId: string | null; className: string | null; active: boolean }>): Promise<PileRecord | null>;

  listShifts(activeOnly?: boolean): Promise<ShiftRecord[]>;
  listMaterialCategories(activeOnly?: boolean): Promise<string[]>;
  appendAudit(input: AuditWriteInput): Promise<void>;
}
