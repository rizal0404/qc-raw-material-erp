import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
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
const migrationLockName = 'qc_raw_material_schema_migrations';

function withoutOuterTransaction(content: string): string {
  const trimmed = content.trim();
  const match = /^BEGIN;\s*([\s\S]*?)\s*COMMIT;$/i.exec(trimmed);
  return match?.[1] ?? content;
}

let migrationLockAcquired = false;
try {
  console.log(`Migration target: ${migrationConfig.target}${migrationConfig.projectRef ? ` (Supabase ${migrationConfig.projectRef})` : ''}`);
  await sql`SELECT pg_advisory_lock(hashtext(${migrationLockName}))`;
  migrationLockAcquired = true;

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  for (const filename of files) {
    const content = await readFile(resolve(migrationsDir, filename), 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    const [existing] = await sql<{ checksum: string }[]>`SELECT checksum FROM app_schema_migrations WHERE filename = ${filename}`;
    if (existing) {
      if (existing.checksum !== checksum) throw new Error(`Migration checksum changed after apply: ${filename}`);
      console.log(`skip ${filename}`);
      continue;
    }
    console.log(`apply ${filename}`);
    const migrationBody = withoutOuterTransaction(content);
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migrationBody);
      await transaction`INSERT INTO app_schema_migrations(filename, checksum) VALUES (${filename}, ${checksum})`;
    });
  }
  console.log('Database migrations complete.');
} finally {
  if (migrationLockAcquired) {
    await sql`SELECT pg_advisory_unlock(hashtext(${migrationLockName}))`;
  }
  await sql.end();
}
