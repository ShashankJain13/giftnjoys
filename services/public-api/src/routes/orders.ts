import {
  AppError,
  badRequest,
  checkoutSchema,
  notFound,
  ORDER_STATUS_LABELS,
  orderPlacedText,
  quoteSchema,
  trackOrderSchema,
  waLink,
  type Order,
  type Quote,
} from '@gnj/core';
import { Hono } from 'hono';
import { verifyAccountToken } from '../auth';
import type { AppContext } from '../context';
import { noStore, parseBody, parseWith, rateLimit } from '../http';

export function orderRoutes(ctx: AppContext) {
  const app = new Hono();
  const { orderService, orders } = ctx.repos;

  const quoteDto = (q: Quote) => ({
    ...q,
    lines: q.lines.map(({ imageKey, stockQty, ...line }) => ({
      ...line,
      image: imageKey ? ctx.mediaUrl(imageKey) : undefined,
      ...(line.problem === 'INSUFFICIENT_STOCK' ? { available: stockQty } : {}),
    })),
  });

  app.post('/cart/quote', async (c) => {
    noStore(c);
    const input = await parseBody(c, quoteSchema);
    return c.json(quoteDto(await orderService.quote(input)));
  });

  app.post('/orders', rateLimit({ windowMs: 60_000, max: ctx.env.ORDER_RATE_LIMIT_PER_MINUTE, name: 'orders' }), async (c) => {
    noStore(c);
    const idempotencyKey = c.req.header('idempotency-key')?.trim();
    if (idempotencyKey && !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
      throw badRequest('Invalid Idempotency-Key header');
    }
    const input = await parseBody(c, checkoutSchema);

    // Optional: a signed-in shopper's token, so the order can be linked to their account and
    // (if requested) their saved address updated. Guest checkout works fine without it.
    let accountId: string | undefined;
    const authHeader = c.req.header('authorization') ?? '';
    if (authHeader.startsWith('Bearer ') && ctx.env.CUSTOMER_JWT_SECRET) {
      accountId = await verifyAccountToken(authHeader.slice(7).trim(), ctx.env.CUSTOMER_JWT_SECRET).catch(() => undefined);
    }

    let result: { order: Order; created: boolean };
    try {
      result = await orderService.placeOrder(input, { ...(idempotencyKey ? { idempotencyKey } : {}), ...(accountId ? { accountId } : {}) });
    } catch (err) {
      if (err instanceof AppError && err.code === 'CART_CHANGED') {
        const details = err.details as { lines: Quote['lines'] };
        throw new AppError(409, err.code, err.message, {
          lines: quoteDto({ lines: details.lines } as Quote).lines,
        });
      }
      throw err;
    }

    const { order, created } = result;
    if (created) {
      ctx.log.info('order.placed', { orderNumber: order.orderNumber, items: order.items.length, total: order.total });
      await ctx.notifications.enqueue({ type: 'ORDER_PLACED', orderNumber: order.orderNumber });
      if (accountId && input.saveAddress) {
        const { phone, address1, address2, city, state, pincode } = order.customer;
        await ctx.repos.accounts.updateSavedAddress(accountId, { phone, address1, address2, city, state, pincode }).catch((err: unknown) => {
          ctx.log.warn('account.save_address_failed', { accountId, error: String(err) });
        });
      }
    }
    const snapshot = await ctx.catalog.get();
    return c.json(
      {
        orderNumber: order.orderNumber,
        status: order.status,
        statusLabel: ORDER_STATUS_LABELS[order.status],
        createdAt: order.createdAt,
        customer: { name: order.customer.name, email: order.customer.email, phone: order.customer.phone },
        items: order.items.map(({ imageKey, ...i }) => ({ ...i, image: imageKey ? ctx.mediaUrl(imageKey) : undefined })),
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        giftWrapFee: order.giftWrapFee,
        total: order.total,
        whatsappLink: waLink(snapshot.store.whatsappNumber, orderPlacedText(order, snapshot.store.storeName)),
      },
      created ? 201 : 200,
    );
  });

  app.get('/orders/track', rateLimit({ windowMs: 60_000, max: 30, name: 'track' }), async (c) => {
    noStore(c);
    const { orderNumber, phone } = parseWith(trackOrderSchema, {
      orderNumber: c.req.query('orderNumber') ?? '',
      phone: c.req.query('phone') ?? '',
    });
    const order = await orders.get(orderNumber);
    // Same response for "no such order" and "wrong phone" so order numbers can't be probed.
    if (!order || order.customerPhone !== phone) throw notFound('Order with these details');
    return c.json({
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map(({ imageKey, productId: _p, ...i }) => ({ ...i, image: imageKey ? ctx.mediaUrl(imageKey) : undefined })),
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      giftWrapFee: order.giftWrapFee,
      total: order.total,
      deliverTo: { name: order.customer.name, city: order.customer.city, pincode: order.customer.pincode },
      history: order.statusHistory.map(({ to, at }) => ({ status: to, label: ORDER_STATUS_LABELS[to], at })),
      shipping: order.shipping ?? null,
      ...(order.status === 'REJECTED' && order.rejectReason ? { reason: order.rejectReason } : {}),
      ...(order.status === 'CANCELLED' && order.cancelReason ? { reason: order.cancelReason } : {}),
    });
  });

  return app;
}
