import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Listing, type ListingParams } from '@/components/Listing';
import { getCategories, getProducts } from '@/lib/api';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<ListingParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = (await getCategories()).find((c) => c.slug === slug);
  if (!category) return { title: 'Category not found' };
  return {
    title: `${category.name} gifts`,
    description: category.description ?? `Shop ${category.name.toLowerCase()} gifts online.`,
    alternates: { canonical: `/c/${slug}` },
    openGraph: category.imageUrl ? { images: [category.imageUrl] } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const filters: ListingParams = {
    occasion: sp.occasion,
    minPrice: sp.minPrice,
    maxPrice: sp.maxPrice,
    sort: sp.sort,
    page: sp.page,
    inStock: sp.inStock,
  };
  const [list, categories] = await Promise.all([getProducts({ ...filters, category: slug, pageSize: '24' }), getCategories()]);
  if (!list) notFound();
  return (
    <Suspense>
      <Listing list={list} params={filters} basePath={`/c/${slug}`} categories={categories} activeCategorySlug={slug} />
    </Suspense>
  );
}
