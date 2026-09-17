import { ORDER_STATUS_LABELS, type OrderStatus, type ProductStatus } from '@gnj/core/schemas';
import { Badge, type Tone } from './ui';

const ORDER_TONES: Record<OrderStatus, Tone> = {
  PENDING: 'amber',
  APPROVED: 'blue',
  SHIPPED: 'violet',
  DELIVERED: 'green',
  REJECTED: 'red',
  CANCELLED: 'slate',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

const PRODUCT_TONES: Record<ProductStatus, Tone> = { DRAFT: 'amber', PUBLISHED: 'green', ARCHIVED: 'slate' };

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge tone={PRODUCT_TONES[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export function ConfidenceBadge({ value }: { value?: number }) {
  if (value === undefined) return null;
  const tone: Tone = value >= 0.8 ? 'green' : value >= 0.5 ? 'amber' : 'red';
  return <Badge tone={tone}>{Math.round(value * 100)}% match</Badge>;
}
