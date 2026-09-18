'use client';

import { formatINR } from '@gnj/core/format';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import type { PlacedOrder } from '@/lib/types';

export default function OrderPlacedPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = use(params);
  const [order, setOrder] = useState<PlacedOrder | null>();

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`gnj-order-${orderNumber}`);
      setOrder(raw ? (JSON.parse(raw) as PlacedOrder) : null);
    } catch {
      setOrder(null);
    }
  }, [orderNumber]);

  if (order === undefined) return <div className="container-page py-16 text-center text-neutral-500">Loading…</div>;

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="rounded-3xl bg-white p-6 text-center ring-1 ring-black/5 sm:p-10">
        <CheckCircle2 className="mx-auto size-16 text-emerald-500" aria-hidden />
        <h1 className="font-display mt-4 text-3xl font-bold">Thank you{order ? `, ${order.customer.name.split(' ')[0]}` : ''}!</h1>
        <p className="mt-2 text-neutral-600">
          Your order <strong data-testid="order-number">{orderNumber}</strong> has been received and is{' '}
          <span className="font-semibold text-amber-700">pending approval</span>.
        </p>

        {order && (
          <>
            <a
              href={order.whatsappLink}
              target="_blank"
              rel="noreferrer"
              data-testid="whatsapp-confirm"
              className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              💬 Send order on WhatsApp
            </a>
            <p className="mt-2 text-xs text-neutral-500">Sends your order details to our team so we can confirm faster.</p>
          </>
        )}

        <ol className="mx-auto mt-8 grid max-w-xl gap-3 text-left sm:grid-cols-3">
          {[
            { t: 'We review', d: 'Our team checks availability for your gifts.' },
            { t: 'You get confirmation', d: `An email${order ? ` to ${order.customer.email}` : ''} once approved.` },
            { t: 'We ship', d: 'Courier & tracking details by email.' },
          ].map((s, i) => (
            <li key={s.t} className="rounded-2xl bg-cream p-4">
              <span className="text-xs font-bold text-brand-700">STEP {i + 1}</span>
              <span className="mt-1 block font-semibold">{s.t}</span>
              <span className="mt-1 block text-xs text-neutral-600">{s.d}</span>
            </li>
          ))}
        </ol>
      </div>

      {order && (
        <div className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-black/5">
          <h2 className="mb-4 text-lg font-semibold">Order summary</h2>
          <ul className="divide-y divide-neutral-100">
            {order.items.map((i) => (
              <li key={i.productId} className="flex items-center gap-3 py-3 text-sm">
                <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-brand-50">{i.image && <img src={i.image} alt="" className="size-full object-cover" />}</span>
                <span className="flex-1">
                  {i.name} <span className="text-neutral-500">× {i.qty}</span>
                  {i.variant && <span className="block text-xs text-neutral-500">{i.variant}</span>}
                </span>
                <span className="font-medium">{formatINR(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-neutral-600">Subtotal</dt><dd>{formatINR(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-600">Shipping</dt><dd>{order.shippingFee ? formatINR(order.shippingFee) : 'Free'}</dd></div>
            {order.giftWrapFee > 0 && <div className="flex justify-between"><dt className="text-neutral-600">Gift wrap</dt><dd>{formatINR(order.giftWrapFee)}</dd></div>}
            <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatINR(order.total)}</dd></div>
          </dl>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href={`/track?order=${orderNumber}`} className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-black/15 hover:bg-white">
          Track this order
        </Link>
        <Link href="/shop" className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
