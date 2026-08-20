import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadMigrationDatabaseConfig } from './migration-config';

const migrationConfig = loadMigrationDatabaseConfig();
const sql = postgres(migrationConfig.url, {
  prepare: false,
  max: 1,
  ...(migrationConfig.ssl ? { ssl: 'require' as const } : {}),
});

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../migrations');

try {
  console.log(`Verification target: ${migrationConfig.target}${migrationConfig.projectRef ? ` (Supabase ${migrationConfig.projectRef})` : ''}`);

  const expectedFiles = (await readdir(migrationsDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  const applied = await sql<{ filename: string }[]>`SELECT filename FROM app_schema_migrations ORDER BY filename`;
  const appliedFiles = applied.map((row) => row.filename);
  if (JSON.stringify(appliedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`Migration ledger mismatch. Expected ${expectedFiles.join(', ')}, received ${appliedFiles.join(', ')}`);
  }

  const unprotectedTables = await sql<{ table_name: string }[]>`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
    ORDER BY c.relname
  `;
  if (unprotectedTables.length > 0) {
    throw new Error(`RLS is disabled on public tables: ${unprotectedTables.map((row) => row.table_name).join(', ')}`);
  }

  const [viewSecurity] = await sql<{ security_invoker: boolean }[]>`
    SELECT coalesce('security_invoker=true' = ANY(c.reloptions), false) AS security_invoker
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'v_mix_summary'
      AND c.relkind = 'v'
  `;
  if (!viewSecurity?.security_invoker) {
    throw new Error('public.v_mix_summary must use security_invoker=true');
  }

  const exposedRoles = await sql<{ rolname: string }[]>`
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
    ORDER BY rolname
  `;
  for (const { rolname } of exposedRoles) {
    const [access] = await sql<{ schema_usage: boolean; table_access: boolean; sequence_access: boolean; function_access: boolean }[]>`
      SELECT
        has_schema_privilege(${rolname}, 'public', 'USAGE') AS schema_usage,
        EXISTS (
          SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND has_table_privilege(${rolname}, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        ) AS table_access,
        EXISTS (
          SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND CASE
              WHEN c.relkind = 'S' THEN has_sequence_privilege(${rolname}, c.oid, 'USAGE,SELECT,UPDATE')
              ELSE false
            END
        ) AS sequence_access,
        EXISTS (
          SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND has_function_privilege(${rolname}, p.oid, 'EXECUTE')
        ) AS function_access
    `;
    if (access?.schema_usage || access?.table_access || access?.sequence_access || access?.function_access) {
      throw new Error(`Data API role ${rolname} still has privileges in public schema`);
    }
  }

  console.log(`Migration verification complete: ${appliedFiles.length} files, all public tables use RLS, Data API access is closed.`);
} finally {
  await sql.end();
}
