'use client';

import { waLink } from '@gnj/core/whatsapp';
import { Minus, Play, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import type { Product } from '@/lib/types';
import { AddToCartButton } from './AddToCartButton';

type Slide = { type: 'image' | 'video'; src: string };

export function ProductGallery({ images, videos = [], name }: { images: string[]; videos?: string[]; name: string }) {
  const [active, setActive] = useState(0);
  const slides: Slide[] = [...images.map((src) => ({ type: 'image' as const, src })), ...videos.map((src) => ({ type: 'video' as const, src }))];
  const slide = slides[active];
  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-3xl bg-brand-50 ring-1 ring-black/5">
        {slide?.type === 'image' ? (
          <img src={slide.src} alt={name} className="size-full object-cover" />
        ) : slide?.type === 'video' ? (
          <video src={slide.src} controls playsInline className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-8xl">🎁</div>
        )}
      </div>
      {slides.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {slides.map((s, i) => (
            <button
              key={s.src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={s.type === 'video' ? 'Play video' : `Show image ${i + 1}`}
              className={`relative size-20 shrink-0 overflow-hidden rounded-xl ring-2 ${i === active ? 'ring-brand-600' : 'ring-transparent hover:ring-brand-200'}`}
            >
              {s.type === 'image' ? (
                <img src={s.src} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center bg-ink text-white">
                  <Play className="size-6" fill="currentColor" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PurchasePanel({ product, whatsappNumber, productUrl }: { product: Product; whatsappNumber: string; productUrl: string }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const [qty, setQty] = useState(product.moq ?? 1);
  const max = Math.min(99, product.stockLeft ?? 99);

  return (
    <div className="space-y-4">
      {product.inStock && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-neutral-700">Quantity</span>
          <div className="flex items-center rounded-full bg-white ring-1 ring-black/10">
            <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-2.5 hover:text-brand-700">
              <Minus className="size-4" />
            </button>
            <span className="w-10 text-center font-semibold" aria-live="polite">
              {qty}
            </span>
            <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(max, q + 1))} className="p-2.5 hover:text-brand-700">
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <AddToCartButton product={product} qty={qty} />
        {product.inStock && (
          <button
            type="button"
            onClick={() => {
              add({ productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: product.price, mrp: product.mrp }, qty);
              router.push('/cart');
            }}
            className="w-full rounded-full bg-ink px-6 py-3.5 text-base font-semibold text-white hover:bg-black"
          >
            Buy now
          </button>
        )}
      </div>
      <a
        href={waLink(whatsappNumber, `Hi! I'm interested in "${product.name}" — ${productUrl}`)}
        target="_blank"
        rel="noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-50 px-6 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
      >
        💬 Ask about this gift on WhatsApp
      </a>
    </div>
  );
}
