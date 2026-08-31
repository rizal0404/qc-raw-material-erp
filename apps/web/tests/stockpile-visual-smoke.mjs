// Run against the opt-in read-only fixture, never an operational API.
// PREVIEW_PORT=5499 PREVIEW_ORIGIN=http://localhost:5285 PREVIEW_STOCKPILE=1 node tests/fixtures/preview-api.mjs
// VITE_API_BASE_URL=http://localhost:5499/api/v1 vite --port 5285
// PLAYWRIGHT_MODULE may point to a bundled Playwright entrypoint.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.PILE_PREVIEW_URL || 'http://localhost:5285';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Preview must use loopback');
const output = resolve(process.env.PILE_QA_OUTPUT || '.tmp/stockpile-3d-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${origin}/peta-mutu`);
  await page.getByText('Gudang LS · Preview sintetis', { exact: true }).waitFor();
  await page.locator('.pile-scene canvas').waitFor();
  await page.getByText('LOT 21', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'pile-3d-overview.png'), fullPage: true });
  await page.locator('.pile-scene').screenshot({ path: resolve(output, 'pile-3d-scene.png') });
  // Select the visible front face of the first pile in the default camera.
  const box = await page.locator('.pile-scene canvas').boundingBox();
  await page.locator('.pile-scene canvas').click({ position: { x: box.width * .32, y: box.height * .55 } });
  await page.locator('.stockpile-detail .pile-detail-position').waitFor();
  assert.equal(await page.locator('.pile-layer-chip[aria-pressed=true]').count(), 1);
  await page.getByLabel('Fokus layer terpilih').check();
  await page.getByLabel('Pisahkan layer', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.screenshot({ path: resolve(output, 'pile-3d-inspect.png'), fullPage: true });
  await page.getByRole('button', { name: 'Samping', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'pile-3d-side.png'), fullPage: true });
  await page.getByRole('button', { name: 'Atas', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'pile-3d-top.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reset tampilan', exact: true }).click();
  assert.equal(await page.getByLabel('Pisahkan layer', { exact: true }).inputValue(), '0');
  await page.getByLabel('Geser posisi REC', { exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByLabel('Geser posisi REC', { exact: true }).inputValue(), '7.2');
  assert.equal(await page.getByRole('button', { name: 'Simpan REC', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: /2D Layer/ }).click();
  await page.getByRole('img', { name: /Peta mutu Gudang LS/ }).waitFor();
  assert.equal(await page.locator('.pile-layer-chip[aria-pressed=true]').count(), 1);
  await page.getByRole('button', { name: /3D Pile/ }).click();
  await page.locator('.pile-scene canvas').waitFor();
  const today = await page.locator('input[type=date]').inputValue();
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  await page.locator('input[type=date]').fill(yesterday);
  await page.getByText(/Snapshot historis/, { exact: false }).first().waitFor();
  assert.equal(await page.getByLabel('Geser posisi REC', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '+ Tambah layer', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Hari ini', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#pile-rec-position').disabled);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.pile-scene canvas').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, 'pile-3d-mobile.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile page must not overflow horizontally');
  // Loss of a real initialized context must switch to the usable 2D map.
  await page.locator('.pile-scene canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByText(/Peta 2D tetap dapat digunakan/).waitFor();
  await page.getByRole('img', { name: /Peta mutu Gudang LS/ }).waitFor();
  assert.deepEqual(errors, []);
  // Clay uses the same viewport, its own layout and SM legend.
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${origin}/peta-mutu?material=CL`);
  await page.getByText('Gudang CL · Preview sintetis', { exact: true }).waitFor();
  await page.locator('.pile-scene canvas').waitFor();
  await page.getByRole('button', { name: 'SM', exact: true }).click();
  await page.getByText('SM < 2,3', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'pile-3d-clay.png'), fullPage: true });
  await page.getByLabel(/Tampilan lot/).selectOption('RECLAIMED');
  await page.getByText('Belum ada layer pada tampilan ini.', { exact: true }).waitFor();
  assert.equal(await page.locator('.pile-layer-chip').count(), 0);
  assert.deepEqual(errors, []);
  // Test the no-WebGL startup path in a fresh browser context.
  const noGpu = await browser.newContext();
  await noGpu.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' || type === 'webgl' ? null : original.call(this, type, ...args);
    };
  });
  const fallback = await noGpu.newPage();
  await fallback.goto(`${origin}/peta-mutu`);
  await fallback.getByText(/Peta 2D tetap dapat digunakan/).waitFor();
  await fallback.getByRole('img', { name: /Peta mutu Gudang LS/ }).waitFor();
  await fallback.screenshot({ path: resolve(output, 'pile-2d-fallback.png'), fullPage: true });
  await noGpu.close();
  console.log(JSON.stringify({ passed: ['3D render', 'mesh selection', 'isolation', 'separation', 'camera presets', 'REC sync', 'history read-only', 'mobile layout', 'WebGL loss', 'no-WebGL fallback', 'Clay layout/SM legend', 'empty lot filter'], output, errors }));
} finally {
  await browser.close();
}
