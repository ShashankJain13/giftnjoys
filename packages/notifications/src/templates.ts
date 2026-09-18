import {
  formatDateTimeIST,
  formatINR,
  orderPlacedText,
  waLink,
  type Order,
  type OrderStatus,
  type StoreSettings,
} from '@gnj/core';

export interface TemplateContext {
  store: StoreSettings;
  siteUrl: string;
  adminUrl: string;
  mediaUrl: (key: string) => string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = '#e11d48';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const trimUrl = (url: string) => url.replace(/\/$/, '');

function layout(ctx: TemplateContext, preheader: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f6f3f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${BRAND};padding:18px 24px;color:#fff;font-size:20px;font-weight:700">🎁 ${escapeHtml(ctx.store.storeName)}</td></tr>
<tr><td style="padding:24px">${body}</td></tr>
<tr><td style="padding:16px 24px;background:#fafafa;color:#6b7280;font-size:12px">
${escapeHtml(ctx.store.storeName)} · <a href="${escapeHtml(trimUrl(ctx.siteUrl))}" style="color:#6b7280">${escapeHtml(trimUrl(ctx.siteUrl).replace(/^https?:\/\//, ''))}</a>
${ctx.store.supportEmail ? ` · ${escapeHtml(ctx.store.supportEmail)}` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

function button(href: string, label: string, color = BRAND): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;margin:4px 8px 4px 0">${escapeHtml(label)}</a>`;
}

function itemsTable(order: Order, ctx: TemplateContext): string {
  const rows = order.items
    .map(
      (i) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid #f1f1f1;width:56px">${
        i.imageKey
          ? `<img src="${escapeHtml(ctx.mediaUrl(i.imageKey))}" width="48" height="48" style="border-radius:6px;object-fit:cover" alt="">`
          : ''
      }</td>
<td style="padding:8px;border-bottom:1px solid #f1f1f1">${escapeHtml(i.name)}${i.variant ? `<br><span style="color:#6b7280;font-size:12px">${escapeHtml(i.variant)}</span>` : ''}<br><span style="color:#6b7280;font-size:13px">${i.qty} × ${formatINR(i.unitPrice)}</span></td>
<td align="right" style="padding:8px 0;border-bottom:1px solid #f1f1f1;white-space:nowrap">${formatINR(i.lineTotal)}</td></tr>`,
    )
    .join('');
  const line = (label: string, value: string, bold = false) =>
    `<tr><td></td><td style="padding:4px 8px;${bold ? 'font-weight:700' : 'color:#4b5563'}">${label}</td><td align="right" style="padding:4px 0;${bold ? 'font-weight:700' : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}
${line('Subtotal', formatINR(order.subtotal))}
${line('Shipping', order.shippingFee ? formatINR(order.shippingFee) : 'Free')}
${order.giftWrap ? line('Gift wrap', formatINR(order.giftWrapFee)) : ''}
${line('Total', formatINR(order.total), true)}</table>`;
}

function addressBlock(order: Order): string {
  const c = order.customer;
  return [c.name, c.address1, c.address2, `${c.city}, ${c.state} ${c.pincode}`]
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br>');
}

function itemsText(order: Order): string {
  return [
    ...order.items.map((i) => `- ${i.name}${i.variant ? ` (${i.variant})` : ''} x ${i.qty} = ${formatINR(i.lineTotal)}`),
    `Subtotal: ${formatINR(order.subtotal)}`,
    `Shipping: ${order.shippingFee ? formatINR(order.shippingFee) : 'Free'}`,
    ...(order.giftWrap ? [`Gift wrap: ${formatINR(order.giftWrapFee)}`] : []),
    `Total: ${formatINR(order.total)}`,
  ].join('\n');
}

const trackUrl = (order: Order, ctx: TemplateContext) =>
  `${trimUrl(ctx.siteUrl)}/track?order=${encodeURIComponent(order.orderNumber)}`;

export function adminNewOrderEmail(order: Order, ctx: TemplateContext): RenderedEmail {
  const c = order.customer;
  const adminLink = `${trimUrl(ctx.adminUrl)}/orders/${encodeURIComponent(order.orderNumber)}`;
  const chat = waLink(c.phone, `Hi ${c.name}, this is ${ctx.store.storeName} about your order ${order.orderNumber}.`);
  const html = layout(
    ctx,
    `New order ${order.orderNumber} for ${formatINR(order.total)}`,
    `<h2 style="margin:0 0 4px">New order ${escapeHtml(order.orderNumber)}</h2>
<p style="margin:0 0 16px;color:#6b7280">${escapeHtml(formatDateTimeIST(order.createdAt))} · <strong style="color:#b45309">Pending approval</strong></p>
${itemsTable(order, ctx)}
${order.giftMessage ? `<p style="background:#fff1f2;padding:12px;border-radius:8px"><strong>Gift message:</strong> ${escapeHtml(order.giftMessage)}</p>` : ''}
${order.notes ? `<p><strong>Customer notes:</strong> ${escapeHtml(order.notes)}</p>` : ''}
<h3 style="margin:20px 0 6px">Customer</h3>
<p style="margin:0;line-height:1.5">${addressBlock(order)}<br>📞 ${escapeHtml(c.phone)} · ✉️ ${escapeHtml(c.email)}</p>
<p style="margin-top:20px">${button(adminLink, 'Review order')}${button(chat, 'WhatsApp customer', '#16a34a')}</p>`,
  );
  const text = [
    `New order ${order.orderNumber} (pending approval)`,
    '',
    itemsText(order),
    order.giftMessage ? `\nGift message: ${order.giftMessage}` : '',
    order.notes ? `Notes: ${order.notes}` : '',
    '',
    `Customer: ${c.name}, ${c.phone}, ${c.email}`,
    `${c.address1} ${c.address2}, ${c.city}, ${c.state} ${c.pincode}`,
    '',
    `Review: ${adminLink}`,
  ]
    .filter((l) => l !== undefined)
    .join('\n');
  return { subject: `New order ${order.orderNumber} · ${formatINR(order.total)} · pending approval`, html, text };
}

export function customerOrderReceivedEmail(order: Order, ctx: TemplateContext): RenderedEmail {
  const firstName = order.customer.name.split(' ')[0] ?? order.customer.name;
  const whatsapp = waLink(ctx.store.whatsappNumber, orderPlacedText(order, ctx.store.storeName));
  const html = layout(
    ctx,
    `We received your order ${order.orderNumber}`,
    `<h2 style="margin:0 0 8px">Thank you, ${escapeHtml(firstName)}! 🎉</h2>
<p style="margin:0 0 16px;line-height:1.5">We've received your order <strong>${escapeHtml(order.orderNumber)}</strong>. Our team will review it shortly and confirm availability — you'll get another email once it's approved.</p>
${itemsTable(order, ctx)}
<h3 style="margin:20px 0 6px">Delivering to</h3>
<p style="margin:0;line-height:1.5">${addressBlock(order)}</p>
<p style="margin-top:20px">${button(whatsapp, 'Confirm on WhatsApp', '#16a34a')}${button(trackUrl(order, ctx), 'Track order')}</p>`,
  );
  const text = [
    `Thank you, ${firstName}! We received your order ${order.orderNumber}.`,
    'Our team will review it and email you once it is approved.',
    '',
    itemsText(order),
    '',
    `Confirm on WhatsApp: ${whatsapp}`,
    `Track: ${trackUrl(order, ctx)}`,
  ].join('\n');
  return { subject: `We received your order ${order.orderNumber}`, html, text };
}

export function customerStatusEmail(
  order: Order,
  status: OrderStatus,
  ctx: TemplateContext,
): RenderedEmail | undefined {
  const firstName = escapeHtml(order.customer.name.split(' ')[0] ?? order.customer.name);
  const n = escapeHtml(order.orderNumber);
  let subject: string;
  let intro: string;
  let extraHtml = '';
  const extraText: string[] = [];

  switch (status) {
    case 'APPROVED':
      subject = `Your order ${order.orderNumber} is confirmed`;
      intro = `Good news, ${firstName}! Your order <strong>${n}</strong> is confirmed and will be packed soon. We'll email you the tracking details once it ships.`;
      break;
    case 'SHIPPED': {
      subject = `Your order ${order.orderNumber} has shipped`;
      intro = `Your order <strong>${n}</strong> is on its way, ${firstName}! 🚚`;
      const s = order.shipping;
      if (s) {
        extraHtml = `<table role="presentation" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:12px;margin:12px 0;width:100%;font-size:14px">
<tr><td style="padding:4px 12px;color:#4b5563">Courier</td><td style="padding:4px 12px"><strong>${escapeHtml(s.courier)}</strong></td></tr>
<tr><td style="padding:4px 12px;color:#4b5563">Tracking number</td><td style="padding:4px 12px"><strong>${escapeHtml(s.awb)}</strong></td></tr>
${s.expectedDelivery ? `<tr><td style="padding:4px 12px;color:#4b5563">Expected delivery</td><td style="padding:4px 12px">${escapeHtml(s.expectedDelivery)}</td></tr>` : ''}
</table>${s.trackingUrl ? button(s.trackingUrl, 'Track shipment', '#16a34a') : ''}`;
        extraText.push(`Courier: ${s.courier}`, `Tracking number: ${s.awb}`);
        if (s.expectedDelivery) extraText.push(`Expected delivery: ${s.expectedDelivery}`);
        if (s.trackingUrl) extraText.push(`Track shipment: ${s.trackingUrl}`);
      }
      break;
    }
    case 'DELIVERED':
      subject = `Delivered: your order ${order.orderNumber}`;
      intro = `Your order <strong>${n}</strong> has been delivered. We hope it brings a big smile, ${firstName}! 💝`;
      break;
    case 'REJECTED':
      subject = `Update on your order ${order.orderNumber}`;
      intro = `Sorry ${firstName}, we couldn't accept your order <strong>${n}</strong>.`;
      if (order.rejectReason) {
        extraHtml = `<p><strong>Reason:</strong> ${escapeHtml(order.rejectReason)}</p>`;
        extraText.push(`Reason: ${order.rejectReason}`);
      }
      break;
    case 'CANCELLED':
      subject = `Your order ${order.orderNumber} was cancelled`;
      intro = `Your order <strong>${n}</strong> has been cancelled.`;
      if (order.cancelReason) {
        extraHtml = `<p><strong>Reason:</strong> ${escapeHtml(order.cancelReason)}</p>`;
        extraText.push(`Reason: ${order.cancelReason}`);
      }
      break;
    default:
      return undefined;
  }

  const help = waLink(ctx.store.whatsappNumber, `Hi, I have a question about order ${order.orderNumber}.`);
  const html = layout(
    ctx,
    subject,
    `<p style="margin:0 0 12px;line-height:1.5;font-size:16px">${intro}</p>${extraHtml}
${itemsTable(order, ctx)}
<p style="margin-top:20px">${button(trackUrl(order, ctx), 'View order status')}${button(help, 'Chat on WhatsApp', '#16a34a')}</p>`,
  );
  const text = [
    intro.replace(/<[^>]+>/g, ''),
    ...extraText,
    '',
    itemsText(order),
    '',
    `Order status: ${trackUrl(order, ctx)}`,
  ].join('\n');
  return { subject, html, text };
}
