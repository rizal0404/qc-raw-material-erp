import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as query } from 'drizzle-orm';
import { loadMigrationDatabaseConfig } from './migration-config';
import { createClayReportRepository } from './repositories/clay-report.repository';
import { createQcRepository } from './repositories/qc.repository';
import type { SaveMixRepositoryInput } from '@qc/domain';
import * as schema from './schema/index';

// Opt-in PostgreSQL tests. Every transaction deliberately rolls back, including
// fixture users/crushers/reports. No existing operational records are modified.
function connection() {
  const config = loadMigrationDatabaseConfig();
  return postgres(config.url, { prepare: false, max: 1, connect_timeout: 10, ...(config.ssl ? { ssl: 'require' as const } : {}) });
}
const rollback = new Error('ROLLBACK_CLAY_TEST_FIXTURES');

test('Direct Clay mixing consumes report columns without reconciliation', async t=>{
  const client=connection(),db=drizzle(client,{schema}),fixtureId=randomUUID(),username=`clay_mix_test_${fixtureId}`;
  const preview=process.env.CLAY_MIX_PREVIEW==='1';
  try{
    await assert.rejects(db.transaction(async tx=>{
      if(preview){
        const migration=await readFile(new URL('../migrations/0017_clay_direct_mixing.sql',import.meta.url),'utf8');
        await tx.execute(query.raw(migration.trim().replace(/^BEGIN;\s*/i,'').replace(/\s*COMMIT;$/i,'')));
      }
      await tx.execute(query`SET LOCAL statement_timeout='15s'`);
      const [user]=await tx.insert(schema.users).values({username,displayName:'Rollback-only Clay mix test',passwordHash:'not-a-login-hash',role:'QC_ANALYST'}).returning();
      const [crusher]=await tx.insert(schema.crushers).values({code:`TEST_${fixtureId}`,name:'Rollback-only crusher',materialKind:'CL'}).returning();
      const [pile]=await tx.insert(schema.piles).values({code:`TEST_${fixtureId}`,name:'Rollback-only pile',materialKind:'CL'}).returning();
      assert.ok(user);assert.ok(crusher);assert.ok(pile);
      const shiftCode=`TEST_${fixtureId.slice(0,8)}`,otherShift=`OTHER_${fixtureId.slice(0,8)}`;
      await tx.execute(query`INSERT INTO shifts(code,name,start_time,end_time) VALUES (${shiftCode},'Test','07:00','15:00'),(${otherShift},'Other','15:00','23:00')`);
      const reports=createClayReportRepository(tx),qc=createQcRepository(tx);
      const report=await reports.createReport({operationDate:'2026-08-27',shiftCode,crusherId:crusher.id,operatorUserId:null,operatorNameSnapshot:null,createdBy:user.id});
      const column=await reports.createColumn({reportId:report.id,displayOrder:0,vendorId:null,sourceId:null,pileId:null,vendorNameSnapshot:null,sourceNameSnapshot:'Manual Clay',headerPrimary:'BUFFER',headerSecondary:'TRASS',inputMode:'MANUAL',status:'CONFIRMED',tonPerRetaseSnapshot:20,createdBy:user.id});
      const backfill=(delta:number)=>reports.appendHourly({report,column,eventAt:new Date('2026-08-27T08:00:00+08:00'),delta,requestId:randomUUID(),batchId:randomUUID(),reason:'Rollback-only mix test',createdBy:user.id});
      await backfill(5);
      const chemistry={sio2:50,al2o3:20,fe2o3:10,cao:3,mgo:null,k2o:null,na2o:null,so3:null,h2o:null};
      const [raw]=await tx.insert(schema.rawSamples).values({sampleId:`CL_TEST_${fixtureId}`,materialKind:'CL',operationDate:report.operationDate,sio2:'50',al2o3:'20',fe2o3:'10',cao:'3'}).returning();
      assert.ok(raw);
      const input=(retase:number,code=`CL_TEST_${randomUUID()}`):SaveMixRepositoryInput=>({mixCode:code,materialKind:'CL',operationDate:report.operationDate,pileId:pile.id,shiftCode,batchNo:null,tiangKe:'1',pileCycle:1,defaultTonPerRetase:20,note:null,createdBy:user.id,
        items:[{rawSampleId:raw.id,retase,tonPerRetase:20,chemistry,note:null,oxideChangeNote:null,retaseAllocationIds:[],clayRetaseSources:[{columnId:column.id,retase}],retaseOverrideReason:null}]});
      const balance=async()=>{const all=await qc.listClayWorkbenchSources(report.operationDate,shiftCode);const found=all.find(x=>x.columnId===column.id);assert.ok(found);return found;};
      const constraint=(name:string)=>(error:unknown)=>{const e=error as {constraint_name?:string;cause?:{constraint_name?:string}};assert.equal(e.constraint_name??e.cause?.constraint_name,name);return true;};
      await t.test('saved draft counters are available without allocations',async()=>{assert.equal((await balance()).availableRetase,5);assert.equal((await balance()).reportStatus,'DRAFT');});
      let mix=await qc.saveMix(input(3));
      await t.test('partial consumption and recall preserve column linkage',async()=>{assert.equal((await balance()).availableRetase,2);assert.deepEqual(mix.items[0]?.clayRetaseSources,[{columnId:column.id,retase:3}]);assert.deepEqual(mix.items[0]?.retaseAllocationIds,[]);});
      await t.test('second mix cannot consume the same capacity',async()=>{await assert.rejects(()=>qc.saveMix(input(3)),constraint('clay_consumption_balance'));assert.equal((await balance()).availableRetase,2);});
      await t.test('negative backfill cannot cross consumed balance',async()=>{await assert.rejects(()=>backfill(-3),constraint('clay_consumption_balance'));assert.equal((await balance()).totalRetase,5);await backfill(-1);assert.equal((await balance()).availableRetase,1);});
      await t.test('replacement reuses its own retase and preserves released history',async()=>{mix=await qc.replaceMix(mix.id,input(4,mix.mixCode),'Test replacement',user.id,'QC_ANALYST');assert.equal((await balance()).availableRetase,0);const links=await tx.execute(query`SELECT active FROM mix_item_clay_retase_sources WHERE column_id=${column.id}::uuid ORDER BY active`);assert.deepEqual(Array.from(links,x=>x.active),[false,true]);});
      await t.test('failed replacement rolls back the release and old mix status',async()=>{await assert.rejects(()=>qc.replaceMix(mix.id,input(5,mix.mixCode),'Fail replacement',user.id,'QC_ANALYST'),constraint('clay_consumption_balance'));assert.equal((await qc.getMixByCode(mix.mixCode))?.id,mix.id);assert.equal((await balance()).availableRetase,0);});
      await t.test('reversal also respects consumed column balance',async()=>{
        const [original]=await tx.select().from(schema.retaseEvents).where(query`${schema.retaseEvents.clayReportColumnId}=${column.id}::uuid AND delta=1`).limit(1);assert.ok(original);
        await assert.rejects(()=>tx.transaction(sp=>sp.insert(schema.retaseEvents).values({requestId:randomUUID(),operationDate:report.operationDate,eventTs:new Date(),shiftCode,crusherId:crusher.id,clayReportId:report.id,clayReportColumnId:column.id,materialKind:'CL',materialCategory:'CLAY',delta:-1,eventType:'REVERSAL',status:'VALID',createdBy:user.id,reversesEventId:original.id,reason:'Rollback-only reversal'})),constraint('clay_consumption_balance'));
      });
      await t.test('wrong shift cannot consume a report',async()=>{await assert.rejects(()=>qc.saveMix({...input(1),shiftCode:otherShift}),constraint('clay_consumption_context'));});
      await t.test('wrong date cannot consume a report',async()=>{await assert.rejects(()=>qc.saveMix({...input(1),operationDate:'2026-08-26'}),constraint('clay_consumption_context'));});
      await t.test('historical column identity remains fixed',async()=>{await assert.rejects(()=>tx.transaction(sp=>sp.update(schema.clayReportColumns).set({headerPrimary:'OTHER'}).where(query`${schema.clayReportColumns.id}=${column.id}::uuid`)),constraint('clay_consumption_identity'));});
      await t.test('releasing part of a mix restores available counter',async()=>{mix=await qc.replaceMix(mix.id,input(2,mix.mixCode),'Reduce used retase',user.id,'QC_ANALYST');assert.equal((await balance()).availableRetase,2);});
      await t.test('unconfirmed columns cannot be consumed',async()=>{await reports.updateColumn(column.id,{status:'PROVISIONAL'});await assert.rejects(()=>qc.saveMix(input(1)),constraint('clay_consumption_context'));await reports.updateColumn(column.id,{status:'CONFIRMED'});});
      throw rollback;
    }),error=>error===rollback);
    assert.equal((await client`SELECT id FROM users WHERE username=${username}`).length,0,'fixtures must not persist');
  }finally{await client.end();}
});

test('Clay migration preserves event constraints on PostgreSQL', async t => {
  const sql = connection();
  try {
    await assert.rejects(sql.begin(async tx => {
      await tx`SET LOCAL statement_timeout = '15s'`;
      await tx`CREATE TEMP TABLE clay_retase_probe (LIKE public.retase_events INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP`;
      const migration = await readFile(new URL('../migrations/0016_clay_retase_event_constraints.sql', import.meta.url), 'utf8');
      const body = migration.trim().replace(/^BEGIN;\s*/i, '').replace(/\s*COMMIT;$/i, '').replaceAll('public.retase_events', 'pg_temp.clay_retase_probe');
      await tx.unsafe(body);
      const base = {
        operation_date: '2026-08-27', shift_code: 'SHIFT_1', crusher_id: randomUUID(),
        event_type: 'MANUAL_CORRECTION', delta: 1, status: 'VALID', created_by: randomUUID(),
        material_kind: 'CL', clay_report_id: randomUUID(), clay_report_column_id: randomUUID(),
        entry_source: 'QC_BACKFILL', entry_batch_id: randomUUID(), reason: 'Regression test',
      };
      const cases: { name: string; patch: Record<string, unknown>; constraint?: string }[] = [
        { name: 'accepts positive Clay backfill without AA', patch: {} },
        { name: 'accepts negative Clay backfill without AA', patch: { delta: -1 } },
        { name: 'accepts direct Clay live dump without AA', patch: { event_type: 'DUMP', entry_source: 'LIVE_COUNTER', entry_batch_id: null } },
        { name: 'keeps Limestone AA requirement', patch: { material_kind: 'LS', clay_report_id: null, clay_report_column_id: null }, constraint: 'retase_aa_snapshot_ck' },
        { name: 'accepts legacy Limestone with AA snapshot', patch: { material_kind: 'LS', clay_report_id: null, clay_report_column_id: null, aa_unit_no_snapshot: 'QA-AA' } },
        { name: 'rejects Clay without report linkage', patch: { clay_report_id: null, clay_report_column_id: null }, constraint: 'retase_aa_snapshot_ck' },
        { name: 'rejects NULL material kind instead of passing unknown CHECK', patch: { material_kind: null }, constraint: 'retase_aa_snapshot_ck' },
        { name: 'rejects LS mislabeled with Clay references', patch: { material_kind: 'LS' }, constraint: 'retase_aa_snapshot_ck' },
        { name: 'rejects negative DUMP', patch: { event_type: 'DUMP', delta: -1 }, constraint: 'retase_reversal_shape_ck' },
        { name: 'rejects negative backfill without batch', patch: { delta: -1, entry_batch_id: null }, constraint: 'retase_reversal_shape_ck' },
        { name: 'rejects negative correction without reason', patch: { delta: -1, reason: '  ' }, constraint: 'retase_reversal_shape_ck' },
        { name: 'rejects negative correction from live source', patch: { delta: -1, entry_source: 'LIVE_COUNTER' }, constraint: 'retase_reversal_shape_ck' },
        { name: 'keeps negative legacy non-reversal forbidden', patch: { delta: -1, material_kind: 'LS', clay_report_id: null, clay_report_column_id: null, aa_unit_no_snapshot: 'QA-AA' }, constraint: 'retase_reversal_shape_ck' },
        { name: 'accepts ordinary reversal', patch: { event_type: 'REVERSAL', delta: -1, clay_report_id: null, clay_report_column_id: null, reverses_event_id: randomUUID() } },
        { name: 'rejects reversal without original event', patch: { event_type: 'REVERSAL', delta: -1 }, constraint: 'retase_reversal_shape_ck' },
      ];
      for (const item of cases) await t.test(item.name, async () => {
        const row = { ...base, ...item.patch, request_id: randomUUID() };
        const write = () => tx.savepoint(async sp => { await sp`INSERT INTO pg_temp.clay_retase_probe ${sp(row)}`; });
        if (item.constraint) await assert.rejects(write, (error: unknown) => {
          const pg = error as { code?: string; constraint_name?: string };
          assert.equal(pg.code, '23514'); assert.equal(pg.constraint_name, item.constraint); return true;
        });
        else await write();
      });
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});

test('Clay repository backfill, retry, correction, and report read with real FKs', { skip: process.env.CLAY_DB_PREVIEW_ONLY === '1' }, async () => {
  const sql = connection(), db = drizzle(sql, { schema });
  const fixtureId = randomUUID(), username = `clay_test_${fixtureId}`;
  try {
    await assert.rejects(db.transaction(async tx => {
      await tx.execute(query`SET LOCAL statement_timeout = '15s'`);
      const [user] = await tx.insert(schema.users).values({ username, displayName: 'Rollback-only Clay test', passwordHash: 'not-a-login-hash', role: 'QC_ANALYST' }).returning();
      const [crusher] = await tx.insert(schema.crushers).values({ code: `TEST_${fixtureId}`, name: 'Rollback-only Clay test', materialKind: 'CL' }).returning();
      assert.ok(user); assert.ok(crusher);
      const shiftCode = `TEST_${fixtureId.slice(0, 8)}`;
      await tx.execute(query`INSERT INTO shifts (code, name, start_time, end_time) VALUES (${shiftCode}, 'Rollback-only shift', '07:00', '15:00')`);
      const repository = createClayReportRepository(tx);
      const report = await repository.createReport({ operationDate: '2026-08-27', shiftCode, crusherId: crusher.id, operatorUserId: null, operatorNameSnapshot: null, createdBy: user.id });
      const column = await repository.createColumn({ reportId: report.id, displayOrder: 0, vendorId: null, sourceId: null, pileId: null, vendorNameSnapshot: null, sourceNameSnapshot: 'Manual test source', headerPrimary: 'TOP', headerSecondary: 'TEST', inputMode: 'MANUAL', status: 'CONFIRMED', tonPerRetaseSnapshot: 20, createdBy: user.id });
      const input = { report, column, eventAt: new Date('2026-08-27T08:00:00+08:00'), delta: 3, requestId: randomUUID(), batchId: randomUUID(), reason: 'Rollback-only positive test', createdBy: user.id };
      await repository.appendHourly(input);
      await repository.appendHourly(input); // retry must not duplicate +3
      assert.equal((await repository.listHourly(report.id))[0]?.retase, 3);
      const correction = { ...input, delta: -1, requestId: randomUUID(), batchId: randomUUID(), reason: 'Rollback-only negative test' };
      await repository.appendHourly(correction);
      await repository.appendHourly(correction); // retry must not duplicate -1
      assert.deepEqual(await repository.listHourly(report.id), [{ columnId: column.id, hour: '08:00', retase: 2, tonnage: 40 }]);
      const current = await repository.findCurrent(report);
      assert.equal(current?.id, report.id);
      // Confirm batch transactions wrote exactly four immutable unit events.
      const events = await tx.select().from(schema.retaseEvents).where(query`${schema.retaseEvents.clayReportId} = ${report.id}::uuid`);
      assert.equal(events.length, 4);
      assert.ok(events.every(event => event.aaId === null && event.aaUnitNoSnapshot === null));
      throw rollback;
    }), error => error === rollback);
    const leftovers = await sql`SELECT id FROM public.users WHERE username = ${username}`;
    assert.equal(leftovers.length, 0, 'fixture transaction must roll back');
  } finally { await sql.end(); }
});
