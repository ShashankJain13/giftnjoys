import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TrackOrder } from './TrackOrder';

export const metadata: Metadata = { title: 'Track your order', robots: { index: false } };

export default function TrackPage() {
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="font-display text-3xl font-bold">Track your order</h1>
      <p className="mt-1 text-neutral-600">Enter your order number and the mobile number used at checkout.</p>
      <Suspense>
        <TrackOrder />
      </Suspense>
    </div>
  );
}
