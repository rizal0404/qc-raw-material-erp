import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config';

function configureRequiredEnvironment() {
  vi.stubEnv('PASSWORD_PEPPER', 'test-pepper-that-is-long-enough');
}

afterEach(() => vi.unstubAllEnvs());

describe('API database target configuration', () => {
  it('uses local PostgreSQL by default', () => {
    configureRequiredEnvironment();
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/qc_raw_material');
    vi.stubEnv('DATABASE_SSL', 'false');

    const config = loadConfig();

    expect(config.databaseTarget).toBe('local');
    expect(config.databaseUrl).toContain('localhost:5432');
    expect(config.databaseSsl).toBe(false);
    expect(config.databasePoolMax).toBe(10);
  });

  it('selects the isolated Supabase URL and safe defaults explicitly', () => {
    configureRequiredEnvironment();
    vi.stubEnv('DATABASE_TARGET', 'supabase');
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/qc_raw_material');
    vi.stubEnv('DATABASE_SSL', 'false');
    vi.stubEnv('SUPABASE_DATABASE_URL', 'postgresql://postgres.project:secret@pooler.supabase.com:5432/postgres');

    const config = loadConfig();

    expect(config.databaseTarget).toBe('supabase');
    expect(config.databaseUrl).toContain('pooler.supabase.com');
    expect(config.databaseSsl).toBe(true);
    expect(config.databasePoolMax).toBe(2);
  });

  it('rejects an unknown database target', () => {
    configureRequiredEnvironment();
    vi.stubEnv('DATABASE_TARGET', 'production');
    expect(() => loadConfig()).toThrow('DATABASE_TARGET must be local or supabase');
  });
});
