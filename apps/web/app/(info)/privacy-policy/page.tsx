import type { Metadata } from 'next';
import { InfoPage } from '../InfoPage';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function PrivacyPolicyPage() {
  return (
    <InfoPage title="Privacy policy">
      <p className="rounded-xl bg-amber-50 p-3 text-sm">Template text — have it reviewed for compliance (e.g. India’s DPDP Act) before going live.</p>
      <h2>What we collect</h2>
      <p>When you place an order we collect your name, mobile number, email address and delivery address, plus the gift message and notes you choose to add.</p>
      <h2>How we use it</h2>
      <ul>
        <li>To review, confirm, ship and support your order.</li>
        <li>To contact you on WhatsApp, phone or email about your order.</li>
      </ul>
      <p>We do not sell your personal data. We share delivery details only with courier partners to deliver your order.</p>
      <h2>Your choices</h2>
      <p>Contact us to access, correct or delete your personal information.</p>
    </InfoPage>
  );
}
