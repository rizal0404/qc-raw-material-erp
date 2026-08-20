export type CookieSameSite = 'lax' | 'strict' | 'none';
export type DatabaseTarget = 'local' | 'supabase';

export interface AppConfig {
  nodeEnv: string;
  version: string;
  host: string;
  port: number;
  corsOrigins: string[];
  databaseTarget: DatabaseTarget;
  databaseUrl: string;
  databaseSsl: boolean;
  databasePoolMax: number;
  counter: { undoWindowMs: number; };
  auth: {
    cookieName: string;
    cookieSecure: boolean;
    cookieSameSite: CookieSameSite;
    cookieDomain?: string;
    sessionTtlMs: number;
    sessionTouchIntervalMs: number;
    maxLoginFailures: number;
    loginLockMs: number;
    passwordPepper: string;
  };
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseSameSite(value: string | undefined): CookieSameSite {
  if (value === 'strict' || value === 'none' || value === 'lax') return value;
  return 'lax';
}

function parsePositiveInteger(name: string, value: string | undefined, defaultValue: number): number {
  const parsed = Number(value ?? defaultValue);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseDatabaseTarget(value: string | undefined): DatabaseTarget {
  const normalized = value?.trim().toLowerCase() || 'local';
  if (normalized === 'local' || normalized === 'supabase') return normalized;
  throw new Error('DATABASE_TARGET must be local or supabase');
}

export function loadConfig(): AppConfig {
  const databaseTarget = parseDatabaseTarget(process.env.DATABASE_TARGET);
  const databaseUrl = databaseTarget === 'supabase'
    ? process.env.SUPABASE_DATABASE_URL?.trim()
    : process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(databaseTarget === 'supabase' ? 'SUPABASE_DATABASE_URL is required' : 'DATABASE_URL is required');
  }
  const databaseSsl = parseBoolean(
    databaseTarget === 'supabase' ? process.env.SUPABASE_DATABASE_SSL : process.env.DATABASE_SSL,
    databaseTarget === 'supabase',
  );
  if (databaseTarget === 'supabase' && !databaseSsl) {
    throw new Error('Supabase runtime requires SUPABASE_DATABASE_SSL=true');
  }
  const passwordPepper = process.env.PASSWORD_PEPPER;
  if (!passwordPepper || passwordPepper.length < 24) throw new Error('PASSWORD_PEPPER is required and should be at least 24 characters');

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const cookieSameSite = parseSameSite(process.env.SESSION_COOKIE_SAME_SITE);
  const cookieSecure = parseBoolean(process.env.SESSION_COOKIE_SECURE, nodeEnv === 'production');
  if (cookieSameSite === 'none' && !cookieSecure) throw new Error('SameSite=None requires SESSION_COOKIE_SECURE=true');

  const cookieDomain = process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;
  return {
    nodeEnv,
    version: process.env.APP_VERSION ?? '0.7.0',
    host: process.env.API_HOST ?? '0.0.0.0',
    port: Number(process.env.API_PORT ?? 3000),
    corsOrigins: (process.env.API_CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((x) => x.trim()).filter(Boolean),
    databaseTarget,
    databaseUrl,
    databaseSsl,
    databasePoolMax: parsePositiveInteger(
      databaseTarget === 'supabase' ? 'SUPABASE_DB_POOL_MAX' : 'DB_POOL_MAX',
      databaseTarget === 'supabase' ? process.env.SUPABASE_DB_POOL_MAX : process.env.DB_POOL_MAX,
      databaseTarget === 'supabase' ? 2 : 10,
    ),
    counter: {
      undoWindowMs: Number(process.env.COUNTER_UNDO_MINUTES ?? 10) * 60 * 1000,
    },
    auth: {
      cookieName: process.env.SESSION_COOKIE_NAME ?? 'qc_session',
      cookieSecure,
      cookieSameSite,
      ...(cookieDomain ? { cookieDomain } : {}),
      sessionTtlMs: Number(process.env.SESSION_TTL_HOURS ?? 8) * 60 * 60 * 1000,
      sessionTouchIntervalMs: Number(process.env.SESSION_TOUCH_MINUTES ?? 5) * 60 * 1000,
      maxLoginFailures: Number(process.env.AUTH_MAX_LOGIN_FAILURES ?? 5),
      loginLockMs: Number(process.env.AUTH_LOCK_MINUTES ?? 15) * 60 * 1000,
      passwordPepper,
    },
  };
}
