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
