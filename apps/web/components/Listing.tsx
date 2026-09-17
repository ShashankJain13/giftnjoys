import Link from 'next/link';
import type { Category, ProductList } from '@/lib/types';
import { OCCASION_EMOJI } from '@/lib/occasions';
import { ProductGrid } from './ProductCard';
import { SortSelect } from './SortSelect';

export type ListingParams = Partial<Record<'q' | 'occasion' | 'minPrice' | 'maxPrice' | 'sort' | 'page' | 'inStock' | 'bestseller' | 'featured', string>>;

const PRICE_RANGES = [
  { label: 'Under ₹199', max: '199' },
  { label: '₹199 – ₹499', min: '199', max: '499' },
  { label: '₹499 – ₹999', min: '499', max: '999' },
  { label: '₹999 – ₹1,999', min: '999', max: '1999' },
  { label: 'Above ₹1,999', min: '1999' },
];

function hrefWith(basePath: string, current: ListingParams, patch: ListingParams): string {
  const next = new URLSearchParams();
  const merged = { ...current, ...patch, page: patch.page };
  for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function listingTitle(list: ProductList | null, params: ListingParams): string {
  if (list?.category) return list.category.name;
  if (params.q) return `Results for “${params.q}”`;
  if (list?.occasion) return `${list.occasion.name} gifts`;
  if (params.bestseller === 'true') return 'Bestsellers';
  if (params.featured === 'true') return 'Editor’s picks';
  if (params.maxPrice && !params.minPrice) return `Gifts under ₹${Number(params.maxPrice).toLocaleString('en-IN')}`;
  return 'All gifts';
}

export function Listing({
  list,
  params,
  basePath,
  categories,
  activeCategorySlug,
}: {
  list: ProductList;
  params: ListingParams;
  basePath: string;
  categories: Category[];
  activeCategorySlug?: string;
}) {
  const title = listingTitle(list, params);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const chip = (active: boolean) =>
    `block rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-brand-600 font-medium text-white' : 'text-neutral-700 hover:bg-brand-50'}`;
  const activeRange = PRICE_RANGES.find((r) => (r.min ?? '') === (params.minPrice ?? '') && (r.max ?? '') === (params.maxPrice ?? ''));
  const hasFilters = !!(params.occasion || params.minPrice || params.maxPrice || params.inStock || params.bestseller || params.featured);

  return (
    <div className="container-page py-8">
      <nav className="mb-3 text-xs text-neutral-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-brand-700">Home</Link> / <Link href="/shop" className="hover:text-brand-700">Shop</Link>
        {list.category && <> / <span className="text-neutral-700">{list.category.name}</span></>}
      </nav>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          {list.category?.description && <p className="mt-1 max-w-2xl text-sm text-neutral-600">{list.category.description}</p>}
          <p className="mt-1 text-sm text-neutral-500" data-testid="result-count">
            {list.total} {list.total === 1 ? 'gift' : 'gifts'}
          </p>
        </div>
        <SortSelect value={list.sort} hasQuery={!!params.q} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
        <aside className="space-y-6">
          {!activeCategorySlug && categories.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Category</h2>
              <ul className="scrollbar-none flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
                {categories.map((c) => (
                  <li key={c.id} className="shrink-0">
                    <Link href={hrefWith(`/c/${c.slug}`, params, {})} className={chip(false)}>
                      {c.name} <span className="text-xs opacity-60">{c.productCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Price</h2>
            <ul className="scrollbar-none flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
              {PRICE_RANGES.map((r) => {
                const active = activeRange === r;
                return (
                  <li key={r.label} className="shrink-0">
                    <Link href={hrefWith(basePath, params, active ? { minPrice: undefined, maxPrice: undefined } : { minPrice: r.min, maxPrice: r.max })} className={chip(active)}>
                      {r.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          {list.facets.occasions.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Occasion</h2>
              <ul className="scrollbar-none flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
                {list.facets.occasions.map((o) => {
                  const active = params.occasion === o.slug;
                  return (
                    <li key={o.slug} className="shrink-0">
                      <Link href={hrefWith(basePath, params, { occasion: active ? undefined : o.slug })} className={chip(active)}>
                        {OCCASION_EMOJI[o.slug]} {o.name} <span className="text-xs opacity-60">{o.count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div>
            <Link href={hrefWith(basePath, params, { inStock: params.inStock === 'true' ? undefined : 'true' })} className={chip(params.inStock === 'true')}>
              {params.inStock === 'true' ? '✓ ' : ''}In stock only
            </Link>
          </div>
          {hasFilters && (
            <Link href={hrefWith(basePath, { q: params.q, sort: params.sort }, {})} className="block text-sm font-medium text-brand-700 hover:underline">
              Clear filters
            </Link>
          )}
        </aside>

        <div>
          {list.items.length === 0 ? (
            <div className="rounded-2xl bg-white p-12 text-center ring-1 ring-black/5">
              <div className="text-5xl">🔍</div>
              <p className="mt-3 font-semibold">No gifts match these filters</p>
              <p className="mt-1 text-sm text-neutral-600">Try removing a filter or searching for something else.</p>
              <Link href="/shop" className="mt-4 inline-block rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white">
                Browse all gifts
              </Link>
            </div>
          ) : (
            <ProductGrid products={list.items} priorityCount={4} />
          )}
          {totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
              {list.page > 1 && (
                <Link href={hrefWith(basePath, params, { page: String(list.page - 1) })} className="rounded-full px-4 py-2 text-sm ring-1 ring-black/10 hover:bg-white">
                  ← Previous
                </Link>
              )}
              <span className="px-3 text-sm text-neutral-600">
                Page {list.page} of {totalPages}
              </span>
              {list.page < totalPages && (
                <Link href={hrefWith(basePath, params, { page: String(list.page + 1) })} className="rounded-full px-4 py-2 text-sm ring-1 ring-black/10 hover:bg-white">
                  Next →
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
