import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../config';

export async function registerSystemRoutes(app: FastifyInstance, config: AppConfig) {
  app.get('/health', async () => ({
    ok: true as const,
    service: 'qc-api',
    version: config.version,
    time: new Date().toISOString(),
  }));

  app.get('/version', async () => ({ version: config.version }));
}
