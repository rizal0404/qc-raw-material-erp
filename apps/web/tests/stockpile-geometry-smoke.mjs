// Only against preview-api.mjs with PREVIEW_STOCKPILE=1 PREVIEW_STOCKPILE_EDIT=1.
// All writes below are to the opt-in in-memory synthetic fixture, never production.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:5285', api = 'http://localhost:5499/api/v1';
const output = resolve('.tmp/stockpile-3d-qa'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [], writes = []; page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.method() === 'PATCH') writes.push(request.postDataJSON()); });
const getMap = async () => (await page.request.get(`${api}/stockpile-map?layoutId=layout-LS&lotStatus=ACTIVE`)).json();
const first = async () => (await getMap()).layers[0];
const handle = name => page.getByRole('button', { name: `Drag ${name} layer`, exact: true });
const center = async locator => { await locator.scrollIntoViewIfNeeded(); const b = await locator.boundingBox(); assert(b); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const drag = async (locator, dx, dy, cancel = false) => {
  const start = await center(locator), count = writes.length;
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + dx, start.y + dy, { steps: 10 });
  assert.equal(writes.length, count, 'no writes while dragging');
  if (cancel) await page.keyboard.press('Escape');
  const savedResponse = !cancel ? page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes('/stockpile-map/layers/')) : null;
  await page.mouse.up();
  if (savedResponse) await savedResponse;
  if (!cancel) await page.waitForFunction(() => document.querySelector('.pile-editor-status')?.textContent.includes('tersimpan'));
  await handle('geser').waitFor();
  assert.equal(writes.length, count + (cancel ? 0 : 1), 'one PATCH per completed changed gesture');
};
try {
  const initial = await getMap();
  assert(initial.layout.name.includes('Preview sintetis') && initial.geometryEditing, 'Only editable synthetic fixture allowed');
  await page.goto(`${origin}/peta-mutu`); await page.locator('.pile-scene canvas').waitFor();
  await page.locator('.pile-layer-chip').first().dblclick();
  await page.getByRole('dialog').waitFor();
  for (const [label, value] of [['Panjang (sumbu tiang)', '2'], ['Lebar dasar (% gudang)', '30'], ['Tinggi (level)', '.45'], ['Posisi awal (sumbu tiang)', '1'], ['Posisi melintang awal (%)', '30'], ['Level bawah', '3.55']]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.screenshot({ path: resolve(output, 'pile-edit-dimensions.png'), fullPage: true });
  await page.getByRole('button', { name: 'Terapkan & simpan' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  let saved = await first(); assert.equal(saved.endPosition, 3); assert.equal(saved.endDepth, 60); assert.equal(saved.topLevel, 4);
  await page.reload(); await page.locator('.pile-scene canvas').waitFor();
  await page.locator('.pile-layer-chip').first().click();
  await page.getByRole('button', { name: 'Edit dimensi', exact: true }).click();
  assert.equal(await page.getByLabel('Lebar dasar (% gudang)').inputValue(), '30');
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  await page.getByRole('button', { name: /Atur layer/ }).click();
  await page.getByRole('button', { name: 'Samping', exact: true }).click();
  const before = saved;
  await drag(handle('panjang'), 32, 0); saved = await first(); assert(saved.endPosition > before.endPosition);
  await drag(handle('tinggi'), 0, 5); saved = await first(); assert(saved.topLevel < before.topLevel);
  await page.getByRole('button', { name: 'Atas', exact: true }).click();
  const widthBefore = saved.endDepth - saved.startDepth;
  await drag(handle('lebar'), 0, 20); saved = await first(); assert.notEqual(saved.endDepth - saved.startDepth, widthBefore);
  const moveBefore = saved;
  await drag(handle('geser'), 25, 12); saved = await first();
  assert.notEqual(saved.startPosition, moveBefore.startPosition); assert.notEqual(saved.startDepth, moveBefore.startDepth);
  assert(Math.abs((saved.endPosition - saved.startPosition) - (moveBefore.endPosition - moveBefore.startPosition)) < .0002);
  await drag(handle('geser'), -20, 0, true); assert.deepEqual(await first(), saved);
  // A real mesh double-click (not a chip or handle) opens the same dimension editor.
  await page.getByRole('button', { name: 'Samping', exact: true }).click();
  let right = await center(handle('panjang')), top = await center(handle('tinggi'));
  await page.mouse.dblclick((right.x + top.x) / 2, (right.y + top.y) / 2);
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  // Body drag uses the same autosave; no explicit save button needed.
  right = await center(handle('panjang')); top = await center(handle('tinggi'));
  const count = writes.length;
  await page.mouse.move((right.x + top.x) / 2, (right.y + top.y) / 2); await page.mouse.down();
  await page.mouse.move((right.x + top.x) / 2 + 20, (right.y + top.y) / 2, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.pile-editor-status')?.textContent.includes('tersimpan'));
  await handle('geser').waitFor(); assert.equal(writes.length, count + 1);
  await page.screenshot({ path: resolve(output, 'pile-edit-handles.png'), fullPage: true });
  await page.getByRole('button', { name: 'Perspektif', exact: true }).click();
  const perspectiveBefore = await first();
  await drag(handle('geser'), 10, -8);
  const perspectiveAfter = await first();
  assert.notEqual(perspectiveAfter.startPosition, perspectiveBefore.startPosition);
  assert.notEqual(perspectiveAfter.startDepth, perspectiveBefore.startDepth);
  assert.equal(perspectiveAfter.bottomLevel, perspectiveBefore.bottomLevel);
  // Reject one write: rollback, lock editing, explicit reconciliation, then retry.
  await page.route('**/stockpile-map/layers/*', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ok:false,code:'STOCKPILE_VERSION_CONFLICT',message:'Konflik versi uji'}) }), { times: 1 });
  const stable = await first(), start = await center(handle('panjang'));
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 20, start.y, { steps: 5 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Muat ulang editor' }).waitFor(); assert.deepEqual(await first(), stable);
  assert(await page.getByRole('button', { name: 'Edit dimensi', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'Muat ulang editor' }).click(); await handle('geser').waitFor();
  const today = await page.locator('input[type=date]').inputValue();
  await page.locator('input[type=date]').fill('2020-01-01'); await page.getByText(/Snapshot historis/).first().waitFor();
  assert(await page.getByRole('button', { name: /Atur layer/ }).isDisabled());
  await page.locator('input[type=date]').fill(today); await page.locator('.pile-layer-chip').first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.pile-layer-chip').first().dblclick(); await page.getByRole('dialog').waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: resolve(output, 'pile-edit-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: dimensions, reload persistence, X/Y/Z resize, move, body drag, perspective move, double-click, Escape, conflict rollback/reload, history, mobile; PATCH count=' + writes.length);
} catch (error) {
  await page.screenshot({ path: resolve(output, 'pile-edit-failure.png'), fullPage: true });
  console.error('Browser errors:', errors); throw error;
} finally { await browser.close(); }
