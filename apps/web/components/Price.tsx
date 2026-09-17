import { formatINR } from '@gnj/core/format';

export function Price({ price, mrp, size = 'md' }: { price: number; mrp?: number; size?: 'md' | 'lg' }) {
  const showMrp = mrp !== undefined && mrp > price;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className={size === 'lg' ? 'text-3xl font-bold text-ink' : 'text-base font-bold text-ink'}>{formatINR(price)}</span>
      {showMrp && (
        <span className={size === 'lg' ? 'text-lg text-neutral-400 line-through' : 'text-xs text-neutral-400 line-through'}>
          {formatINR(mrp)}
        </span>
      )}
      {showMrp && size === 'lg' && (
        <span className="text-sm font-semibold text-emerald-700">You save {formatINR(Math.round((mrp - price) * 100) / 100)}</span>
      )}
    </div>
  );
}
