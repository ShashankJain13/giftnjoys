import type { Banner, OccasionSlug, ShippingSettings } from '@gnj/core/schemas';

export interface CategoryRef {
  id: string;
  slug: string;
  name: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  mrp?: number;
  discountPct: number;
  inStock: boolean;
  lowStock: boolean;
  stockLeft?: number;
  moq?: number;
  colors: string[];
  sizes: string[];
  style?: string;
  images: string[];
  videos: string[];
  category: CategoryRef | null;
  tags: string[];
  occasions: OccasionSlug[];
  isBestseller: boolean;
  isFeatured: boolean;
  publishedAt: string;
}

export interface Category extends CategoryRef {
  description?: string;
  imageUrl?: string;
  parentId?: string;
  productCount: number;
  children: Category[];
}

export interface PublicSettings {
  storeName: string;
  tagline: string;
  whatsappNumber: string;
  supportEmail: string;
  supportPhone: string;
  announcement: string;
  address: string;
  instagramUrl: string;
  facebookUrl: string;
  shipping: ShippingSettings;
  occasions: Array<{ slug: OccasionSlug; name: string }>;
}

export interface HomeData {
  banners: Array<Banner & { imageUrl?: string }>;
  categories: Category[];
  newArrivals: Product[];
  bestsellers: Product[];
  featured: Product[];
  priceTiles: Array<{ max: number; count: number }>;
  occasions: Array<{ slug: OccasionSlug; name: string; count: number }>;
  faqs: Array<{ q: string; a: string }>;
}

export interface ProductList {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  category?: { slug: string; name: string; description?: string };
  occasion?: { slug: string; name: string };
  facets: {
    price: { min: number; max: number };
    occasions: Array<{ slug: OccasionSlug; name: string; count: number }>;
  };
}

export interface QuoteLine {
  productId: string;
  qty: number;
  name: string;
  slug?: string;
  image?: string;
  unitPrice: number;
  mrp?: number;
  lineTotal: number;
  problem?: 'UNAVAILABLE' | 'INSUFFICIENT_STOCK';
  available?: number;
  variant?: string;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  shippingFee: number;
  giftWrapFee: number;
  total: number;
  amountToFreeShipping: number;
  freeShippingThreshold: number;
  hasProblems: boolean;
}

export interface PlacedOrder {
  orderNumber: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  customer: { name: string; email: string; phone: string };
  items: Array<{ productId: string; name: string; slug: string; image?: string; unitPrice: number; qty: number; lineTotal: number; variant?: string }>;
  subtotal: number;
  shippingFee: number;
  giftWrapFee: number;
  total: number;
  whatsappLink: string;
}

export interface TrackedOrder {
  orderNumber: string;
  status: 'PENDING' | 'APPROVED' | 'SHIPPED' | 'DELIVERED' | 'REJECTED' | 'CANCELLED';
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{ name: string; slug: string; image?: string; unitPrice: number; qty: number; lineTotal: number; variant?: string }>;
  subtotal: number;
  shippingFee: number;
  giftWrapFee: number;
  total: number;
  deliverTo: { name: string; city: string; pincode: string };
  history: Array<{ status: string; label: string; at: string }>;
  shipping: { courier: string; awb: string; trackingUrl?: string; expectedDelivery?: string; shippedAt: string } | null;
  reason?: string;
}
