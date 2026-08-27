// Read-only, loopback-only UI fixture. Never connects to Supabase or application sessions.
// Run manually with: node apps/web/tests/fixtures/preview-api.mjs
import { createServer } from 'node:http';

const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const chemistry = { sio2: 12.6, al2o3: 3.2, fe2o3: 2.4, cao: 43.1, mgo: 1.7, k2o: .4, na2o: .2, so3: .1, h2o: 3 };
const quality = { lsf: 108.6, sm: 2.25, am: 1.33, naeq: .46, r2o3: 18.2 };
const lookup = kind => ({
  ok: true,
  vendors: [{ id: `vendor-${kind}`, code: `V-${kind}`, label: `Vendor Uji ${kind}`, active: true, materialKinds: [kind] }],
  crushers: [{ id: `crusher-${kind}`, code: `CR-${kind}`, label: `Crusher ${kind} 01`, active: true, materialKind: kind, plantId: `plant-${kind}` }],
  plants: [{ id: `plant-${kind}`, code: `P-${kind}`, label: `Plant ${kind}`, active: true, materialKinds: [kind] }],
  piles: [{ id: `pile-${kind}`, code: `PILE-${kind}`, label: `Pile ${kind} 01`, active: true, materialKind: kind, plantId: `plant-${kind}`, className: kind === 'LS' ? 'HIGH' : 'CLAY' }],
  sources: [{ id: `source-${kind}`, code: `SRC-${kind}`, label: `Blok Uji ${kind}`, block: 'A1', active: true, materialKind: kind, materialCategory: 'PILE' }],
  shifts: [{ code: 'SHIFT_1', label: 'Shift 1', startTime: '07:00:00', endTime: '15:00:00' }, { code: 'SHIFT_2', label: 'Shift 2', startTime: '15:00:00', endTime: '23:00:00' }, { code: 'SHIFT_3', label: 'Shift 3', startTime: '23:00:00', endTime: '07:00:00' }],
});
const samples = kind => Array.from({ length: kind === 'LS' ? 6 : 3 }, (_, index) => ({
  id: `sample-${kind}-${index}`, sampleId: `${kind}-${date.replaceAll('-', '')}-${String(index + 1).padStart(3, '0')}`,
  materialKind: kind, operationDate: date, noSample: String(index + 1), sourceShift: '08:00', typeGrade: kind === 'LS' ? 'High grade' : 'Clay',
  vendorId: `vendor-${kind}`, vendorSnapshot: `Vendor Uji ${kind}`, sourceId: `source-${kind}`, sourceSnapshot: `Blok Uji ${kind}`,
  plantId: `plant-${kind}`, loaderUnitNo: 'AM-01', block: 'A1', direction: 'Utara', chemistry, quality, note: null,
  defaultTonPerRetase: 25, mappedRetase: null, retaseSource: 'MANUAL', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}));
const layouts = ['LS', 'CL'].map(kind => ({ id: `layout-${kind}`, code: `WH-${kind}`, name: `Gudang ${kind}`, materialKind: kind, plantId: `plant-${kind}`, plantCode: `P-${kind}`, plantName: `Plant ${kind}`, axisLength: 12, maxLevel: 4, postMarks: [{ position: 0, label: '0' }, { position: 6, label: '6' }, { position: 12, label: '12' }], hopperSide: 'START', active: true }));

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost:5399');
  const kind = url.searchParams.get('materialKind') === 'CL' ? 'CL' : 'LS';
  const route = url.pathname.replace('/api/v1', '');
  response.setHeader('content-type', 'application/json');
  response.setHeader('access-control-allow-origin', 'http://localhost:5185');
  response.setHeader('access-control-allow-credentials', 'true');
  const send = (data, status = 200) => { response.statusCode = status; response.end(JSON.stringify(data)); };
  if (request.method === 'OPTIONS') { response.setHeader('access-control-allow-headers', 'content-type'); return send({ ok: true }); }
  if (request.method !== 'GET') return send({ ok: false, code: 'PREVIEW_READ_ONLY', message: 'Preview UI hanya baca; tidak ada data yang disimpan.' }, 405);
  if (route === '/auth/session') return send({ ok: true, authenticated: true, user: { id: 'preview-user', username: 'ui-preview', displayName: 'Preview UI', role: process.env.PREVIEW_ROLE || 'SUPERVISOR_ADMIN', status: 'ACTIVE', vendorId: null, crusherIds: ['crusher-LS', 'crusher-CL'], lastLoginAt: new Date().toISOString() }, session: { expiresAt: new Date(Date.now() + 3600000).toISOString() } });
  if (route === '/lookups/master') return send(lookup(kind));
  if (route === '/lookups/equipment') return send({ ok: true, items: [{ id: `am-${kind}`, unitNo: `AM-${kind}`, label: `Alat Muat ${kind}`, active: true, vendorId: `vendor-${kind}`, type: 'AM', materialKinds: [kind] }] });
  if (route === '/samples' || route === '/workbench/samples') return send({ ok: true, items: samples(kind), total: samples(kind).length });
  if (route === '/workbench/clay-retase') return send({ok:true,items:url.searchParams.get('shiftCode')==='SHIFT_1'?[
    {columnId:'clay-top',reportId:'report-clay',operationDate:date,shiftCode:'SHIFT_1',crusherName:'Clay Crusher Tonasa 5',reportStatus:'SUBMITTED',columnStatus:'CONFIRMED',headerPrimary:'TOP',headerSecondary:'BONTOA',vendorId:null,vendorName:null,sourceId:null,sourceName:'Top Bontoa',totalRetase:10,consumedRetase:0,availableRetase:10},
    {columnId:'clay-buffer',reportId:'report-clay',operationDate:date,shiftCode:'SHIFT_1',crusherName:'Clay Crusher Tonasa 5',reportStatus:'SUBMITTED',columnStatus:'CONFIRMED',headerPrimary:'BUFFER',headerSecondary:'TRASS',vendorId:null,vendorName:null,sourceId:null,sourceName:'Buffer Trass',totalRetase:7,consumedRetase:0,availableRetase:7},
  ]:[]});
  if (route === '/mixes' || route === '/workbench/retase-suggestions') return send({ ok: true, items: [], total: 0 });
  if (route === '/stockpile-map/layouts') return send({ ok: true, items: layouts });
  if (route === '/stockpile-map') return send({ ok: true, asOf: date, isHistorical: false, layout: layouts.find(item => item.id === url.searchParams.get('layoutId')) || layouts[0], zones: [], lots: [], layers: [], reclaimer: null, counts: { activeLots: 0, reclaimedLots: 0, unplacedMixes: 0 } });
  if (route.startsWith('/reports/')) return send({ ok: true, items: [] });
  if (route === '/vendor/shift-reports/current') return send({ ok: true, item: null });
  if (route === '/clay-reports/current') return send({ ok: false, code: 'NOT_FOUND', message: 'Belum ada laporan pada preview ini.' }, 404);
  if (route === '/reconciliation') return send({ ok: true, items: [], exceptions: [], summary: { assignmentCount: 0, observedRetase: 0, reservedRetase: 0, remainingRetase: 0, reviewRequired: 0, unassignedEvents: 0, ambiguousEvents: 0 } });
  if (route === '/counter/context') return send({ ok: true, crusher: { name: 'Crusher LS 01', materialKind: 'LS' }, canRecord: false, requested: { operationDate: date, shiftCode: 'SHIFT_1' }, current: { localDate: date, localTime: '12:00' }, assignmentCount: 0, submittedReportCount: 0, operationalAssignmentCount: 0 });
  if (route === '/retase-summary') return send({ ok: true, summary: { totalNet: 0, dumpEvents: 0, reversalEvents: 0, unassignedEvents: 0, ambiguousEvents: 0, hourly: [], byAa: [], byAm: [], byVendor: [] } });
  return send({ ok: true, items: [], total: 0 });
});
server.listen(5399, '127.0.0.1', () => console.log('Read-only UI fixture at http://localhost:5399 (synthetic data only)'));
