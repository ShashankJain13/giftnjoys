'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page py-24 text-center">
      <div className="text-6xl">🎁</div>
      <h1 className="font-display mt-4 text-3xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-neutral-600">Please try again in a moment.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
        Try again
      </button>
    </div>
  );
}
