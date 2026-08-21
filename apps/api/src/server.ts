import Fastify from 'fastify';
import { buildApp } from './application';
import { loadConfig } from './config';

// Keep the Fastify import in the runtime entrypoint so Vercel's framework
// detector selects this file instead of the application factory.
void Fastify;

const config = loadConfig();
const app = await buildApp(config);

// Vercel's Fastify runtime serves the exported instance itself. Calling
// listen() there starts a nested HTTP server and can leave the invocation
// waiting indefinitely. Local and persistent deployments still own a port.
if (!process.env.VERCEL) {
  await app.listen({ host: config.host, port: config.port });
}

export default app;
