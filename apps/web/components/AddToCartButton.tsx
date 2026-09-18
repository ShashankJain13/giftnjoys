'use client';

import { Check, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import type { Product } from '@/lib/types';

export function AddToCartButton({
  product,
  qty = 1,
  compact = false,
  variant,
  onBeforeAdd,
}: {
  product: Product;
  qty?: number;
  compact?: boolean;
  variant?: string;
  /** Return false to block adding (e.g. a required colour/size hasn't been picked yet). */
  onBeforeAdd?: () => boolean;
}) {
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);

  if (!product.inStock) {
    return (
      <button type="button" disabled className="w-full rounded-full bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-400">
        Sold out
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (onBeforeAdd && !onBeforeAdd()) return;
        add(
          { productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: product.price, mrp: product.mrp, variant },
          qty,
        );
        setAdded(true);
        setTimeout(() => setAdded(false), 1600);
      }}
      className={
        compact
          ? 'flex w-full items-center justify-center gap-1.5 rounded-full border border-brand-600 px-3 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-600 hover:text-white'
          : 'flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700'
      }
    >
      {added ? <Check className="size-4" /> : <ShoppingBag className="size-4" />}
      {added ? 'Added' : 'Add to cart'}
    </button>
  );
}
