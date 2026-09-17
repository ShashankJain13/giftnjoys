import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { createApp } from './app';
import { createContext } from './context';
import { loadEnv } from './env';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env.local'));
} catch {
  // Environment may be provided by the shell.
}

const env = loadEnv();
const ctx = createContext(env);
serve({ fetch: createApp(ctx).fetch, port: env.PUBLIC_API_PORT }, (info) => {
  ctx.log.info('public-api.listening', { url: `http://localhost:${info.port}`, catalogTtlSeconds: env.CATALOG_TTL_SECONDS });
});
