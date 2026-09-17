import type { Metadata } from 'next';
import { InfoPage } from '../InfoPage';

export const metadata: Metadata = { title: 'Terms of service' };

export default function TermsPage() {
  return (
    <InfoPage title="Terms of service">
      <p className="rounded-xl bg-amber-50 p-3 text-sm">Template text — please have it reviewed before going live.</p>
      <h2>Orders</h2>
      <p>Placing an order is a request to purchase. An order is accepted only when we approve it and notify you. We may decline orders, for example when an item is out of stock.</p>
      <h2>Prices</h2>
      <p>All prices are in Indian Rupees and include applicable taxes. The price charged is the price shown at the time your order is approved.</p>
      <h2>Product images</h2>
      <p>We try to show products accurately; small variations in colour or design may occur.</p>
    </InfoPage>
  );
}
