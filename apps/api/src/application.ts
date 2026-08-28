import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { createClayReportRepository, createDatabase, createIamRepository, createMasterRepository, createQcRepository, createVendorOperationRepository, createRetaseRepository, createReconciliationRepository, createStockpileMapRepository } from '@qc/db';
import type { AppConfig } from './config';
import { AppError } from './lib/errors';
import { registerSystemRoutes } from './modules/system/routes';
import { createAuthGuards } from './modules/iam/guards';
import { registerIamRoutes } from './modules/iam/routes';
import { createAuthService } from './modules/iam/service';
import { createArgonPasswordHasher } from './security/password';
import { createSessionTokenCodec } from './security/session-token';
import { registerMasterRoutes } from './modules/master/routes';
import { createMasterService } from './modules/master/service';
import { registerQcRoutes } from './modules/qc/routes';
import { createQcService } from './modules/qc/service';
import { registerVendorOperationRoutes } from './modules/vendor-operation/routes';
import { createVendorOperationService } from './modules/vendor-operation/service';
import { registerRetaseRoutes } from './modules/retase/routes';
import { createRetaseService } from './modules/retase/service';
import { registerReconciliationRoutes } from './modules/reconciliation/routes';
import { createReconciliationService } from './modules/reconciliation/service';
import { registerStockpileMapRoutes } from './modules/stockpile-map/routes';
import { createStockpileMapService } from './modules/stockpile-map/service';
import { registerClayReportRoutes } from './modules/clay-report/routes';
import { createClayReportService } from './modules/clay-report/service';

function isAllowedOrigin(config: AppConfig, origin: string | undefined): boolean {
  if (!origin) return true;
  return config.corsOrigins.includes(origin);
}

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: true, genReqId: () => crypto.randomUUID() });
  const database = createDatabase(config.databaseUrl, { ssl: config.databaseSsl, max: config.databasePoolMax });
  const iamRepository = createIamRepository(database.db);
  const masterRepository = createMasterRepository(database.db);
  const masterService = createMasterService(masterRepository);
  const qcRepository = createQcRepository(database.db);
  const qcService = createQcService(qcRepository, masterRepository);
  const vendorOperationRepository = createVendorOperationRepository(database.db);
  const vendorOperationService = createVendorOperationService(vendorOperationRepository, masterRepository);
  const retaseRepository = createRetaseRepository(database.db);
  const retaseService = createRetaseService(retaseRepository, masterRepository, { undoWindowMs: config.counter.undoWindowMs });
  const reconciliationRepository = createReconciliationRepository(database.db);
  const reconciliationService = createReconciliationService(reconciliationRepository);
  const stockpileMapRepository = createStockpileMapRepository(database.db);
  const stockpileMapService = createStockpileMapService(stockpileMapRepository, masterRepository, qcRepository);
  const clayReportRepository = createClayReportRepository(database.db);
  const clayReportService = createClayReportService(clayReportRepository, masterRepository);
  const authService = createAuthService({
    repository: iamRepository,
    passwordHasher: createArgonPasswordHasher({ pepper: config.auth.passwordPepper }),
    tokenCodec: createSessionTokenCodec(),
    sessionTtlMs: config.auth.sessionTtlMs,
    maxLoginFailures: config.auth.maxLoginFailures,
    loginLockMs: config.auth.loginLockMs,
    sessionTouchIntervalMs: config.auth.sessionTouchIntervalMs,
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(cookie);
  await app.register(swagger, {
    openapi: {
      info: { title: 'QC Raw Material API', version: config.version },
      servers: [{ url: '/api/v1' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.decorate('db', database.db);
  app.decorate('sql', database.sql);
  app.decorate('auth', createAuthGuards(authService, config));

  app.addHook('onRequest', async (request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (!isAllowedOrigin(config, origin)) {
      throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origin request tidak diizinkan.');
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error(error); else request.log.warn({ code: error.code }, error.message);
      return reply.status(error.statusCode).send({
        ok: false,
        code: error.code,
        message: error.message,
        requestId: request.id,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'Payload request tidak valid.',
        requestId: request.id,
        details: { issues: error.issues },
      });
    }
    const postgresCode = (error as { code?: string; cause?: { code?: string } }).code
      ?? (error as { cause?: { code?: string } }).cause?.code;
    if (postgresCode === '23502') {
      const pgError = error as { table_name?: string; column_name?: string; cause?: { table_name?: string; column_name?: string } };
      const table = pgError.table_name ?? pgError.cause?.table_name;
      const column = pgError.column_name ?? pgError.cause?.column_name;
      if (column === 'crusher_id' && (table === 'loading_assignments' || table === 'qc_retase_allocations')) {
        request.log.error({ code: postgresCode, table, column }, 'Optional crusher migration is missing on the API database.');
        return reply.status(503).send({
          ok: false, code: 'DATABASE_MIGRATION_REQUIRED',
          message: 'Database API belum mendukung crusher opsional. Terapkan migrasi 0018_optional_assignment_crusher.sql pada database yang digunakan API, lalu coba simpan kembali.',
          requestId: request.id,
        });
      }
    }
    if (postgresCode === '23505') {
      return reply.status(409).send({ ok: false, code: 'UNIQUE_CONSTRAINT', message: 'Data dengan business key yang sama sudah ada.', requestId: request.id });
    }
    if (postgresCode === '23503') {
      return reply.status(409).send({ ok: false, code: 'REFERENCE_CONFLICT', message: 'Data masih direferensikan atau foreign key tidak valid.', requestId: request.id });
    }
    if (postgresCode === '23514') {
      const constraint=(error as {constraint_name?:string;cause?:{constraint_name?:string}}).constraint_name??(error as {cause?:{constraint_name?:string}}).cause?.constraint_name;
      const clayErrors:Record<string,string>={
        clay_consumption_balance:'Retase Clay tidak cukup atau sudah dipakai mixing. Muat ulang retase; untuk mengurangi laporan, kurangi pemakaian melalui Replace Mix terlebih dahulu.',
        clay_consumption_context:'Kolom laporan Clay harus CONFIRMED, aktif, serta sesuai tanggal dan shift mixing. Periksa sumber retase yang dipilih.',
        clay_consumption_identity:'Identitas kolom Clay sudah dipakai mixing dan harus dipertahankan untuk riwayat. Buat kolom baru untuk sumber berbeda.',
        clay_consumption_immutable:'Pemakaian retase Clay hanya dapat diubah melalui Replace Mix.',
      };
      if(constraint&&clayErrors[constraint])return reply.status(409).send({ok:false,code:constraint.toUpperCase(),message:clayErrors[constraint],requestId:request.id});
      return reply.status(400).send({ ok: false, code: 'CONSTRAINT_VIOLATION', message: 'Data melanggar aturan integritas database.', requestId: request.id });
    }
    request.log.error(error);
    return reply.status((error as { statusCode?: number }).statusCode ?? 500).send({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan pada server.',
      requestId: request.id,
    });
  });

  app.get('/', async () => ({
    ok: true as const,
    service: 'qc-api',
    version: config.version,
    documentation: '/docs',
    health: '/api/v1/health',
  }));

  await app.register(async (v1) => {
    await registerSystemRoutes(v1, config);
    await registerIamRoutes(v1, config, authService, masterService);
    await registerMasterRoutes(v1, masterService);
    await registerQcRoutes(v1, qcService);
    await registerVendorOperationRoutes(v1, vendorOperationService);
    await registerRetaseRoutes(v1, retaseService);
    await registerReconciliationRoutes(v1, reconciliationService);
    await registerStockpileMapRoutes(v1, stockpileMapService);
    await registerClayReportRoutes(v1, clayReportService);
    // Next slices: operations-reporting/audit explorer.
  }, { prefix: '/api/v1' });

  app.addHook('onClose', async () => database.sql.end());
  return app;
}
