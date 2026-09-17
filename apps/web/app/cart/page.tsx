'use client';

import { formatINR } from '@gnj/core/format';
import { Minus, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clientApi } from '@/lib/api';
import { useCart, useHydrated } from '@/lib/cart';
import type { Quote } from '@/lib/types';

export default function CartPage() {
  const hydrated = useHydrated();
  const { lines, giftWrap, setQty, remove, setGiftWrap } = useCart();
  const [quote, setQuote] = useState<Quote>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const key = JSON.stringify(lines.map((l) => [l.productId, l.qty])) + giftWrap;
  useEffect(() => {
    if (!hydrated) return;
    if (lines.length === 0) {
      setQuote(undefined);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      clientApi<Quote>('/cart/quote', { method: 'POST', body: { items: lines.map((l) => ({ productId: l.productId, qty: l.qty })), giftWrap } })
        .then((q) => {
          setQuote(q);
          setError(undefined);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, key]);

  if (!hydrated) return <div className="container-page py-16 text-center text-neutral-500">Loading your cart…</div>;

  if (lines.length === 0) {
    return (
      <div className="container-page py-20 text-center">
        <div className="text-6xl">🛍️</div>
        <h1 className="font-display mt-4 text-3xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-neutral-600">Find something that will make someone smile.</p>
        <Link href="/shop" className="mt-6 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
          Start shopping
        </Link>
      </div>
    );
  }

  const quoteLine = (id: string) => quote?.lines.find((l) => l.productId === id);
  const freeProgress = quote && quote.freeShippingThreshold > 0 ? Math.min(100, (quote.subtotal / quote.freeShippingThreshold) * 100) : 0;

  return (
    <div className="container-page py-8">
      <h1 className="font-display mb-6 text-3xl font-bold">Your cart</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          {lines.map((line) => {
            const q = quoteLine(line.productId);
            const price = q && !q.problem ? q.unitPrice : line.price;
            return (
              <div key={line.productId} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-black/5" data-testid="cart-line">
                <Link href={`/p/${line.slug}`} className="size-24 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                  {line.image ? <img src={line.image} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-3xl">🎁</span>}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/p/${line.slug}`} className="line-clamp-2 font-medium hover:text-brand-700">
                      {line.name}
                    </Link>
                    <button type="button" onClick={() => remove(line.productId)} aria-label={`Remove ${line.name}`} className="rounded-full p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <span className="mt-1 text-sm text-neutral-600">{formatINR(price)} each</span>
                  {q && q.unitPrice > 0 && q.unitPrice !== line.price && <span className="text-xs text-amber-700">Price updated to {formatINR(q.unitPrice)}</span>}
                  {q?.problem === 'UNAVAILABLE' && <span className="mt-1 text-sm font-medium text-red-600">No longer available — please remove it</span>}
                  {q?.problem === 'INSUFFICIENT_STOCK' && (
                    <span className="mt-1 text-sm font-medium text-red-600">
                      Only {q.available ?? 0} in stock{' '}
                      {(q.available ?? 0) > 0 && (
                        <button type="button" className="underline" onClick={() => setQty(line.productId, q.available!)}>
                          Set to {q.available}
                        </button>
                      )}
                    </span>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="flex items-center rounded-full ring-1 ring-black/10">
                      <button type="button" aria-label="Decrease quantity" onClick={() => setQty(line.productId, line.qty - 1)} className="p-2">
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold">{line.qty}</span>
                      <button type="button" aria-label="Increase quantity" onClick={() => setQty(line.productId, line.qty + 1)} className="p-2">
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <span className="font-semibold">{formatINR(q ? q.lineTotal : price * line.qty)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="h-fit space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5 lg:sticky lg:top-40">
          <h2 className="text-lg font-semibold">Order summary</h2>
          {quote && quote.freeShippingThreshold > 0 && (
            <div>
              <p className="text-sm">
                {quote.amountToFreeShipping > 0 ? (
                  <>Add <strong>{formatINR(quote.amountToFreeShipping)}</strong> more for free shipping</>
                ) : (
                  <span className="font-medium text-emerald-700">🎉 You’ve unlocked free shipping</span>
                )}
              </p>
              <div className="mt-2 h-2 rounded-full bg-neutral-100">
                <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${freeProgress}%` }} />
              </div>
            </div>
          )}
          <label className="flex items-start gap-3 rounded-xl bg-brand-50 p-3 text-sm">
            <input type="checkbox" checked={giftWrap} onChange={(e) => setGiftWrap(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
            <span>
              <span className="font-medium">Add gift wrapping 🎀</span>
              <span className="block text-xs text-neutral-600">You can write a gift message at checkout</span>
            </span>
          </label>
          <dl className={`space-y-2 text-sm ${loading ? 'opacity-60' : ''}`}>
            <div className="flex justify-between">
              <dt className="text-neutral-600">Subtotal</dt>
              <dd>{quote ? formatINR(quote.subtotal) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">Shipping</dt>
              <dd>{quote ? (quote.shippingFee ? formatINR(quote.shippingFee) : 'Free') : '—'}</dd>
            </div>
            {giftWrap && (
              <div className="flex justify-between">
                <dt className="text-neutral-600">Gift wrap</dt>
                <dd>{quote ? formatINR(quote.giftWrapFee) : '—'}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-neutral-100 pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd data-testid="cart-total">{quote ? formatINR(quote.total) : '—'}</dd>
            </div>
          </dl>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {quote?.hasProblems && <p className="text-sm text-red-600">Please fix the items marked in red to continue.</p>}
          <Link
            href="/checkout"
            aria-disabled={!quote || quote.hasProblems}
            className={`block rounded-full px-6 py-3.5 text-center font-semibold text-white ${!quote || quote.hasProblems ? 'pointer-events-none bg-neutral-300' : 'bg-brand-600 hover:bg-brand-700'}`}
          >
            Proceed to checkout
          </Link>
          <p className="text-center text-xs text-neutral-500">No payment now — we confirm your order on WhatsApp first.</p>
        </aside>
      </div>
    </div>
  );
}
