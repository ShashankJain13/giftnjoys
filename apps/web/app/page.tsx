import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeroCarousel } from '@/components/HeroCarousel';
import { ProductGrid } from '@/components/ProductCard';
import { getHome, getSettings } from '@/lib/api';
import { OCCASION_EMOJI } from '@/lib/occasions';

export const revalidate = 60;

function Section({ title, subtitle, href, children }: { title: string; subtitle?: string; href?: string; children: ReactNode }) {
  return (
    <section className="container-page mt-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
            View all <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const PERKS = [
  { icon: '🎀', title: 'Gift wrapping', text: 'Add a wrap and a handwritten-style note' },
  { icon: '💬', title: 'Confirm on WhatsApp', text: 'Talk to a real person about your order' },
  { icon: '🚚', title: 'Delivery across India', text: 'Tracking details sent by email' },
  { icon: '✨', title: 'Hand-picked', text: 'Every product reviewed before listing' },
];

export default async function HomePage() {
  const [home, settings] = await Promise.all([getHome(), getSettings()]);

  return (
    <>
      <div className="container-page pt-6">
        <HeroCarousel banners={home.banners} />
      </div>

      <section className="container-page mt-6">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PERKS.map((p) => (
            <li key={p.title} className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5">
              <span className="text-2xl" aria-hidden>
                {p.icon}
              </span>
              <span>
                <span className="block text-sm font-semibold">{p.title}</span>
                <span className="block text-xs text-neutral-500">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {home.categories.length > 0 && (
        <Section title="Shop by category" subtitle="Find the right gift faster">
          <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
            {home.categories.map((c) => (
              <Link key={c.id} href={`/c/${c.slug}`} className="group w-28 shrink-0 text-center sm:w-auto">
                <div className="aspect-square overflow-hidden rounded-full bg-brand-50 ring-2 ring-transparent transition group-hover:ring-brand-500">
                  {c.imageUrl ? <img src={c.imageUrl} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-4xl">🎁</span>}
                </div>
                <span className="mt-2 block text-sm leading-tight font-medium group-hover:text-brand-700">{c.name}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {home.newArrivals.length > 0 && (
        <Section title="Just arrived" subtitle="Fresh picks added to the store" href="/shop?sort=newest">
          <ProductGrid products={home.newArrivals.slice(0, 8)} priorityCount={4} />
        </Section>
      )}

      {home.priceTiles.some((t) => t.count > 0) && (
        <Section title="Shop by budget" subtitle="Great gifts at every price">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {home.priceTiles
              .filter((t) => t.count > 0)
              .map((t, i) => (
                <Link
                  key={t.max}
                  href={`/shop?maxPrice=${t.max}&sort=price_asc`}
                  className={`rounded-2xl p-5 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    ['bg-gradient-to-br from-brand-500 to-brand-700', 'bg-gradient-to-br from-amber-500 to-orange-600', 'bg-gradient-to-br from-violet-500 to-fuchsia-600', 'bg-gradient-to-br from-teal-500 to-emerald-600'][i % 4]
                  }`}
                >
                  <span className="block text-sm text-white/85">Gifts under</span>
                  <span className="font-display block text-3xl font-bold">₹{t.max.toLocaleString('en-IN')}</span>
                  <span className="mt-2 block text-xs text-white/85">{t.count} gifts →</span>
                </Link>
              ))}
          </div>
        </Section>
      )}

      {home.bestsellers.length > 0 && (
        <Section title="Bestsellers" subtitle="What everyone is gifting right now" href="/shop?bestseller=true">
          <ProductGrid products={home.bestsellers.slice(0, 8)} />
        </Section>
      )}

      {home.occasions.length > 0 && (
        <Section title="Gifts for every occasion">
          <div className="flex flex-wrap gap-2">
            {home.occasions.map((o) => (
              <Link
                key={o.slug}
                href={`/shop?occasion=${o.slug}`}
                className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium ring-1 ring-black/10 hover:bg-brand-50 hover:ring-brand-300"
              >
                <span aria-hidden>{OCCASION_EMOJI[o.slug] ?? '🎁'}</span> {o.name}
                <span className="text-xs text-neutral-500">{o.count}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {home.featured.length > 0 && (
        <Section title="Editor’s picks" href="/shop?featured=true">
          <ProductGrid products={home.featured.slice(0, 4)} />
        </Section>
      )}

      <Section title="How ordering works">
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            { n: 1, title: 'Pick your gifts', text: 'Add products to your cart, choose gift wrap and write a message.' },
            { n: 2, title: 'Place your order', text: 'Share your delivery details. No payment needed at this step.' },
            { n: 3, title: 'Confirm on WhatsApp', text: `We review your order, confirm on WhatsApp and share payment & shipping details by email.` },
          ].map((s) => (
            <li key={s.n} className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-600 font-bold text-white">{s.n}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-neutral-600">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-neutral-500">Orders are usually dispatched within {settings.shipping.dispatchDays} after confirmation.</p>
      </Section>

      {home.faqs.length > 0 && (
        <Section title="Frequently asked questions">
          <div className="divide-y divide-black/5 rounded-2xl bg-white ring-1 ring-black/5">
            {home.faqs.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span className="text-brand-600 transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
