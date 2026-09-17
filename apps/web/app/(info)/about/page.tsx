import type { Metadata } from 'next';
import { getSettings } from '@/lib/api';
import { InfoPage } from '../InfoPage';

export const metadata: Metadata = { title: 'About us' };

export default async function AboutPage() {
  const s = await getSettings();
  return (
    <InfoPage title={`About ${s.storeName}`}>
      <p>{s.storeName} started with a simple idea: finding a thoughtful gift should be easy and fun, not stressful.</p>
      <p>We hand-pick every product in our store — from personalised keepsakes and festive décor to hampers for teams and families — and check it before it goes live.</p>
      <p>Because gifting is personal, we like to talk to you. Every order is reviewed by our team and confirmed with you on WhatsApp before it ships.</p>
    </InfoPage>
  );
}
