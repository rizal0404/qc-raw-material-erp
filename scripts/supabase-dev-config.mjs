function resolvePort(name, value, fallback) {
  const normalized = value?.trim() || fallback;
  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return String(port);
}

export function resolveSupabaseDevConfig(environment = process.env) {
  const apiPort = resolvePort('SUPABASE_API_PORT', environment.SUPABASE_API_PORT, '3137');
  const webPort = resolvePort('SUPABASE_WEB_PORT', environment.SUPABASE_WEB_PORT, '5174');
  const webOrigin = `http://localhost:${webPort}`;

  return {
    apiPort,
    webPort,
    webOrigin,
    apiBaseUrl: `http://localhost:${apiPort}/api/v1`,
  };
}
