import {
  PRODUCT_STATUSES,
  productBulkSchema,
  productCreateSchema,
  productStatusChangeSchema,
  productUpdateSchema,
  stockChangeSchema,
  type Product,
  type ProductStatus,
} from '@gnj/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../context';
import { parseBody, parseWith, toProductDto, type AdminEnv } from '../http';

const listQuerySchema = z.object({
  status: z.enum([...PRODUCT_STATUSES, 'ALL']).default('ALL'),
  categoryId: z.string().optional(),
  importJobId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  sort: z.enum(['updated', 'name', 'price', 'stock', 'confidence']).default('updated'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export function productRoutes(ctx: AppContext) {
  const app = new Hono<AdminEnv>();
  const { products } = ctx.repos;

  app.get('/', async (c) => {
    const query = parseWith(listQuerySchema, c.req.query());
    let items: Product[];
    if (query.importJobId) {
      items = await products.listByImportJob(query.importJobId);
      if (query.status !== 'ALL') items = items.filter((p) => p.status === query.status);
    } else {
      const statuses: ProductStatus[] = query.status === 'ALL' ? [...PRODUCT_STATUSES] : [query.status];
      items = (await Promise.all(statuses.map((s) => products.listAllByStatus(s)))).flat();
    }
    if (query.categoryId) {
      items = items.filter((p) => (query.categoryId === 'none' ? !p.categoryId : p.categoryId === query.categoryId));
    }
    if (query.lowStock === 'true') items = items.filter((p) => p.stockQty <= 5);
    if (query.q) {
      const needle = query.q.toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.slug.includes(needle) ||
          p.sku?.toLowerCase().includes(needle) ||
          p.tags.some((t) => t.includes(needle)),
      );
    }
    const sorters: Record<typeof query.sort, (a: Product, b: Product) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      name: (a, b) => a.name.localeCompare(b.name),
      price: (a, b) => a.price - b.price,
      stock: (a, b) => a.stockQty - b.stockQty,
      confidence: (a, b) => (a.parseConfidence ?? 1) - (b.parseConfidence ?? 1),
    };
    items.sort(sorters[query.sort]);
    const start = (query.page - 1) * query.pageSize;
    return c.json({
      items: items.slice(start, start + query.pageSize).map((p) => toProductDto(ctx, p)),
      total: items.length,
      page: query.page,
      pageSize: query.pageSize,
    });
  });

  app.post('/', async (c) => {
    const input = await parseBody(c, productCreateSchema);
    const product = await products.create(input);
    ctx.log.info('product.created', { id: product.id, by: c.get('admin').email });
    return c.json(toProductDto(ctx, product), 201);
  });

  app.post('/bulk', async (c) => {
    const input = await parseBody(c, productBulkSchema);
    const results = await Promise.allSettled(
      input.ids.map(async (id) => {
        switch (input.action) {
          case 'publish':
            return products.setStatus(id, 'PUBLISHED');
          case 'unpublish':
            return products.setStatus(id, 'DRAFT');
          case 'archive':
            return products.setStatus(id, 'ARCHIVED');
          case 'delete':
            return products.delete(id);
          case 'setCategory':
            return products.update(id, { categoryId: input.categoryId ?? null });
        }
      }),
    );
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? { id: input.ids[i]!, error: (r.reason as Error).message } : undefined))
      .filter(Boolean);
    ctx.log.info('product.bulk', { action: input.action, count: input.ids.length, failed: failed.length, by: c.get('admin').email });
    return c.json({ succeeded: input.ids.length - failed.length, failed });
  });

  app.get('/:id', async (c) => c.json(toProductDto(ctx, await products.require(c.req.param('id')))));

  app.patch('/:id', async (c) => {
    const patch = await parseBody(c, productUpdateSchema);
    return c.json(toProductDto(ctx, await products.update(c.req.param('id'), patch)));
  });

  app.post('/:id/status', async (c) => {
    const { status } = await parseBody(c, productStatusChangeSchema);
    return c.json(toProductDto(ctx, await products.setStatus(c.req.param('id'), status)));
  });

  app.patch('/:id/stock', async (c) => {
    const change = await parseBody(c, stockChangeSchema);
    return c.json(toProductDto(ctx, await products.adjustStock(c.req.param('id'), change)));
  });

  app.delete('/:id', async (c) => {
    await products.delete(c.req.param('id'));
    ctx.log.info('product.deleted', { id: c.req.param('id'), by: c.get('admin').email });
    return c.body(null, 204);
  });

  return app;
}
