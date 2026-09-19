import { AppError, isAppError } from '@gnj/core';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError } from 'zod';
import type { AppContext } from './context';
import { accountRoutes } from './routes/accounts';
import { catalogRoutes } from './routes/catalog';
import { orderRoutes } from './routes/orders';

export function createApp(ctx: AppContext) {
  const app = new Hono();

  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: ctx.env.CORS_ORIGINS,
      allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Idempotency-Key', 'Authorization', 'X-Internal-Secret'],
      maxAge: 600,
    }),
  );
  app.use('/v1/*', bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: { code: 'TOO_LARGE', message: 'Request body too large' } }, 413) }));

  app.get('/health', (c) => c.json({ ok: true, service: 'public-api', env: ctx.env.APP_ENV }));
  app.route('/v1', catalogRoutes(ctx));
  app.route('/v1', orderRoutes(ctx));
  app.route('/v1', accountRoutes(ctx));

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));
  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json(
        { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
        err.status as 400,
      );
    }
    if (err instanceof ZodError) {
      const e = new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields');
      return c.json({ error: { code: e.code, message: e.message } }, 400);
    }
    ctx.log.error('request.failed', { method: c.req.method, path: c.req.path, error: String(err), stack: (err as Error).stack });
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } }, 500);
  });

  return app;
}
