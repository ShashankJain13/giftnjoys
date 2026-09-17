import { formatDateTimeIST, formatINR } from '@gnj/core/format';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '@gnj/core/schemas';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { OrderStatusBadge } from '../components/status';
import { Alert, Button, Card, EmptyState, Input, PageHeader, Spinner, Tabs } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import type { DashboardSummary, OrderSummary } from '../lib/types';

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const status = (params.get('status') as OrderStatus) ?? 'PENDING';
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search === q) return;
      const next = new URLSearchParams(params);
      if (search) next.set('q', search);
      else next.delete('q');
      setParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const counts = useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardSummary>('/dashboard/summary') });

  const orders = useInfiniteQuery({
    queryKey: ['orders', status, q],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ status, limit: '50' });
      if (q) query.set('q', q);
      if (pageParam) query.set('cursor', pageParam);
      return api<{ items: OrderSummary[]; cursor?: string }>(`/orders?${query}`);
    },
    getNextPageParam: (last) => last.cursor,
    refetchInterval: status === 'PENDING' ? 30_000 : false,
  });

  const items = orders.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title="Orders" subtitle="Approve new orders, add shipping details and keep customers updated" />
      <Tabs<OrderStatus>
        value={status}
        onChange={(v) => setParams(new URLSearchParams({ status: v }), { replace: true })}
        tabs={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s], count: counts.data?.ordersByStatus[s] }))}
      />
      <Input
        placeholder="Search by order number, phone, or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-md"
      />
      {q && <p className="-mt-2 mb-3 text-xs text-slate-500">Order number and phone searches look across all statuses.</p>}
      <Card padded={false}>
        {orders.isLoading ? (
          <div className="p-8 text-center">
            <Spinner />
          </div>
        ) : orders.error ? (
          <Alert className="m-4">{errorMessage(orders.error)}</Alert>
        ) : items.length === 0 ? (
          <EmptyState title="No orders here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-2 py-2">Customer</th>
                  <th className="px-2 py-2 text-right">Items</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((o) => (
                  <tr key={o.orderNumber} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${o.orderNumber}`)}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{o.orderNumber}</div>
                      <div className="text-xs text-slate-500">{formatDateTimeIST(o.createdAt)}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div>{o.customerName}</div>
                      <div className="text-xs text-slate-500">
                        {o.customerPhone} · {o.city}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right">{o.itemCount}</td>
                    <td className="px-2 py-2.5 text-right font-medium">{formatINR(o.total)}</td>
                    <td className="px-4 py-2.5">
                      <OrderStatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {orders.hasNextPage && (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button variant="secondary" size="sm" loading={orders.isFetchingNextPage} onClick={() => void orders.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
