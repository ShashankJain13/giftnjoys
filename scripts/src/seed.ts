import { S3Storage } from '@gnj/adapters';
import { createDb, createRepositories, type OccasionSlug } from '@gnj/core';
import bcrypt from 'bcryptjs';
import { loadAwsTarget, loadLocalEnv } from './env';
import { categorySvg, productSvg } from './placeholder-svg';

// `pnpm seed` → local Docker stack. `AWS_PROFILE=giftnjoys-dev pnpm seed -- --aws` → AWS dev (from Terraform outputs).
const env = process.argv.includes('--aws') ? await loadAwsTarget() : loadLocalEnv();
const force = process.argv.includes('--force');
const reset = process.argv.includes('--reset');
const skipSamples = process.argv.includes('--no-samples');
console.log(`Seeding ${env.kind === 'aws' ? `AWS tables ${env.tablePrefix}-*` : 'local Docker stack'}`);

const db = createDb({
  region: env.region,
  tablePrefix: env.tablePrefix,
  ...(env.dynamodbEndpoint ? { endpoint: env.dynamodbEndpoint, credentials: env.credentials } : {}),
});
const repos = createRepositories(db);
const storage = new S3Storage({
  region: env.region,
  ...(env.s3Endpoint ? { endpoint: env.s3Endpoint, credentials: env.credentials } : {}),
  mediaBucket: env.mediaBucket,
  importsBucket: env.importsBucket,
  mediaBaseUrl: env.mediaBaseUrl,
});

const enc = new TextEncoder();

interface SeedCategory {
  key: string;
  name: string;
  slug: string;
  hue: number;
  description: string;
  keywords: string[];
}

const CATEGORIES: SeedCategory[] = [
  {
    key: 'kids',
    name: 'Kids Return Gifts',
    slug: 'kids-return-gifts',
    hue: 48,
    description: 'Budget-friendly return gifts for birthday parties, Kanjak and school events.',
    keywords: ['return gift', 'returngift', 'kids', 'birthday party', 'kanjak', 'school', 'toy', 'toys', 'puzzle', 'teddy', 'goodie bag'],
  },
  {
    key: 'general',
    name: 'General Gifts',
    slug: 'general-gifts',
    hue: 340,
    description: 'Gifts and hampers for every other occasion — anniversaries, festivals, corporate and more.',
    keywords: ['gift', 'hamper', 'combo', 'decor', 'personalised', 'personalized', 'mug', 'bottle', 'diya', 'rakhi'],
  },
];

interface SeedProduct {
  name: string;
  category: string;
  price: number;
  mrp: number;
  stock: number;
  occasions: OccasionSlug[];
  description: string;
  tags: string[];
  bestseller?: boolean;
  featured?: boolean;
  draft?: boolean;
  colors?: string[];
  sizes?: string[];
}

const PRODUCTS: SeedProduct[] = [
  { name: 'Personalised Name Wooden Keychain', category: 'kids', price: 199, mrp: 349, stock: 50, occasions: ['birthday-return-gift'], tags: ['keychain', 'wooden', 'return gift'], bestseller: true, description: 'Laser-engraved pine wood keychain with the name of your choice. Lightweight, sturdy and gift-ready — a popular birthday return gift.' },
  { name: 'Cuddly Teddy Bear 25 cm', category: 'kids', price: 249, mrp: 399, stock: 60, occasions: ['birthday-return-gift'], tags: ['teddy', 'soft toy', 'return gift'], bestseller: true, description: 'Soft plush mini teddy with a satin bow — a favourite party return gift. Safe for all ages.', colors: ['Brown', 'White', 'Pink'] },
  { name: 'Wooden Alphabet Puzzle', category: 'kids', price: 349, mrp: 499, stock: 30, occasions: ['birthday-return-gift'], tags: ['puzzle', 'learning', 'return gift'], description: 'Chunky A–Z wooden puzzle with non-toxic paint, for ages 2+. A fun and useful return gift.' },
  { name: 'Return Gift Combo – Notebook & Pencil Set', category: 'kids', price: 99, mrp: 179, stock: 100, occasions: ['birthday-return-gift'], tags: ['stationery', 'return gift', 'combo'], bestseller: true, description: 'A mini notebook, pencil and eraser set packed as a ready-to-hand-out birthday return gift.' },
  { name: 'Cartoon Print Kids Water Bottle', category: 'kids', price: 179, mrp: 299, stock: 45, occasions: ['birthday-return-gift'], tags: ['bottle', 'kids', 'return gift'], description: 'Leak-proof bottle with fun cartoon prints — light, useful and loved by kids.', sizes: ['350ml', '500ml', '750ml'] },
  { name: 'Kanjak Gift Set for Little Girls', category: 'kids', price: 149, mrp: 249, stock: 40, occasions: ['birthday-return-gift'], tags: ['kanjak', 'return gift'], description: 'A cute mix of bangles, a hair clip and a small toy — ready to hand out during Kanjak/Navratri.' },
  { name: 'Custom Photo Collage Frame (12 Photos)', category: 'general', price: 649, mrp: 999, stock: 25, occasions: ['birthday-return-gift'], tags: ['photo frame'], featured: true, description: 'A 12-photo collage printed on premium paper in a matte black frame. Share your photos on WhatsApp after ordering.' },
  { name: 'Engraved Couple Name Night Lamp', category: 'general', price: 899, mrp: 1499, stock: 12, occasions: ['birthday-return-gift'], tags: ['lamp', 'couple'], bestseller: true, description: 'Warm-white LED acrylic lamp engraved with two names and a date. USB powered.' },
  { name: 'Aroma Soy Candle Trio', category: 'general', price: 449, mrp: 699, stock: 40, occasions: ['birthday-return-gift'], tags: ['candles'], description: 'Three hand-poured soy wax candles in vanilla, lavender and sandalwood. Around 20 hours burn time each.' },
  { name: 'Macramé Wall Hanging', category: 'general', price: 549, mrp: 899, stock: 15, occasions: ['birthday-return-gift'], tags: ['boho', 'wall decor'], description: 'Handwoven cotton macramé on a natural wooden dowel. 45 × 70 cm.' },
  { name: 'Magic Colour-Changing Mug', category: 'general', price: 299, mrp: 499, stock: 60, occasions: ['birthday-return-gift'], tags: ['mug'], bestseller: true, description: 'Black ceramic mug that reveals your printed photo when filled with a hot drink. 330 ml.' },
  { name: 'Insulated Steel Bottle 750 ml', category: 'general', price: 549, mrp: 899, stock: 35, occasions: ['birthday-return-gift'], tags: ['bottle'], featured: true, description: 'Double-wall vacuum insulated bottle keeps drinks hot for 12 hours and cold for 24.' },
  { name: 'Chocolate & Cookie Celebration Hamper', category: 'general', price: 1299, mrp: 1799, stock: 20, occasions: ['birthday-return-gift'], tags: ['hamper', 'chocolates'], bestseller: true, description: 'Assorted chocolates, butter cookies and a greeting card in a reusable kraft box.' },
  { name: 'Dry Fruit Festive Gift Box', category: 'general', price: 1499, mrp: 1999, stock: 18, occasions: ['birthday-return-gift'], tags: ['dry fruits'], featured: true, description: 'Almonds, cashews, raisins and pistachios in a four-compartment keepsake box.' },
  { name: 'Self-Care Spa Hamper', category: 'general', price: 1899, mrp: 2499, stock: 8, occasions: ['birthday-return-gift'], tags: ['spa', 'self care'], description: 'Bath salts, body butter, a scented candle and a soft towel in a woven basket.' },
  { name: 'Silver-Plated Charm Bracelet', category: 'general', price: 599, mrp: 999, stock: 14, occasions: ['birthday-return-gift'], tags: ['bracelet'], description: 'Adjustable chain bracelet with heart, star and moon charms. Comes in a velvet pouch.' },
  { name: 'Vegan Leather Wallet with Name Engraving', category: 'general', price: 749, mrp: 1199, stock: 16, occasions: ['birthday-return-gift'], tags: ['wallet', 'engraved'], featured: true, description: 'Slim bi-fold wallet with RFID lining and an engraved name on the front.', colors: ['Black', 'Brown', 'Tan'] },
  { name: 'Brass Diya Set of 4', category: 'general', price: 399, mrp: 599, stock: 45, occasions: ['birthday-return-gift'], tags: ['diya', 'brass'], bestseller: true, description: 'Hand-polished brass diyas with a traditional lotus pattern.' },
  { name: 'Designer Rakhi Set with Roli Chawal', category: 'general', price: 249, mrp: 399, stock: 70, occasions: ['birthday-return-gift'], tags: ['rakhi'], description: 'Two handcrafted rakhis with roli, chawal and a greeting card.' },
  { name: 'Premium Undated Planner', category: 'general', price: 449, mrp: 699, stock: 26, occasions: ['birthday-return-gift'], tags: ['planner', 'diary'], description: 'A5 hardbound planner with weekly spreads, habit trackers and 100 gsm paper.' },
  { name: 'Bamboo Desk Organiser', category: 'general', price: 499, mrp: 799, stock: 0, occasions: ['birthday-return-gift'], tags: ['desk', 'organiser'], description: 'Five-slot bamboo organiser for pens, phone and notes.' },
  { name: 'Crystal Showpiece (draft)', category: 'general', price: 999, mrp: 1499, stock: 5, occasions: ['birthday-return-gift'], tags: ['crystal'], draft: true, description: 'Example draft product — not visible on the website until published.' },
];

async function seedAdmin() {
  const passwordHash = await bcrypt.hash(env.adminPassword, 10);
  await repos.meta.putAdminUser({ email: env.adminEmail, name: 'Store Admin', passwordHash });
  console.log(`✓ admin user ${env.adminEmail} (password ${env.kind === 'aws' ? 'from SSM parameter' : 'from .env.local'})`);
}

async function seedSettings(categoryIds: Record<string, string>) {
  // Merge with what's stored so re-running the seed never wipes changes made in the admin panel.
  const csv = (v?: string) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const store = await repos.settings.get('store');
  const adminEmails = csv(process.env.STORE_ADMIN_EMAILS);
  await repos.settings.put('store', {
    ...store,
    ...(process.env.STORE_NAME ? { storeName: process.env.STORE_NAME } : {}),
    ...(process.env.STORE_WHATSAPP_NUMBER ? { whatsappNumber: process.env.STORE_WHATSAPP_NUMBER } : {}),
    ...(process.env.STORE_SUPPORT_EMAIL ? { supportEmail: process.env.STORE_SUPPORT_EMAIL } : {}),
    ...(process.env.STORE_SUPPORT_PHONE ? { supportPhone: process.env.STORE_SUPPORT_PHONE } : {}),
    adminEmails: adminEmails.length ? adminEmails : store.adminEmails,
  });
  await repos.settings.put('shipping', await repos.settings.get('shipping'));
  await repos.settings.put('homepage', await repos.settings.get('homepage'));
  const importSettings = await repos.settings.get('import');
  const seededKeywords = Object.fromEntries(
    CATEGORIES.filter((c) => categoryIds[c.key]).map((c) => [categoryIds[c.key]!, c.keywords]),
  );
  await repos.settings.put('import', {
    ...importSettings,
    categoryKeywords: { ...seededKeywords, ...importSettings.categoryKeywords },
  });
  console.log('✓ settings (store, shipping, homepage, import) — existing values kept');
}

async function seedCatalog(): Promise<Record<string, string>> {
  let existing = await repos.categories.list();

  if (reset) {
    console.log('--reset: deleting all existing products and categories first');
    for (const status of ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const) {
      const items = await repos.products.listAllByStatus(status);
      for (const p of items) await repos.products.delete(p.id);
    }
    for (const c of existing) await repos.categories.delete(c.id).catch(() => undefined);
    existing = [];
  }

  if (existing.length && !force && !reset) {
    console.log(`• ${existing.length} categories already exist — skipping catalog (use --force or --reset)`);
    return Object.fromEntries(
      CATEGORIES.map((c) => [c.key, existing.find((e) => e.slug === c.slug)?.id]).filter(([, id]) => id),
    ) as Record<string, string>;
  }

  const ids: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const found = existing.find((e) => e.slug === c.slug);
    if (found) {
      ids[c.key] = found.id;
      continue;
    }
    const imageKey = `categories/${c.slug}.svg`;
    await storage.putObject('media', imageKey, enc.encode(categorySvg(c.name, c.hue)), 'image/svg+xml');
    const created = await repos.categories.create({
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageKey,
      sortOrder: i,
    });
    ids[c.key] = created.id;
  }
  console.log(`✓ ${CATEGORIES.length} categories`);

  let published = 0;
  if (skipSamples) {
    console.log('• --no-samples: skipping sample products');
    return ids;
  }
  for (const [i, p] of PRODUCTS.entries()) {
    const category = CATEGORIES.find((c) => c.key === p.category)!;
    const created = await repos.products.create({
      name: p.name,
      description: p.description,
      categoryId: ids[p.category]!,
      price: p.price,
      mrp: p.mrp,
      stockQty: p.stock,
      occasions: p.occasions,
      tags: p.tags,
      isBestseller: p.bestseller ?? false,
      isFeatured: p.featured ?? false,
      colors: p.colors ?? [],
      sizes: p.sizes ?? [],
    });
    const images = [0, 1].map((v) => ({ key: `products/${created.id}/seed-${v + 1}.svg` }));
    await Promise.all(
      images.map((img, v) =>
        storage.putObject('media', img.key, enc.encode(productSvg(p.name, (category.hue + v * 25 + i * 7) % 360, v)), 'image/svg+xml'),
      ),
    );
    await repos.products.update(created.id, { images });
    if (!p.draft) {
      await repos.products.setStatus(created.id, 'PUBLISHED');
      published++;
    }
  }
  console.log(`✓ ${PRODUCTS.length} products (${published} published, ${PRODUCTS.length - published} draft)`);
  return ids;
}

await seedAdmin();
const categoryIds = await seedCatalog();
await seedSettings(categoryIds);
console.log('Seed complete.');
