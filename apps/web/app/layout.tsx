import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Footer, WhatsAppFloat } from '@/components/Footer';
import { Header } from '@/components/Header';
import { getCategories, getSettings, SITE_URL } from '@/lib/api';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings().catch(() => null);
  const name = settings?.storeName ?? 'SmileBox';
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${name} — ${settings?.tagline ?? 'Gifts for every occasion'}`, template: `%s | ${name}` },
    description: 'Hand-picked gifts, hampers and personalised keepsakes for birthdays, anniversaries, festivals and corporate gifting. Order online and confirm on WhatsApp.',
    openGraph: { siteName: name, type: 'website', locale: 'en_IN', images: ['/logo-icon.png'] },
    icons: { icon: '/favicon-32.png', apple: '/apple-touch-icon.png' },
  };
}

export const viewport: Viewport = { themeColor: '#be123c' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  return (
    <html lang="en-IN">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">
          Skip to content
        </a>
        <Header settings={settings} categories={categories} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer settings={settings} categories={categories} />
        <WhatsAppFloat settings={settings} />
      </body>
    </html>
  );
}
