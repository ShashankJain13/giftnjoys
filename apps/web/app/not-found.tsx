import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-page py-24 text-center">
      <div className="text-6xl">🎈</div>
      <h1 className="font-display mt-4 text-3xl font-bold">We couldn’t find that page</h1>
      <p className="mt-2 text-neutral-600">It may have moved or is no longer available.</p>
      <Link href="/shop" className="mt-6 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
        Browse gifts
      </Link>
    </div>
  );
}
