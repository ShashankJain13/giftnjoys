import { formatDateTimeIST, formatINR } from '@gnj/core/format';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, FileText, Package } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { OrderStatusBadge } from '../components/status';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner, Thumb } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import type { DashboardSummary } from '../lib/types';

function Kpi({ label, value, icon, to, tone }: { label: string; value: ReactNode; icon: ReactNode; to: string; tone: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-xs ring-1 ring-slate-200 hover:ring-slate-300">
      <div className={`flex size-11 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
      <div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </Link>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <Alert>{errorMessage(error)}</Alert>;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="What needs your attention today" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Orders pending approval" value={data.ordersByStatus.PENDING} to="/orders?status=PENDING" icon={<ClipboardList className="size-5" />} tone="bg-amber-100 text-amber-700" />
        <Kpi label="Orders today" value={data.ordersToday} to="/orders" icon={<FileText className="size-5" />} tone="bg-sky-100 text-sky-700" />
        <Kpi label="Live products" value={data.productCounts.published} to="/products?status=PUBLISHED" icon={<Package className="size-5" />} tone="bg-emerald-100 text-emerald-700" />
        <Kpi label="Drafts to review" value={data.productCounts.drafts} to="/products?status=DRAFT" icon={<AlertTriangle className="size-5" />} tone="bg-brand-100 text-brand-700" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Pending orders" className="xl:col-span-2" padded={false} actions={<Link to="/orders" className="text-sm text-brand-700">View all</Link>}>
          {data.pendingOrders.length === 0 ? (
            <EmptyState title="All caught up 🎉">No orders waiting for approval.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.pendingOrders.map((o) => (
                <li key={o.orderNumber}>
                  <Link to={`/orders/${o.orderNumber}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <div>
                      <div className="font-medium">{o.orderNumber}</div>
                      <div className="text-xs text-slate-500">
                        {o.customerName} · {o.city} · {formatDateTimeIST(o.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{formatINR(o.total)}</span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Low stock" padded={false}>
          {data.lowStock.length === 0 ? (
            <EmptyState title="Stock looks healthy" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.lowStock.map((p) => (
                <li key={p.id}>
                  <Link to={`/products/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <Thumb src={p.images[0]?.url} size="sm" />
                    <span className="line-clamp-1 flex-1 text-sm">{p.name}</span>
                    <Badge tone={p.stockQty === 0 ? 'red' : 'amber'}>{p.stockQty === 0 ? 'Out' : `${p.stockQty} left`}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent WhatsApp imports" className="xl:col-span-3" padded={false} actions={<Link to="/imports" className="text-sm text-brand-700">Import chat</Link>}>
          {data.recentImports.length === 0 ? (
            <EmptyState title="No imports yet">Export a WhatsApp group chat and upload it to create draft products.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentImports.map((j) => (
                <li key={j.id}>
                  <Link to={`/imports/${j.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-slate-50">
                    <span className="font-medium">{j.filename}</span>
                    <span className="text-slate-500">
                      {j.stats ? `${j.stats.created} created · ${j.stats.duplicates} duplicates` : j.status} · {formatDateTimeIST(j.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
