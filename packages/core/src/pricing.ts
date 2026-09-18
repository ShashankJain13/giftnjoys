import { roundMoney } from './schemas/common';
import type { CartItemInput } from './schemas/order';
import type { ShippingSettings } from './schemas/settings';

export { roundMoney };
export { discountPct } from './schemas/product';

export interface Totals {
  subtotal: number;
  shippingFee: number;
  giftWrapFee: number;
  total: number;
  /** Amount still needed for free shipping (0 when already free or disabled). */
  amountToFreeShipping: number;
}

/**
 * Merges duplicate cart lines (sum of qty, capped at 99). Lines for the same product but a
 * different colour/size variant are kept separate. Keeps first-seen order.
 */
export function mergeCartItems(items: CartItemInput[]): CartItemInput[] {
  const merged = new Map<string, { productId: string; qty: number; variant?: string }>();
  for (const item of items) {
    const key = `${item.productId}::${item.variant ?? ''}`;
    const existing = merged.get(key);
    merged.set(key, {
      productId: item.productId,
      qty: Math.min(99, (existing?.qty ?? 0) + item.qty),
      ...(item.variant ? { variant: item.variant } : {}),
    });
  }
  return [...merged.values()];
}

export function computeTotals(
  lines: Array<{ unitPrice: number; qty: number }>,
  shipping: Pick<ShippingSettings, 'flatFee' | 'freeShippingThreshold' | 'giftWrapFee'>,
  giftWrap: boolean,
): Totals {
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0));
  const freeEnabled = shipping.freeShippingThreshold > 0;
  const qualifiesFree = freeEnabled && subtotal >= shipping.freeShippingThreshold;
  const shippingFee = subtotal === 0 || qualifiesFree ? 0 : roundMoney(shipping.flatFee);
  const giftWrapFee = giftWrap && subtotal > 0 ? roundMoney(shipping.giftWrapFee) : 0;
  const amountToFreeShipping =
    freeEnabled && !qualifiesFree && subtotal > 0 ? roundMoney(shipping.freeShippingThreshold - subtotal) : 0;
  return {
    subtotal,
    shippingFee,
    giftWrapFee,
    total: roundMoney(subtotal + shippingFee + giftWrapFee),
    amountToFreeShipping,
  };
}
