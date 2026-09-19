import { z } from 'zod';
import { INDIAN_STATES, phoneSchema } from './order';

export const OAUTH_PROVIDERS = ['google', 'facebook'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const savedAddressSchema = z.object({
  phone: phoneSchema,
  address1: z.string().trim().min(5, 'Enter the address').max(200),
  address2: z.string().trim().max(200).default(''),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  state: z.enum(INDIAN_STATES, { error: 'Select a state' }),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
});
export type SavedAddress = z.infer<typeof savedAddressSchema>;

/**
 * A logged-in shopper's account — distinct from `Customer` (order.ts), which is just the
 * contact/shipping snapshot embedded on a single order. Created on first OAuth sign-in.
 */
export interface Account {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  provider: OAuthProvider;
  savedAddress?: SavedAddress;
  createdAt: string;
  updatedAt: string;
}

/** What the storefront server sends after verifying an OAuth identity, to create/refresh the account. */
export const oauthUpsertSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254)),
  name: z.string().trim().min(1).max(80),
  avatarUrl: z.string().trim().max(500).optional(),
  provider: z.enum(OAUTH_PROVIDERS),
});
export type OAuthUpsertInput = z.infer<typeof oauthUpsertSchema>;
