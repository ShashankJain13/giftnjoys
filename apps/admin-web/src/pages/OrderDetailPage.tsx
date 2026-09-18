import { formatDateTimeIST, formatINR } from '@gnj/core/format';
import { ORDER_STATUS_LABELS } from '@gnj/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Gift, Mail, MessageCircle, Phone, Truck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { OrderStatusBadge } from '../components/status';
import { Alert, Button, Card, Field, Input, Modal, PageHeader, Spinner, Textarea, Thumb } from '../components/ui';
import { api, ApiError, errorMessage, PUBLIC_SITE_URL } from '../lib/api';
import type { OrderDto } from '../lib/types';

type Dialog = 'approve' | 'reject' | 'ship' | 'deliver' | 'cancel' | null;

const COURIERS = ['Delhivery', 'Blue Dart', 'DTDC', 'Ekart', 'India Post', 'Xpressbees', 'Shadowfax', 'Shiprocket', 'Self delivery'];

export function OrderDetailPage() {
  const { orderNumber } = useParams();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [ship, setShip] = useState({ courier: '', awb: '', trackingUrl: '', expectedDelivery: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [notes, setNotes] = useState('');

  const order = useQuery({ queryKey: ['order', orderNumber], queryFn: () => api<OrderDto>(`/orders/${orderNumber}`) });
  useEffect(() => setNotes(order.data?.adminNotes ?? ''), [order.data?.adminNotes]);

  const onDone = (o: OrderDto, message: string) => {
    qc.setQueryData(['order', orderNumber], o);
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    setDialog(null);
    setReason('');
    setNote('');
    setActionError(undefined);
    setNotice(message);
  };

  const action = useMutation({
    mutationFn: ({ name, body }: { name: Exclude<Dialog, null>; body: unknown }) =>
      api<OrderDto>(`/orders/${orderNumber}/${name}`, { method: 'POST', body }),
    onSuccess: (o) => onDone(o, `Order ${ORDER_STATUS_LABELS[o.status].toLowerCase()} — customer notified by email.`),
    onError: (err) => {
      setActionError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors());
    },
  });

  const saveNotes = useMutation({
    mutationFn: () => api<OrderDto>(`/orders/${orderNumber}/notes`, { method: 'PATCH', body: { adminNotes: notes } }),
    onSuccess: (o) => {
      qc.setQueryData(['order', orderNumber], o);
      setNotice('Notes saved');
    },
    onError: (err) => setActionError(errorMessage(err)),
  });

  if (order.isLoading) return <Spinner />;
  if (order.error || !order.data) return <Alert>{errorMessage(order.error)}</Alert>;
  const o = order.data;
  const c = o.customer;
  const can = (a: string) => o.allowedActions.includes(a as never);

  const open = (d: Dialog) => {
    setActionError(undefined);
    setFieldErrors({});
    setDialog(d);
  };

  return (
    <>
      <Link to={`/orders?status=${o.status}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Orders
      </Link>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            {o.orderNumber} <OrderStatusBadge status={o.status} />
          </span>
        }
        subtitle={`Placed ${formatDateTimeIST(o.createdAt)}`}
        actions={
          <>
            <a href={o.whatsappLink} target="_blank" rel="noreferrer">
              <Button variant="secondary">
                <MessageCircle className="size-4 text-emerald-600" /> WhatsApp update
              </Button>
            </a>
            {can('cancel') && (
              <Button variant="ghost" onClick={() => open('cancel')}>
                Cancel order
              </Button>
            )}
            {can('reject') && (
              <Button variant="danger" onClick={() => open('reject')}>
                <X className="size-4" /> Reject
              </Button>
            )}
            {can('approve') && (
              <Button variant="success" onClick={() => open('approve')}>
                <Check className="size-4" /> Approve
              </Button>
            )}
            {can('ship') && (
              <Button onClick={() => open('ship')}>
                <Truck className="size-4" /> Add shipping details
              </Button>
            )}
            {can('deliver') && (
              <Button variant="success" onClick={() => open('deliver')}>
                <Check className="size-4" /> Mark delivered
              </Button>
            )}
          </>
        }
      />

      {notice && (
        <Alert tone="green" className="mb-4">
          {notice}{' '}
          {['APPROVED', 'SHIPPED', 'DELIVERED', 'REJECTED', 'CANCELLED'].includes(o.status) && (
            <a href={o.whatsappLink} target="_blank" rel="noreferrer" className="font-medium underline">
              Also send it on WhatsApp →
            </a>
          )}
        </Alert>
      )}
      {actionError && !dialog && <Alert className="mb-4">{actionError}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Items (${o.items.reduce((n, i) => n + i.qty, 0)})`} padded={false}>
            <ul className="divide-y divide-slate-100">
              {o.items.map((i) => (
                <li key={i.productId} className="flex items-center gap-3 px-4 py-3">
                  <Thumb src={i.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/products/${i.productId}`} className="line-clamp-1 font-medium hover:text-brand-700">
                      {i.name}
                    </Link>
                    {i.variant && <div className="text-xs text-slate-500">{i.variant}</div>}
                    <div className="text-xs text-slate-500">
                      {i.qty} × {formatINR(i.unitPrice)}
                    </div>
                  </div>
                  <div className="font-medium">{formatINR(i.lineTotal)}</div>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-slate-100 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd>{formatINR(o.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Shipping</dt>
                <dd>{o.shippingFee ? formatINR(o.shippingFee) : 'Free'}</dd>
              </div>
              {o.giftWrap && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Gift wrap</dt>
                  <dd>{formatINR(o.giftWrapFee)}</dd>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatINR(o.total)}</dd>
              </div>
            </dl>
          </Card>

          {(o.giftWrap || o.giftMessage || o.notes) && (
            <Card title={<span className="inline-flex items-center gap-1.5"><Gift className="size-4 text-brand-600" /> Gifting</span>}>
              {o.giftWrap && <p className="text-sm">🎀 Gift wrap requested</p>}
              {o.giftMessage && <blockquote className="mt-2 rounded-lg bg-brand-50 p-3 text-sm whitespace-pre-wrap italic">“{o.giftMessage}”</blockquote>}
              {o.notes && (
                <p className="mt-2 text-sm">
                  <span className="text-slate-500">Customer note:</span> {o.notes}
                </p>
              )}
            </Card>
          )}

          {o.shipping && (
            <Card title={<span className="inline-flex items-center gap-1.5"><Truck className="size-4" /> Shipment</span>}>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Courier</dt>
                  <dd className="font-medium">{o.shipping.courier}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">AWB / tracking no.</dt>
                  <dd className="font-medium">{o.shipping.awb}</dd>
                </div>
                {o.shipping.expectedDelivery && (
                  <div>
                    <dt className="text-slate-500">Expected delivery</dt>
                    <dd>{o.shipping.expectedDelivery}</dd>
                  </div>
                )}
                {o.shipping.trackingUrl && (
                  <div>
                    <dt className="text-slate-500">Tracking link</dt>
                    <dd>
                      <a href={o.shipping.trackingUrl} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                        Open
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          <Card title="Internal notes">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only visible to admins" />
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="secondary" loading={saveNotes.isPending} disabled={notes === (o.adminNotes ?? '')} onClick={() => saveNotes.mutate()}>
                Save notes
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Customer">
            <div className="space-y-2 text-sm">
              <div className="font-medium">{c.name}</div>
              <a href={`tel:+91${c.phone}`} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
                <Phone className="size-4" /> +91 {c.phone}
              </a>
              <a href={`mailto:${c.email}`} className="flex items-center gap-2 break-all text-slate-600 hover:text-slate-900">
                <Mail className="size-4" /> {c.email}
              </a>
              <address className="pt-2 leading-relaxed text-slate-700 not-italic">
                {c.address1}
                {c.address2 && (
                  <>
                    <br />
                    {c.address2}
                  </>
                )}
                <br />
                {c.city}, {c.state} {c.pincode}
              </address>
            </div>
          </Card>

          <Card title="Timeline">
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {[...o.statusHistory].reverse().map((h) => (
                <li key={`${h.to}-${h.at}`} className="text-sm">
                  <span className="absolute -left-1.5 mt-1 size-3 rounded-full bg-brand-500 ring-4 ring-white" />
                  <div className="font-medium">{ORDER_STATUS_LABELS[h.to]}</div>
                  <div className="text-xs text-slate-500">
                    {formatDateTimeIST(h.at)} · {h.by}
                  </div>
                  {h.note && <div className="mt-0.5 text-slate-600">{h.note}</div>}
                </li>
              ))}
            </ol>
            <a href={`${PUBLIC_SITE_URL}/track?order=${o.orderNumber}`} target="_blank" rel="noreferrer" className="mt-4 block text-xs text-slate-500 hover:text-slate-800">
              Customer tracking page →
            </a>
          </Card>
        </div>
      </div>

      <Modal
        open={dialog === 'approve' || dialog === 'deliver'}
        title={dialog === 'approve' ? 'Approve order?' : 'Mark as delivered?'}
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button variant="success" loading={action.isPending} onClick={() => action.mutate({ name: dialog!, body: note ? { note } : {} })}>
              {dialog === 'approve' ? 'Approve & notify' : 'Mark delivered'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {dialog === 'approve' && <p className="text-sm text-slate-600">Stock will be reserved for these items and the customer gets a confirmation email.</p>}
          <Field label="Note (optional, internal)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {actionError && <Alert>{actionError}</Alert>}
        </div>
      </Modal>

      <Modal
        open={dialog === 'reject' || dialog === 'cancel'}
        title={dialog === 'reject' ? 'Reject order' : 'Cancel order'}
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button variant="danger" loading={action.isPending} onClick={() => action.mutate({ name: dialog!, body: { reason } })}>
              {dialog === 'reject' ? 'Reject & notify' : 'Cancel & notify'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {dialog === 'cancel' && o.status === 'APPROVED' && <Alert tone="amber">Reserved stock will be returned to inventory.</Alert>}
          <Field label="Reason (shared with the customer)" error={fieldErrors.reason}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Item is out of stock in this colour" />
          </Field>
          {actionError && !fieldErrors.reason && <Alert>{actionError}</Alert>}
        </div>
      </Modal>

      <Modal
        open={dialog === 'ship'}
        title="Shipping details"
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button loading={action.isPending} onClick={() => action.mutate({ name: 'ship', body: ship })}>
              Mark shipped & notify
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Courier" error={fieldErrors.courier}>
            <Input list="couriers" value={ship.courier} onChange={(e) => setShip({ ...ship, courier: e.target.value })} />
            <datalist id="couriers">
              {COURIERS.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label="AWB / tracking number" error={fieldErrors.awb}>
            <Input value={ship.awb} onChange={(e) => setShip({ ...ship, awb: e.target.value })} />
          </Field>
          <Field label="Tracking link (optional)" error={fieldErrors.trackingUrl}>
            <Input type="url" placeholder="https://" value={ship.trackingUrl} onChange={(e) => setShip({ ...ship, trackingUrl: e.target.value })} />
          </Field>
          <Field label="Expected delivery (optional)" error={fieldErrors.expectedDelivery}>
            <Input type="date" value={ship.expectedDelivery} onChange={(e) => setShip({ ...ship, expectedDelivery: e.target.value })} />
          </Field>
          {actionError && Object.keys(fieldErrors).length === 0 && <Alert>{actionError}</Alert>}
        </div>
      </Modal>
    </>
  );
}
