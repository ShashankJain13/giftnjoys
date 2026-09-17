'use client';

import { formatINR } from '@gnj/core/format';
import { Menu, Search, ShoppingBag, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { clientApi } from '@/lib/api';
import { cartCount, useCart, useHydrated } from '@/lib/cart';
import { OCCASION_EMOJI } from '@/lib/occasions';
import type { Category, PublicSettings } from '@/lib/types';

interface Suggestions {
  products: Array<{ id: string; slug: string; name: string; price: number; image?: string }>;
  categories: Array<{ slug: string; name: string }>;
}

export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggestions>({ products: [], categories: [] });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setData({ products: [], categories: [] });
      return;
    }
    const t = setTimeout(() => {
      clientApi<Suggestions>(`/search/suggest?q=${encodeURIComponent(term)}`)
        .then(setData)
        .catch(() => setData({ products: [], categories: [] }));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const hasResults = data.products.length > 0 || data.categories.length > 0;

  return (
    <div ref={box} className="relative w-full max-w-xl">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          if (q.trim()) router.push(`/shop?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label className="sr-only" htmlFor={`${listId}-input`}>
          Search gifts
        </label>
        <div className="flex items-center rounded-full bg-neutral-100 px-4 ring-brand-500 focus-within:bg-white focus-within:ring-2">
          <Search className="size-4 text-neutral-500" aria-hidden />
          <input
            id={`${listId}-input`}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search mugs, hampers, frames…"
            autoComplete="off"
            aria-controls={listId}
            className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-neutral-500"
          />
        </div>
      </form>
      {open && hasResults && (
        <div id={listId} className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          {data.categories.length > 0 && (
            <div className="border-b border-neutral-100 p-2">
              {data.categories.map((c) => (
                <Link key={c.slug} href={`/c/${c.slug}`} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-1.5 text-sm hover:bg-brand-50">
                  in <span className="font-medium">{c.name}</span>
                </Link>
              ))}
            </div>
          )}
          <ul className="p-2">
            {data.products.map((p) => (
              <li key={p.id}>
                <Link href={`/p/${p.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-brand-50">
                  {p.image ? <img src={p.image} alt="" className="size-10 rounded-md object-cover" /> : <span className="size-10 rounded-md bg-brand-50" />}
                  <span className="line-clamp-1 flex-1 text-sm">{p.name}</span>
                  <span className="text-sm font-semibold">{formatINR(p.price)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={`/shop?q=${encodeURIComponent(q.trim())}`}
            onClick={() => setOpen(false)}
            className="block border-t border-neutral-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            See all results for “{q.trim()}”
          </Link>
        </div>
      )}
    </div>
  );
}

export function CartButton() {
  const hydrated = useHydrated();
  const count = useCart((s) => cartCount(s.lines));
  return (
    <Link href="/cart" className="relative flex items-center gap-2 rounded-full bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700" aria-label="Cart">
      <ShoppingBag className="size-4" />
      <span className="hidden sm:inline">Cart</span>
      {hydrated && count > 0 && (
        <span data-testid="cart-count" className="flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-brand-700">
          {count}
        </span>
      )}
    </Link>
  );
}

export function MobileMenu({ categories, occasions }: { categories: Category[]; occasions: PublicSettings['occasions'] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-full p-2 hover:bg-brand-50 lg:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-lg font-bold text-brand-700">Menu</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-full p-1.5 hover:bg-neutral-100">
                <X className="size-5" />
              </button>
            </div>
            <nav className="space-y-6 text-sm">
              <div className="space-y-1">
                <Link href="/shop" className="block rounded-lg px-2 py-2 font-medium hover:bg-brand-50">All gifts</Link>
                <Link href="/shop?bestseller=true" className="block rounded-lg px-2 py-2 font-medium hover:bg-brand-50">Bestsellers</Link>
                <Link href="/track" className="block rounded-lg px-2 py-2 font-medium hover:bg-brand-50">Track order</Link>
              </div>
              <div>
                <p className="mb-1 px-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Categories</p>
                {categories.map((c) => (
                  <Link key={c.id} href={`/c/${c.slug}`} className="block rounded-lg px-2 py-2 hover:bg-brand-50">
                    {c.name}
                  </Link>
                ))}
              </div>
              <div>
                <p className="mb-1 px-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Occasions</p>
                {occasions.map((o) => (
                  <Link key={o.slug} href={`/shop?occasion=${o.slug}`} className="block rounded-lg px-2 py-2 hover:bg-brand-50">
                    {OCCASION_EMOJI[o.slug] ?? '🎁'} {o.name}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
