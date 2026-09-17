import type { Metadata } from 'next';
import { InfoPage } from '../InfoPage';

export const metadata: Metadata = { title: 'Returns & refunds' };

export default function ReturnsPolicyPage() {
  return (
    <InfoPage title="Returns & refunds">
      <p className="rounded-xl bg-amber-50 p-3 text-sm">Template text — please review and adapt it to your business before going live.</p>
      <h2>Damaged or wrong items</h2>
      <p>If your order arrives damaged or incorrect, message us on WhatsApp within 48 hours of delivery with photos of the package and product. We will arrange a replacement or refund.</p>
      <h2>Personalised products</h2>
      <p>Personalised items are made for you and cannot be returned unless they arrive damaged or with a mistake on our side.</p>
      <h2>Cancellations</h2>
      <p>You can cancel an order any time before it ships by contacting us on WhatsApp or email.</p>
    </InfoPage>
  );
}
