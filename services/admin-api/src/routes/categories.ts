import { categoryCreateSchema, categoryReorderSchema, categoryUpdateSchema } from '@gnj/core';
import { Hono } from 'hono';
import type { AppContext } from '../context';
import { parseBody, toCategoryDto, type AdminEnv } from '../http';

export function categoryRoutes(ctx: AppContext) {
  const app = new Hono<AdminEnv>();
  const { categories, products } = ctx.repos;

  app.get('/', async (c) => {
    const [all, published, drafts] = await Promise.all([
      categories.list(),
      products.listAllByStatus('PUBLISHED'),
      products.listAllByStatus('DRAFT'),
    ]);
    const counts = new Map<string, number>();
    for (const p of [...published, ...drafts]) {
      if (p.categoryId) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    }
    return c.json({ items: all.map((cat) => toCategoryDto(ctx, cat, counts.get(cat.id) ?? 0)) });
  });

  app.post('/', async (c) => {
    const input = await parseBody(c, categoryCreateSchema);
    return c.json(toCategoryDto(ctx, await categories.create(input)), 201);
  });

  app.post('/reorder', async (c) => {
    const { ids } = await parseBody(c, categoryReorderSchema);
    await categories.reorder(ids);
    return c.json({ ok: true });
  });

  app.patch('/:id', async (c) => {
    const patch = await parseBody(c, categoryUpdateSchema);
    return c.json(toCategoryDto(ctx, await categories.update(c.req.param('id'), patch)));
  });

  app.delete('/:id', async (c) => {
    await categories.delete(c.req.param('id'));
    return c.body(null, 204);
  });

  return app;
}
