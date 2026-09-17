import Link from 'next/link';
import type { Product } from '@/lib/types';
import { AddToCartButton } from './AddToCartButton';
import { Price } from './Price';

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const image = product.images[0];
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/p/${product.slug}`} className="relative block aspect-square overflow-hidden bg-brand-50">
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading={priority ? 'eager' : 'lazy'}
            className="size-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-5xl">🎁</div>
        )}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {product.discountPct >= 5 && (
            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">-{product.discountPct}%</span>
          )}
          {product.isBestseller && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-950">Bestseller</span>}
        </div>
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">Out of stock</span>
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {product.category && <span className="text-[11px] font-medium tracking-wide text-brand-700 uppercase">{product.category.name}</span>}
        <Link href={`/p/${product.slug}`} className="line-clamp-2 text-sm leading-snug font-medium text-ink hover:text-brand-700">
          {product.name}
        </Link>
        <Price price={product.price} mrp={product.mrp} />
        {product.lowStock && product.stockLeft !== undefined && (
          <span className="text-xs font-medium text-amber-700">Only {product.stockLeft} left</span>
        )}
        <div className="mt-auto pt-1">
          <AddToCartButton product={product} compact />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Product[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
