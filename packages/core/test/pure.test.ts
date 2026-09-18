import { describe, expect, it } from 'vitest';
import {
  allowedActions,
  canPerform,
  checkoutSchema,
  computeTotals,
  discountPct,
  formatINR,
  mergeCartItems,
  normalizeIndianPhone,
  orderPlacedText,
  priceFromDiscount,
  productCreateSchema,
  productUpdateSchema,
  publishProblems,
  shipOrderSchema,
  slugify,
  storeSettingsSchema,
  toWaPhone,
  waLink,
} from '../src/index';

const shipping = { flatFee: 79, freeShippingThreshold: 999, giftWrapFee: 49 };

describe('pricing', () => {
  it('charges flat shipping below the threshold', () => {
    const t = computeTotals([{ unitPrice: 299, qty: 2 }], shipping, false);
    expect(t).toEqual({ subtotal: 598, shippingFee: 79, giftWrapFee: 0, total: 677, amountToFreeShipping: 401 });
  });

  it('ships free at or above the threshold and adds gift wrap', () => {
    const t = computeTotals([{ unitPrice: 333.33, qty: 3 }], shipping, true);
    expect(t.subtotal).toBe(999.99);
    expect(t.shippingFee).toBe(0);
    expect(t.giftWrapFee).toBe(49);
    expect(t.total).toBe(1048.99);
  });

  it('never charges anything for an empty cart', () => {
    expect(computeTotals([], shipping, true).total).toBe(0);
  });

  it('treats threshold 0 as "free shipping disabled"', () => {
    const t = computeTotals([{ unitPrice: 5000, qty: 1 }], { ...shipping, freeShippingThreshold: 0 }, false);
    expect(t.shippingFee).toBe(79);
    expect(t.amountToFreeShipping).toBe(0);
  });

  it('merges duplicate cart lines and caps qty', () => {
    expect(
      mergeCartItems([
        { productId: 'a', qty: 2 },
        { productId: 'b', qty: 1 },
        { productId: 'a', qty: 98 },
      ]),
    ).toEqual([
      { productId: 'a', qty: 99 },
      { productId: 'b', qty: 1 },
    ]);
  });

  it('keeps different variants of the same product as separate lines', () => {
    expect(
      mergeCartItems([
        { productId: 'a', qty: 1, variant: 'Red' },
        { productId: 'a', qty: 2, variant: 'Blue' },
        { productId: 'a', qty: 3, variant: 'Red' },
      ]),
    ).toEqual([
      { productId: 'a', qty: 4, variant: 'Red' },
      { productId: 'a', qty: 2, variant: 'Blue' },
    ]);
  });

  it('computes discount percent', () => {
    expect(discountPct(499, 999)).toBe(50);
    expect(discountPct(499, 499)).toBe(0);
    expect(discountPct(499)).toBe(0);
  });

  it('derives price from MRP and a discount percentage', () => {
    expect(priceFromDiscount(999, 50)).toBe(499.5);
    expect(priceFromDiscount(400, 25)).toBe(300);
    expect(priceFromDiscount(199, 0)).toBe(199);
  });
});

describe('order state machine', () => {
  it('only allows valid transitions', () => {
    expect(allowedActions('PENDING')).toEqual(['approve', 'reject', 'cancel']);
    expect(allowedActions('APPROVED')).toEqual(['ship', 'cancel']);
    expect(allowedActions('SHIPPED')).toEqual(['deliver']);
    expect(allowedActions('DELIVERED')).toEqual([]);
    expect(canPerform('REJECTED', 'approve')).toBe(false);
  });
});

describe('util + whatsapp', () => {
  it('slugifies names', () => {
    expect(slugify('  Personalised Photo Mug & Coaster (Set of 2)! ')).toBe('personalised-photo-mug-and-coaster-set-of-2');
    expect(slugify('💝💝')).toBe('item');
  });

  it('normalises Indian phone numbers', () => {
    expect(normalizeIndianPhone('+91 98765-43210')).toBe('9876543210');
    expect(normalizeIndianPhone('09876543210')).toBe('9876543210');
    expect(toWaPhone('9876543210')).toBe('919876543210');
    expect(toWaPhone('919876543210')).toBe('919876543210');
  });

  it('builds wa.me links with encoded text', () => {
    expect(waLink('9876543210', 'Hi & bye')).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye');
  });

  it('formats INR', () => {
    expect(formatINR(1299)).toBe('₹1,299');
    expect(formatINR(12.5)).toBe('₹12.50');
  });

  it('includes order number and total in the customer WhatsApp text', () => {
    const text = orderPlacedText(
      {
        orderNumber: 'GNJ-260917-0001',
        total: 677,
        giftWrap: true,
        customer: { name: 'Asha Rao', pincode: '560001' } as never,
        items: [{ productId: 'p', name: 'Mug', slug: 'mug', unitPrice: 299, qty: 2, lineTotal: 598 }],
      },
      'GiftNJoys',
    );
    expect(text).toContain('GNJ-260917-0001');
    expect(text).toContain('₹677');
    expect(text).toContain('Mug × 2');
  });
});

describe('schemas', () => {
  const validCheckout = {
    customer: {
      name: 'Asha Rao',
      phone: '+91 98765 43210',
      email: ' Asha@Example.com ',
      address1: '12, MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    },
    items: [{ productId: '01J', qty: 1 }],
  };

  it('normalises checkout input and applies defaults', () => {
    const parsed = checkoutSchema.parse(validCheckout);
    expect(parsed.customer.phone).toBe('9876543210');
    expect(parsed.customer.email).toBe('asha@example.com');
    expect(parsed.giftWrap).toBe(false);
    expect(parsed.website).toBe('');
  });

  it('rejects bad phone and pincode', () => {
    const res = checkoutSchema.safeParse({
      ...validCheckout,
      customer: { ...validCheckout.customer, phone: '12345', pincode: '000000' },
    });
    expect(res.success).toBe(false);
    const paths = res.error?.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('customer.phone');
    expect(paths).toContain('customer.pincode');
  });

  it('product update schema does not inject defaults', () => {
    expect(productUpdateSchema.parse({ price: 10.005 })).toEqual({ price: 10.01 });
    expect(productCreateSchema.safeParse({ price: 10 }).success).toBe(false);
  });

  it('publish problems', () => {
    expect(publishProblems({ name: 'Mug', price: 0 })).toEqual(['Price must be greater than 0']);
    expect(publishProblems({ name: 'Mug', price: 100, mrp: 150 })).toEqual([]);
  });

  it('ship schema allows empty optional fields', () => {
    expect(shipOrderSchema.parse({ courier: 'Delhivery', awb: 'AWB123' })).toEqual({
      courier: 'Delhivery',
      awb: 'AWB123',
      trackingUrl: '',
      expectedDelivery: '',
    });
  });

  it('settings schemas are fully defaulted', () => {
    const store = storeSettingsSchema.parse({});
    expect(store.storeName).toBe('SmileBox');
    expect(store.adminEmails.length).toBeGreaterThan(0);
  });
});
