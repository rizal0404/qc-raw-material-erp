import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from './config';
import { buildApp } from './application';

const webOrigin = 'http://localhost:5174';

function testConfig(): AppConfig {
  return {
    nodeEnv: 'test',
    version: 'test',
    host: '127.0.0.1',
    port: 3137,
    corsOrigins: [webOrigin],
    databaseTarget: 'local',
    databaseUrl: 'postgresql://postgres:postgres@localhost:5432/qc_raw_material_test',
    databaseSsl: false,
    databasePoolMax: 1,
    counter: { undoWindowMs: 10 * 60 * 1000 },
    auth: {
      cookieName: 'qc_session',
      cookieSecure: false,
      cookieSameSite: 'lax',
      sessionTtlMs: 8 * 60 * 60 * 1000,
      sessionTouchIntervalMs: 5 * 60 * 1000,
      maxLoginFailures: 5,
      loginLockMs: 15 * 60 * 1000,
      passwordPepper: 'test-pepper-that-is-long-enough',
    },
  };
}

describe('API CORS preflight', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('allows %s from the configured web origin', async (method) => {
    const app = await buildApp(testConfig());
    apps.push(app);

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/vendor/shift-reports/report-id/draft',
      headers: {
        origin: webOrigin,
        'access-control-request-method': method,
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(webOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toContain(method);
  });
});

describe('Database migration errors', () => {
  it.each(['loading_assignments', 'qc_retase_allocations'])('reports missing optional-crusher migration for %s without exposing SQL', async table_name => {
    const app = await buildApp(testConfig());
    app.get('/test/missing-migration', async () => {
      throw new Error('SQL with private report content', { cause: Object.assign(new Error('not-null violation'), { code: '23502', table_name, column_name: 'crusher_id' }) });
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/test/missing-migration' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ ok: false, code: 'DATABASE_MIGRATION_REQUIRED', message: expect.stringContaining('0018_optional_assignment_crusher.sql'), requestId: expect.any(String) });
      expect(response.body).not.toContain('private report');
    } finally { await app.close(); }
  });
  it('does not mislabel a missing actual event destination as a migration problem', async () => {
    const app = await buildApp(testConfig());
    app.get('/test/invalid-event', async () => {
      throw Object.assign(new Error('not-null violation'), { code: '23502', table_name: 'retase_events', column_name: 'crusher_id' });
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/test/invalid-event' });
      expect(response.statusCode).toBe(500);
      expect(response.json().code).toBe('INTERNAL_ERROR');
    } finally { await app.close(); }
  });
});
