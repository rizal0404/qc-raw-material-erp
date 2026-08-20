import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index';

export interface DatabaseConnectionOptions {
  ssl: boolean;
  max: number;
}

export function createDatabase(url: string, options: DatabaseConnectionOptions) {
  const sql = postgres(url, {
    prepare: false,
    max: options.max,
    ...(options.ssl ? { ssl: 'require' as const } : {}),
  });
  return { db: drizzle(sql, { schema }), sql };
}
