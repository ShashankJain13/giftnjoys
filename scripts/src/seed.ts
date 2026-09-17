import { S3Storage } from '@gnj/adapters';
import { createDb, createRepositories, type OccasionSlug } from '@gnj/core';
import bcrypt from 'bcryptjs';
import { loadAwsTarget, loadLocalEnv } from './env';
import { categorySvg, productSvg } from './placeholder-svg';

// `pnpm seed` → local Docker stack. `AWS_PROFILE=giftnjoys-dev pnpm seed -- --aws` → AWS dev (from Terraform outputs).
const env = process.argv.includes('--aws') ? await loadAwsTarget() : loadLocalEnv();
const force = process.argv.includes('--force');
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
  { key: 'personalised', name: 'Personalised Gifts', slug: 'personalised-gifts', hue: 340, description: 'Names, photos and messages made into keepsakes.', keywords: ['personalised', 'personalized', 'custom', 'customised', 'engraved', 'name', 'photo'] },
  { key: 'decor', name: 'Home & Décor', slug: 'home-decor', hue: 28, description: 'Candles, frames and pieces that make a house feel like home.', keywords: ['decor', 'candle', 'lamp', 'vase', 'wall', 'clock', 'cushion', 'frame', 'showpiece'] },
  { key: 'mugs', name: 'Mugs & Drinkware', slug: 'mugs-drinkware', hue: 200, description: 'Mugs, bottles and sippers for every kind of sip.', keywords: ['mug', 'mugs', 'bottle', 'cup', 'tumbler', 'sipper', 'glass'] },
  { key: 'hampers', name: 'Gift Hampers', slug: 'gift-hampers', hue: 12, description: 'Curated boxes and baskets ready to gift.', keywords: ['hamper', 'basket', 'combo', 'gift box', 'box'] },
  { key: 'toys', name: 'Soft Toys & Kids', slug: 'toys-kids', hue: 48, description: 'Cuddly friends and playful learning for little ones.', keywords: ['teddy', 'toy', 'toys', 'soft toy', 'kids', 'puzzle', 'baby'] },
  { key: 'accessories', name: 'Jewellery & Accessories', slug: 'jewellery-accessories', hue: 280, description: 'Bracelets, wallets and small things with big charm.', keywords: ['bracelet', 'pendant', 'keychain', 'wallet', 'watch', 'earrings', 'ring'] },
  { key: 'festive', name: 'Festive & Pooja', slug: 'festive-pooja', hue: 38, description: 'Diyas, rakhis and décor for every celebration.', keywords: ['diya', 'rangoli', 'pooja', 'puja', 'rakhi', 'toran', 'lantern', 'diwali'] },
  { key: 'stationery', name: 'Stationery & Desk', slug: 'stationery-desk', hue: 160, description: 'Planners, organisers and desk upgrades.', keywords: ['diary', 'pen', 'notebook', 'planner', 'desk', 'organiser', 'organizer'] },
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
}

const PRODUCTS: SeedProduct[] = [
  { name: 'Personalised Name Wooden Keychain', category: 'personalised', price: 199, mrp: 349, stock: 50, occasions: ['birthday', 'thank-you'], tags: ['keychain', 'wooden'], bestseller: true, description: 'Laser-engraved pine wood keychain with the name of your choice. Lightweight, sturdy and gift-ready.' },
  { name: 'Custom Photo Collage Frame (12 Photos)', category: 'personalised', price: 649, mrp: 999, stock: 25, occasions: ['anniversary', 'birthday'], tags: ['photo frame'], featured: true, description: 'A 12-photo collage printed on premium paper in a matte black frame. Share your photos on WhatsApp after ordering.' },
  { name: 'Engraved Couple Name Night Lamp', category: 'personalised', price: 899, mrp: 1499, stock: 12, occasions: ['anniversary', 'valentines', 'wedding'], tags: ['lamp', 'couple'], bestseller: true, description: 'Warm-white LED acrylic lamp engraved with two names and a date. USB powered.' },
  { name: 'Aroma Soy Candle Trio', category: 'decor', price: 449, mrp: 699, stock: 40, occasions: ['housewarming', 'diwali', 'thank-you'], tags: ['candles'], description: 'Three hand-poured soy wax candles in vanilla, lavender and sandalwood. Around 20 hours burn time each.' },
  { name: 'Macramé Wall Hanging', category: 'decor', price: 549, mrp: 899, stock: 15, occasions: ['housewarming'], tags: ['boho', 'wall decor'], description: 'Handwoven cotton macramé on a natural wooden dowel. 45 × 70 cm.' },
  { name: 'Minimal Desk Clock – Walnut Finish', category: 'decor', price: 799, mrp: 1199, stock: 10, occasions: ['corporate', 'housewarming'], tags: ['clock'], description: 'Silent-sweep table clock with a walnut-finish wooden body.' },
  { name: 'Magic Colour-Changing Mug', category: 'mugs', price: 299, mrp: 499, stock: 60, occasions: ['birthday', 'valentines'], tags: ['mug'], bestseller: true, description: 'Black ceramic mug that reveals your printed photo when filled with a hot drink. 330 ml.' },
  { name: 'Insulated Steel Bottle 750 ml', category: 'mugs', price: 549, mrp: 899, stock: 35, occasions: ['corporate'], tags: ['bottle'], featured: true, description: 'Double-wall vacuum insulated bottle keeps drinks hot for 12 hours and cold for 24.' },
  { name: 'Ceramic Coffee Mug & Coaster Set', category: 'mugs', price: 399, mrp: 599, stock: 2, occasions: ['thank-you', 'corporate'], tags: ['mug', 'coaster'], description: 'Speckled stoneware mug with a matching cork-backed coaster.' },
  { name: 'Chocolate & Cookie Celebration Hamper', category: 'hampers', price: 1299, mrp: 1799, stock: 20, occasions: ['birthday', 'diwali', 'corporate'], tags: ['hamper', 'chocolates'], bestseller: true, description: 'Assorted chocolates, butter cookies and a greeting card in a reusable kraft box.' },
  { name: 'Dry Fruit Festive Gift Box', category: 'hampers', price: 1499, mrp: 1999, stock: 18, occasions: ['diwali', 'rakhi', 'corporate'], tags: ['dry fruits'], featured: true, description: 'Almonds, cashews, raisins and pistachios in a four-compartment keepsake box.' },
  { name: 'Self-Care Spa Hamper', category: 'hampers', price: 1899, mrp: 2499, stock: 8, occasions: ['birthday', 'thank-you'], tags: ['spa', 'self care'], description: 'Bath salts, body butter, a scented candle and a soft towel in a woven basket.' },
  { name: 'Cuddly Teddy Bear 60 cm', category: 'toys', price: 699, mrp: 999, stock: 22, occasions: ['kids', 'valentines', 'birthday'], tags: ['teddy', 'soft toy'], bestseller: true, description: 'Super-soft plush teddy with a satin bow. Safe for all ages.' },
  { name: 'Wooden Alphabet Puzzle', category: 'toys', price: 349, mrp: 499, stock: 30, occasions: ['kids'], tags: ['puzzle', 'learning'], description: 'Chunky A–Z wooden puzzle with non-toxic paint, for ages 2+.' },
  { name: 'Silver-Plated Charm Bracelet', category: 'accessories', price: 599, mrp: 999, stock: 14, occasions: ['birthday', 'rakhi', 'anniversary'], tags: ['bracelet'], description: 'Adjustable chain bracelet with heart, star and moon charms. Comes in a velvet pouch.' },
  { name: 'Vegan Leather Wallet with Name Engraving', category: 'accessories', price: 749, mrp: 1199, stock: 16, occasions: ['corporate', 'birthday'], tags: ['wallet', 'engraved'], featured: true, description: 'Slim bi-fold wallet with RFID lining and an engraved name on the front.' },
  { name: 'Brass Diya Set of 4', category: 'festive', price: 399, mrp: 599, stock: 45, occasions: ['diwali'], tags: ['diya', 'brass'], bestseller: true, description: 'Hand-polished brass diyas with a traditional lotus pattern.' },
  { name: 'Designer Rakhi Set with Roli Chawal', category: 'festive', price: 249, mrp: 399, stock: 70, occasions: ['rakhi'], tags: ['rakhi'], description: 'Two handcrafted rakhis with roli, chawal and a greeting card.' },
  { name: 'Premium Undated Planner', category: 'stationery', price: 449, mrp: 699, stock: 26, occasions: ['corporate', 'thank-you'], tags: ['planner', 'diary'], description: 'A5 hardbound planner with weekly spreads, habit trackers and 100 gsm paper.' },
  { name: 'Bamboo Desk Organiser', category: 'stationery', price: 499, mrp: 799, stock: 0, occasions: ['corporate'], tags: ['desk', 'organiser'], description: 'Five-slot bamboo organiser for pens, phone and notes.' },
  { name: 'Crystal Showpiece (draft)', category: 'decor', price: 999, mrp: 1499, stock: 5, occasions: ['wedding'], tags: ['crystal'], draft: true, description: 'Example draft product — not visible on the website until published.' },
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
  const existing = await repos.categories.list();
  if (existing.length && !force) {
    console.log(`• ${existing.length} categories already exist — skipping catalog (use --force to add again)`);
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
