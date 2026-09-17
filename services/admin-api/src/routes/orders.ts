import {
  approveOrderSchema,
  cancelOrderSchema,
  deliverOrderSchema,
  normalizeIndianPhone,
  ORDER_STATUSES,
  orderNotesSchema,
  rejectOrderSchema,
  shipOrderSchema,
  type Order,
} from '@gnj/core';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../context';
import { parseBody, parseWith, toOrderDto, toOrderSummary, type AdminEnv } from '../http';

const listQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).default('PENDING'),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function orderRoutes(ctx: AppContext) {
  const app = new Hono<AdminEnv>();
  const { orders, orderService } = ctx.repos;

  app.get('/', async (c) => {
    const query = parseWith(listQuerySchema, c.req.query());
    if (query.q) {
      const q = query.q.trim();
      const upper = q.toUpperCase();
      if (/^GNJ-\d{6}-\d{3,}$/.test(upper)) {
        const order = await orders.get(upper);
        return c.json({ items: order ? [toOrderSummary(order)] : [] });
      }
      const phone = normalizeIndianPhone(q);
      if (/^[6-9]\d{9}$/.test(phone)) {
        return c.json({ items: (await orders.listByPhone(phone, 50)).map(toOrderSummary) });
      }
      const page = await orders.listByStatus(query.status, { limit: 200 });
      const needle = q.toLowerCase();
      const items = page.items.filter(
        (o) => o.customer.name.toLowerCase().includes(needle) || o.customer.email.includes(needle),
      );
      return c.json({ items: items.map(toOrderSummary) });
    }
    const page = await orders.listByStatus(query.status, { limit: query.limit, cursor: query.cursor });
    return c.json({ items: page.items.map(toOrderSummary), cursor: page.cursor });
  });

  app.get('/:orderNumber', async (c) => c.json(await toOrderDto(ctx, await orders.require(c.req.param('orderNumber')))));

  const afterTransition = async (c: Context<AdminEnv>, order: Order, action: string) => {
    ctx.log.info('order.transition', { orderNumber: order.orderNumber, action, status: order.status, by: c.get('admin').email });
    await ctx.notifications.enqueue({ type: 'ORDER_STATUS_CHANGED', orderNumber: order.orderNumber, status: order.status });
    return c.json(await toOrderDto(ctx, order));
  };

  app.post('/:orderNumber/approve', async (c) => {
    const { note } = await parseBody(c, approveOrderSchema);
    const order = await orderService.approve(c.req.param('orderNumber'), c.get('admin').email, note);
    return afterTransition(c, order, 'approve');
  });

  app.post('/:orderNumber/reject', async (c) => {
    const { reason } = await parseBody(c, rejectOrderSchema);
    const order = await orderService.reject(c.req.param('orderNumber'), c.get('admin').email, reason);
    return afterTransition(c, order, 'reject');
  });

  app.post('/:orderNumber/ship', async (c) => {
    const input = await parseBody(c, shipOrderSchema);
    const order = await orderService.ship(c.req.param('orderNumber'), c.get('admin').email, input);
    return afterTransition(c, order, 'ship');
  });

  app.post('/:orderNumber/deliver', async (c) => {
    const { note } = await parseBody(c, deliverOrderSchema);
    const order = await orderService.deliver(c.req.param('orderNumber'), c.get('admin').email, note);
    return afterTransition(c, order, 'deliver');
  });

  app.post('/:orderNumber/cancel', async (c) => {
    const { reason } = await parseBody(c, cancelOrderSchema);
    const order = await orderService.cancel(c.req.param('orderNumber'), c.get('admin').email, reason);
    return afterTransition(c, order, 'cancel');
  });

  app.patch('/:orderNumber/notes', async (c) => {
    const { adminNotes } = await parseBody(c, orderNotesSchema);
    return c.json(await toOrderDto(ctx, await orders.updateNotes(c.req.param('orderNumber'), adminNotes)));
  });

  return app;
}
