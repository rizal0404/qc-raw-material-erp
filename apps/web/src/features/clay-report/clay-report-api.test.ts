import { afterEach, expect, it, vi } from 'vitest';
import { getCurrentClayReport } from './clay-report-api';

afterEach(() => vi.unstubAllGlobals());
it('serializes only the business context when reloading a full report after a write', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  const report = { operationDate: '2026-08-18', shiftCode: 'SHIFT_2', crusherId: 'crusher-id', columns: [], note: 'not a query parameter', status: 'DRAFT' };
  await getCurrentClayReport(report);
  const url = new URL(fetch.mock.calls[0]![0]);
  expect([...url.searchParams.keys()]).toEqual(['operationDate', 'shiftCode', 'crusherId']);
  expect(url.searchParams.get('shiftCode')).toBe('SHIFT_2');
});
