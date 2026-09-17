import type { ReactNode } from 'react';

export function InfoPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <article className="container-page max-w-3xl py-10">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      {updated && <p className="mt-1 text-sm text-neutral-500">Last updated {updated}</p>}
      <div className="mt-6 space-y-4 leading-relaxed text-neutral-700 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
        {children}
      </div>
    </article>
  );
}
