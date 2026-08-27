import { describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal, MasterRepository } from '@qc/domain';
import { createMasterService } from './service';

const actor: AuthPrincipal = {
  sessionId: '10000000-0000-4000-8000-000000000001',
  userId: '10000000-0000-4000-8000-000000000002',
  username: 'admin',
  displayName: 'Admin',
  role: 'SUPERVISOR_ADMIN',
  vendorId: null,
  status: 'ACTIVE',
  crusherIds: [],
  lastLoginAt: null,
  sessionExpiresAt: new Date(Date.now() + 60_000),
  sessionLastSeenAt: new Date(),
};

const now = new Date('2026-08-20T00:00:00.000Z');
function repo(overrides: Partial<MasterRepository> = {}): MasterRepository {
  const defaults: Partial<MasterRepository> = {
    findVendorByCode: async () => null,
    findVendorByAlias: async () => null,
    findVendorById: async () => null,
    createVendor: async (input) => ({ id: '20000000-0000-4000-8000-000000000001', ...input, active: true, createdAt: now, updatedAt: now }),
    updateVendor: async () => null,
    listVendors: async () => ({ items: [], total: 0 }),
    listPlants: async () => ({ items: [], total: 0 }),
    listCrushers: async () => ({ items: [], total: 0 }),
    listSources: async () => ({ items: [], total: 0 }),
    listPiles: async () => ({ items: [], total: 0 }),
    listEquipment: async () => ({ items: [], total: 0 }),
    listShifts: async () => [],
    listMaterialCategories: async () => ['PILE', 'FILLER'],
    appendAudit: async () => undefined,
  };
  return { ...defaults, ...overrides } as MasterRepository;
}

describe('Master service', () => {
  it('canonicalizes vendor code and writes audit', async () => {
    const createVendor = vi.fn(async (input) => ({ id: '20000000-0000-4000-8000-000000000001', ...input, active: true, createdAt: now, updatedAt: now }));
    const appendAudit = vi.fn(async () => undefined);
    const service = createMasterService(repo({ createVendor, appendAudit }));
    const result = await service.createVendor(actor, { code: 'pt topabiring', name: 'PT Topabiring', aliases: [], contactEmail: null, materialKinds:['LS','CL'] }, 'req-1');
    expect(result.code).toBe('PT_TOPABIRING');
    expect(createVendor).toHaveBeenCalledWith(expect.objectContaining({ code: 'PT_TOPABIRING' }));
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'MASTER_VENDOR_CREATED', entityType: 'VENDOR' }));
  });

  it('requires reason when active status changes', async () => {
    const service = createMasterService(repo({
      findVendorById: async () => ({ id: '20000000-0000-4000-8000-000000000001', code: 'V1', name: 'Vendor 1', aliases: [], contactEmail: null, materialKinds:['LS','CL'], active: true, createdAt: now, updatedAt: now }),
    }));
    await expect(service.updateVendor(actor, '20000000-0000-4000-8000-000000000001', { active: false })).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
  });

  it('blocks duplicate equipment business key per vendor/type/unit', async () => {
    const vendorId = '30000000-0000-4000-8000-000000000001';
    const service = createMasterService(repo({
      findVendorById: async () => ({ id: vendorId, code: 'V1', name: 'Vendor 1', aliases: [], contactEmail: null, materialKinds:['LS','CL'], active: true, createdAt: now, updatedAt: now }),
      findEquipmentByBusinessKey: async () => ({ id: '40000000-0000-4000-8000-000000000001', vendorId, vendorCode: 'V1', vendorName: 'Vendor 1', type: 'AA', unitNo: '12', brand: null, model: null, aliases: [], materialKinds:['LS','CL'], active: true, createdAt: now, updatedAt: now }),
    }));
    await expect(service.createEquipment(actor, { vendorId, type: 'AA', unitNo: '12', aliases: [], materialKinds:['LS','CL'] })).rejects.toMatchObject({ code: 'EQUIPMENT_EXISTS' });
  });

  it('limits vendor lookup to the logged-in vendor', async () => {
    const vendorA = { id: '50000000-0000-4000-8000-000000000001', code: 'A', name: 'Vendor A', aliases: [], contactEmail: null, materialKinds:['LS','CL'] as ('LS'|'CL')[], active: true, createdAt: now, updatedAt: now };
    const vendorB = { id: '50000000-0000-4000-8000-000000000002', code: 'B', name: 'Vendor B', aliases: [], contactEmail: null, materialKinds:['LS','CL'] as ('LS'|'CL')[], active: true, createdAt: now, updatedAt: now };
    const vendorPrincipal: AuthPrincipal = { ...actor, role: 'VENDOR', vendorId: vendorA.id };
    const service = createMasterService(repo({ listVendors: async () => ({ items: [vendorA, vendorB], total: 2 }) }));
    const lookup = await service.getLookupBootstrap(vendorPrincipal);
    expect(lookup.vendors.map((x) => x.id)).toEqual([vendorA.id]);
  });
  it('blocks a vendor alias already owned by another canonical vendor', async () => {
    const service = createMasterService(repo({
      findVendorByAlias: async () => ({ id: '60000000-0000-4000-8000-000000000001', code: 'OLD', name: 'Existing Vendor', aliases: ['PT TEST'], contactEmail: null, materialKinds:['LS','CL'], active: true, createdAt: now, updatedAt: now }),
    }));
    await expect(service.createVendor(actor, { code: 'NEW', name: 'New Vendor', aliases: [' pt   test '], contactEmail: null, materialKinds:['LS','CL'] })).rejects.toMatchObject({ code: 'VENDOR_ALIAS_EXISTS' });
  });

});
