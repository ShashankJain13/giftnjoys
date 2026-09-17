import { z } from 'zod';
import { moneySchema } from './common';

export const storeSettingsSchema = z.object({
  storeName: z.string().trim().min(2).max(60).default('SmileBox'),
  tagline: z.string().trim().max(120).default('Thoughtful gifts for every occasion'),
  /** Business WhatsApp number with country code, digits only (e.g. 919876543210). */
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^\d{10,15}$/, 'Digits only, with country code (e.g. 919876543210)')
    .default('919999999999'),
  supportEmail: z.string().trim().toLowerCase().pipe(z.email()).default('support@smilebox.local'),
  supportPhone: z.string().trim().max(20).default(''),
  adminEmails: z
    .array(z.string().trim().toLowerCase().pipe(z.email()))
    .min(1, 'Add at least one admin email')
    .max(10)
    .default(['admin@smilebox.local']),
  announcement: z.string().trim().max(160).default('Free shipping above ₹999 · Gift wrapping available'),
  address: z.string().trim().max(300).default(''),
  instagramUrl: z.string().trim().max(200).default(''),
  facebookUrl: z.string().trim().max(200).default(''),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const shippingSettingsSchema = z.object({
  flatFee: moneySchema.default(79),
  /** Orders with subtotal at or above this ship free. 0 disables free shipping. */
  freeShippingThreshold: moneySchema.default(999),
  giftWrapFee: moneySchema.default(49),
  dispatchDays: z.string().trim().max(60).default('1–3 business days'),
});
export type ShippingSettings = z.infer<typeof shippingSettingsSchema>;

export const BANNER_THEMES = ['rose', 'amber', 'teal', 'violet', 'sky'] as const;

export const bannerSchema = z.object({
  id: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(80),
  subtitle: z.string().trim().max(160).default(''),
  ctaLabel: z.string().trim().max(30).default('Shop now'),
  ctaHref: z.string().trim().max(300).default('/shop'),
  imageKey: z.string().max(512).optional(),
  theme: z.enum(BANNER_THEMES).default('rose'),
});
export type Banner = z.infer<typeof bannerSchema>;

export const faqSchema = z.object({
  q: z.string().trim().min(3).max(200),
  a: z.string().trim().min(3).max(1000),
});

export const homepageSettingsSchema = z.object({
  banners: z
    .array(bannerSchema)
    .max(8)
    .default([
      {
        id: 'welcome',
        title: 'Gifts that make them smile',
        subtitle: 'Hand-picked gifts for birthdays, anniversaries and every little celebration.',
        ctaLabel: 'Explore gifts',
        ctaHref: '/shop',
        theme: 'rose',
      },
      {
        id: 'festive',
        title: 'Festive hampers & décor',
        subtitle: 'Brighten the season with curated festive picks.',
        ctaLabel: 'Shop festive',
        ctaHref: '/shop?occasion=diwali',
        theme: 'amber',
      },
      {
        id: 'corporate',
        title: 'Corporate gifting made easy',
        subtitle: 'Bulk orders for teams and clients — message us on WhatsApp.',
        ctaLabel: 'View corporate gifts',
        ctaHref: '/shop?occasion=corporate',
        theme: 'teal',
      },
    ]),
  priceTiles: z.array(z.number().int().positive()).max(8).default([199, 499, 999, 1999]),
  faqs: z
    .array(faqSchema)
    .max(20)
    .default([
      {
        q: 'How do I place an order?',
        a: 'Add products to your cart and check out with your delivery details. Your order is confirmed after our team reviews it — you will get an email and can also message us on WhatsApp.',
      },
      {
        q: 'How will I pay?',
        a: 'Online payment is coming soon. For now our team contacts you on WhatsApp after approving your order to share payment options.',
      },
      {
        q: 'When will my order ship?',
        a: 'Approved orders are usually dispatched within 1–3 business days. You will receive courier and tracking details by email.',
      },
      {
        q: 'Can I add a gift message?',
        a: 'Yes — add a personal message and choose gift wrapping at checkout.',
      },
    ]),
});
export type HomepageSettings = z.infer<typeof homepageSettingsSchema>;

export const importSettingsSchema = z.object({
  dateOrder: z.enum(['DMY', 'MDY']).default('DMY'),
  groupWindowMinutes: z.number().int().min(1).max(60).default(3),
  /** categoryId → keywords used to guess a category for imported products. */
  categoryKeywords: z.record(z.string(), z.array(z.string().trim().toLowerCase().min(2).max(40)).max(50)).default({}),
  defaultStockQty: z.number().int().min(0).max(100_000).default(10),
});
export type ImportSettings = z.infer<typeof importSettingsSchema>;

export const SETTINGS_SCHEMAS = {
  store: storeSettingsSchema,
  shipping: shippingSettingsSchema,
  homepage: homepageSettingsSchema,
  import: importSettingsSchema,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type SettingsMap = { [K in SettingsKey]: z.infer<(typeof SETTINGS_SCHEMAS)[K]> };
export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingsKey[];

export function isSettingsKey(value: string): value is SettingsKey {
  return value in SETTINGS_SCHEMAS;
}
