import { formatINR } from '@gnj/core/format';
import type { Metadata } from 'next';
import { getSettings } from '@/lib/api';
import { InfoPage } from '../InfoPage';

export const metadata: Metadata = { title: 'Shipping policy' };

export default async function ShippingPolicyPage() {
  const s = await getSettings();
  return (
    <InfoPage title="Shipping policy">
      <p className="rounded-xl bg-amber-50 p-3 text-sm">Template text — please review and adapt it to your business before going live.</p>
      <h2>Order confirmation</h2>
      <p>Orders are reviewed by our team before dispatch. You will receive an email when your order is approved.</p>
      <h2>Dispatch & delivery</h2>
      <ul>
        <li>Approved orders are dispatched within {s.shipping.dispatchDays}.</li>
        <li>Delivery usually takes 3–7 business days depending on your location.</li>
        <li>Courier name and tracking number are shared by email once the order ships.</li>
      </ul>
      <h2>Shipping charges</h2>
      <ul>
        <li>A flat shipping fee of {formatINR(s.shipping.flatFee)} applies per order.</li>
        {s.shipping.freeShippingThreshold > 0 && <li>Orders of {formatINR(s.shipping.freeShippingThreshold)} or more ship free.</li>}
      </ul>
    </InfoPage>
  );
}
