import { formatINR } from '@gnj/core/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ProductStatusBadge } from '../components/status';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Input, Modal, PageHeader, Select, Spinner, Tabs, Thumb } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import type { CategoryDto, Paged, ProductDto } from '../lib/types';

type StatusTab = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
type BulkAction = 'publish' | 'unpublish' | 'archive' | 'delete' | 'setCategory';

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const status = (params.get('status') as StatusTab) ?? 'ALL';
  const page = Number(params.get('page') ?? 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string }>();

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
    setSelected(new Set());
  };

  useEffect(() => {
    const t = setTimeout(() => (search !== (params.get('q') ?? '') ? setParam('q', search) : undefined), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = new URLSearchParams({ status, page: String(page), pageSize: '50', sort: params.get('sort') ?? 'updated' });
  for (const k of ['q', 'categoryId', 'lowStock']) if (params.get(k)) query.set(k, params.get(k)!);

  const products = useQuery({ queryKey: ['products', query.toString()], queryFn: () => api<Paged<ProductDto>>(`/products?${query}`) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<{ items: CategoryDto[] }>('/categories') });
  const categoryName = new Map(categories.data?.items.map((c) => [c.id, c.name]));

  const bulk = useMutation({
    mutationFn: (input: { action: BulkAction; categoryId?: string | null }) =>
      api<{ succeeded: number; failed: Array<{ id: string; error: string }> }>('/products/bulk', {
        method: 'POST',
        body: { ids: [...selected], ...input },
      }),
    onSuccess: (res) => {
      setSelected(new Set());
      setConfirmDelete(false);
      setMessage(
        res.failed.length
          ? { tone: 'red', text: `${res.succeeded} updated, ${res.failed.length} failed: ${res.failed[0]?.error}` }
          : { tone: 'green', text: `${res.succeeded} product(s) updated` },
      );
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setMessage({ tone: 'red', text: errorMessage(err) }),
  });

  const items = products.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((p) => selected.has(p.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Manage your catalog, stock and visibility"
        actions={
          <Link to="/products/new">
            <Button>
              <Plus className="size-4" /> Add product
            </Button>
          </Link>
        }
      />
      <Tabs<StatusTab>
        value={status}
        onChange={(v) => setParam('status', v === 'ALL' ? undefined : v)}
        tabs={[
          { value: 'ALL', label: 'All' },
          { value: 'PUBLISHED', label: 'Published' },
          { value: 'DRAFT', label: 'Drafts' },
          { value: 'ARCHIVED', label: 'Archived' },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search name, SKU or tag…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={params.get('categoryId') ?? ''} onChange={(e) => setParam('categoryId', e.target.value)} className="max-w-52">
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {categories.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={params.get('sort') ?? 'updated'} onChange={(e) => setParam('sort', e.target.value)} className="max-w-44">
          <option value="updated">Recently updated</option>
          <option value="name">Name</option>
          <option value="price">Price</option>
          <option value="stock">Stock (low first)</option>
          <option value="confidence">Import match (low first)</option>
        </Select>
        <Checkbox label="Low stock (≤5)" checked={params.get('lowStock') === 'true'} onChange={(v) => setParam('lowStock', v ? 'true' : undefined)} />
      </div>

      {message && (
        <Alert tone={message.tone} className="mb-3">
          {message.text}
        </Alert>
      )}

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
          <span className="mr-2">{selected.size} selected</span>
          <Button size="sm" variant="success" loading={bulk.isPending} onClick={() => bulk.mutate({ action: 'publish' })}>
            Publish
          </Button>
          <Button size="sm" variant="secondary" onClick={() => bulk.mutate({ action: 'unpublish' })}>
            Move to draft
          </Button>
          <Button size="sm" variant="secondary" onClick={() => bulk.mutate({ action: 'archive' })}>
            Archive
          </Button>
          <Select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="h-8 max-w-44 py-1 text-slate-900">
            <option value="">Set category…</option>
            <option value="__none">Uncategorised</option>
            {categories.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {bulkCategory && (
            <Button size="sm" variant="secondary" onClick={() => bulk.mutate({ action: 'setCategory', categoryId: bulkCategory === '__none' ? null : bulkCategory })}>
              Apply
            </Button>
          )}
          <Button size="sm" variant="danger" className="ml-auto" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>
      )}

      <Card padded={false}>
        {products.isLoading ? (
          <div className="p-8 text-center">
            <Spinner />
          </div>
        ) : products.error ? (
          <Alert className="m-4">{errorMessage(products.error)}</Alert>
        ) : items.length === 0 ? (
          <EmptyState title="No products found">Try another filter, or add a product.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="w-10 px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="accent-brand-600"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((p) => p.id)))}
                    />
                  </th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2 text-right">Price</th>
                  <th className="px-2 py-2 text-right">Stock</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/products/${p.id}`)}>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${p.name}`} className="accent-brand-600" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-3">
                        <Thumb src={p.images[0]?.url} size="sm" />
                        <div className="min-w-0">
                          <div className="line-clamp-1 font-medium">{p.name}</div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            {p.sku && <span>SKU {p.sku} ·</span>}
                            {p.source === 'WHATSAPP' && <Badge tone="green">WhatsApp</Badge>}
                            {p.isBestseller && <Badge tone="brand">Bestseller</Badge>}
                            {p.images.length === 0 && <Badge tone="red">No image</Badge>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-slate-600">{p.categoryId ? (categoryName.get(p.categoryId) ?? '—') : <span className="text-slate-400">—</span>}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <div className="font-medium">{formatINR(p.price)}</div>
                      {p.mrp && p.mrp > p.price && <div className="text-xs text-slate-400 line-through">{formatINR(p.mrp)}</div>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span className={p.stockQty === 0 ? 'font-semibold text-red-600' : p.stockQty <= 5 ? 'font-semibold text-amber-600' : ''}>{p.stockQty}</span>
                    </td>
                    <td className="px-2 py-2">
                      <ProductStatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {products.data && products.data.total > products.data.pageSize && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-500">
              {products.data.total} products · page {page} of {Math.ceil(products.data.total / products.data.pageSize)}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={page * products.data.pageSize >= products.data.total} onClick={() => setParam('page', String(page + 1))}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={confirmDelete}
        title="Delete products?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={bulk.isPending} onClick={() => bulk.mutate({ action: 'delete' })}>
              Delete {selected.size}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This permanently removes {selected.size} product(s). Past orders keep their details. Consider archiving instead.</p>
      </Modal>
    </>
  );
}
