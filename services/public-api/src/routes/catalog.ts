import { notFound, OCCASIONS, type Banner } from '@gnj/core';
import { Hono } from 'hono';
import { z } from 'zod';
import { occasionName, type CatalogSnapshot, type PublicProduct } from '../catalog';
import type { AppContext } from '../context';
import { cacheFor, parseWith } from '../http';

const SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'discount', 'popular'] as const;

const listSchema = z.object({
  category: z.string().trim().max(120).optional(),
  occasion: z.string().trim().max(40).optional(),
  q: z.string().trim().max(100).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  bestseller: z.enum(['true', 'false']).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(SORTS).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

function searchIds(snapshot: CatalogSnapshot, q: string): string[] {
  let hits = snapshot.search.search(q, { combineWith: 'AND' });
  if (hits.length === 0) hits = snapshot.search.search(q, { combineWith: 'OR' });
  return hits.map((h) => String(h.id));
}

const card = (p: PublicProduct) => p;

export function catalogRoutes(ctx: AppContext) {
  const app = new Hono();

  app.get('/settings/public', async (c) => {
    const s = await ctx.catalog.get();
    cacheFor(c, 60);
    return c.json({
      storeName: s.store.storeName,
      tagline: s.store.tagline,
      whatsappNumber: s.store.whatsappNumber,
      supportEmail: s.store.supportEmail,
      supportPhone: s.store.supportPhone,
      announcement: s.store.announcement,
      address: s.store.address,
      instagramUrl: s.store.instagramUrl,
      facebookUrl: s.store.facebookUrl,
      shipping: s.shipping,
      occasions: OCCASIONS,
    });
  });

  app.get('/categories', async (c) => {
    const s = await ctx.catalog.get();
    cacheFor(c, 60);
    return c.json({ items: s.categoryTree });
  });

  app.get('/home', async (c) => {
    const s = await ctx.catalog.get();
    const inStockFirst = (list: PublicProduct[]) => [...list].sort((a, b) => Number(b.inStock) - Number(a.inStock));
    const bestsellers = inStockFirst(s.products.filter((p) => p.isBestseller));
    const featured = inStockFirst(s.products.filter((p) => p.isFeatured));
    const banners = s.homepage.banners.map((b: Banner) => ({ ...b, imageUrl: b.imageKey ? ctx.mediaUrl(b.imageKey) : undefined }));
    const occasionCounts = OCCASIONS.map((o) => ({
      ...o,
      count: s.products.filter((p) => p.occasions.includes(o.slug)).length,
    })).filter((o) => o.count > 0);

    cacheFor(c, 30);
    return c.json({
      banners,
      categories: s.categoryTree.filter((cat) => cat.productCount > 0),
      newArrivals: inStockFirst(s.products).slice(0, 12).map(card),
      bestsellers: (bestsellers.length ? bestsellers : s.products).slice(0, 12).map(card),
      featured: featured.slice(0, 8).map(card),
      priceTiles: s.homepage.priceTiles.map((max) => ({
        max,
        count: s.products.filter((p) => p.price <= max).length,
      })),
      occasions: occasionCounts,
      faqs: s.homepage.faqs,
    });
  });

  app.get('/products', async (c) => {
    const query = parseWith(listSchema, c.req.query());
    const s = await ctx.catalog.get();
    let items = s.products;
    let categoryInfo: { slug: string; name: string; description?: string } | undefined;

    if (query.q) {
      const ids = searchIds(s, query.q);
      const byId = new Map(items.map((p) => [p.id, p]));
      items = ids.map((id) => byId.get(id)).filter((p): p is PublicProduct => !!p);
    }
    if (query.category) {
      const category = s.categoryBySlug.get(query.category);
      if (!category) throw notFound('Category');
      categoryInfo = { slug: category.slug, name: category.name, description: category.description };
      const allowed = s.descendants.get(category.id)!;
      items = items.filter((p) => p.category && allowed.has(p.category.id));
    }
    if (query.occasion) items = items.filter((p) => p.occasions.includes(query.occasion as never));

    // Facets are computed before price/stock filters so the UI can show the full range.
    const facetBase = items;
    if (query.minPrice !== undefined) items = items.filter((p) => p.price >= query.minPrice!);
    if (query.maxPrice !== undefined) items = items.filter((p) => p.price <= query.maxPrice!);
    if (query.inStock === 'true') items = items.filter((p) => p.inStock);
    if (query.bestseller === 'true') items = items.filter((p) => p.isBestseller);
    if (query.featured === 'true') items = items.filter((p) => p.isFeatured);

    const sort = query.sort ?? (query.q ? 'relevance' : 'newest');
    const sorted = [...items];
    switch (sort) {
      case 'newest':
        sorted.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
        break;
      case 'price_asc':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'discount':
        sorted.sort((a, b) => b.discountPct - a.discountPct);
        break;
      case 'popular':
        sorted.sort((a, b) => Number(b.isBestseller) - Number(a.isBestseller) || Number(b.isFeatured) - Number(a.isFeatured));
        break;
      case 'relevance':
        break;
    }
    // Out-of-stock items sink to the bottom (stable).
    const ordered = [...sorted.filter((p) => p.inStock), ...sorted.filter((p) => !p.inStock)];

    const prices = facetBase.map((p) => p.price);
    const start = (query.page - 1) * query.pageSize;
    cacheFor(c, 30);
    return c.json({
      items: ordered.slice(start, start + query.pageSize).map(card),
      total: ordered.length,
      page: query.page,
      pageSize: query.pageSize,
      sort,
      ...(categoryInfo ? { category: categoryInfo } : {}),
      ...(query.occasion ? { occasion: { slug: query.occasion, name: occasionName(query.occasion) } } : {}),
      facets: {
        price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : { min: 0, max: 0 },
        occasions: OCCASIONS.map((o) => ({ ...o, count: facetBase.filter((p) => p.occasions.includes(o.slug)).length })).filter(
          (o) => o.count > 0,
        ),
      },
    });
  });

  app.get('/products/:slug', async (c) => {
    const s = await ctx.catalog.get();
    const product = s.bySlug.get(c.req.param('slug'));
    if (!product) throw notFound('Product');
    const related = s.products
      .filter((p) => p.id !== product.id && p.inStock)
      .map((p) => ({
        p,
        score:
          (product.category && p.category?.id === product.category.id ? 3 : 0) +
          p.occasions.filter((o) => product.occasions.includes(o)).length +
          p.tags.filter((t) => product.tags.includes(t)).length,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => card(x.p));
    cacheFor(c, 30);
    return c.json({ product, related });
  });

  app.get('/search/suggest', async (c) => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 100);
    if (q.length < 2) return c.json({ products: [], categories: [] });
    const s = await ctx.catalog.get();
    const ids = searchIds(s, q).slice(0, 6);
    const byId = new Map(s.products.map((p) => [p.id, p]));
    const needle = q.toLowerCase();
    cacheFor(c, 30);
    return c.json({
      products: ids
        .map((id) => byId.get(id))
        .filter((p): p is PublicProduct => !!p)
        .map((p) => ({ id: p.id, slug: p.slug, name: p.name, price: p.price, image: p.images[0] })),
      categories: s.categories
        .filter((cat) => cat.name.toLowerCase().includes(needle))
        .slice(0, 3)
        .map((cat) => ({ slug: cat.slug, name: cat.name })),
    });
  });

  return app;
}
