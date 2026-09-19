import { formatDateIST, formatINR } from '@gnj/core/format';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AddressForm } from './AddressForm';

interface AccountOrder {
  orderNumber: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  items: Array<{ name: string; image?: string; qty: number; lineTotal: number }>;
  total: number;
}

const SERVER_API = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

async function fetchOrders(token: string): Promise<AccountOrder[]> {
  const res = await fetch(`${SERVER_API}/v1/accounts/me/orders`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json()) as { items: AccountOrder[] };
  return data.items;
}

export default async function AccountPage() {
  const session = await auth();
  if (!session?.accountToken) redirect('/');

  const orders = await fetchOrders(session.accountToken);

  return (
    <div className="container-page py-8">
      <h1 className="font-display mb-1 text-3xl font-bold">My account</h1>
      <p className="mb-6 text-neutral-600">
        Signed in as <span className="font-medium">{session.user?.email}</span>
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Order history</h2>
          {orders.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-sm text-neutral-500 ring-1 ring-black/5">
              No orders yet. <Link href="/shop" className="font-medium text-brand-700 underline">Start shopping</Link>.
            </p>
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => (
                <li key={o.orderNumber} className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold">{o.orderNumber}</span>
                      <span className="ml-2 text-sm text-neutral-500">{formatDateIST(o.createdAt)}</span>
                    </div>
                    <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{o.statusLabel}</span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-600">{o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-semibold">{formatINR(o.total)}</span>
                    <Link href={`/track?order=${encodeURIComponent(o.orderNumber)}`} className="text-sm font-medium text-brand-700 hover:underline">
                      Track this order
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          <h2 className="mb-3 text-lg font-semibold">Saved address</h2>
          <AddressForm initial={session.savedAddress} />
        </aside>
      </div>
    </div>
  );
}
