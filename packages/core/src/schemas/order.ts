import { z } from 'zod';
import { normalizeIndianPhone } from '../util';
import { idSchema } from './common';

export const ORDER_STATUSES = ['PENDING', 'APPROVED', 'SHIPPED', 'DELIVERED', 'REJECTED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending approval',
  APPROVED: 'Approved',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizeIndianPhone)
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'));

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254)),
  address1: z.string().trim().min(5, 'Enter your address').max(200),
  address2: z.string().trim().max(200).default(''),
  city: z.string().trim().min(2, 'Enter your city').max(80),
  state: z.enum(INDIAN_STATES, { error: 'Select your state' }),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
});
export type Customer = z.infer<typeof customerSchema>;

export const cartItemInputSchema = z.object({
  productId: idSchema,
  qty: z.number().int().min(1).max(99),
});
export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export const quoteSchema = z.object({
  items: z.array(cartItemInputSchema).min(1).max(50),
  giftWrap: z.boolean().default(false),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export const checkoutSchema = z.object({
  customer: customerSchema,
  items: z.array(cartItemInputSchema).min(1, 'Your cart is empty').max(50),
  giftWrap: z.boolean().default(false),
  giftMessage: z.string().trim().max(300).default(''),
  notes: z.string().trim().max(500).default(''),
  /** Honeypot: real users never fill this hidden field. */
  website: z.string().max(200).default(''),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface OrderItem {
  productId: string;
  name: string;
  slug: string;
  imageKey?: string;
  unitPrice: number;
  mrp?: number;
  qty: number;
  lineTotal: number;
}

export interface OrderStatusChange {
  from: OrderStatus | null;
  to: OrderStatus;
  at: string;
  by: string;
  note?: string;
}

export interface ShippingInfo {
  courier: string;
  awb: string;
  trackingUrl?: string;
  expectedDelivery?: string;
  shippedAt: string;
}

export interface Order {
  orderNumber: string;
  status: OrderStatus;
  customer: Customer;
  /** Duplicated top-level for the byPhone GSI. */
  customerPhone: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  giftWrapFee: number;
  total: number;
  giftWrap: boolean;
  giftMessage: string;
  notes: string;
  statusHistory: OrderStatusChange[];
  shipping?: ShippingInfo;
  rejectReason?: string;
  cancelReason?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
}

const reasonSchema = z.string().trim().min(3, 'Please give a reason').max(300);

export const rejectOrderSchema = z.object({ reason: reasonSchema });
export const cancelOrderSchema = z.object({ reason: reasonSchema });
export const approveOrderSchema = z.object({ note: z.string().trim().max(300).optional() });
export const deliverOrderSchema = z.object({ note: z.string().trim().max(300).optional() });

export const shipOrderSchema = z.object({
  courier: z.string().trim().min(2, 'Enter the courier name').max(60),
  awb: z.string().trim().min(3, 'Enter the AWB / tracking number').max(60),
  trackingUrl: z.union([z.literal(''), z.url('Enter a valid URL').max(500)]).default(''),
  expectedDelivery: z
    .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')])
    .default(''),
});
export type ShipOrderInput = z.infer<typeof shipOrderSchema>;

export const orderNotesSchema = z.object({ adminNotes: z.string().trim().max(2000) });

export const trackOrderSchema = z.object({
  orderNumber: z.string().trim().toUpperCase().min(5).max(40),
  phone: phoneSchema,
});
