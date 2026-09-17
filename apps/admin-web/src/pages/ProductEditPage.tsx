import { OCCASIONS, productCreateSchema, productUpdateSchema, type OccasionSlug } from '@gnj/core/schemas';
import { slugify } from '@gnj/core/util';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, MessageSquareText } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ImageUploader, type UploadedImage } from '../components/ImageUploader';
import { ConfidenceBadge, ProductStatusBadge } from '../components/status';
import { Alert, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, cx } from '../components/ui';
import { api, ApiError, errorMessage, PUBLIC_SITE_URL } from '../lib/api';
import type { CategoryDto, ProductDto } from '../lib/types';

interface FormState {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  price: string;
  mrp: string;
  stockQty: string;
  sku: string;
  moq: string;
  tags: string;
  occasions: OccasionSlug[];
  isFeatured: boolean;
  isBestseller: boolean;
  images: UploadedImage[];
}

const empty: FormState = {
  name: '',
  slug: '',
  description: '',
  categoryId: '',
  price: '',
  mrp: '',
  stockQty: '10',
  sku: '',
  moq: '',
  tags: '',
  occasions: [],
  isFeatured: false,
  isBestseller: false,
  images: [],
};

function fromProduct(p: ProductDto): FormState {
  return {
    name: p.name,
    slug: p.slug,
    description: p.description,
    categoryId: p.categoryId ?? '',
    price: String(p.price),
    mrp: p.mrp !== undefined ? String(p.mrp) : '',
    stockQty: String(p.stockQty),
    sku: p.sku ?? '',
    moq: p.moq !== undefined ? String(p.moq) : '',
    tags: p.tags.join(', '),
    occasions: p.occasions,
    isFeatured: p.isFeatured,
    isBestseller: p.isBestseller,
    images: p.images,
  };
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

function toPayload(f: FormState, original?: ProductDto) {
  return {
    name: f.name,
    ...(f.slug && f.slug !== original?.slug ? { slug: f.slug } : {}),
    description: f.description,
    categoryId: f.categoryId || null,
    price: Number(f.price || NaN),
    mrp: num(f.mrp),
    stockQty: Number(f.stockQty || 0),
    sku: f.sku.trim() || null,
    moq: num(f.moq),
    tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    occasions: f.occasions,
    isFeatured: f.isFeatured,
    isBestseller: f.isBestseller,
    images: f.images.map(({ key }) => ({ key })),
  };
}

export function ProductEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string }>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const product = useQuery({ queryKey: ['product', id], queryFn: () => api<ProductDto>(`/products/${id}`), enabled: !isNew });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<{ items: CategoryDto[] }>('/categories') });

  useEffect(() => {
    if (product.data) setForm(fromProduct(product.data));
  }, [product.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'name' && isNew && !slugTouched) next.slug = slugify(String(value));
      return next;
    });
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const refresh = (p: ProductDto) => {
    qc.setQueryData(['product', p.id], p);
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form, product.data);
      const schema = isNew ? productCreateSchema : productUpdateSchema;
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Please fix the highlighted fields', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
      }
      return isNew
        ? api<ProductDto>('/products', { method: 'POST', body: payload })
        : api<ProductDto>(`/products/${id}`, { method: 'PATCH', body: payload });
    },
    onSuccess: (p) => {
      refresh(p);
      setNotice({ tone: 'green', text: 'Saved' });
      if (isNew) navigate(`/products/${p.id}`, { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setNotice({ tone: 'red', text: errorMessage(err) });
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED') => {
      await save.mutateAsync();
      return api<ProductDto>(`/products/${id}/status`, { method: 'POST', body: { status } });
    },
    onSuccess: (p) => {
      refresh(p);
      setNotice({ tone: 'green', text: p.status === 'PUBLISHED' ? 'Published — now visible on the store' : `Moved to ${p.status.toLowerCase()}` });
    },
    onError: (err) => setNotice({ tone: 'red', text: errorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: () => api(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      navigate('/products', { replace: true });
    },
    onError: (err) => setNotice({ tone: 'red', text: errorMessage(err) }),
  });

  if (!isNew && product.isLoading) return <Spinner />;
  if (!isNew && product.error) return <Alert>{errorMessage(product.error)}</Alert>;
  const p = product.data;

  function submit(e: FormEvent) {
    e.preventDefault();
    setNotice(undefined);
    save.mutate();
  }

  return (
    <form onSubmit={submit}>
      <Link to="/products" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <PageHeader
        title={isNew ? 'New product' : form.name || 'Edit product'}
        subtitle={p && <span className="inline-flex items-center gap-2"><ProductStatusBadge status={p.status} />{p.source === 'WHATSAPP' && <ConfidenceBadge value={p.parseConfidence} />}</span>}
        actions={
          <>
            {p?.status === 'PUBLISHED' && (
              <a href={`${PUBLIC_SITE_URL}/p/${p.slug}`} target="_blank" rel="noreferrer">
                <Button variant="ghost">
                  <ExternalLink className="size-4" /> View
                </Button>
              </a>
            )}
            {p && p.status !== 'PUBLISHED' && (
              <Button variant="success" loading={setStatus.isPending} onClick={() => setStatus.mutate('PUBLISHED')}>
                Save & publish
              </Button>
            )}
            {p?.status === 'PUBLISHED' && (
              <Button variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate('DRAFT')}>
                Unpublish
              </Button>
            )}
            <Button type="submit" loading={save.isPending && !setStatus.isPending}>
              {isNew ? 'Create draft' : 'Save'}
            </Button>
          </>
        }
      />
      {notice && (
        <Alert tone={notice.tone} className="mb-4">
          {notice.text}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <div className="grid gap-4">
              <Field label="Name" error={errors.name}>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} autoFocus={isNew} />
              </Field>
              <Field label="Description" error={errors.description}>
                <Textarea rows={6} value={form.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
              <Field label="URL slug" error={errors.slug} hint={`${PUBLIC_SITE_URL}/p/${form.slug || '…'}`}>
                <Input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set('slug', e.target.value.toLowerCase());
                  }}
                  invalid={!!errors.slug}
                />
              </Field>
            </div>
          </Card>

          <Card title="Images">
            <ImageUploader images={form.images} onChange={(imgs) => set('images', imgs)} />
          </Card>

          <Card title="Pricing & inventory">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Selling price (₹)" error={errors.price}>
                <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} invalid={!!errors.price} />
              </Field>
              <Field label="MRP (₹)" error={errors.mrp} hint="Shown struck-through">
                <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.mrp} onChange={(e) => set('mrp', e.target.value)} invalid={!!errors.mrp} />
              </Field>
              <Field label="Stock quantity" error={errors.stockQty}>
                <Input type="number" min="0" step="1" value={form.stockQty} onChange={(e) => set('stockQty', e.target.value)} invalid={!!errors.stockQty} />
              </Field>
              <Field label="SKU" error={errors.sku}>
                <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} />
              </Field>
              <Field label="Min. order qty" error={errors.moq}>
                <Input type="number" min="1" step="1" value={form.moq} onChange={(e) => set('moq', e.target.value)} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Organisation">
            <div className="grid gap-4">
              <Field label="Category" error={errors.categoryId}>
                <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">Uncategorised</option>
                  {categories.data?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parentId ? '— ' : ''}
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tags" hint="Comma separated, helps search" error={errors.tags}>
                <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} />
              </Field>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Occasions</span>
                <div className="flex flex-wrap gap-1.5">
                  {OCCASIONS.map((o) => {
                    const on = form.occasions.includes(o.slug);
                    return (
                      <button
                        key={o.slug}
                        type="button"
                        onClick={() => set('occasions', on ? form.occasions.filter((x) => x !== o.slug) : [...form.occasions, o.slug])}
                        className={cx('rounded-full px-2.5 py-1 text-xs ring-1', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400')}
                      >
                        {o.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Checkbox label="Bestseller (homepage)" checked={form.isBestseller} onChange={(v) => set('isBestseller', v)} />
              <Checkbox label="Featured" checked={form.isFeatured} onChange={(v) => set('isFeatured', v)} />
            </div>
          </Card>

          {p?.source === 'WHATSAPP' && (
            <Card title={<span className="inline-flex items-center gap-1.5"><MessageSquareText className="size-4 text-emerald-600" /> Imported from WhatsApp</span>}>
              {p.parseWarnings && p.parseWarnings.length > 0 && (
                <ul className="mb-3 list-disc space-y-0.5 pl-4 text-xs text-amber-700">
                  {p.parseWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <button type="button" className="text-sm text-brand-700" onClick={() => setShowRaw((v) => !v)}>
                {showRaw ? 'Hide' : 'Show'} original message
              </button>
              {showRaw && <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs whitespace-pre-wrap">{p.rawSourceText}</pre>}
              {p.importJobId && (
                <Link to={`/imports/${p.importJobId}`} className="mt-3 block text-sm text-slate-500 hover:text-slate-800">
                  Open import batch →
                </Link>
              )}
            </Card>
          )}

          {p && (
            <Card title="Danger zone">
              <div className="flex flex-wrap gap-2">
                {p.status !== 'ARCHIVED' && (
                  <Button variant="secondary" onClick={() => setStatus.mutate('ARCHIVED')}>
                    Archive
                  </Button>
                )}
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={confirmDelete}
        title="Delete this product?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">“{form.name}” will be removed permanently. Existing orders are not affected.</p>
      </Modal>
    </form>
  );
}
