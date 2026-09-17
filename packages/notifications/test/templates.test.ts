import { storeSettingsSchema, type Order } from '@gnj/core';
import { describe, expect, it } from 'vitest';
import { adminNewOrderEmail, customerOrderReceivedEmail, customerStatusEmail, escapeHtml } from '../src/templates';

const ctx = {
  store: storeSettingsSchema.parse({ whatsappNumber: '919876500000' }),
  siteUrl: 'http://localhost:3000/',
  adminUrl: 'http://localhost:5173',
  mediaUrl: (k: string) => `http://media.local/${k}`,
};

const order: Order = {
  orderNumber: 'GNJ-260917-0001',
  status: 'PENDING',
  customer: {
    name: 'Asha <script>alert(1)</script> Rao',
    phone: '9876543210',
    email: 'asha@example.com',
    address1: '12 MG Road',
    address2: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
  },
  customerPhone: '9876543210',
  items: [{ productId: 'p1', name: 'Mug & Coaster', slug: 'mug', imageKey: 'products/p1/1.jpg', unitPrice: 299, qty: 2, lineTotal: 598 }],
  subtotal: 598,
  shippingFee: 79,
  giftWrapFee: 49,
  total: 726,
  giftWrap: true,
  giftMessage: 'Happy birthday! <3',
  notes: '',
  statusHistory: [],
  createdAt: '2026-09-17T06:30:00.000Z',
  updatedAt: '2026-09-17T06:30:00.000Z',
};

describe('email templates', () => {
  it('escapes customer-provided values in admin email', () => {
    const email = adminNewOrderEmail(order, ctx);
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('Happy birthday! &lt;3');
    expect(email.html).toContain('http://localhost:5173/orders/GNJ-260917-0001');
    expect(email.subject).toContain('₹726');
  });

  it('customer email has WhatsApp confirm link to store number and tracking link', () => {
    const email = customerOrderReceivedEmail(order, ctx);
    expect(email.html).toContain('https://wa.me/919876500000?text=');
    expect(email.text).toContain('http://localhost:3000/track?order=GNJ-260917-0001');
  });

  it('shipped email includes courier details', () => {
    const shipped: Order = {
      ...order,
      status: 'SHIPPED',
      shipping: { courier: 'Delhivery', awb: 'AWB123', trackingUrl: 'https://track.example/AWB123', shippedAt: order.createdAt },
    };
    const email = customerStatusEmail(shipped, 'SHIPPED', ctx)!;
    expect(email.subject).toBe('Your order GNJ-260917-0001 has shipped');
    expect(email.text).toContain('Tracking number: AWB123');
    expect(email.html).toContain('https://track.example/AWB123');
  });

  it('returns nothing for PENDING status changes', () => {
    expect(customerStatusEmail(order, 'PENDING', ctx)).toBeUndefined();
  });

  it('escapeHtml handles quotes', () => {
    expect(escapeHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });
});
