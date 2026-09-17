import { waLink } from '@gnj/core/whatsapp';
import type { Metadata } from 'next';
import { getSettings } from '@/lib/api';
import { InfoPage } from '../InfoPage';

export const metadata: Metadata = { title: 'Contact us' };

export default async function ContactPage() {
  const s = await getSettings();
  return (
    <InfoPage title="Contact us">
      <p>We usually reply within a few hours during business days.</p>
      <ul>
        <li>
          WhatsApp:{' '}
          <a className="font-semibold text-brand-700 underline" href={waLink(s.whatsappNumber, `Hi ${s.storeName}!`)} target="_blank" rel="noreferrer">
            Start a chat
          </a>
        </li>
        {s.supportEmail && (
          <li>
            Email: <a className="text-brand-700 underline" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a>
          </li>
        )}
        {s.supportPhone && <li>Phone: {s.supportPhone}</li>}
        {s.address && <li className="whitespace-pre-line">Address: {s.address}</li>}
      </ul>
      <p>For bulk or corporate orders, mention the quantity and delivery city and we’ll share a custom quote.</p>
    </InfoPage>
  );
}
