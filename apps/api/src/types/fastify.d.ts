import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import type * as schema from '@qc/db/schema';
import type { AuthPrincipal } from '@qc/domain';
import type { AuthGuards } from '../modules/iam/guards';

declare module 'fastify' {
  interface FastifyInstance {
    db: PostgresJsDatabase<typeof schema>;
    sql: Sql;
    auth: AuthGuards;
  }

  interface FastifyRequest {
    principal?: AuthPrincipal;
  }
}
