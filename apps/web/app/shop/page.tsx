import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Listing, listingTitle, type ListingParams } from '@/components/Listing';
import { getCategories, getProducts } from '@/lib/api';

type Props = { searchParams: Promise<ListingParams> };

const pick = (sp: ListingParams): ListingParams => ({
  q: sp.q,
  occasion: sp.occasion,
  minPrice: sp.minPrice,
  maxPrice: sp.maxPrice,
  sort: sp.sort,
  page: sp.page,
  inStock: sp.inStock,
  bestseller: sp.bestseller,
  featured: sp.featured,
});

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = pick(await searchParams);
  return { title: listingTitle(null, params), robots: params.q ? { index: false } : undefined };
}

export default async function ShopPage({ searchParams }: Props) {
  const params = pick(await searchParams);
  const [list, categories] = await Promise.all([getProducts({ ...params, pageSize: '24' }), getCategories()]);
  return (
    <Suspense>
      <Listing list={list!} params={params} basePath="/shop" categories={categories} />
    </Suspense>
  );
}
