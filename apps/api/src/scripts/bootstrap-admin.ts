import { createDatabase, createIamRepository } from '@qc/db';
import { loadConfig } from '../config';
import { createArgonPasswordHasher } from '../security/password';
import { createSessionTokenCodec } from '../security/session-token';
import { createAuthService } from '../modules/iam/service';

const config = loadConfig();
const username = process.env.BOOTSTRAP_ADMIN_USERNAME ?? 'admin';
const displayName = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME ?? 'Supervisor Admin';
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!password || password.length < 12) {
  throw new Error('BOOTSTRAP_ADMIN_PASSWORD minimal 12 karakter dan wajib diisi.');
}

const database = createDatabase(config.databaseUrl, { ssl: config.databaseSsl, max: 1 });
try {
  const repository = createIamRepository(database.db);
  const service = createAuthService({
    repository,
    passwordHasher: createArgonPasswordHasher({ pepper: config.auth.passwordPepper }),
    tokenCodec: createSessionTokenCodec(),
    sessionTtlMs: config.auth.sessionTtlMs,
    maxLoginFailures: config.auth.maxLoginFailures,
    loginLockMs: config.auth.loginLockMs,
    sessionTouchIntervalMs: config.auth.sessionTouchIntervalMs,
  });
  const user = await service.bootstrapAdmin(username, displayName, password);
  console.log(`Bootstrap admin created: ${user.username} (${user.id})`);
} finally {
  await database.sql.end();
}
