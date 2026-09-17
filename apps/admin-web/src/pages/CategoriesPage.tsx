import { slugify } from '@gnj/core/util';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ImageUploader } from '../components/ImageUploader';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, Thumb } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import type { CategoryDto } from '../lib/types';

interface Draft {
  id?: string;
  name: string;
  slug: string;
  description: string;
  parentId: string;
  isActive: boolean;
  image?: { key: string; url: string };
}

const blank: Draft = { name: '', slug: '', description: '', parentId: '', isActive: true };

export function CategoriesPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pageError, setPageError] = useState<string>();
  const [deleting, setDeleting] = useState<CategoryDto | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ['categories'], queryFn: () => api<{ items: CategoryDto[] }>('/categories') });
  const items = data?.items ?? [];
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['categories'] });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = {
        name: d.name,
        slug: d.slug || slugify(d.name),
        description: d.description || null,
        parentId: d.parentId || null,
        imageKey: d.image?.key ?? null,
        isActive: d.isActive,
      };
      return d.id
        ? api<CategoryDto>(`/categories/${d.id}`, { method: 'PATCH', body })
        : api<CategoryDto>('/categories', { method: 'POST', body });
    },
    onSuccess: () => {
      setDraft(null);
      invalidate();
    },
    onError: (err) => {
      setFormError(errorMessage(err));
      if (err instanceof ApiError) setErrors(err.fieldErrors());
    },
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api('/categories/reorder', { method: 'POST', body: { ids } }),
    onSuccess: invalidate,
    onError: (err) => setPageError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleting(null);
      invalidate();
    },
    onError: (err) => {
      setDeleting(null);
      setPageError(errorMessage(err));
    },
  });

  const move = (index: number, delta: number) => {
    const ids = items.map((c) => c.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    reorder.mutate(ids);
  };

  const open = (c?: CategoryDto) => {
    setErrors({});
    setFormError(undefined);
    setDraft(
      c
        ? {
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description ?? '',
            parentId: c.parentId ?? '',
            isActive: c.isActive,
            image: c.imageKey && c.imageUrl ? { key: c.imageKey, url: c.imageUrl } : undefined,
          }
        : blank,
    );
  };

  const nameOf = new Map(items.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Shown in the store menu and homepage tiles, in this order"
        actions={
          <Button onClick={() => open()}>
            <Plus className="size-4" /> Add category
          </Button>
        }
      />
      {pageError && <Alert className="mb-3">{pageError}</Alert>}
      <Card padded={false}>
        {isLoading ? (
          <div className="p-8 text-center">
            <Spinner />
          </div>
        ) : error ? (
          <Alert className="m-4">{errorMessage(error)}</Alert>
        ) : items.length === 0 ? (
          <EmptyState title="No categories yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex flex-col">
                  <button type="button" aria-label="Move up" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === items.length - 1 || reorder.isPending} onClick={() => move(i, 1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <Thumb src={c.imageUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {c.name} {!c.isActive && <Badge>Hidden</Badge>}
                  </div>
                  <div className="text-xs text-slate-500">
                    /c/{c.slug}
                    {c.parentId && ` · in ${nameOf.get(c.parentId) ?? '?'}`}
                  </div>
                </div>
                <span className="text-sm text-slate-500">{c.productCount ?? 0} products</span>
                <Button size="sm" variant="ghost" onClick={() => open(c)} aria-label={`Edit ${c.name}`}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}>
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!draft}
        wide
        title={draft?.id ? 'Edit category' : 'New category'}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => draft && save.mutate(draft)}>
              Save
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4">
            {formError && <Alert>{formError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" error={errors.name}>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: draft.id ? draft.slug : slugify(e.target.value) })} />
              </Field>
              <Field label="Slug" error={errors.slug}>
                <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })} />
              </Field>
            </div>
            <Field label="Parent category" error={errors.parentId}>
              <Select value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
                <option value="">None (top level)</option>
                {items
                  .filter((c) => c.id !== draft.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Description" error={errors.description}>
              <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Tile image</span>
              <ImageUploader
                max={1}
                purpose="category-image"
                images={draft.image ? [draft.image] : []}
                onChange={(imgs) => setDraft({ ...draft, image: imgs[0] })}
              />
            </div>
            <Checkbox label="Visible in store" checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleting}
        title="Delete category?"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          “{deleting?.name}” will be removed. Its {deleting?.productCount ?? 0} product(s) stay in the catalog as uncategorised.
        </p>
      </Modal>
    </>
  );
}
