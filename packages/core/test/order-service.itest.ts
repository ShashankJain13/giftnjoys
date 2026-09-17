/**
 * Integration tests against DynamoDB Local (docker compose stack).
 * Uses throwaway tables with a random prefix; skipped when DYNAMODB_ENDPOINT is not configured.
 */
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError, createDb, createRepositories, tableDefinitions, type CheckoutInput, type Repositories } from '../src/index';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env.local'));
} catch {
  /* optional */
}

const endpoint = process.env.DYNAMODB_ENDPOINT;
const isLocal = !!endpoint && /localhost|127\.0\.0\.1/.test(endpoint);

describe.skipIf(!isLocal)('OrderService (DynamoDB Local)', () => {
  const prefix = `gnj-itest-${Date.now().toString(36)}`;
  const credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
  const raw = new DynamoDBClient({ region: 'ap-south-1', endpoint, credentials });
  const db = createDb({ region: 'ap-south-1', tablePrefix: prefix, endpoint, credentials });
  let repos: Repositories;

  beforeAll(async () => {
    for (const def of tableDefinitions(db.tables)) {
      await raw.send(new CreateTableCommand(def));
      await waitUntilTableExists({ client: raw, maxWaitTime: 60, minDelay: 1, maxDelay: 2 }, { TableName: def.TableName });
    }
    repos = createRepositories(db);
    await repos.settings.put('shipping', { flatFee: 50, freeShippingThreshold: 1000, giftWrapFee: 30 });
  }, 60_000);

  afterAll(async () => {
    await Promise.all(Object.values(db.tables).map((t) => raw.send(new DeleteTableCommand({ TableName: t })).catch(() => {})));
  });

  async function publishedProduct(name: string, price: number, stockQty: number) {
    const p = await repos.products.create({ name, price, stockQty, mrp: price * 2 });
    return repos.products.setStatus(p.id, 'PUBLISHED');
  }

  const checkout = (items: CheckoutInput['items'], extra: Partial<CheckoutInput> = {}): CheckoutInput => ({
    customer: {
      name: 'Test Buyer',
      phone: '9876543210',
      email: 'buyer@example.com',
      address1: '1 Test Street',
      address2: '',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    },
    items,
    giftWrap: false,
    giftMessage: '',
    notes: '',
    website: '',
    ...extra,
  });

  it('allocates unique slugs and enforces explicit slug uniqueness', async () => {
    const a = await repos.products.create({ name: 'Brass Diya', price: 100 });
    const b = await repos.products.create({ name: 'Brass Diya', price: 120 });
    expect(a.slug).toBe('brass-diya');
    expect(b.slug).toBe('brass-diya-2');
    await expect(repos.products.create({ name: 'X', slug: 'brass-diya', price: 1 })).rejects.toThrow(/already used/);

    const renamed = await repos.products.update(a.id, { slug: 'brass-diya-classic' });
    expect(renamed.slug).toBe('brass-diya-classic');
    expect((await repos.products.getBySlug('brass-diya-classic'))?.id).toBe(a.id);
    // Old slug is released
    const c = await repos.products.create({ name: 'Another', slug: 'brass-diya', price: 1 });
    expect(c.slug).toBe('brass-diya');
  });

  it('prices orders from the database, ignoring anything the client sends', async () => {
    const mug = await publishedProduct('Itest Mug', 300, 10);
    const { order, created } = await repos.orderService.placeOrder(
      checkout([{ productId: mug.id, qty: 2, unitPrice: 1 } as never], { giftWrap: true }),
    );
    expect(created).toBe(true);
    expect(order.orderNumber).toMatch(/^GNJ-\d{6}-\d{4}$/);
    expect(order).toMatchObject({ status: 'PENDING', subtotal: 600, shippingFee: 50, giftWrapFee: 30, total: 680 });
  });

  it('is idempotent per Idempotency-Key', async () => {
    const p = await publishedProduct('Itest Candle', 450, 10);
    const input = checkout([{ productId: p.id, qty: 1 }]);
    const first = await repos.orderService.placeOrder(input, { idempotencyKey: 'key-123' });
    const second = await repos.orderService.placeOrder(input, { idempotencyKey: 'key-123' });
    expect(second.created).toBe(false);
    expect(second.order.orderNumber).toBe(first.order.orderNumber);
  });

  it('rejects honeypot submissions and unavailable products', async () => {
    const p = await publishedProduct('Itest Frame', 200, 5);
    await expect(repos.orderService.placeOrder(checkout([{ productId: p.id, qty: 1 }], { website: 'spam' }))).rejects.toMatchObject({
      code: 'REJECTED',
    });
    await repos.products.setStatus(p.id, 'ARCHIVED');
    await expect(repos.orderService.placeOrder(checkout([{ productId: p.id, qty: 1 }]))).rejects.toMatchObject({
      code: 'CART_CHANGED',
    });
  });

  it('deducts stock on approval, blocks over-selling, and restocks on cancel', async () => {
    const p = await publishedProduct('Itest Teddy', 700, 3);
    const o1 = (await repos.orderService.placeOrder(checkout([{ productId: p.id, qty: 2 }]))).order;
    const o2 = (await repos.orderService.placeOrder(checkout([{ productId: p.id, qty: 2 }]))).order;

    const approved = await repos.orderService.approve(o1.orderNumber, 'admin@test');
    expect(approved.status).toBe('APPROVED');
    expect((await repos.products.get(p.id))?.stockQty).toBe(1);

    await expect(repos.orderService.approve(o2.orderNumber, 'admin@test')).rejects.toThrow(/Not enough stock/);
    expect((await repos.orders.get(o2.orderNumber))?.status).toBe('PENDING');
    expect((await repos.products.get(p.id))?.stockQty).toBe(1);

    const cancelled = await repos.orderService.cancel(o1.orderNumber, 'admin@test', 'Customer changed mind');
    expect(cancelled.status).toBe('CANCELLED');
    expect((await repos.products.get(p.id))?.stockQty).toBe(3);
  });

  it('runs approve → ship → deliver and records history', async () => {
    const p = await publishedProduct('Itest Hamper', 1200, 5);
    const { order } = await repos.orderService.placeOrder(checkout([{ productId: p.id, qty: 1 }]));
    await repos.orderService.approve(order.orderNumber, 'admin@test');
    await expect(repos.orderService.deliver(order.orderNumber, 'admin@test')).rejects.toBeInstanceOf(AppError);
    const shipped = await repos.orderService.ship(order.orderNumber, 'admin@test', {
      courier: 'Delhivery',
      awb: 'AWB999',
      trackingUrl: '',
      expectedDelivery: '2026-09-20',
    });
    expect(shipped.shipping).toMatchObject({ courier: 'Delhivery', awb: 'AWB999', expectedDelivery: '2026-09-20' });
    expect(shipped.shipping?.trackingUrl).toBeUndefined();
    const delivered = await repos.orderService.deliver(order.orderNumber, 'admin@test');
    expect(delivered.statusHistory.map((h) => h.to)).toEqual(['PENDING', 'APPROVED', 'SHIPPED', 'DELIVERED']);
    expect(delivered.total).toBe(1200); // free shipping at threshold
  });

  it('lets only one of two concurrent approvals win', async () => {
    const p = await publishedProduct('Itest Wallet', 750, 10);
    const { order } = await repos.orderService.placeOrder(checkout([{ productId: p.id, qty: 1 }]));
    const results = await Promise.allSettled([
      repos.orderService.approve(order.orderNumber, 'a@test'),
      repos.orderService.approve(order.orderNumber, 'b@test'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await repos.products.get(p.id))?.stockQty).toBe(9);
  });

  it('lists and counts orders by status and phone', async () => {
    const pending = await repos.orders.listByStatus('PENDING', { limit: 100 });
    expect(pending.items.length).toBeGreaterThan(0);
    expect(await repos.orders.countByStatus('DELIVERED')).toBe(1);
    expect((await repos.orders.listByPhone('9876543210')).length).toBeGreaterThan(3);
  });
});
