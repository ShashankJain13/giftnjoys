import { formatINR } from './format';
import type { Order, OrderStatus } from './schemas/order';
import { normalizeIndianPhone } from './util';

/** Digits-only international number for wa.me (10-digit Indian numbers get the 91 prefix). */
export function toWaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || (digits.length === 11 && digits.startsWith('0'))) {
    return `91${normalizeIndianPhone(digits)}`;
  }
  return digits;
}

export function waLink(phone: string, text?: string): string {
  const base = `https://wa.me/${toWaPhone(phone)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

type OrderSummary = Pick<Order, 'orderNumber' | 'items' | 'total' | 'customer' | 'giftWrap'>;

/** Message the customer sends to the business after placing an order. */
export function orderPlacedText(order: OrderSummary, storeName: string): string {
  const lines = [
    `Hi ${storeName}, I placed order *${order.orderNumber}*.`,
    '',
    ...order.items.map((i) => `• ${i.name} × ${i.qty} — ${formatINR(i.lineTotal)}`),
    '',
    `Total: *${formatINR(order.total)}*${order.giftWrap ? ' (gift wrapped)' : ''}`,
    `Name: ${order.customer.name}`,
    `Delivery pincode: ${order.customer.pincode}`,
    '',
    'Please confirm my order.',
  ];
  return lines.join('\n');
}

const STATUS_LINES: Partial<Record<OrderStatus, string>> = {
  APPROVED: 'has been approved and will be packed soon.',
  REJECTED: 'could not be accepted.',
  CANCELLED: 'has been cancelled.',
  SHIPPED: 'has been shipped!',
  DELIVERED: 'has been delivered. Thank you for shopping with us!',
};

/** Message the admin sends to the customer when the order status changes. */
export function orderStatusText(
  order: Pick<Order, 'orderNumber' | 'status' | 'customer' | 'shipping' | 'rejectReason' | 'cancelReason'>,
  storeName: string,
  siteUrl: string,
): string {
  const firstName = order.customer.name.split(' ')[0] ?? order.customer.name;
  const lines = [`Hi ${firstName}, your ${storeName} order *${order.orderNumber}* ${STATUS_LINES[order.status] ?? `is now ${order.status.toLowerCase()}.`}`];
  if (order.status === 'SHIPPED' && order.shipping) {
    lines.push('', `Courier: ${order.shipping.courier}`, `AWB / Tracking no: ${order.shipping.awb}`);
    if (order.shipping.trackingUrl) lines.push(`Track: ${order.shipping.trackingUrl}`);
    if (order.shipping.expectedDelivery) lines.push(`Expected delivery: ${order.shipping.expectedDelivery}`);
  }
  if (order.status === 'REJECTED' && order.rejectReason) lines.push('', `Reason: ${order.rejectReason}`);
  if (order.status === 'CANCELLED' && order.cancelReason) lines.push('', `Reason: ${order.cancelReason}`);
  lines.push('', `Track your order: ${siteUrl.replace(/\/$/, '')}/track?order=${encodeURIComponent(order.orderNumber)}`);
  return lines.join('\n');
}
