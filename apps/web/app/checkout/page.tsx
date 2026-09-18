'use client';

import { formatINR } from '@gnj/core/format';
import { checkoutSchema, INDIAN_STATES } from '@gnj/core/schemas';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, clientApi } from '@/lib/api';
import { useCart, useHydrated } from '@/lib/cart';
import type { PlacedOrder, Quote } from '@/lib/types';

interface FormValues {
  name: string;
  phone: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  giftMessage: string;
  notes: string;
  website: string;
}

const initial: FormValues = { name: '', phone: '', email: '', address1: '', address2: '', city: '', state: '', pincode: '', giftMessage: '', notes: '', website: '' };

function Field({ label, error, children, className = '' }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-neutral-800">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const inputClass = (invalid?: boolean) =>
  `block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm ring-1 focus:ring-2 focus:ring-brand-500 focus:outline-none ${invalid ? 'ring-red-400' : 'ring-black/15'}`;

export default function CheckoutPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { lines, giftWrap, setGiftWrap, clear } = useCart();
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ReactNode>();
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<Quote>();
  const idempotencyKey = useRef<string>('');
  const placed = useRef(false);

  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, []);

  useEffect(() => {
    if (!hydrated || lines.length === 0) return;
    clientApi<Quote>('/cart/quote', {
      method: 'POST',
      body: { items: lines.map((l) => ({ productId: l.productId, qty: l.qty, ...(l.variant ? { variant: l.variant } : {}) })), giftWrap },
    })
      .then(setQuote)
      .catch(() => undefined);
  }, [hydrated, lines, giftWrap]);

  useEffect(() => {
    if (hydrated && lines.length === 0 && !placed.current) router.replace('/cart');
  }, [hydrated, lines.length, router]);

  const set = (key: keyof FormValues) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [`customer.${key}`]: '', [key]: '' }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const payload = {
      customer: {
        name: values.name,
        phone: values.phone,
        email: values.email,
        address1: values.address1,
        address2: values.address2,
        city: values.city,
        state: values.state,
        pincode: values.pincode,
      },
      items: lines.map((l) => ({ productId: l.productId, qty: l.qty, ...(l.variant ? { variant: l.variant } : {}) })),
      giftWrap,
      giftMessage: values.giftMessage,
      notes: values.notes,
      website: values.website,
    };
    const parsed = checkoutSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      setFormError('Please check the highlighted fields.');
      return;
    }
    setSubmitting(true);
    try {
      const order = await clientApi<PlacedOrder>('/orders', {
        method: 'POST',
        body: payload,
        headers: { 'Idempotency-Key': idempotencyKey.current },
      });
      try {
        sessionStorage.setItem(`gnj-order-${order.orderNumber}`, JSON.stringify(order));
      } catch {
        /* storage unavailable */
      }
      placed.current = true;
      clear();
      router.push(`/order/${order.orderNumber}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
          setErrors(Object.fromEntries((err.details as Array<{ path: string; message: string }>).map((d) => [d.path, d.message])));
        }
        setFormError(
          err.code === 'CART_CHANGED' ? (
            <>
              {err.message}{' '}
              <Link href="/cart" className="font-semibold underline">
                Review your cart
              </Link>
            </>
          ) : (
            err.message
          ),
        );
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  if (!hydrated || lines.length === 0) return <div className="container-page py-16 text-center text-neutral-500">Loading…</div>;
  const e = (k: string) => errors[`customer.${k}`] || errors[k];

  return (
    <div className="container-page py-8">
      <h1 className="font-display mb-6 text-3xl font-bold">Checkout</h1>
      <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <h2 className="mb-4 text-lg font-semibold">Contact</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={e('name')} className="sm:col-span-2">
                <input name="name" autoComplete="name" value={values.name} onChange={set('name')} className={inputClass(!!e('name'))} />
              </Field>
              <Field label="Mobile number (WhatsApp)" error={e('phone')}>
                <div className="flex">
                  <span className="flex items-center rounded-l-xl bg-neutral-100 px-3 text-sm text-neutral-600 ring-1 ring-black/15">+91</span>
                  <input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" value={values.phone} onChange={set('phone')} className={`${inputClass(!!e('phone'))} rounded-l-none`} />
                </div>
              </Field>
              <Field label="Email" error={e('email')}>
                <input name="email" type="email" autoComplete="email" value={values.email} onChange={set('email')} className={inputClass(!!e('email'))} />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <h2 className="mb-4 text-lg font-semibold">Delivery address</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="House / flat, street" error={e('address1')} className="sm:col-span-2">
                <input name="address1" autoComplete="address-line1" value={values.address1} onChange={set('address1')} className={inputClass(!!e('address1'))} />
              </Field>
              <Field label="Area, landmark (optional)" error={e('address2')} className="sm:col-span-2">
                <input name="address2" autoComplete="address-line2" value={values.address2} onChange={set('address2')} className={inputClass(!!e('address2'))} />
              </Field>
              <Field label="City" error={e('city')}>
                <input name="city" autoComplete="address-level2" value={values.city} onChange={set('city')} className={inputClass(!!e('city'))} />
              </Field>
              <Field label="Pincode" error={e('pincode')}>
                <input name="pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={values.pincode} onChange={set('pincode')} className={inputClass(!!e('pincode'))} />
              </Field>
              <Field label="State" error={e('state')} className="sm:col-span-2">
                <select name="state" autoComplete="address-level1" value={values.state} onChange={set('state')} className={inputClass(!!e('state'))}>
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <h2 className="mb-4 text-lg font-semibold">Make it special 🎀</h2>
            <label className="mb-4 flex items-center gap-3 text-sm">
              <input type="checkbox" checked={giftWrap} onChange={(ev) => setGiftWrap(ev.target.checked)} className="size-4 accent-brand-600" />
              Gift wrap my order {quote && `(${formatINR(quote.giftWrapFee || 0)})`}
            </label>
            <Field label="Gift message (optional)" error={errors.giftMessage}>
              <textarea name="giftMessage" rows={3} maxLength={300} value={values.giftMessage} onChange={set('giftMessage')} placeholder="Happy birthday! Wishing you a wonderful year ahead." className={inputClass(!!errors.giftMessage)} />
            </Field>
            <Field label="Notes for us (optional)" error={errors.notes} className="mt-4">
              <textarea name="notes" rows={2} maxLength={500} value={values.notes} onChange={set('notes')} placeholder="Preferred delivery date, colour preference…" className={inputClass(!!errors.notes)} />
            </Field>
            {/* Honeypot: hidden from people, tempting for bots */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" name="website" value={values.website} onChange={set('website')} />
              </label>
            </div>
          </section>
        </div>

        <aside className="h-fit space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5 lg:sticky lg:top-40">
          <h2 className="text-lg font-semibold">Your order</h2>
          <ul className="space-y-3">
            {lines.map((l) => {
              const q = quote?.lines.find((x) => x.productId === l.productId && (x.variant ?? '') === (l.variant ?? ''));
              return (
                <li key={`${l.productId}::${l.variant ?? ''}`} className="flex items-center gap-3 text-sm">
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                    {l.image && <img src={l.image} alt="" className="size-full object-cover" />}
                    <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">{l.qty}</span>
                  </span>
                  <span className="line-clamp-2 flex-1">
                    {l.name}
                    {l.variant && <span className="block text-xs text-neutral-500">{l.variant}</span>}
                  </span>
                  <span className="font-medium">{formatINR(q?.lineTotal ?? l.price * l.qty)}</span>
                </li>
              );
            })}
          </ul>
          {quote && (
            <dl className="space-y-1.5 border-t border-neutral-100 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-neutral-600">Subtotal</dt><dd>{formatINR(quote.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-600">Shipping</dt><dd>{quote.shippingFee ? formatINR(quote.shippingFee) : 'Free'}</dd></div>
              {giftWrap && <div className="flex justify-between"><dt className="text-neutral-600">Gift wrap</dt><dd>{formatINR(quote.giftWrapFee)}</dd></div>}
              <div className="flex justify-between pt-1 text-base font-bold"><dt>Total</dt><dd>{formatINR(quote.total)}</dd></div>
            </dl>
          )}
          {formError && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{formError}</div>}
          <button type="submit" disabled={submitting} className="w-full rounded-full bg-brand-600 px-6 py-3.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
          <p className="text-xs leading-relaxed text-neutral-500">
            No payment is taken now. After placing your order you can confirm it with us on WhatsApp; we’ll email you once it’s approved.
          </p>
        </aside>
      </form>
    </div>
  );
}
