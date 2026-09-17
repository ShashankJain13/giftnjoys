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

/** Merges duplicate products in a cart (sum of qty, capped at 99). Keeps first-seen order. */
export function mergeCartItems(items: CartItemInput[]): CartItemInput[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.productId, Math.min(99, (merged.get(item.productId) ?? 0) + item.qty));
  }
  return [...merged].map(([productId, qty]) => ({ productId, qty }));
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
