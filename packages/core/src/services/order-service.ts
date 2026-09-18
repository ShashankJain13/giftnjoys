import { cancellationCodes, isTransactionCanceled } from '../db/errors';
import { AppError, badRequest, conflict } from '../errors';
import { canPerform, nextStatus, type OrderAction } from '../orders/state-machine';
import { computeTotals, mergeCartItems, type Totals } from '../pricing';
import type {
  CheckoutInput,
  Order,
  OrderItem,
  OrderStatusChange,
  QuoteInput,
  ShipOrderInput,
} from '../schemas/order';
import { ORDER_STATUS_LABELS } from '../schemas/order';
import type { MetaRepository } from '../repositories/meta';
import type { OrdersRepository, TransactItem } from '../repositories/orders';
import type { ProductsRepository } from '../repositories/products';
import type { SettingsRepository } from '../repositories/settings';
import { nowIso } from '../util';

export type LineProblem = 'UNAVAILABLE' | 'INSUFFICIENT_STOCK';

export interface QuoteLine {
  productId: string;
  qty: number;
  name: string;
  slug?: string;
  imageKey?: string;
  unitPrice: number;
  mrp?: number;
  lineTotal: number;
  stockQty: number;
  problem?: LineProblem;
  variant?: string;
}

export interface Quote extends Totals {
  lines: QuoteLine[];
  freeShippingThreshold: number;
  hasProblems: boolean;
}

export interface OrderServiceDeps {
  products: ProductsRepository;
  orders: OrdersRepository;
  settings: SettingsRepository;
  meta: MetaRepository;
}

export class OrderService {
  constructor(private readonly deps: OrderServiceDeps) {}

  /** Prices a cart using database prices only. */
  async quote(input: QuoteInput): Promise<Quote> {
    const items = mergeCartItems(input.items);
    const [products, shipping] = await Promise.all([
      this.deps.products.getMany(items.map((i) => i.productId)),
      this.deps.settings.get('shipping'),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines: QuoteLine[] = items.map((item) => {
      const p = byId.get(item.productId);
      if (!p || p.status !== 'PUBLISHED') {
        return {
          productId: item.productId,
          qty: item.qty,
          name: p?.name ?? 'Item no longer available',
          unitPrice: 0,
          lineTotal: 0,
          stockQty: 0,
          problem: 'UNAVAILABLE' as const,
          ...(item.variant ? { variant: item.variant } : {}),
        };
      }
      return {
        productId: p.id,
        qty: item.qty,
        name: p.name,
        slug: p.slug,
        imageKey: p.images[0]?.key,
        unitPrice: p.price,
        mrp: p.mrp,
        ...(item.variant ? { variant: item.variant } : {}),
        lineTotal: Math.round(p.price * item.qty * 100) / 100,
        stockQty: p.stockQty,
        ...(p.stockQty < item.qty ? { problem: 'INSUFFICIENT_STOCK' as const } : {}),
      };
    });

    const totals = computeTotals(
      lines.filter((l) => l.problem !== 'UNAVAILABLE'),
      shipping,
      input.giftWrap,
    );
    return {
      lines,
      ...totals,
      freeShippingThreshold: shipping.freeShippingThreshold,
      hasProblems: lines.some((l) => l.problem),
    };
  }

  async placeOrder(
    input: CheckoutInput,
    opts: { idempotencyKey?: string } = {},
  ): Promise<{ order: Order; created: boolean }> {
    if (input.website) throw new AppError(400, 'REJECTED', 'We could not place this order. Please try again.');

    if (opts.idempotencyKey) {
      const existing = await this.existingForKey(opts.idempotencyKey);
      if (existing) return { order: existing, created: false };
    }

    const quote = await this.quote({ items: input.items, giftWrap: input.giftWrap });
    if (quote.hasProblems) {
      throw new AppError(409, 'CART_CHANGED', 'Some items in your cart are unavailable or low on stock.', {
        lines: quote.lines,
      });
    }

    const now = new Date();
    const at = now.toISOString();
    const orderNumber = await this.deps.meta.nextOrderNumber(now);
    const items: OrderItem[] = quote.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      slug: l.slug ?? '',
      ...(l.imageKey ? { imageKey: l.imageKey } : {}),
      unitPrice: l.unitPrice,
      ...(l.mrp !== undefined ? { mrp: l.mrp } : {}),
      qty: l.qty,
      lineTotal: l.lineTotal,
      ...(l.variant ? { variant: l.variant } : {}),
    }));

    const order: Order = {
      orderNumber,
      status: 'PENDING',
      customer: input.customer,
      customerPhone: input.customer.phone,
      items,
      subtotal: quote.subtotal,
      shippingFee: quote.shippingFee,
      giftWrapFee: quote.giftWrapFee,
      total: quote.total,
      giftWrap: input.giftWrap,
      giftMessage: input.giftMessage,
      notes: input.notes,
      statusHistory: [{ from: null, to: 'PENDING', at, by: 'customer' }],
      createdAt: at,
      updatedAt: at,
    };

    const extra: TransactItem[] = opts.idempotencyKey
      ? [this.deps.meta.idempotencyPutItem(opts.idempotencyKey, orderNumber)]
      : [];
    try {
      await this.deps.orders.create(order, extra);
    } catch (err) {
      if (opts.idempotencyKey && isTransactionCanceled(err) && cancellationCodes(err)[1] === 'ConditionalCheckFailed') {
        const existing = await this.existingForKey(opts.idempotencyKey);
        if (existing) return { order: existing, created: false };
      }
      throw err;
    }
    return { order, created: true };
  }

  private async existingForKey(key: string): Promise<Order | undefined> {
    const orderNumber = await this.deps.meta.getIdempotentOrderNumber(key);
    return orderNumber ? this.deps.orders.get(orderNumber) : undefined;
  }

  async approve(orderNumber: string, actor: string, note?: string): Promise<Order> {
    const order = await this.load(orderNumber, 'approve');
    const change = this.change(order, 'approve', actor, note);
    const stockItems: TransactItem[] = order.items.map((item) =>
      this.deps.products.stockDecrementItem(item.productId, item.qty, change.at),
    );
    try {
      await this.deps.orders.transact([this.deps.orders.transitionItem(order, change), ...stockItems]);
    } catch (err) {
      if (isTransactionCanceled(err)) {
        const codes = cancellationCodes(err);
        if (codes[0] === 'ConditionalCheckFailed') throw this.staleError();
        const failedIndex = codes.findIndex((c, i) => i > 0 && c === 'ConditionalCheckFailed');
        const item = failedIndex > 0 ? order.items[failedIndex - 1] : undefined;
        if (item) {
          const product = await this.deps.products.get(item.productId);
          throw conflict(
            product
              ? `Not enough stock for "${item.name}" (need ${item.qty}, have ${product.stockQty}). Update stock or reject the order.`
              : `"${item.name}" no longer exists in the catalog.`,
          );
        }
      }
      throw err;
    }
    return this.deps.orders.require(orderNumber);
  }

  async reject(orderNumber: string, actor: string, reason: string): Promise<Order> {
    const order = await this.load(orderNumber, 'reject');
    const change = this.change(order, 'reject', actor, reason);
    await this.run([this.deps.orders.transitionItem(order, change, { rejectReason: reason })]);
    return this.deps.orders.require(orderNumber);
  }

  async ship(orderNumber: string, actor: string, input: ShipOrderInput): Promise<Order> {
    const order = await this.load(orderNumber, 'ship');
    const change = this.change(order, 'ship', actor);
    const shipping = {
      courier: input.courier,
      awb: input.awb,
      ...(input.trackingUrl ? { trackingUrl: input.trackingUrl } : {}),
      ...(input.expectedDelivery ? { expectedDelivery: input.expectedDelivery } : {}),
      shippedAt: change.at,
    };
    await this.run([this.deps.orders.transitionItem(order, change, { shipping })]);
    return this.deps.orders.require(orderNumber);
  }

  async deliver(orderNumber: string, actor: string, note?: string): Promise<Order> {
    const order = await this.load(orderNumber, 'deliver');
    const change = this.change(order, 'deliver', actor, note);
    await this.run([this.deps.orders.transitionItem(order, change, { deliveredAt: change.at })]);
    return this.deps.orders.require(orderNumber);
  }

  async cancel(orderNumber: string, actor: string, reason: string): Promise<Order> {
    const order = await this.load(orderNumber, 'cancel');
    const change = this.change(order, 'cancel', actor, reason);
    const items: TransactItem[] = [this.deps.orders.transitionItem(order, change, { cancelReason: reason })];
    if (order.status === 'APPROVED') {
      // Stock was deducted at approval — put it back for products that still exist.
      const existing = new Set((await this.deps.products.getMany(order.items.map((i) => i.productId))).map((p) => p.id));
      for (const item of order.items.filter((i) => existing.has(i.productId))) {
        items.push(this.deps.products.stockIncrementItem(item.productId, item.qty, change.at));
      }
    }
    await this.run(items);
    return this.deps.orders.require(orderNumber);
  }

  private async load(orderNumber: string, action: OrderAction): Promise<Order> {
    const order = await this.deps.orders.require(orderNumber);
    if (!canPerform(order.status, action)) {
      throw badRequest(`Cannot ${action} an order that is ${ORDER_STATUS_LABELS[order.status].toLowerCase()}`);
    }
    return order;
  }

  private change(order: Order, action: OrderAction, actor: string, note?: string): OrderStatusChange {
    return { from: order.status, to: nextStatus(action), at: nowIso(), by: actor, ...(note ? { note } : {}) };
  }

  private staleError() {
    return conflict('This order was updated by someone else. Reload and try again.');
  }

  private async run(items: TransactItem[]): Promise<void> {
    try {
      await this.deps.orders.transact(items);
    } catch (err) {
      if (isTransactionCanceled(err) && cancellationCodes(err)[0] === 'ConditionalCheckFailed') throw this.staleError();
      throw err;
    }
  }
}
