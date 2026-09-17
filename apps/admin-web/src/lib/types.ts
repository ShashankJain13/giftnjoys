import type { OrderAction } from '@gnj/core/orders';
import type {
  Category,
  HomepageSettings,
  ImportJob,
  ImportSettings,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ShippingSettings,
  StoreSettings,
} from '@gnj/core/schemas';

export type ProductDto = Omit<Product, 'images'> & {
  images: Array<{ key: string; url: string }>;
  discountPct: number;
};

export type CategoryDto = Category & { imageUrl?: string; productCount?: number };

export type OrderDto = Omit<Order, 'items'> & {
  items: Array<OrderItem & { imageUrl?: string }>;
  allowedActions: OrderAction[];
  whatsappLink: string;
};

export interface OrderSummary {
  orderNumber: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  city: string;
  itemCount: number;
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardSummary {
  ordersByStatus: Record<OrderStatus, number>;
  ordersToday: number;
  productCounts: { published: number; drafts: number };
  pendingOrders: OrderSummary[];
  lowStock: ProductDto[];
  recentImports: ImportJob[];
}

export type ImportJobDto = ImportJob & { products?: { DRAFT: number; PUBLISHED: number; ARCHIVED: number } };

export interface AllSettings {
  store: StoreSettings;
  shipping: ShippingSettings;
  homepage: HomepageSettings;
  import: ImportSettings;
}

export interface AdminPrincipal {
  sub: string;
  email: string;
  name?: string;
}
