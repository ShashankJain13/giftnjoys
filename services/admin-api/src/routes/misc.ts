import {
  badRequest,
  IMAGE_CONTENT_TYPES,
  importCreateSchema,
  isSettingsKey,
  istStartOfDayIso,
  newId,
  notFound,
  ORDER_STATUSES,
  presignUploadSchema,
  SETTINGS_KEYS,
  unauthorized,
} from '@gnj/core';
import { Hono } from 'hono';
import { z } from 'zod';
import { LocalAuthenticator } from '../auth';
import type { AppContext } from '../context';
import { parseBody, toOrderSummary, toProductDto, type AdminEnv } from '../http';

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMPORT_MAX_BYTES = 200 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function safeFilename(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return (cleaned || 'upload').slice(-100);
}

/** Public (no auth) — only the local-mode login endpoint. */
export function authRoutes(ctx: AppContext) {
  const app = new Hono<AdminEnv>();
  const loginSchema = z.object({ email: z.string().trim().min(3).max(254), password: z.string().min(1).max(200) });

  app.post('/login', async (c) => {
    if (!(ctx.auth instanceof LocalAuthenticator)) throw notFound('Route');
    const { email, password } = await parseBody(c, loginSchema);
    const result = await ctx.auth.login(email, password);
    ctx.log.info('auth.login', { email: result.admin.email });
    return c.json({ ...result, mode: ctx.auth.mode });
  });

  app.get('/config', (c) =>
    c.json({
      mode: ctx.auth.mode,
      ...(ctx.env.AUTH_MODE === 'cognito'
        ? { userPoolId: ctx.env.COGNITO_USER_POOL_ID, clientId: ctx.env.COGNITO_CLIENT_ID, region: ctx.env.AWS_REGION }
        : {}),
    }),
  );
  return app;
}

export function meRoutes() {
  const app = new Hono<AdminEnv>();
  app.get('/', (c) => {
    const admin = c.get('admin');
    if (!admin) throw unauthorized();
    return c.json(admin);
  });
  return app;
}

export function uploadRoutes(ctx: AppContext) {
  const app = new Hono<AdminEnv>();

  app.post('/presign', async (c) => {
    const input = await parseBody(c, presignUploadSchema);
    const now = new Date();
    const datePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    if (input.purpose === 'import') {
      const lower = input.filename.toLowerCase();
      const contentType = lower.endsWith('.zip') ? 'application/zip' : lower.endsWith('.txt') ? 'text/plain' : undefined;
      if (!contentType) throw badRequest('Upload the WhatsApp export as a .zip (with media) or .txt file');
      const key = `imports/${datePath}/${newId()}-${safeFilename(input.filename)}`;
      const upload = await ctx.storage.presignPost({ bucket: 'imports', key, contentType, maxBytes: IMPORT_MAX_BYTES });
      return c.json(upload);
    }

    if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(input.contentType)) {
      throw badRequest('Images must be JPEG, PNG, WebP or GIF');
    }
    const folder = input.purpose === 'product-image' ? 'products' : input.purpose === 'category-image' ? 'categories' : 'banners';
    const key = `${folder}/uploads/${datePath}/${newId()}.${EXTENSIONS[input.contentType]}`;
    const upload = await ctx.storage.presignPost({
      bucket: 'media',
      key,
      contentType: input.contentType,
      maxBytes: IMAGE_MAX_BYTES,
    });
    return c.json({ ...upload, publicUrl: ctx.storage.publicUrl(key) });
  });

  return app;
}

export function importRoutes(ctx: AppContext) {
  const app = new Hono<AdminEnv>();
  const { importJobs, products } = ctx.repos;

  app.get('/', async (c) => c.json({ items: await importJobs.list(50) }));

  app.post('/', async (c) => {
    const input = await parseBody(c, importCreateSchema);
    const head = await ctx.storage.headObject('imports', input.key);
    if (!head) throw badRequest('Upload not found. Please upload the file again.');
    if (head.size > IMPORT_MAX_BYTES) throw badRequest('File is larger than 200 MB');
    const job = await importJobs.create({ filename: input.filename, s3Key: input.key, createdBy: c.get('admin').email });
    await ctx.imports.enqueue({ jobId: job.id });
    ctx.log.info('import.queued', { jobId: job.id, bytes: head.size, by: c.get('admin').email });
    return c.json(job, 202);
  });

  app.get('/:id', async (c) => {
    const job = await importJobs.require(c.req.param('id'));
    const items = await products.listByImportJob(job.id);
    const byStatus = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 };
    for (const p of items) byStatus[p.status]++;
    return c.json({ ...job, products: byStatus });
  });

  return app;
}

export function settingsRoutes(ctx: AppContext) {
  const app = new Hono<AdminEnv>();
  const { settings } = ctx.repos;

  app.get('/', async (c) => {
    const entries = await Promise.all(SETTINGS_KEYS.map(async (k) => [k, await settings.get(k)] as const));
    return c.json(Object.fromEntries(entries));
  });

  app.get('/:key', async (c) => {
    const key = c.req.param('key');
    if (!isSettingsKey(key)) throw notFound('Settings section');
    return c.json(await settings.get(key));
  });

  app.put('/:key', async (c) => {
    const key = c.req.param('key');
    if (!isSettingsKey(key)) throw notFound('Settings section');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw badRequest('Request body must be valid JSON');
    }
    const saved = await settings.put(key, body);
    ctx.log.info('settings.updated', { key, by: c.get('admin').email });
    return c.json(saved);
  });

  return app;
}

export function dashboardRoutes(ctx: AppContext) {
  const app = new Hono<AdminEnv>();
  const { orders, products, importJobs } = ctx.repos;

  app.get('/summary', async (c) => {
    const since = istStartOfDayIso();
    const [statusCounts, todayCounts, drafts, published, pending, recentImports] = await Promise.all([
      Promise.all(ORDER_STATUSES.map(async (s) => [s, await orders.countByStatus(s)] as const)),
      Promise.all(ORDER_STATUSES.map((s) => orders.countByStatus(s, since))),
      products.countByStatus('DRAFT'),
      products.listAllByStatus('PUBLISHED'),
      orders.listByStatus('PENDING', { limit: 10 }),
      importJobs.list(5),
    ]);
    const lowStock = published
      .filter((p) => p.stockQty <= 5)
      .sort((a, b) => a.stockQty - b.stockQty)
      .slice(0, 10);
    return c.json({
      ordersByStatus: Object.fromEntries(statusCounts),
      ordersToday: todayCounts.reduce((a, b) => a + b, 0),
      productCounts: { published: published.length, drafts },
      pendingOrders: pending.items.map(toOrderSummary),
      lowStock: lowStock.map((p) => toProductDto(ctx, p)),
      recentImports,
    });
  });

  return app;
}
