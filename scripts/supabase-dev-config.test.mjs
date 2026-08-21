import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSupabaseDevConfig } from './supabase-dev-config.mjs';

test('uses isolated default ports and matching browser/API configuration', () => {
  assert.deepEqual(resolveSupabaseDevConfig({}), {
    apiPort: '3137',
    webPort: '5174',
    webOrigin: 'http://localhost:5174',
    apiBaseUrl: 'http://localhost:3137/api/v1',
  });
});

test('keeps custom Supabase ports synchronized', () => {
  assert.deepEqual(resolveSupabaseDevConfig({
    SUPABASE_API_PORT: '4137',
    SUPABASE_WEB_PORT: '6174',
  }), {
    apiPort: '4137',
    webPort: '6174',
    webOrigin: 'http://localhost:6174',
    apiBaseUrl: 'http://localhost:4137/api/v1',
  });
});

test('rejects an invalid port before starting child processes', () => {
  assert.throws(
    () => resolveSupabaseDevConfig({ SUPABASE_WEB_PORT: 'not-a-port' }),
    /SUPABASE_WEB_PORT must be an integer between 1 and 65535/,
  );
});
