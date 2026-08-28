import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import type { AuthPrincipal, SaveMixRepositoryInput } from '@qc/domain';
import { loadMigrationDatabaseConfig } from './migration-config';
import * as schema from './schema/index';
import { createMasterRepository } from './repositories/master.repository';
import { createVendorOperationRepository } from './repositories/vendor-operation.repository';
import { createRetaseRepository } from './repositories/retase.repository';
import { createReconciliationRepository } from './repositories/reconciliation.repository';
import { createQcRepository } from './repositories/qc.repository';
import { createMasterService } from '../../../apps/api/src/modules/master/service';
import { createVendorOperationService } from '../../../apps/api/src/modules/vendor-operation/service';
import { createRetaseService } from '../../../apps/api/src/modules/retase/service';
import { createReconciliationService } from '../../../apps/api/src/modules/reconciliation/service';

// Opt-in against a migrated PostgreSQL database. All fixture writes roll back.
test('vendor master edits and optional crusher survive the complete retase/mixing chain', async t => {
  const config = loadMigrationDatabaseConfig();
  const client = postgres(config.url, { max: 1, prepare: false, ...(config.ssl ? { ssl: 'require' as const } : {}) });
  const db = drizzle(client, { schema });
  const suffix = randomUUID(); const rollback = new Error('ROLLBACK_VENDOR_IMPORT_TEST');
  try {
    await assert.rejects(db.transaction(async tx => {
      await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
      const [user] = await tx.insert(schema.users).values({ username: `vendor_test_${suffix}`, displayName: 'Vendor import regression', passwordHash: 'not-a-login-hash', role: 'SUPERVISOR_ADMIN' }).returning();
      assert.ok(user);
      const actor: AuthPrincipal = { userId: user.id, sessionId: suffix, username: user.username, displayName: user.displayName, role: 'SUPERVISOR_ADMIN', vendorId: null, status: 'ACTIVE', crusherIds: [], lastLoginAt: null, sessionExpiresAt: new Date(), sessionLastSeenAt: new Date() };
      const masterRepo = createMasterRepository(tx), master = createMasterService(masterRepo);
      const vendor = await master.createVendor(actor, { code: `V_${suffix}`, name: 'Vendor original', aliases: [], materialKinds: ['LS', 'CL'] });
      const am = await master.createEquipment(actor, { vendorId: vendor.id, type: 'AM', unitNo: '07', aliases: [], materialKinds: ['LS', 'CL'] });
      const aa = await master.createEquipment(actor, { vendorId: vendor.id, type: 'AA', unitNo: '11', aliases: [], materialKinds: ['LS', 'CL'] });
      const plant = await master.createPlant(actor, { code: `P_${suffix}`, name: 'Plant original', materialKinds: ['LS'] });
      const pile = await master.createPile(actor, { code: `PILE_${suffix}`, name: 'Test pile', materialKind: 'LS', plantId: plant.id });
      const source = await master.createSource(actor, { code: `S_${suffix}`, name: 'B9', block: 'B9', materialKind: 'LS', materialCategory: 'PILE', aliases: [] });
      const c4 = await master.createCrusher(actor, { code: `C4_${suffix}`, name: 'Test crusher 4', materialKind: 'LS', plantId: plant.id });
      const c5 = await master.createCrusher(actor, { code: `C5_${suffix}`, name: 'Test crusher 5', materialKind: 'LS', plantId: plant.id });
      const clay = await master.createCrusher(actor, { code: `CL_${suffix}`, name: 'Test Clay', materialKind: 'CL' });
      const reports = createVendorOperationService(createVendorOperationRepository(tx), masterRepo);
      const context = { vendorId: vendor.id, operationDate: '2026-08-18', shiftCode: 'SHIFT_1' as const, materialKind: 'LS' as const };
      const fleet = { total: 1, operating: 1, standby: 0, breakdown: 0, repair: 0, other: 0 };
      const draft = await reports.createDraft(actor, { ...context, am: fleet, aa: fleet, assignments: [{ amId: am.id, sourceId: source.id, aaIds: [aa.id], crusherId: null }], note: 'Imported WhatsApp report' });
      assert.equal(draft.assignments[0]?.crusherId, null);
      const assignment = draft.assignments[0]!; const assignmentAaId = assignment.aa[0]!.assignmentAaId;

      await t.test('reproduces the former foreign-key failure, then renames referenced vendor/equipment/plant without deleting retained scopes', async () => {
        await assert.rejects(tx.transaction(sp => sp.delete(schema.vendorMaterialScopes).where(eq(schema.vendorMaterialScopes.vendorId, vendor.id))), (error: unknown) => {
          const e = error as { code?: string; cause?: { code?: string } }; return (e.code ?? e.cause?.code) === '23503';
        });
        const renamed = await master.updateVendor(actor, vendor.id, { name: 'Vendor corrected', code: vendor.code, aliases: [], contactEmail: null, active: true, materialKinds: ['LS', 'CL'] });
        assert.equal(renamed.name, 'Vendor corrected'); assert.deepEqual(renamed.materialKinds.sort(), ['CL', 'LS']);
        assert.equal((await master.updateEquipment(actor, am.id, { brand: 'Hyundai', materialKinds: ['LS', 'CL'] })).brand, 'Hyundai');
        assert.equal((await master.updatePlant(actor, plant.id, { name: 'Plant corrected', materialKinds: ['LS'] })).name, 'Plant corrected');
        assert.equal((await reports.getCurrent(actor, context))?.vendorId, vendor.id);
        assert.equal((await reports.getCurrent(actor, context))?.vendorName, 'Vendor corrected');
      });
      await t.test('requires a specific crusher before attaching a pile', async () => {
        await assert.rejects(reports.updateDraft(actor, draft.id, { am: fleet, aa: fleet, assignments: [{ amId: am.id, sourceId: source.id, crusherId: null, pileId: pile.id, aaIds: [aa.id] }] }), /Pile tujuan memerlukan crusher/);
      });
      await reports.submit(actor, draft.id, 'Verified QC import');
      const retaseRepo = createRetaseRepository(tx);
      const counter = createRetaseService(retaseRepo, masterRepo, { now: () => new Date('2026-08-18T01:00:00Z') });
      await t.test('one assignment is available in both Limestone crushers but never in Clay', async () => {
        for (const crusher of [c4, c5]) {
          const rows = await retaseRepo.listCounterAssignments({ ...context, crusherId: crusher.id });
          assert.equal(rows.length, 1); assert.equal(rows[0]?.id, assignment.id); assert.equal(rows[0]?.crusherId, crusher.id);
          assert.equal(await retaseRepo.countEffectiveSubmittedReports({ ...context, crusherId: crusher.id }), 1);
          assert.equal((await retaseRepo.getAssignmentAaById(assignmentAaId, crusher.id))?.crusherId, crusher.id);
          assert.equal((await retaseRepo.listAssignmentCandidatesForAa({ ...context, crusherId: crusher.id, aaId: aa.id })).length, 1);
        }
        assert.deepEqual(await retaseRepo.listCounterAssignments({ ...context, crusherId: clay.id }), []);
        assert.equal(await retaseRepo.getAssignmentAaById(assignmentAaId, clay.id), null);
        assert.equal(await retaseRepo.countEffectiveSubmittedReports({ ...context, crusherId: clay.id }), 0);
        await assert.rejects(counter.record(actor, { ...context, requestId: randomUUID(), crusherId: clay.id, assignmentAaId }), /Assignment AA tidak ditemukan/);
      });
      await t.test('records each actual destination and keeps counter totals separate', async () => {
        for (const crusher of [c4, c5]) {
          const recorded = await counter.record(actor, { ...context, requestId: randomUUID(), crusherId: crusher.id, assignmentAaId });
          assert.equal(recorded.item.crusherId, crusher.id); assert.equal(recorded.item.status, 'VALID');
          assert.equal((await retaseRepo.listCounterAssignments({ ...context, crusherId: crusher.id }))[0]?.aa[0]?.confirmedCount, 1);
        }
      });

      await t.test('database still rejects missing actual event destinations and removing referenced material scopes', async () => {
        const hasSqlState = (code: string) => (error: unknown) => {
          const e = error as { code?: string; cause?: { code?: string } };
          return (e.code ?? e.cause?.code) === code;
        };
        await assert.rejects(tx.transaction(sp => sp.execute(sql`UPDATE retase_events SET crusher_id=NULL WHERE assignment_id=${assignment.id}::uuid`)), hasSqlState('23502'));
        await assert.rejects(master.updateVendor(actor, vendor.id, { name: 'Must roll back', materialKinds: ['CL'] }), hasSqlState('23503'));
        assert.equal((await masterRepo.findVendorById(vendor.id))?.name, 'Vendor corrected');
      });
      const reconciliationRepo = createReconciliationRepository(tx), reconciliation = createReconciliationService(reconciliationRepo);
      await t.test('reconciliation aggregates the assignment once and includes it under either matching crusher filter', async () => {
        const all = await reconciliation.list(actor, context);
        assert.equal(all.items.length, 1); assert.equal(all.summary.observedRetase, 2); assert.equal(all.items[0]?.crusherId, null);
        assert.equal(all.items[0]?.crusherName, 'Lintas crusher');
        assert.equal((await reconciliation.list(actor, { ...context, crusherId: c4.id })).items.length, 1);
        assert.equal((await reconciliation.list(actor, { ...context, crusherId: clay.id })).items.length, 0);
      });
      await t.test('resolves a historical unassigned event to the same cross-crusher assignment', async () => {
        const event = await counter.record(actor, { ...context, requestId: randomUUID(), crusherId: c5.id, vendorId: vendor.id, unlistedUnitNo: '999', reason: 'Temporary unit' });
        await tx.update(schema.retaseEvents).set({ eventTs: new Date('2026-08-18T01:00:00Z') }).where(eq(schema.retaseEvents.id, event.item.id));
        const candidates = await reconciliationRepo.listExceptionAssignmentCandidates(event.item.id);
        assert.equal(candidates[0]?.assignmentId, assignment.id); assert.equal(candidates[0]?.crusherId, c5.id);
        await reconciliation.resolveException(actor, event.item.id, { assignmentId: assignment.id, reason: 'QC verified the loading assignment' });
        assert.equal((await retaseRepo.getEventById(event.item.id))?.status, 'VALID');
      });
      const [sample] = await tx.insert(schema.rawSamples).values({ sampleId: `LS_${suffix}`, operationDate: context.operationDate, materialKind: 'LS', vendorId: vendor.id, sio2: '12', al2o3: '3', fe2o3: '2', cao: '45' }).returning();
      assert.ok(sample);
      const allocation = await reconciliation.createAllocation(actor, { assignmentId: assignment.id, sampleId: sample.id, approvedRetase: 3 });
      await reconciliation.confirm(actor, allocation.id, {});
      await t.test('confirmed cross-crusher allocations appear in Workbench', async () => {
        const suggestions = await reconciliation.workbenchSuggestions(actor, context);
        assert.equal(suggestions[0]?.mappedRetase, 3); assert.equal(suggestions[0]?.sources[0]?.crusherName, 'Lintas crusher');
      });
      await t.test('Mix consumes exact events across actual crushers once', async () => {
        const input: SaveMixRepositoryInput = { mixCode: `LS_MIX_${suffix}`, operationDate: context.operationDate, shiftCode: context.shiftCode, materialKind: 'LS', pileId: pile.id, batchNo: 1, tiangKe: null, pileCycle: 1, defaultTonPerRetase: 20, note: null, createdBy: user.id, items: [{ rawSampleId: sample.id, retase: 3, tonPerRetase: 20, note: null, oxideChangeNote: null, retaseOverrideReason: null, retaseAllocationIds: [allocation.id], clayRetaseSources: [], chemistry: { sio2: 12, al2o3: 3, fe2o3: 2, cao: 45, mgo: null, k2o: null, na2o: null, so3: null, h2o: null } }] };
        await createQcRepository(tx).saveMix(input);
        const bindings = await tx.execute(sql`SELECT re.crusher_id FROM qc_retase_allocation_events link JOIN retase_events re ON re.id=link.event_id WHERE link.allocation_id=${allocation.id}::uuid AND link.active`);
        assert.equal(bindings.length, 3); assert.equal(new Set(bindings.map(r => r.crusher_id)).size, 2);
        assert.equal((await reconciliationRepo.getAllocation(allocation.id))?.consumedRetase, 3);
        assert.equal((await reconciliation.workbenchSuggestions(actor, context)).length, 0);
      });
      throw rollback;
    }), error => error === rollback);
    assert.equal((await client`SELECT id FROM users WHERE username=${`vendor_test_${suffix}`}`).length, 0);
  } finally { await client.end(); }
});
