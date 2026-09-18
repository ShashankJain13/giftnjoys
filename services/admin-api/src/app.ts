import { AppError, isAppError, unauthorized } from '@gnj/core';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError } from 'zod';
import type { AppContext } from './context';
import type { AdminEnv } from './http';
import { categoryRoutes } from './routes/categories';
import { authRoutes, dashboardRoutes, importRoutes, meRoutes, settingsRoutes, uploadRoutes } from './routes/misc';
import { orderRoutes } from './routes/orders';
import { productRoutes } from './routes/products';
import { whatsappWebhookRoutes } from './routes/whatsapp-webhook';

export function createApp(ctx: AppContext) {
  const app = new Hono<AdminEnv>();

  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: ctx.env.CORS_ORIGINS,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );
  app.use('/admin/v1/*', bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: { code: 'TOO_LARGE', message: 'Request body too large' } }, 413) }));

  app.get('/health', (c) => c.json({ ok: true, service: 'admin-api', env: ctx.env.APP_ENV }));

  // Public: Meta calls this directly (webhook verification handshake + signed message events),
  // so it sits outside the admin JWT middleware below and authenticates via HMAC signature instead.
  app.route('/webhooks/whatsapp', whatsappWebhookRoutes(ctx));

  app.route('/admin/v1/auth', authRoutes(ctx));

  // Everything else requires an authenticated admin.
  app.use('/admin/v1/*', async (c, next) => {
    if (c.req.path.startsWith('/admin/v1/auth/')) return next();
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorized();
    c.set('admin', await ctx.auth.verify(token));
    await next();
  });

  app.route('/admin/v1/me', meRoutes());
  app.route('/admin/v1/dashboard', dashboardRoutes(ctx));
  app.route('/admin/v1/products', productRoutes(ctx));
  app.route('/admin/v1/categories', categoryRoutes(ctx));
  app.route('/admin/v1/uploads', uploadRoutes(ctx));
  app.route('/admin/v1/imports', importRoutes(ctx));
  app.route('/admin/v1/orders', orderRoutes(ctx));
  app.route('/admin/v1/settings', settingsRoutes(ctx));

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
      return c.json(
        { error: { code: e.code, message: e.message, details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } },
        400,
      );
    }
    ctx.log.error('request.failed', { method: c.req.method, path: c.req.path, error: String(err), stack: (err as Error).stack });
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } }, 500);
  });

  return app;
}
