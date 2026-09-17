import { formatDateTimeIST } from '@gnj/core/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ConfidenceBadge, ProductStatusBadge } from '../components/status';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Input, PageHeader, Select, Spinner, Tabs, cx } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import type { CategoryDto, ImportJobDto, Paged, ProductDto } from '../lib/types';

type Filter = 'DRAFT' | 'PUBLISHED' | 'ALL';

function Stat({ label, value, tone }: { label: string; value: number | undefined; tone?: string }) {
  return (
    <div className="rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200">
      <div className={cx('text-xl font-semibold', tone)}>{value ?? '—'}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function DraftCard({
  product,
  categories,
  selected,
  onSelect,
}: {
  product: ProductDto;
  categories: CategoryDto[];
  selected: boolean;
  onSelect: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price || ''));
  const [mrp, setMrp] = useState(product.mrp !== undefined ? String(product.mrp) : '');
  const [categoryId, setCategoryId] = useState(product.categoryId ?? '');
  const [stock, setStock] = useState(String(product.stockQty));
  const [imageIndex, setImageIndex] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setName(product.name);
    setPrice(String(product.price || ''));
    setMrp(product.mrp !== undefined ? String(product.mrp) : '');
    setCategoryId(product.categoryId ?? '');
    setStock(String(product.stockQty));
  }, [product]);

  const dirty =
    name !== product.name ||
    Number(price || 0) !== product.price ||
    (mrp === '' ? undefined : Number(mrp)) !== product.mrp ||
    categoryId !== (product.categoryId ?? '') ||
    Number(stock) !== product.stockQty;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['import-products'] });
    void qc.invalidateQueries({ queryKey: ['import'] });
  };

  const save = async () => {
    if (!dirty) return product;
    return api<ProductDto>(`/products/${product.id}`, {
      method: 'PATCH',
      body: {
        name,
        price: Number(price || 0),
        mrp: mrp === '' ? null : Number(mrp),
        categoryId: categoryId || null,
        stockQty: Math.max(0, Math.floor(Number(stock) || 0)),
      },
    });
  };

  const saveOnly = useMutation({ mutationFn: save, onSuccess: refresh, onError: (e) => setError(errorMessage(e)) });
  const publish = useMutation({
    mutationFn: async () => {
      await save();
      return api<ProductDto>(`/products/${product.id}/status`, { method: 'POST', body: { status: 'PUBLISHED' } });
    },
    onSuccess: () => {
      setError(undefined);
      refresh();
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/products/${product.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });

  const image = product.images[imageIndex];

  return (
    <div className={cx('flex flex-col overflow-hidden rounded-xl bg-white ring-1', selected ? 'ring-2 ring-brand-500' : 'ring-slate-200')}>
      <div className="relative aspect-[4/3] bg-slate-100">
        {image ? (
          <img src={image.url} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-slate-400">No image</div>
        )}
        <div className="absolute top-2 left-2 rounded bg-white/90 px-1.5 py-1">
          <Checkbox label={<span className="sr-only">Select</span>} checked={selected} onChange={onSelect} />
        </div>
        <div className="absolute top-2 right-2 flex gap-1">
          <ConfidenceBadge value={product.parseConfidence} />
          <ProductStatusBadge status={product.status} />
        </div>
        {product.images.length > 1 && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {product.images.map((img, i) => (
              <button
                key={img.key}
                type="button"
                aria-label={`Image ${i + 1}`}
                onClick={() => setImageIndex(i)}
                className={cx('size-2 rounded-full', i === imageIndex ? 'bg-white' : 'bg-white/50')}
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className="font-medium" />
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-slate-500">
            Price ₹
            <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} invalid={!Number(price)} />
          </label>
          <label className="text-xs text-slate-500">
            MRP ₹
            <Input type="number" min="0" value={mrp} onChange={(e) => setMrp(e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">
            Stock
            <Input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} />
          </label>
        </div>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
          <option value="">Uncategorised</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {product.parseWarnings && product.parseWarnings.length > 0 && (
          <ul className="space-y-0.5 text-xs text-amber-700">
            {product.parseWarnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}
        <button type="button" className="self-start text-xs text-slate-500 hover:text-slate-800" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Hide' : 'Show'} original message
        </button>
        {showRaw && <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs whitespace-pre-wrap">{product.rawSourceText}</pre>}
        {error && <Alert className="text-xs">{error}</Alert>}
        <div className="mt-auto flex items-center gap-2 pt-1">
          {product.status !== 'PUBLISHED' ? (
            <Button size="sm" variant="success" loading={publish.isPending} onClick={() => publish.mutate()}>
              <CheckCircle2 className="size-3.5" /> Publish
            </Button>
          ) : (
            <Badge tone="green">Live</Badge>
          )}
          {dirty && (
            <Button size="sm" variant="secondary" loading={saveOnly.isPending} onClick={() => saveOnly.mutate()}>
              Save
            </Button>
          )}
          <Link to={`/products/${product.id}`} className="text-xs text-slate-500 hover:text-slate-800">
            Full edit
          </Link>
          <Button size="sm" variant="ghost" className="ml-auto" aria-label="Delete draft" loading={remove.isPending} onClick={() => remove.mutate()}>
            <Trash2 className="size-4 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ImportReviewPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('DRAFT');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMessage, setBulkMessage] = useState<{ tone: 'green' | 'red'; text: string }>();

  const job = useQuery({
    queryKey: ['import', id],
    queryFn: () => api<ImportJobDto>(`/imports/${id}`),
    refetchInterval: (q) => (q.state.data && ['QUEUED', 'PROCESSING'].includes(q.state.data.status) ? 1500 : false),
  });
  const done = job.data?.status === 'DONE';
  const products = useQuery({
    queryKey: ['import-products', id, filter],
    queryFn: () => api<Paged<ProductDto>>(`/products?importJobId=${id}&status=${filter}&sort=confidence&pageSize=200`),
    enabled: done,
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<{ items: CategoryDto[] }>('/categories') });

  const bulk = useMutation({
    mutationFn: (action: 'publish' | 'delete') =>
      api<{ succeeded: number; failed: Array<{ id: string; error: string }> }>('/products/bulk', {
        method: 'POST',
        body: { ids: [...selected], action },
      }),
    onSuccess: (res, action) => {
      setSelected(new Set());
      setBulkMessage(
        res.failed.length
          ? { tone: 'red', text: `${res.succeeded} ${action === 'publish' ? 'published' : 'deleted'}; ${res.failed.length} need fixing (${res.failed[0]?.error})` }
          : { tone: 'green', text: `${res.succeeded} product(s) ${action === 'publish' ? 'published' : 'deleted'}` },
      );
      void qc.invalidateQueries({ queryKey: ['import-products'] });
      void qc.invalidateQueries({ queryKey: ['import', id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setBulkMessage({ tone: 'red', text: errorMessage(err) }),
  });

  if (job.isLoading) return <Spinner />;
  if (job.error || !job.data) return <Alert>{errorMessage(job.error)}</Alert>;
  const j = job.data;
  const items = products.data?.items ?? [];

  return (
    <>
      <Link to="/imports" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Imports
      </Link>
      <PageHeader title={j.filename} subtitle={`Uploaded ${formatDateTimeIST(j.createdAt)} by ${j.createdBy}`} />

      {(j.status === 'QUEUED' || j.status === 'PROCESSING') && (
        <Alert tone="blue" className="mb-4 flex items-center gap-2">
          <Spinner small /> Reading messages and images… this usually takes a few seconds.
        </Alert>
      )}
      {j.status === 'FAILED' && <Alert className="mb-4">Import failed: {j.error}</Alert>}
      {j.warnings?.map((w) => (
        <Alert key={w} tone="amber" className="mb-2">
          {w}
        </Alert>
      ))}

      {j.stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Messages read" value={j.stats.messages} />
          <Stat label="Product posts found" value={j.stats.candidates} />
          <Stat label="Drafts created" value={j.stats.created} tone="text-emerald-600" />
          <Stat label="Already imported" value={j.stats.duplicates} />
          <Stat label="Without image" value={j.stats.withoutImage} tone={j.stats.withoutImage ? 'text-amber-600' : undefined} />
          <Stat label="Without price" value={j.stats.withoutPrice} tone={j.stats.withoutPrice ? 'text-red-600' : undefined} />
        </div>
      )}

      {done && (
        <>
          <Tabs<Filter>
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setSelected(new Set());
            }}
            tabs={[
              { value: 'DRAFT', label: 'To review', count: j.products?.DRAFT },
              { value: 'PUBLISHED', label: 'Published', count: j.products?.PUBLISHED },
              { value: 'ALL', label: 'All' },
            ]}
          />
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Checkbox
              label="Select all"
              checked={items.length > 0 && items.every((p) => selected.has(p.id))}
              onChange={(v) => setSelected(v ? new Set(items.map((p) => p.id)) : new Set())}
            />
            <Button size="sm" variant="secondary" onClick={() => setSelected(new Set(items.filter((p) => (p.parseConfidence ?? 0) >= 0.8 && p.price > 0).map((p) => p.id)))}>
              Select high-confidence
            </Button>
            {selected.size > 0 && (
              <>
                <Button size="sm" variant="success" loading={bulk.isPending && bulk.variables === 'publish'} onClick={() => bulk.mutate('publish')}>
                  Publish {selected.size}
                </Button>
                <Button size="sm" variant="danger" loading={bulk.isPending && bulk.variables === 'delete'} onClick={() => bulk.mutate('delete')}>
                  Delete {selected.size}
                </Button>
              </>
            )}
          </div>
          {bulkMessage && (
            <Alert tone={bulkMessage.tone} className="mb-4">
              {bulkMessage.text}
            </Alert>
          )}
          {products.isLoading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <Card>
              <EmptyState title={filter === 'DRAFT' ? 'Nothing left to review 🎉' : 'No products here'} />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((p) => (
                <DraftCard
                  key={p.id}
                  product={p}
                  categories={categories.data?.items ?? []}
                  selected={selected.has(p.id)}
                  onSelect={(v) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (v) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
