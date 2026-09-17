import type { MetadataRoute } from 'next';
import { getCategories, getProducts, SITE_URL } from '@/lib/api';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, first] = await Promise.all([getCategories(), getProducts({ pageSize: '60', page: '1' })]);
  const products = [...(first?.items ?? [])];
  const pages = first ? Math.ceil(first.total / first.pageSize) : 0;
  for (let page = 2; page <= pages; page++) {
    const next = await getProducts({ pageSize: '60', page: String(page) });
    products.push(...(next?.items ?? []));
  }
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/shop`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    ...categories.map((c) => ({ url: `${SITE_URL}/c/${c.slug}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...products.map((p) => ({ url: `${SITE_URL}/p/${p.slug}`, lastModified: new Date(p.publishedAt), changeFrequency: 'weekly' as const, priority: 0.6 })),
    ...['about', 'contact', 'shipping-policy', 'returns-policy', 'privacy-policy', 'terms'].map((p) => ({ url: `${SITE_URL}/${p}`, changeFrequency: 'yearly' as const, priority: 0.2 })),
  ];
}
