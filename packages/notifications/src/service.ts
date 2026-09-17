import type { EmailMessage, EmailSender, Logger } from '@gnj/adapters';
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

/**
 * Errors that retrying won't fix (e.g. SES sandbox rejecting an unverified recipient).
 * These are logged and dropped so a queue retry doesn't re-send the emails that did succeed.
 */
const PERMANENT_EMAIL_ERRORS = new Set([
  'MessageRejected',
  'MailFromDomainNotVerifiedException',
  'AccountSuspendedException',
  'SendingPausedException',
  'BadRequestException',
  'NotFoundException',
]);

type SendResult = 'sent' | 'rejected' | 'failed';

export function createNotificationHandler(deps: NotificationDeps) {
  async function send(kind: string, message: EmailMessage): Promise<SendResult> {
    try {
      await deps.email.send(message);
      return 'sent';
    } catch (err) {
      const name = (err as { name?: string }).name ?? 'Error';
      // Log only the error name: SES messages include recipient addresses.
      if (PERMANENT_EMAIL_ERRORS.has(name)) {
        deps.log.warn('notification.rejected', { kind, error: name });
        return 'rejected';
      }
      deps.log.error('notification.send_failed', { kind, error: name });
      return 'failed';
    }
  }

  return async function handle(event: NotificationEvent): Promise<void> {
    const order = await deps.orders.get(event.orderNumber);
    if (!order) {
      deps.log.warn('notification.order_missing', { orderNumber: event.orderNumber, type: event.type });
      return;
    }
    const store = await deps.settings.get('store');
    const ctx = { store, siteUrl: deps.siteUrl, adminUrl: deps.adminUrl, mediaUrl: deps.mediaUrl };

    let results: SendResult[];
    if (event.type === 'ORDER_PLACED') {
      results = await Promise.all([
        send('admin-new-order', { to: store.adminEmails, replyTo: order.customer.email, ...adminNewOrderEmail(order, ctx) }),
        send('customer-order-received', { to: order.customer.email, replyTo: store.supportEmail, ...customerOrderReceivedEmail(order, ctx) }),
      ]);
    } else {
      const email = customerStatusEmail(order, event.status, ctx);
      if (!email) return;
      results = [await send(`customer-${event.status.toLowerCase()}`, { to: order.customer.email, replyTo: store.supportEmail, ...email })];
    }

    deps.log.info('notification.processed', {
      type: event.type,
      orderNumber: order.orderNumber,
      sent: results.filter((r) => r === 'sent').length,
      rejected: results.filter((r) => r === 'rejected').length,
      failed: results.filter((r) => r === 'failed').length,
    });
    // Retry (via the queue) only when nothing went out and at least one failure looks transient.
    if (results.includes('failed') && !results.includes('sent')) {
      throw new Error(`Email delivery failed for ${event.type} ${order.orderNumber}`);
    }
  };
}
