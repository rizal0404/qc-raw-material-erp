import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { migrationChecksumMatches, migrationChecksums } from './migration-checksum';
import { loadMigrationDatabaseConfig } from './migration-config';

const managedVariables = [
  'DATABASE_TARGET',
  'DATABASE_URL',
  'DATABASE_SSL',
  'MIGRATION_DATABASE_TARGET',
  'MIGRATION_DATABASE_URL',
  'MIGRATION_DATABASE_SSL',
  'MIGRATION_EXPECTED_PROJECT_REF',
  'SUPABASE_DATABASE_URL',
  'SUPABASE_DATABASE_SSL',
  'SUPABASE_PROJECT_REF',
] as const;
const originalEnvironment = new Map(managedVariables.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of managedVariables) delete process.env[name];
});

afterEach(() => {
  for (const name of managedVariables) {
    const original = originalEnvironment.get(name);
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

describe('migration database target configuration', () => {
  it('uses local PostgreSQL by default', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/qc_raw_material';
    const config = loadMigrationDatabaseConfig();
    assert.equal(config.ssl, false);
    assert.equal(config.projectRef, undefined);
    assert.equal(config.target, 'localhost:5432/qc_raw_material');
  });

  it('selects Supabase with SSL and an independent project guard', () => {
    process.env.MIGRATION_DATABASE_TARGET = 'supabase';
    process.env.SUPABASE_DATABASE_URL = 'postgresql://postgres.tejxcxlpoksittppontc:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
    process.env.SUPABASE_PROJECT_REF = 'tejxcxlpoksittppontc';

    const config = loadMigrationDatabaseConfig();

    assert.equal(config.ssl, true);
    assert.equal(config.projectRef, 'tejxcxlpoksittppontc');
    assert.equal(config.target, 'aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres');
  });

  it('refuses a Supabase URL for a different project', () => {
    process.env.MIGRATION_DATABASE_TARGET = 'supabase';
    process.env.SUPABASE_DATABASE_URL = 'postgresql://postgres.wrongproject:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
    process.env.SUPABASE_PROJECT_REF = 'tejxcxlpoksittppontc';

    assert.throws(
      () => loadMigrationDatabaseConfig(),
      /expected Supabase project tejxcxlpoksittppontc, received wrongproject/,
    );
  });
});

describe('migration checksum portability', () => {
  it('uses an LF-canonical checksum on Windows and accepts a legacy raw checksum', () => {
    const lf = 'BEGIN;\nSELECT 1;\nCOMMIT;\n';
    const crlf = lf.replace(/\n/g, '\r\n');

    assert.equal(migrationChecksums(lf).canonical, migrationChecksums(crlf).canonical);
    assert.equal(migrationChecksumMatches(migrationChecksums(crlf).legacy, crlf), true);
  });
});
