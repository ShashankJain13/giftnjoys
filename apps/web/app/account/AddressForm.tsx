'use client';

import { savedAddressSchema, INDIAN_STATES } from '@gnj/core/schemas';
import { useSession } from 'next-auth/react';
import { useState, type FormEvent } from 'react';
import { ApiError, clientApi } from '@/lib/api';

interface SavedAddress {
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
}

const empty: SavedAddress = { phone: '', address1: '', address2: '', city: '', state: '', pincode: '' };

export function AddressForm({ initial }: { initial?: SavedAddress }) {
  const { data: session } = useSession();
  const [form, setForm] = useState<SavedAddress>(initial ?? empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string }>();
  const [saving, setSaving] = useState(false);

  const set = (key: keyof SavedAddress) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: '' }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setNotice(undefined);
    const parsed = savedAddressSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    if (!session?.accountToken) return;
    setSaving(true);
    try {
      await clientApi('/accounts/me/address', { method: 'PUT', body: parsed.data, headers: { Authorization: `Bearer ${session.accountToken}` } });
      setNotice({ tone: 'green', text: 'Address saved' });
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiError ? err.message : 'Could not save your address' });
    } finally {
      setSaving(false);
    }
  }

  const inputClass = (invalid?: boolean) =>
    `block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm ring-1 focus:ring-2 focus:ring-brand-500 focus:outline-none ${invalid ? 'ring-red-400' : 'ring-black/15'}`;

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-black/5">
      <p className="text-xs text-neutral-500">Saved here so it's ready next time you check out.</p>
      <div>
        <input placeholder="Mobile number" value={form.phone} onChange={set('phone')} className={inputClass(!!errors.phone)} />
        {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
      </div>
      <div>
        <input placeholder="House / flat, street" value={form.address1} onChange={set('address1')} className={inputClass(!!errors.address1)} />
        {errors.address1 && <p className="mt-1 text-xs text-red-600">{errors.address1}</p>}
      </div>
      <input placeholder="Area, landmark (optional)" value={form.address2} onChange={set('address2')} className={inputClass()} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <input placeholder="City" value={form.city} onChange={set('city')} className={inputClass(!!errors.city)} />
          {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city}</p>}
        </div>
        <div>
          <input placeholder="Pincode" inputMode="numeric" maxLength={6} value={form.pincode} onChange={set('pincode')} className={inputClass(!!errors.pincode)} />
          {errors.pincode && <p className="mt-1 text-xs text-red-600">{errors.pincode}</p>}
        </div>
      </div>
      <div>
        <select value={form.state} onChange={set('state')} className={inputClass(!!errors.state)}>
          <option value="">Select state</option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {errors.state && <p className="mt-1 text-xs text-red-600">{errors.state}</p>}
      </div>
      {notice && <p className={`text-sm ${notice.tone === 'green' ? 'text-emerald-700' : 'text-red-600'}`}>{notice.text}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-full bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
        {saving ? 'Saving…' : 'Save address'}
      </button>
    </form>
  );
}
