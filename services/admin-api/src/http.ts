import {
  AppError,
  allowedActions,
  badRequest,
  discountPct,
  orderStatusText,
  toIssues,
  waLink,
  type Category,
  type Order,
  type Product,
} from '@gnj/core';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AdminPrincipal } from './auth';
import type { AppContext } from './context';

export type AdminEnv = { Variables: { admin: AdminPrincipal } };

export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  return parseWith(schema, json);
}

export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', toIssues(result.error));
  }
  return result.data;
}

export function toProductDto(ctx: AppContext, p: Product) {
  return {
    ...p,
    images: p.images.map((img) => ({ key: img.key, url: ctx.storage.publicUrl(img.key) })),
    videos: p.videos.map((v) => ({ key: v.key, url: ctx.storage.publicUrl(v.key) })),
    discountPct: discountPct(p.price, p.mrp),
  };
}

export function toCategoryDto(ctx: AppContext, c: Category, productCount?: number) {
  return {
    ...c,
    imageUrl: c.imageKey ? ctx.storage.publicUrl(c.imageKey) : undefined,
    ...(productCount !== undefined ? { productCount } : {}),
  };
}

export async function toOrderDto(ctx: AppContext, order: Order) {
  const store = await ctx.repos.settings.get('store');
  return {
    ...order,
    items: order.items.map((i) => ({ ...i, imageUrl: i.imageKey ? ctx.storage.publicUrl(i.imageKey) : undefined })),
    allowedActions: allowedActions(order.status),
    whatsappLink: waLink(order.customer.phone, orderStatusText(order, store.storeName, ctx.env.PUBLIC_SITE_URL)),
  };
}

export function toOrderSummary(order: Order) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    city: order.customer.city,
    itemCount: order.items.reduce((n, i) => n + i.qty, 0),
    total: order.total,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
