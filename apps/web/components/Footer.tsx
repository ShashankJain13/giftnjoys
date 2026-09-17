import { waLink } from '@gnj/core/whatsapp';
import Link from 'next/link';
import type { Category, PublicSettings } from '@/lib/types';

export function Footer({ settings, categories }: { settings: PublicSettings; categories: Category[] }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 bg-ink text-neutral-300">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="font-display text-2xl font-bold text-white">🎁 {settings.storeName}</div>
          <p className="mt-3 text-sm leading-relaxed">{settings.tagline}</p>
          <a
            href={waLink(settings.whatsappNumber, `Hi ${settings.storeName}, I need help choosing a gift.`)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            💬 Chat on WhatsApp
          </a>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-white uppercase">Shop</h2>
          <ul className="space-y-2 text-sm">
            {categories.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.slug}`} className="hover:text-white">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-white uppercase">Help</h2>
          <ul className="space-y-2 text-sm">
            <li><Link href="/track" className="hover:text-white">Track your order</Link></li>
            <li><Link href="/shipping-policy" className="hover:text-white">Shipping policy</Link></li>
            <li><Link href="/returns-policy" className="hover:text-white">Returns & refunds</Link></li>
            <li><Link href="/contact" className="hover:text-white">Contact us</Link></li>
            <li><Link href="/about" className="hover:text-white">About us</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-white uppercase">Get in touch</h2>
          <ul className="space-y-2 text-sm">
            {settings.supportEmail && (
              <li>
                <a href={`mailto:${settings.supportEmail}`} className="hover:text-white">
                  {settings.supportEmail}
                </a>
              </li>
            )}
            {settings.supportPhone && <li>{settings.supportPhone}</li>}
            {settings.address && <li className="leading-relaxed whitespace-pre-line">{settings.address}</li>}
            <li className="flex gap-3 pt-2">
              {settings.instagramUrl && <a href={settings.instagramUrl} target="_blank" rel="noreferrer" className="hover:text-white">Instagram</a>}
              {settings.facebookUrl && <a href={settings.facebookUrl} target="_blank" rel="noreferrer" className="hover:text-white">Facebook</a>}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-neutral-400">
          <span>© {year} {settings.storeName}. All rights reserved.</span>
          <span className="flex gap-4">
            <Link href="/privacy-policy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

export function WhatsAppFloat({ settings }: { settings: PublicSettings }) {
  return (
    <a
      href={waLink(settings.whatsappNumber, `Hi ${settings.storeName}, I have a question.`)}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed right-4 bottom-4 z-30 flex size-14 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white shadow-lg transition hover:scale-105 hover:bg-emerald-600"
    >
      💬
    </a>
  );
}
