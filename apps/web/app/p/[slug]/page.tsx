import { formatINR } from '@gnj/core/format';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Price } from '@/components/Price';
import { ProductGrid } from '@/components/ProductCard';
import { ProductGallery, PurchasePanel } from '@/components/ProductDetailClient';
import { getProduct, getSettings, SITE_URL } from '@/lib/api';
import { OCCASION_EMOJI } from '@/lib/occasions';

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 60;

/**
 * Empty list = don't prebuild product pages at build time, but still cache each one after its first
 * request (ISR, refreshed every 60s). Without this export Next 15 renders the route on every request.
 */
export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProduct(slug);
  if (!data) return { title: 'Gift not found' };
  const { product } = data;
  const description = product.description.slice(0, 160) || `Buy ${product.name} for ${formatINR(product.price)}.`;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/p/${product.slug}` },
    openGraph: { title: product.name, description, images: product.images.slice(0, 1), type: 'website' },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [data, settings] = await Promise.all([getProduct(slug), getSettings()]);
  if (!data) notFound();
  const { product, related } = data;
  const url = `${SITE_URL}/p/${product.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.images,
    description: product.description,
    sku: product.id,
    category: product.category?.name,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'INR',
      price: product.price,
      availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <div className="container-page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav className="mb-4 text-xs text-neutral-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-brand-700">Home</Link>
        {product.category && (
          <>
            {' / '}
            <Link href={`/c/${product.category.slug}`} className="hover:text-brand-700">
              {product.category.name}
            </Link>
          </>
        )}
        {' / '}
        <span className="text-neutral-700">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery images={product.images} name={product.name} />

        <div>
          {product.isBestseller && <span className="mb-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">★ Bestseller</span>}
          <h1 className="font-display text-3xl leading-tight font-bold sm:text-4xl">{product.name}</h1>
          <div className="mt-4 flex items-center gap-3">
            <Price price={product.price} mrp={product.mrp} size="lg" />
            {product.discountPct >= 5 && <span className="rounded-full bg-brand-600 px-2.5 py-1 text-sm font-bold text-white">-{product.discountPct}%</span>}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Inclusive of all taxes</p>

          <p className="mt-4 text-sm font-semibold" data-testid="stock-status">
            {!product.inStock ? (
              <span className="text-red-600">Currently out of stock</span>
            ) : product.lowStock ? (
              <span className="text-amber-700">Hurry — only {product.stockLeft} left</span>
            ) : (
              <span className="text-emerald-700">In stock</span>
            )}
          </p>
          {product.moq && product.moq > 1 && <p className="mt-1 text-sm text-neutral-600">Minimum order: {product.moq} pieces</p>}

          <div className="mt-6">
            <PurchasePanel product={product} whatsappNumber={settings.whatsappNumber} productUrl={url} />
          </div>

          <ul className="mt-6 space-y-2 rounded-2xl bg-white p-4 text-sm ring-1 ring-black/5">
            <li>🚚 Dispatched within {settings.shipping.dispatchDays} after confirmation</li>
            {settings.shipping.freeShippingThreshold > 0 && <li>🎉 Free shipping on orders above {formatINR(settings.shipping.freeShippingThreshold)}</li>}
            {settings.shipping.giftWrapFee >= 0 && <li>🎀 Gift wrapping available at checkout ({formatINR(settings.shipping.giftWrapFee)})</li>}
          </ul>

          {product.description && (
            <section className="mt-8">
              <h2 className="mb-2 text-lg font-semibold">About this gift</h2>
              <p className="leading-relaxed whitespace-pre-line text-neutral-700">{product.description}</p>
            </section>
          )}

          {product.occasions.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-neutral-600">Perfect for</h2>
              <div className="flex flex-wrap gap-2">
                {product.occasions.map((o) => (
                  <Link key={o} href={`/shop?occasion=${o}`} className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-black/10 hover:bg-brand-50">
                    {OCCASION_EMOJI[o]} {settings.occasions.find((x) => x.slug === o)?.name ?? o}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display mb-5 text-2xl font-bold">You may also like</h2>
          <ProductGrid products={related.slice(0, 8)} />
        </section>
      )}
    </div>
  );
}
