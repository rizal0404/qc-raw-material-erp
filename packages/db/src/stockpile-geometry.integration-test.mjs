// Isolated PostgreSQL/WASM test. No .env, connection URL, or operational database.
// npm install --prefix .tmp/stockpile-sql-runtime --no-audit --no-fund @electric-sql/pglite
// STOCKPILE_PGLITE_MODULE=file:///.../pglite/dist/index.js node --import=tsx src/stockpile-geometry.integration-test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { createStockpileMapRepository } from './repositories/stockpile-map.repository.ts';

if (!process.env.STOCKPILE_PGLITE_MODULE) throw new Error('Set STOCKPILE_PGLITE_MODULE to a local PGlite module (isolated test only).');
const resolution = registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@electric-sql/pglite') return { url: process.env.STOCKPILE_PGLITE_MODULE, shortCircuit: true };
  return next(specifier, context);
} });
const { drizzle } = await import('drizzle-orm/pglite');
const { PGlite } = await import(process.env.STOCKPILE_PGLITE_MODULE);
const pg = new PGlite(); // No dataDir = ephemeral in-memory PostgreSQL.
// Production uses postgres-js, whose execute() returns rows directly.
function adapter(db) {
  return new Proxy(db, { get(target, property) {
    if (property === 'execute') return async (...args) => (await target.execute(...args)).rows;
    if (property === 'transaction') return callback => target.transaction(tx => callback(adapter(tx)));
    const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
  } });
}
const repository = createStockpileMapRepository(adapter(drizzle(pg)));
const ids = Object.fromEntries(['user', 'plant', 'pile', 'layout', 'lot', 'layer', 'mix1', 'mix2', 'mix3'].map(key => [key, randomUUID()]));
const execute = (sql, params = []) => pg.query(sql, params);
try {
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE app_schema_migrations(filename text primary key,checksum text,applied_at timestamptz default now());');
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
  for (const name of files.filter(name => name < '0022')) {
    // pgcrypto is not bundled; gen_random_uuid() is built into the PG engine.
    const sql = (await readFile(new URL(name, directory), 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
    // Existing 0020 uses RESERVED in the same transaction as ADD VALUE (PG 55P04).
    // Test bootstrap only: precommit that value; never rewrite an applied migration.
    if (name === '0020_reconciliation_reserved_status.sql') await pg.exec("ALTER TYPE mapping_status ADD VALUE IF NOT EXISTS 'RESERVED' AFTER 'SUGGESTED';");
    await pg.exec(sql);
  }
  await execute("INSERT INTO users(id,username,display_name,password_hash,role) VALUES($1,'geometry-test','Synthetic QA','not-a-login','QC_ANALYST')", [ids.user]);
  await execute("INSERT INTO plants(id,code,name) VALUES($1,'GEOMETRY_TEST','Geometry test')", [ids.plant]);
  await execute("INSERT INTO plant_material_scopes(plant_id,material_kind) VALUES($1,'LS')", [ids.plant]);
  await execute("INSERT INTO piles(id,code,name,material_kind,plant_id) VALUES($1,'GEOMETRY_TEST','Synthetic pile','LS',$2)", [ids.pile, ids.plant]);
  await execute("INSERT INTO shifts(code,name,start_time,end_time) VALUES('GEOMETRY_TEST','QA','00:00','08:00')");
  for (const id of [ids.mix1, ids.mix2, ids.mix3]) await execute("INSERT INTO mixes(id,mix_code,material_kind,operation_date,pile_id,plant_id,shift_code,location_ref,default_ton_per_retase,created_by,batch_no) VALUES($1::uuid,$1::uuid::text,'LS','2020-01-01',$2,$3,'GEOMETRY_TEST','QA',25,$4,1)", [id, ids.pile, ids.plant, ids.user]);
  await execute("INSERT INTO warehouse_layouts(id,code,name,material_kind,plant_id,axis_length,max_level) VALUES($1,'GEOMETRY_TEST','Synthetic warehouse','LS',$2,12,4)", [ids.layout, ids.plant]);
  await execute("INSERT INTO stockpile_lots(id,layout_id,logical_pile_id,lot_no,pile_cycle,created_by) VALUES($1,$2,$3,'1',1,$4)", [ids.lot, ids.layout, ids.pile, ids.user]);
  await execute("INSERT INTO stockpile_lot_versions(lot_id,layout_id,logical_pile_id,lot_no,lot_no_mode,pile_cycle,status,effective_at,changed_by) VALUES($1,$2,$3,'1','PILE_CYCLE',1,'ACTIVE','2020-01-01',$4)", [ids.lot, ids.layout, ids.pile, ids.user]);
  await execute("INSERT INTO stockpile_layers(id,lot_id,start_position,end_position,bottom_level,top_level,created_by) VALUES($1,$2,1,3,1,2,$3)", [ids.layer, ids.lot, ids.user]);
  await execute("INSERT INTO stockpile_layer_mixes(layer_id,mix_id) VALUES($1,$2)", [ids.layer, ids.mix1]);
  await execute("INSERT INTO stockpile_layer_versions(layer_id,lot_id,start_position,end_position,bottom_level,top_level,version,mix_ids,effective_at,changed_by) VALUES($1,$2,1,3,.5,1.5,1,$3,'2020-01-01',$4)", [ids.layer, ids.lot, JSON.stringify([ids.mix1]), ids.user]);

  await pg.exec(await readFile(new URL('0022_stockpile_layer_depth.sql', directory), 'utf8'));
  let current = await repository.findLayer(ids.layer);
  assert.equal(current.startDepth, 9.75); assert.equal(current.endDepth, 90.25);
  const historic = (await repository.listLayers(ids.layout, 'ALL', new Date('2021-01-01')))[0];
  assert.equal(historic.startDepth, 4.875); assert.equal(historic.endDepth, 95.125); // Uses THAT version's bottom level.
  await assert.rejects(execute('UPDATE stockpile_layers SET end_depth=101 WHERE id=$1', [ids.layer]));
  await assert.rejects(execute('UPDATE stockpile_layer_versions SET end_depth=start_depth WHERE layer_id=$1', [ids.layer]));

  const update = { id: ids.layer, layoutId: ids.layout, expectedVersion: 1, label: 'Edited', startPosition: 1.5, endPosition: 3.5, bottomLevel: 1, topLevel: 2,
    startDepth: 20, endDepth: 50, mixIds: [ids.mix1], actorUserId: ids.user };
  await repository.updateLayer(update);
  current = await repository.findLayer(ids.layer);
  assert.equal(current.version, 2); assert.equal(current.startPosition, 1.5); assert.equal(current.endDepth, 50);
  const versions = (await execute('SELECT version,start_depth,end_depth FROM stockpile_layer_versions WHERE layer_id=$1 ORDER BY version', [ids.layer])).rows;
  assert.equal(versions.length, 2); assert.equal(Number(versions[1].end_depth), 50);
  assert.equal((await repository.listLayers(ids.layout, 'ALL', new Date('2021-01-01')))[0].startDepth, 4.875);
  await assert.rejects(repository.updateLayer(update), /STOCKPILE_VERSION_CONFLICT/);

  const create = { layoutId: ids.layout, lot: { logicalPileId: ids.pile, lotNo: '2', lotNoMode: 'MANUAL', pileCycle: 1 },
    layer: { label: null, startPosition: 1.5, endPosition: 3.5, bottomLevel: 1, topLevel: 2, startDepth: 60, endDepth: 80 }, mixIds: [ids.mix2], actorUserId: ids.user };
  const second = await repository.createLayer(create); // Same X/Y, disjoint Z is valid.
  await assert.rejects(repository.updateLayer({ ...update, expectedVersion: 2, endDepth: 70 }), /STOCKPILE_LAYER_COLLISION/);
  assert.equal((await repository.findLayer(ids.layer)).version, 2);
  assert.equal((await execute('SELECT count(*)::int AS count FROM stockpile_layer_versions WHERE layer_id=$1', [ids.layer])).rows[0].count, 2);
  // Touching faces are valid, not an overlap.
  await repository.updateLayer({ ...update, expectedVersion: 2, endDepth: 60 });
  await repository.updateLot({ id: second.lotId, status: 'RECLAIMED', lotNo: '2', lotNoMode: 'MANUAL', actorUserId: ids.user });
  await assert.rejects(repository.updateLayer({ ...update, id: second.layerId, expectedVersion: 1, mixIds: [ids.mix2] }), /STOCKPILE_LOT_RECLAIMED/);
  await repository.createLayer({ ...create, lot: { ...create.lot, lotNo: '3' }, layer: { ...create.layer, startDepth: 70, endDepth: 95 }, mixIds: [ids.mix3] });
  await assert.rejects(repository.updateLot({ id: second.lotId, status: 'ACTIVE', lotNo: '2', lotNoMode: 'MANUAL', actorUserId: ids.user }), /STOCKPILE_LAYER_COLLISION/);
  const security = (await execute("SELECT relrowsecurity FROM pg_class WHERE oid IN ('stockpile_layers'::regclass,'stockpile_layer_versions'::regclass)")).rows;
  assert(security.every(row => row.relrowsecurity));
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await execute("SELECT has_table_privilege($1,'stockpile_layers','UPDATE') AS allowed", [role])).rows[0].allowed, false);
  console.log('PASS: migration 0022 with legacy bootstrap prerequisites, legacy/history backfill, constraints, repository update/read, versions, stale-write rejection, 3D collision/edge touching, reclaimed guard, reactivation, rollback, RLS/grants.');
} finally { await pg.close(); resolution.deregister(); }
