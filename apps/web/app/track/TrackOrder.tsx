'use client';

import { formatDateIST, formatDateTimeIST, formatINR } from '@gnj/core/format';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/api';
import type { TrackedOrder } from '@/lib/types';

const STEPS: Array<{ status: TrackedOrder['status']; label: string }> = [
  { status: 'PENDING', label: 'Order placed' },
  { status: 'APPROVED', label: 'Confirmed' },
  { status: 'SHIPPED', label: 'Shipped' },
  { status: 'DELIVERED', label: 'Delivered' },
];

export function TrackOrder() {
  const params = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get('order') ?? '');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<TrackedOrder>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      const qs = new URLSearchParams({ orderNumber: orderNumber.trim(), phone: phone.trim() });
      setOrder(await clientApi<TrackedOrder>(`/orders/track?${qs}`));
    } catch (err) {
      setOrder(undefined);
      setError((err as Error).message.replace('Order with these details not found', 'We couldn’t find an order with these details. Check the order number and mobile number.'));
    } finally {
      setLoading(false);
    }
  }

  const stopped = order && (order.status === 'REJECTED' || order.status === 'CANCELLED');
  const currentStep = order ? STEPS.findIndex((s) => s.status === order.status) : -1;

  return (
    <>
      <form onSubmit={submit} className="mt-6 grid gap-3 rounded-2xl bg-white p-5 ring-1 ring-black/5 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Order number</span>
          <input
            required
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            placeholder="GNJ-260917-0001"
            className="w-full rounded-xl border-0 px-3.5 py-2.5 ring-1 ring-black/15 focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Mobile number</span>
          <input
            required
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98XXXXXXXX"
            className="w-full rounded-xl border-0 px-3.5 py-2.5 ring-1 ring-black/15 focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <button type="submit" disabled={loading} className="self-end rounded-full bg-brand-600 px-6 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {loading ? 'Checking…' : 'Track'}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {order && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{order.orderNumber}</h2>
              <span className="text-sm text-neutral-500">Placed {formatDateTimeIST(order.createdAt)}</span>
            </div>
            <p className="mt-1 text-sm" data-testid="track-status">
              Status: <strong>{order.statusLabel}</strong>
            </p>

            {stopped ? (
              <p className="mt-4 rounded-xl bg-neutral-100 p-3 text-sm">
                This order was {order.status.toLowerCase()}.{order.reason && <> Reason: {order.reason}</>}
              </p>
            ) : (
              <ol className="mt-6 grid grid-cols-4 gap-2">
                {STEPS.map((s, i) => {
                  const done = i <= currentStep;
                  const at = order.history.find((h) => h.status === s.status)?.at;
                  return (
                    <li key={s.status} className="text-center">
                      <div className={`mx-auto h-2 rounded-full ${done ? 'bg-emerald-500' : 'bg-neutral-200'}`} />
                      <span className={`mt-2 block text-xs font-semibold sm:text-sm ${done ? 'text-emerald-700' : 'text-neutral-400'}`}>{s.label}</span>
                      {at && <span className="block text-[11px] text-neutral-500">{formatDateIST(at)}</span>}
                    </li>
                  );
                })}
              </ol>
            )}

            {order.shipping && (
              <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm">
                <p>
                  <strong>{order.shipping.courier}</strong> · Tracking no. <strong>{order.shipping.awb}</strong>
                </p>
                {order.shipping.expectedDelivery && <p className="mt-1">Expected delivery: {order.shipping.expectedDelivery}</p>}
                {order.shipping.trackingUrl && (
                  <a href={order.shipping.trackingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-emerald-800 underline">
                    Track with courier →
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
            <h3 className="mb-3 font-semibold">Items</h3>
            <ul className="divide-y divide-neutral-100 text-sm">
              {order.items.map((i) => (
                <li key={i.slug + i.name} className="flex items-center gap-3 py-2.5">
                  <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-brand-50">{i.image && <img src={i.image} alt="" className="size-full object-cover" />}</span>
                  <span className="flex-1">
                    {i.name} × {i.qty}
                    {i.variant && <span className="block text-xs text-neutral-500">{i.variant}</span>}
                  </span>
                  <span>{formatINR(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex justify-between border-t border-neutral-100 pt-3 font-bold">
              <span>Total</span>
              <span>{formatINR(order.total)}</span>
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Delivering to {order.deliverTo.name}, {order.deliverTo.city} {order.deliverTo.pincode}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
