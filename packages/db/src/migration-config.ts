export interface MigrationDatabaseConfig {
  url: string;
  ssl: boolean;
  target: string;
  projectRef?: string;
}

type MigrationDatabaseTarget = 'local' | 'supabase';

function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} must be true or false`);
}

function inferSupabaseProjectRef(parsed: URL): string | undefined {
  const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(parsed.hostname);
  if (directMatch) return directMatch[1];

  const username = decodeURIComponent(parsed.username);
  const poolerMatch = /\.([a-z0-9]+)$/i.exec(username);
  return poolerMatch?.[1];
}

function parseDatabaseTarget(value: string | undefined): MigrationDatabaseTarget {
  const normalized = value?.trim().toLowerCase() || 'local';
  if (normalized === 'local' || normalized === 'supabase') return normalized;
  throw new Error('MIGRATION_DATABASE_TARGET must be local or supabase');
}

export function loadMigrationDatabaseConfig(): MigrationDatabaseConfig {
  const databaseTarget = parseDatabaseTarget(process.env.MIGRATION_DATABASE_TARGET || process.env.DATABASE_TARGET);
  const targetUrl = databaseTarget === 'supabase'
    ? process.env.SUPABASE_DATABASE_URL?.trim()
    : process.env.DATABASE_URL?.trim();
  const url = process.env.MIGRATION_DATABASE_URL?.trim() || targetUrl;
  if (!url) {
    throw new Error(databaseTarget === 'supabase'
      ? 'MIGRATION_DATABASE_URL or SUPABASE_DATABASE_URL is required'
      : 'MIGRATION_DATABASE_URL or DATABASE_URL is required');
  }

  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Migration database URL must use postgres:// or postgresql://');
  }

  const sslOverride = process.env.MIGRATION_DATABASE_SSL?.trim();
  const targetSsl = databaseTarget === 'supabase'
    ? process.env.SUPABASE_DATABASE_SSL
    : process.env.DATABASE_SSL;
  const ssl = parseBoolean('MIGRATION_DATABASE_SSL', sslOverride || targetSsl, databaseTarget === 'supabase');
  const projectRef = inferSupabaseProjectRef(parsed);
  if (projectRef && !ssl) {
    throw new Error('Supabase migrations require MIGRATION_DATABASE_SSL=true or DATABASE_SSL=true');
  }

  const expectedProjectRef = process.env.MIGRATION_EXPECTED_PROJECT_REF?.trim()
    || (databaseTarget === 'supabase' ? process.env.SUPABASE_PROJECT_REF?.trim() : undefined);
  if (projectRef && !expectedProjectRef) {
    throw new Error('MIGRATION_EXPECTED_PROJECT_REF is required for Supabase migrations');
  }
  if (expectedProjectRef && projectRef !== expectedProjectRef) {
    throw new Error(`Refusing migration: expected Supabase project ${expectedProjectRef}, received ${projectRef ?? 'non-Supabase target'}`);
  }

  const port = parsed.port || '5432';
  const database = parsed.pathname.replace(/^\//, '') || 'postgres';
  return {
    url,
    ssl,
    target: `${parsed.hostname}:${port}/${database}`,
    ...(projectRef ? { projectRef } : {}),
  };
}
