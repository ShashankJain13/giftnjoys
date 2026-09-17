'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { HomeData } from '@/lib/types';

const THEMES: Record<string, { bg: string; accent: string; emoji: string }> = {
  rose: { bg: 'from-brand-600 via-brand-500 to-orange-400', accent: 'bg-white text-brand-700', emoji: '🎁' },
  amber: { bg: 'from-amber-500 via-orange-500 to-red-500', accent: 'bg-white text-orange-700', emoji: '🪔' },
  teal: { bg: 'from-teal-600 via-emerald-500 to-lime-400', accent: 'bg-white text-teal-800', emoji: '💼' },
  violet: { bg: 'from-violet-600 via-fuchsia-500 to-pink-400', accent: 'bg-white text-violet-700', emoji: '💝' },
  sky: { bg: 'from-sky-600 via-cyan-500 to-teal-400', accent: 'bg-white text-sky-800', emoji: '🎈' },
};

export function HeroCarousel({ banners }: { banners: HomeData['banners'] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(t);
  }, [count, paused]);

  if (count === 0) return null;
  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);

  return (
    <section
      className="relative overflow-hidden rounded-3xl"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
        {banners.map((b, i) => {
          const theme = THEMES[b.theme] ?? THEMES.rose!;
          return (
            <div
              key={b.id}
              className={`relative flex min-h-[260px] w-full shrink-0 items-center bg-gradient-to-br sm:min-h-[340px] ${theme.bg}`}
              aria-hidden={i !== index}
            >
              {b.imageUrl && <img src={b.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-35 mix-blend-overlay" />}
              <div className="relative z-10 max-w-xl px-6 py-10 text-white sm:px-12">
                <h2 className="font-display text-3xl leading-tight font-bold sm:text-5xl">{b.title}</h2>
                {b.subtitle && <p className="mt-3 text-base text-white/90 sm:text-lg">{b.subtitle}</p>}
                {b.ctaLabel && (
                  <Link href={b.ctaHref || '/shop'} tabIndex={i === index ? 0 : -1} className={`mt-6 inline-block rounded-full px-6 py-3 text-sm font-bold shadow ${theme.accent} hover:opacity-90`}>
                    {b.ctaLabel}
                  </Link>
                )}
              </div>
              <div className="pointer-events-none absolute -right-6 bottom-0 hidden text-[11rem] leading-none opacity-90 drop-shadow-xl sm:block lg:right-12" aria-hidden>
                {theme.emoji}
              </div>
            </div>
          );
        })}
      </div>
      {count > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous slide" className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white sm:block">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Next slide" className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white sm:block">
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
