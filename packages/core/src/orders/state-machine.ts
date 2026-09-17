import type { OrderStatus } from '../schemas/order';

export const ORDER_ACTIONS = ['approve', 'reject', 'ship', 'deliver', 'cancel'] as const;
export type OrderAction = (typeof ORDER_ACTIONS)[number];

export const ORDER_TRANSITIONS: Record<OrderAction, { from: readonly OrderStatus[]; to: OrderStatus }> = {
  approve: { from: ['PENDING'], to: 'APPROVED' },
  reject: { from: ['PENDING'], to: 'REJECTED' },
  ship: { from: ['APPROVED'], to: 'SHIPPED' },
  deliver: { from: ['SHIPPED'], to: 'DELIVERED' },
  cancel: { from: ['PENDING', 'APPROVED'], to: 'CANCELLED' },
};

export function canPerform(status: OrderStatus, action: OrderAction): boolean {
  return ORDER_TRANSITIONS[action].from.includes(status);
}

export function allowedActions(status: OrderStatus): OrderAction[] {
  return ORDER_ACTIONS.filter((action) => canPerform(status, action));
}

export function nextStatus(action: OrderAction): OrderStatus {
  return ORDER_TRANSITIONS[action].to;
}

/** Stock is deducted on approval, so cancelling an approved order puts it back. */
export function reservesStock(status: OrderStatus): boolean {
  return status === 'APPROVED' || status === 'SHIPPED' || status === 'DELIVERED';
}

export function isTerminal(status: OrderStatus): boolean {
  return allowedActions(status).length === 0;
}
