import type { Logger } from '@gnj/adapters';
import {
  descendantIds,
  discountPct,
  OCCASIONS,
  type Category,
  type HomepageSettings,
  type OccasionSlug,
  type Product,
  type Repositories,
  type ShippingSettings,
  type StoreSettings,
} from '@gnj/core';
import MiniSearch from 'minisearch';

export interface PublicCategoryRef {
  id: string;
  slug: string;
  name: string;
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  mrp?: number;
  discountPct: number;
  inStock: boolean;
  lowStock: boolean;
  /** Only exposed when low, so shoppers see "Only 3 left". */
  stockLeft?: number;
  moq?: number;
  color?: string;
  size?: string;
  style?: string;
  images: string[];
  videos: string[];
  category: PublicCategoryRef | null;
  tags: string[];
  occasions: OccasionSlug[];
  isBestseller: boolean;
  isFeatured: boolean;
  publishedAt: string;
}

export interface PublicCategory extends PublicCategoryRef {
  description?: string;
  imageUrl?: string;
  parentId?: string;
  productCount: number;
  children: PublicCategory[];
}

export interface CatalogSnapshot {
  loadedAt: number;
  products: PublicProduct[];
  bySlug: Map<string, PublicProduct>;
  categories: PublicCategory[];
  categoryTree: PublicCategory[];
  categoryBySlug: Map<string, PublicCategory>;
  descendants: Map<string, Set<string>>;
  search: MiniSearch<{ id: string; name: string; tags: string; category: string; description: string }>;
  store: StoreSettings;
  shipping: ShippingSettings;
  homepage: HomepageSettings;
}

const LOW_STOCK = 5;

export class CatalogCache {
  private snapshot?: CatalogSnapshot;
  private inflight?: Promise<CatalogSnapshot>;

  constructor(
    private readonly repos: Repositories,
    private readonly mediaUrl: (key: string) => string,
    private readonly ttlMs: number,
    private readonly log: Logger,
  ) {}

  async get(): Promise<CatalogSnapshot> {
    const fresh = this.snapshot && Date.now() - this.snapshot.loadedAt < this.ttlMs;
    if (fresh) return this.snapshot!;
    if (!this.inflight) {
      this.inflight = this.load()
        .then((s) => (this.snapshot = s))
        .catch((err) => {
          // Serve stale data rather than failing the storefront if a refresh fails.
          if (this.snapshot) {
            this.log.error('catalog.refresh_failed', { error: String(err) });
            return this.snapshot;
          }
          throw err;
        })
        .finally(() => (this.inflight = undefined));
    }
    return this.inflight;
  }

  private async load(): Promise<CatalogSnapshot> {
    const started = Date.now();
    const [raw, allCategories, store, shipping, homepage] = await Promise.all([
      this.repos.products.listAllByStatus('PUBLISHED'),
      this.repos.categories.list(),
      this.repos.settings.get('store'),
      this.repos.settings.get('shipping'),
      this.repos.settings.get('homepage'),
    ]);

    const activeCategories = allCategories.filter((c) => c.isActive);
    const categoryById = new Map(activeCategories.map((c) => [c.id, c]));
    const products = raw
      .map((p) => this.toPublicProduct(p, categoryById))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

    const descendants = new Map<string, Set<string>>();
    for (const c of activeCategories) descendants.set(c.id, new Set(descendantIds(activeCategories, c.id)));

    const categories: PublicCategory[] = activeCategories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      ...(c.description ? { description: c.description } : {}),
      ...(c.imageKey ? { imageUrl: this.mediaUrl(c.imageKey) } : {}),
      ...(c.parentId && categoryById.has(c.parentId) ? { parentId: c.parentId } : {}),
      productCount: products.filter((p) => p.category && descendants.get(c.id)!.has(p.category.id)).length,
      children: [],
    }));
    const byId = new Map(categories.map((c) => [c.id, c]));
    const categoryTree: PublicCategory[] = [];
    for (const c of categories) {
      if (c.parentId) byId.get(c.parentId)!.children.push(c);
      else categoryTree.push(c);
    }

    const search = new MiniSearch<{ id: string; name: string; tags: string; category: string; description: string }>({
      fields: ['name', 'tags', 'category', 'description'],
      searchOptions: { boost: { name: 3, tags: 2, category: 1.5 }, prefix: true, fuzzy: 0.2 },
    });
    search.addAll(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        tags: [...p.tags, ...p.occasions].join(' '),
        category: p.category?.name ?? '',
        description: p.description,
      })),
    );

    this.log.debug('catalog.loaded', { products: products.length, categories: categories.length, ms: Date.now() - started });
    return {
      loadedAt: Date.now(),
      products,
      bySlug: new Map(products.map((p) => [p.slug, p])),
      categories,
      categoryTree,
      categoryBySlug: new Map(categories.map((c) => [c.slug, c])),
      descendants,
      search,
      store,
      shipping,
      homepage,
    };
  }

  private toPublicProduct(p: Product, categories: Map<string, Category>): PublicProduct {
    const category = p.categoryId ? categories.get(p.categoryId) : undefined;
    const lowStock = p.stockQty > 0 && p.stockQty <= LOW_STOCK;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      price: p.price,
      ...(p.mrp !== undefined ? { mrp: p.mrp } : {}),
      discountPct: discountPct(p.price, p.mrp),
      inStock: p.stockQty > 0,
      lowStock,
      ...(lowStock ? { stockLeft: p.stockQty } : {}),
      ...(p.moq ? { moq: p.moq } : {}),
      ...(p.color ? { color: p.color } : {}),
      ...(p.size ? { size: p.size } : {}),
      ...(p.style ? { style: p.style } : {}),
      images: p.images.map((i) => this.mediaUrl(i.key)),
      videos: p.videos.map((v) => this.mediaUrl(v.key)),
      category: category ? { id: category.id, slug: category.slug, name: category.name } : null,
      tags: p.tags,
      occasions: p.occasions,
      isBestseller: p.isBestseller,
      isFeatured: p.isFeatured,
      publishedAt: p.publishedAt ?? p.updatedAt,
    };
  }
}

export const occasionName = (slug: string) => OCCASIONS.find((o) => o.slug === slug)?.name ?? slug;
