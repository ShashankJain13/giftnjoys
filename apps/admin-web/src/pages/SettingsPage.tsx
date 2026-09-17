import { BANNER_THEMES, type Banner } from '@gnj/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ImageUploader } from '../components/ImageUploader';
import { Alert, Button, Card, Field, Input, PageHeader, Select, Spinner, Tabs, Textarea } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import type { AllSettings, CategoryDto } from '../lib/types';

type Section = keyof AllSettings;

function useSection<K extends Section>(key: K, initial: AllSettings[K] | undefined) {
  const qc = useQueryClient();
  const [value, setValue] = useState<AllSettings[K] | undefined>(initial);
  const [status, setStatus] = useState<{ tone: 'green' | 'red'; text: ReactNode }>();
  useEffect(() => setValue(initial), [initial]);
  const save = useMutation({
    mutationFn: (v: AllSettings[K]) => api<AllSettings[K]>(`/settings/${key}`, { method: 'PUT', body: v }),
    onSuccess: (saved) => {
      setValue(saved);
      setStatus({ tone: 'green', text: 'Saved' });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => {
      const details = err instanceof ApiError ? Object.entries(err.fieldErrors()) : [];
      setStatus({
        tone: 'red',
        text: details.length ? (
          <ul className="list-disc pl-4">
            {details.map(([path, msg]) => (
              <li key={path}>
                {path}: {msg}
              </li>
            ))}
          </ul>
        ) : (
          errorMessage(err)
        ),
      });
    },
  });
  return { value, setValue, save, status };
}

function SaveBar({ onSave, pending, status }: { onSave: () => void; pending: boolean; status?: { tone: 'green' | 'red'; text: ReactNode } }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
      {status && <Alert tone={status.tone} className="flex-1">{status.text}</Alert>}
      <Button loading={pending} onClick={onSave}>
        Save changes
      </Button>
    </div>
  );
}

const numberOr = (v: string, fallback = 0) => (v.trim() === '' || Number.isNaN(Number(v)) ? fallback : Number(v));

export function SettingsPage() {
  const [tab, setTab] = useState<Section>('store');
  const all = useQuery({ queryKey: ['settings'], queryFn: () => api<AllSettings>('/settings') });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<{ items: CategoryDto[] }>('/categories') });

  const store = useSection('store', all.data?.store);
  const shipping = useSection('shipping', all.data?.shipping);
  const homepage = useSection('homepage', all.data?.homepage);
  const imp = useSection('import', all.data?.import);

  if (all.isLoading) return <Spinner />;
  if (all.error) return <Alert>{errorMessage(all.error)}</Alert>;

  return (
    <>
      <PageHeader title="Settings" subtitle="Store details, shipping rules, homepage content and import rules" />
      <Tabs<Section>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'store', label: 'Store' },
          { value: 'shipping', label: 'Shipping & fees' },
          { value: 'homepage', label: 'Homepage' },
          { value: 'import', label: 'WhatsApp import' },
        ]}
      />

      {tab === 'store' && store.value && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Store name">
              <Input value={store.value.storeName} onChange={(e) => store.setValue({ ...store.value!, storeName: e.target.value })} />
            </Field>
            <Field label="Tagline">
              <Input value={store.value.tagline} onChange={(e) => store.setValue({ ...store.value!, tagline: e.target.value })} />
            </Field>
            <Field label="Business WhatsApp number" hint="Digits with country code, e.g. 919876543210. Orders are confirmed to this number.">
              <Input inputMode="numeric" value={store.value.whatsappNumber} onChange={(e) => store.setValue({ ...store.value!, whatsappNumber: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="Support phone">
              <Input value={store.value.supportPhone} onChange={(e) => store.setValue({ ...store.value!, supportPhone: e.target.value })} />
            </Field>
            <Field label="Support email">
              <Input type="email" value={store.value.supportEmail} onChange={(e) => store.setValue({ ...store.value!, supportEmail: e.target.value })} />
            </Field>
            <Field label="New-order alert emails" hint="Comma separated">
              <Input
                value={store.value.adminEmails.join(', ')}
                onChange={(e) => store.setValue({ ...store.value!, adminEmails: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              />
            </Field>
            <Field label="Announcement bar" className="sm:col-span-2">
              <Input value={store.value.announcement} onChange={(e) => store.setValue({ ...store.value!, announcement: e.target.value })} />
            </Field>
            <Field label="Business address" className="sm:col-span-2">
              <Textarea rows={2} value={store.value.address} onChange={(e) => store.setValue({ ...store.value!, address: e.target.value })} />
            </Field>
            <Field label="Instagram URL">
              <Input value={store.value.instagramUrl} onChange={(e) => store.setValue({ ...store.value!, instagramUrl: e.target.value })} />
            </Field>
            <Field label="Facebook URL">
              <Input value={store.value.facebookUrl} onChange={(e) => store.setValue({ ...store.value!, facebookUrl: e.target.value })} />
            </Field>
          </div>
          <SaveBar onSave={() => store.save.mutate(store.value!)} pending={store.save.isPending} status={store.status} />
        </Card>
      )}

      {tab === 'shipping' && shipping.value && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Flat shipping fee (₹)">
              <Input type="number" min="0" value={shipping.value.flatFee} onChange={(e) => shipping.setValue({ ...shipping.value!, flatFee: numberOr(e.target.value) })} />
            </Field>
            <Field label="Free shipping above (₹)" hint="0 turns free shipping off">
              <Input type="number" min="0" value={shipping.value.freeShippingThreshold} onChange={(e) => shipping.setValue({ ...shipping.value!, freeShippingThreshold: numberOr(e.target.value) })} />
            </Field>
            <Field label="Gift wrap fee (₹)">
              <Input type="number" min="0" value={shipping.value.giftWrapFee} onChange={(e) => shipping.setValue({ ...shipping.value!, giftWrapFee: numberOr(e.target.value) })} />
            </Field>
            <Field label="Dispatch time (shown to customers)">
              <Input value={shipping.value.dispatchDays} onChange={(e) => shipping.setValue({ ...shipping.value!, dispatchDays: e.target.value })} />
            </Field>
          </div>
          <SaveBar onSave={() => shipping.save.mutate(shipping.value!)} pending={shipping.save.isPending} status={shipping.status} />
        </Card>
      )}

      {tab === 'homepage' && homepage.value && (
        <div className="space-y-6">
          <Card
            title="Hero banners"
            actions={
              <Button
                size="sm"
                variant="secondary"
                disabled={homepage.value.banners.length >= 8}
                onClick={() =>
                  homepage.setValue({
                    ...homepage.value!,
                    banners: [...homepage.value!.banners, { id: `b${Date.now().toString(36)}`, title: 'New banner', subtitle: '', ctaLabel: 'Shop now', ctaHref: '/shop', theme: 'rose' }],
                  })
                }
              >
                <Plus className="size-4" /> Add banner
              </Button>
            }
          >
            <div className="space-y-4">
              {homepage.value.banners.map((b, i) => {
                const update = (patch: Partial<Banner>) =>
                  homepage.setValue({ ...homepage.value!, banners: homepage.value!.banners.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={b.id} className="grid gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 md:grid-cols-[1fr_1fr_auto]">
                    <div className="grid gap-2">
                      <Input aria-label="Title" value={b.title} onChange={(e) => update({ title: e.target.value })} />
                      <Textarea aria-label="Subtitle" rows={2} value={b.subtitle} onChange={(e) => update({ subtitle: e.target.value })} />
                    </div>
                    <div className="grid content-start gap-2 sm:grid-cols-2">
                      <Input aria-label="Button label" value={b.ctaLabel} onChange={(e) => update({ ctaLabel: e.target.value })} />
                      <Input aria-label="Button link" value={b.ctaHref} onChange={(e) => update({ ctaHref: e.target.value })} />
                      <Select aria-label="Colour theme" value={b.theme} onChange={(e) => update({ theme: e.target.value as Banner['theme'] })}>
                        {BANNER_THEMES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-24">
                        <ImageUploader
                          max={1}
                          purpose="banner-image"
                          images={b.imageKey ? [{ key: b.imageKey, url: `${(import.meta.env.VITE_MEDIA_BASE_URL ?? 'http://localhost:9000/gnj-local-media').replace(/\/$/, '')}/${b.imageKey}` }] : []}
                          onChange={(imgs) => update({ imageKey: imgs[0]?.key })}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Remove banner"
                        onClick={() => homepage.setValue({ ...homepage.value!, banners: homepage.value!.banners.filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Shop by budget tiles">
            <Field label="Price limits (₹)" hint="Comma separated, e.g. 199, 499, 999, 1999">
              <Input
                value={homepage.value.priceTiles.join(', ')}
                onChange={(e) =>
                  homepage.setValue({
                    ...homepage.value!,
                    priceTiles: e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0),
                  })
                }
              />
            </Field>
          </Card>

          <Card
            title="FAQs"
            actions={
              <Button size="sm" variant="secondary" onClick={() => homepage.setValue({ ...homepage.value!, faqs: [...homepage.value!.faqs, { q: 'New question?', a: 'Answer' }] })}>
                <Plus className="size-4" /> Add FAQ
              </Button>
            }
          >
            <div className="space-y-3">
              {homepage.value.faqs.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <div className="grid flex-1 gap-2">
                    <Input
                      aria-label="Question"
                      value={f.q}
                      onChange={(e) => homepage.setValue({ ...homepage.value!, faqs: homepage.value!.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })}
                    />
                    <Textarea
                      aria-label="Answer"
                      rows={2}
                      value={f.a}
                      onChange={(e) => homepage.setValue({ ...homepage.value!, faqs: homepage.value!.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })}
                    />
                  </div>
                  <Button size="sm" variant="ghost" aria-label="Remove FAQ" onClick={() => homepage.setValue({ ...homepage.value!, faqs: homepage.value!.faqs.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
          <SaveBar onSave={() => homepage.save.mutate(homepage.value!)} pending={homepage.save.isPending} status={homepage.status} />
        </div>
      )}

      {tab === 'import' && imp.value && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date format in exports">
              <Select value={imp.value.dateOrder} onChange={(e) => imp.setValue({ ...imp.value!, dateOrder: e.target.value as 'DMY' | 'MDY' })}>
                <option value="DMY">Day/Month/Year (India)</option>
                <option value="MDY">Month/Day/Year (US)</option>
              </Select>
            </Field>
            <Field label="Group messages within (minutes)" hint="Photos + text from the same sender within this window become one product">
              <Input type="number" min="1" max="60" value={imp.value.groupWindowMinutes} onChange={(e) => imp.setValue({ ...imp.value!, groupWindowMinutes: numberOr(e.target.value, 3) })} />
            </Field>
            <Field label="Default stock for imported products">
              <Input type="number" min="0" value={imp.value.defaultStockQty} onChange={(e) => imp.setValue({ ...imp.value!, defaultStockQty: numberOr(e.target.value, 10) })} />
            </Field>
          </div>
          <h3 className="mt-6 mb-2 text-sm font-semibold">Category keywords</h3>
          <p className="mb-3 text-sm text-slate-500">When a post mentions these words, the draft is placed in that category.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {categories.data?.items.map((c) => (
              <Field key={c.id} label={c.name}>
                <Input
                  value={(imp.value!.categoryKeywords[c.id] ?? []).join(', ')}
                  placeholder="e.g. mug, bottle, sipper"
                  onChange={(e) =>
                    imp.setValue({
                      ...imp.value!,
                      categoryKeywords: {
                        ...imp.value!.categoryKeywords,
                        [c.id]: e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 2),
                      },
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <SaveBar onSave={() => imp.save.mutate(imp.value!)} pending={imp.save.isPending} status={imp.status} />
        </Card>
      )}
    </>
  );
}
