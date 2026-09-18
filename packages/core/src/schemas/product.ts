import { z } from 'zod';
import { idSchema, imageRefSchema, moneySchema, slugSchema, type ImageRef } from './common';

export const PRODUCT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const productStatusSchema = z.enum(PRODUCT_STATUSES);

export const PRODUCT_SOURCES = ['MANUAL', 'WHATSAPP'] as const;
export type ProductSource = (typeof PRODUCT_SOURCES)[number];

export const OCCASIONS = [
  { slug: 'birthday', name: 'Birthday' },
  { slug: 'anniversary', name: 'Anniversary' },
  { slug: 'wedding', name: 'Wedding' },
  { slug: 'diwali', name: 'Diwali' },
  { slug: 'rakhi', name: 'Rakhi' },
  { slug: 'valentines', name: "Valentine's Day" },
  { slug: 'housewarming', name: 'Housewarming' },
  { slug: 'corporate', name: 'Corporate Gifting' },
  { slug: 'kids', name: 'For Kids' },
  { slug: 'thank-you', name: 'Thank You' },
] as const;
export type OccasionSlug = (typeof OCCASIONS)[number]['slug'];
export const occasionSlugSchema = z.enum(OCCASIONS.map((o) => o.slug) as [OccasionSlug, ...OccasionSlug[]]);

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId?: string;
  price: number;
  mrp?: number;
  stockQty: number;
  sku?: string;
  moq?: number;
  colors: string[];
  sizes: string[];
  style?: string;
  images: ImageRef[];
  videos: ImageRef[];
  tags: string[];
  occasions: OccasionSlug[];
  isFeatured: boolean;
  isBestseller: boolean;
  status: ProductStatus;
  source: ProductSource;
  importJobId?: string;
  sourceHash?: string;
  parseConfidence?: number;
  parseWarnings?: string[];
  rawSourceText?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

const tagSchema = z.string().trim().toLowerCase().min(1).max(40);

const productFields = {
  name: z.string().trim().min(2, 'Name is too short').max(160),
  slug: slugSchema,
  description: z.string().trim().max(5000),
  categoryId: idSchema.nullable(),
  price: moneySchema,
  mrp: moneySchema.nullable(),
  stockQty: z.number().int().min(0).max(1_000_000),
  sku: z.string().trim().max(64).nullable(),
  moq: z.number().int().min(1).max(100_000).nullable(),
  colors: z.array(z.string().trim().min(1).max(40)).max(20, 'At most 20 colours'),
  sizes: z.array(z.string().trim().min(1).max(40)).max(20, 'At most 20 sizes'),
  style: z.string().trim().max(80).nullable(),
  images: z.array(imageRefSchema).max(12, 'At most 12 images'),
  videos: z.array(imageRefSchema).max(3, 'At most 3 videos'),
  tags: z.array(tagSchema).max(30),
  occasions: z.array(occasionSlugSchema).max(OCCASIONS.length),
  isFeatured: z.boolean(),
  isBestseller: z.boolean(),
};

/** `null` clears an optional field; omitted fields keep their value (update) or take defaults (create). */
export const productCreateSchema = z.object(productFields).partial().required({ name: true, price: true });
export const productUpdateSchema = z.object(productFields).partial();
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const productStatusChangeSchema = z.object({ status: productStatusSchema });

export const PRODUCT_BULK_ACTIONS = ['publish', 'unpublish', 'archive', 'delete', 'setCategory'] as const;
export const productBulkSchema = z
  .object({
    ids: z.array(idSchema).min(1).max(100),
    action: z.enum(PRODUCT_BULK_ACTIONS),
    categoryId: idSchema.nullable().optional(),
  })
  .refine((v) => v.action !== 'setCategory' || v.categoryId !== undefined, {
    message: 'categoryId is required for setCategory',
    path: ['categoryId'],
  });

export const stockChangeSchema = z
  .object({
    set: z.number().int().min(0).max(1_000_000).optional(),
    delta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  })
  .refine((v) => (v.set === undefined) !== (v.delta === undefined), {
    message: 'Provide exactly one of set or delta',
  });

export function discountPct(price: number, mrp?: number): number {
  if (!mrp || mrp <= price || mrp <= 0) return 0;
  return Math.round((1 - price / mrp) * 100);
}

/** Reasons a product cannot be published (empty = ok). */
export function publishProblems(p: Pick<Product, 'name' | 'price' | 'mrp'>): string[] {
  const problems: string[] = [];
  if (!p.name || p.name.trim().length < 2) problems.push('Name is required');
  if (!(p.price > 0)) problems.push('Price must be greater than 0');
  if (p.mrp !== undefined && p.mrp < p.price) problems.push('MRP must be greater than or equal to price');
  return problems;
}
