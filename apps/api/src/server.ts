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

// Vercel serverless: export the Fastify instance as the default handler.
// Vercel intercepts this export and routes incoming requests through it.
// Local/VPS: detect direct execution and start the persistent listener.
const isVercel = !!process.env.VERCEL;

if (!isVercel) {
  await app.listen({ host: config.host, port: config.port });
}

export default async (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
  await app.ready();
  app.server.emit('request', req, res);
};
