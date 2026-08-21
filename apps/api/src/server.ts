import Fastify from 'fastify';
import { loadConfig } from './config';

// Keep the Fastify import in the runtime entrypoint so Vercel's framework
// detector selects this file instead of the application factory.
void Fastify;

console.info('[startup] Loading API configuration');
const config = loadConfig();
console.info('[startup] API configuration loaded');
const { buildApp } = await import('./application');
const app = await buildApp(config);
console.info('[startup] Fastify application ready');
await app.listen({ host: config.host, port: config.port });
