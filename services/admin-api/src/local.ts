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
const app = createApp(ctx);

serve({ fetch: app.fetch, port: env.ADMIN_API_PORT }, (info) => {
  ctx.log.info('admin-api.listening', { url: `http://localhost:${info.port}`, auth: env.AUTH_MODE, email: env.EMAIL_TRANSPORT });
});
