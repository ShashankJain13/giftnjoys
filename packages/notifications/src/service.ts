import type { EmailSender, Logger } from '@gnj/adapters';
import type { OrderStatus, OrdersRepository, SettingsRepository } from '@gnj/core';
import { adminNewOrderEmail, customerOrderReceivedEmail, customerStatusEmail } from './templates';

export type NotificationEvent =
  | { type: 'ORDER_PLACED'; orderNumber: string }
  | { type: 'ORDER_STATUS_CHANGED'; orderNumber: string; status: OrderStatus };

export interface NotificationDeps {
  orders: OrdersRepository;
  settings: SettingsRepository;
  email: EmailSender;
  siteUrl: string;
  adminUrl: string;
  mediaUrl: (key: string) => string;
  log: Logger;
}

export function createNotificationHandler(deps: NotificationDeps) {
  return async function handle(event: NotificationEvent): Promise<void> {
    const order = await deps.orders.get(event.orderNumber);
    if (!order) {
      deps.log.warn('notification.order_missing', { orderNumber: event.orderNumber, type: event.type });
      return;
    }
    const store = await deps.settings.get('store');
    const ctx = { store, siteUrl: deps.siteUrl, adminUrl: deps.adminUrl, mediaUrl: deps.mediaUrl };

    if (event.type === 'ORDER_PLACED') {
      const results = await Promise.allSettled([
        deps.email.send({ to: store.adminEmails, replyTo: order.customer.email, ...adminNewOrderEmail(order, ctx) }),
        deps.email.send({ to: order.customer.email, replyTo: store.supportEmail, ...customerOrderReceivedEmail(order, ctx) }),
      ]);
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) {
        throw new Error(`Failed to send ${failed.length} ORDER_PLACED email(s): ${String((failed[0] as PromiseRejectedResult).reason)}`);
      }
      deps.log.info('notification.sent', { type: event.type, orderNumber: order.orderNumber, emails: 2 });
      return;
    }

    const email = customerStatusEmail(order, event.status, ctx);
    if (!email) return;
    await deps.email.send({ to: order.customer.email, replyTo: store.supportEmail, ...email });
    deps.log.info('notification.sent', { type: event.type, status: event.status, orderNumber: order.orderNumber });
  };
}
