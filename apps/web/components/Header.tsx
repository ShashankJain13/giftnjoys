import Link from 'next/link';
import type { Category, PublicSettings } from '@/lib/types';
import { OCCASION_EMOJI } from '@/lib/occasions';
import { CartButton, MobileMenu, SearchBox } from './HeaderClient';

export function Header({ settings, categories }: { settings: PublicSettings; categories: Category[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/95 backdrop-blur">
      {settings.announcement && (
        <div className="bg-brand-700 px-4 py-1.5 text-center text-xs font-medium text-white sm:text-sm">{settings.announcement}</div>
      )}
      <div className="container-page flex h-16 items-center gap-3 lg:gap-6">
        <MobileMenu categories={categories} occasions={settings.occasions} />
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={`${settings.storeName} home`}>
          <img src="/logo-icon.png" alt="" aria-hidden className="size-9 object-contain sm:size-10" />
          <span className="font-display text-xl font-bold tracking-tight text-brand-700 sm:text-2xl">{settings.storeName}</span>
        </Link>
        <div className="hidden flex-1 md:block">
          <SearchBox />
        </div>
        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/track" className="hidden rounded-full px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-brand-50 sm:block">
            Track order
          </Link>
          <CartButton />
        </nav>
      </div>
      <div className="container-page pb-3 md:hidden">
        <SearchBox />
      </div>
      <nav className="hidden border-t border-black/5 lg:block" aria-label="Main">
        <ul className="container-page flex items-center gap-1 text-sm font-medium">
          <li>
            <Link href="/shop" className="block px-3 py-2.5 hover:text-brand-700">
              All gifts
            </Link>
          </li>
          <li>
            <Link href="/shop?sort=newest" className="block px-3 py-2.5 hover:text-brand-700">
              New arrivals
            </Link>
          </li>
          <li>
            <Link href="/shop?bestseller=true" className="block px-3 py-2.5 hover:text-brand-700">
              Bestsellers
            </Link>
          </li>
          <li className="group relative">
            <button type="button" className="px-3 py-2.5 hover:text-brand-700" aria-haspopup="true">
              Categories ▾
            </button>
            <div className="invisible absolute top-full left-0 z-50 w-[36rem] rounded-2xl bg-white p-4 opacity-0 shadow-xl ring-1 ring-black/5 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <ul className="grid grid-cols-2 gap-1">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link href={`/c/${c.slug}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-brand-50">
                      {c.imageUrl ? (
                        <img src={c.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50">🎁</span>
                      )}
                      <span>
                        <span className="block font-medium">{c.name}</span>
                        <span className="text-xs text-neutral-500">{c.productCount} gifts</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
          <li className="group relative">
            <button type="button" className="px-3 py-2.5 hover:text-brand-700" aria-haspopup="true">
              Occasions ▾
            </button>
            <div className="invisible absolute top-full left-0 z-50 w-72 rounded-2xl bg-white p-2 opacity-0 shadow-xl ring-1 ring-black/5 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              {settings.occasions.map((o) => (
                <Link key={o.slug} href={`/shop?occasion=${o.slug}`} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-brand-50">
                  <span aria-hidden>{OCCASION_EMOJI[o.slug] ?? '🎁'}</span> {o.name}
                </Link>
              ))}
            </div>
          </li>
          {[199, 499, 999].map((max) => (
            <li key={max}>
              <Link href={`/shop?maxPrice=${max}`} className="block px-3 py-2.5 text-neutral-600 hover:text-brand-700">
                Under ₹{max}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
