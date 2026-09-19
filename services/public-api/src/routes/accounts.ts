import { ORDER_STATUS_LABELS, oauthUpsertSchema, savedAddressSchema, unauthorized, type Order } from '@gnj/core';
import { Hono } from 'hono';
import { requireAccount, signAccountToken, type AccountEnv } from '../auth';
import type { AppContext } from '../context';
import { noStore, parseBody } from '../http';

/** Same shape the track-order endpoint already returns, reused for each entry in the account's order list. */
function orderDto(order: Order, mediaUrl: (key: string) => string) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    createdAt: order.createdAt,
    items: order.items.map(({ imageKey, ...i }) => ({ ...i, image: imageKey ? mediaUrl(imageKey) : undefined })),
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    giftWrapFee: order.giftWrapFee,
    total: order.total,
    shipping: order.shipping ?? null,
  };
}

export function accountRoutes(ctx: AppContext) {
  const app = new Hono<AccountEnv>();
  const { accounts, orders } = ctx.repos;

  // Called only by our own storefront server right after it verifies an OAuth identity —
  // never reachable from a browser directly, so it authenticates via a shared internal secret
  // rather than the account bearer token this endpoint itself issues.
  app.post('/accounts/oauth', async (c) => {
    noStore(c);
    if (!ctx.env.INTERNAL_API_SECRET || !ctx.env.CUSTOMER_JWT_SECRET) throw unauthorized();
    if (c.req.header('x-internal-secret') !== ctx.env.INTERNAL_API_SECRET) throw unauthorized();

    const input = await parseBody(c, oauthUpsertSchema);
    const account = await accounts.upsertByEmail(input);
    const token = await signAccountToken(account.id, ctx.env.CUSTOMER_JWT_SECRET);
    return c.json({ token, account: { id: account.id, email: account.email, name: account.name, avatarUrl: account.avatarUrl, savedAddress: account.savedAddress ?? null } });
  });

  app.get('/accounts/me', requireAccount(ctx.env.CUSTOMER_JWT_SECRET), async (c) => {
    noStore(c);
    const account = await accounts.get(c.get('accountId'));
    if (!account) throw unauthorized();
    return c.json({ id: account.id, email: account.email, name: account.name, avatarUrl: account.avatarUrl, savedAddress: account.savedAddress ?? null });
  });

  app.get('/accounts/me/orders', requireAccount(ctx.env.CUSTOMER_JWT_SECRET), async (c) => {
    noStore(c);
    const items = await orders.listByAccount(c.get('accountId'), 50);
    return c.json({ items: items.map((o) => orderDto(o, ctx.mediaUrl)) });
  });

  app.put('/accounts/me/address', requireAccount(ctx.env.CUSTOMER_JWT_SECRET), async (c) => {
    noStore(c);
    const input = await parseBody(c, savedAddressSchema);
    const account = await accounts.updateSavedAddress(c.get('accountId'), input);
    return c.json({ savedAddress: account.savedAddress ?? null });
  });

  return app;
}
