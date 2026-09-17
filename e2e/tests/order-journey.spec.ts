import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { gradientPng, mailSubjectsFor, URLS } from './helpers';

const stamp = Date.now().toString(36).toUpperCase();
const productName = `Glass Terrarium Kit ${stamp}`;
const phone = '9876501234';
const shots = (name: string) => `test-results/screens/${name}.png`;

test.describe.configure({ mode: 'serial' });

test('WhatsApp import → publish → customer order → approve & ship → tracking', async ({ browser }) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  test.skip(!adminEmail || !adminPassword, 'ADMIN_EMAIL / ADMIN_PASSWORD not set (.env.local)');

  const admin = await browser.newPage();
  const shopper = await browser.newPage();

  // ---------- Admin: sign in ----------
  await admin.goto(`${URLS.admin}/login`);
  await admin.getByLabel('Email').fill(adminEmail!);
  await admin.getByLabel('Password').fill(adminPassword!);
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await expect(admin.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await admin.screenshot({ path: shots('01-admin-dashboard'), fullPage: true });

  // ---------- Admin: import a WhatsApp export with one product post ----------
  const chat = [
    '17/09/26, 10:00 am - Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.',
    '17/09/26, 10:05 am - Supplier Desk: IMG-20260917-WA0101.jpg (file attached)',
    `*${productName}* 🌿`,
    'Mini glass terrarium with moss, pebbles and a wooden base. Perfect desk decor.',
    'MRP ₹1,499',
    'Offer price ₹899/-',
    '#terrarium #decor',
    '17/09/26, 10:06 am - Supplier Desk: IMG-20260917-WA0102.jpg (file attached)',
    '',
  ].join('\n');
  const zip = zipSync({
    'WhatsApp Chat with Supplier Desk.txt': strToU8(chat),
    'IMG-20260917-WA0101.jpg': new Uint8Array(gradientPng(240, [209, 250, 229], [5, 150, 105])),
    'IMG-20260917-WA0102.jpg': new Uint8Array(gradientPng(240, [254, 243, 199], [217, 119, 6])),
  });

  await admin.getByRole('link', { name: 'WhatsApp import' }).click();
  await admin.locator('input[type="file"]').setInputFiles({ name: `WhatsApp Chat - Supplier Desk ${stamp}.zip`, mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await expect(admin.getByText('Drafts created')).toBeVisible({ timeout: 30_000 });
  const priceInput = admin.getByLabel('Price ₹');
  await expect(priceInput).toHaveCount(1);
  await expect(priceInput).toHaveValue('899');
  await admin.screenshot({ path: shots('02-import-review'), fullPage: true });

  // Adjust the price and publish from the review grid
  await priceInput.fill('849');
  await admin.getByRole('button', { name: 'Publish', exact: true }).click();
  // Published drafts leave the "To review" tab and the tab counts update
  await expect(admin.getByText('Nothing left to review 🎉')).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Published 1' })).toBeVisible();

  // ---------- Shopper: find the product (catalog cache refreshes every few seconds locally) ----------
  await expect(async () => {
    await shopper.goto(`${URLS.web}/shop?q=${encodeURIComponent(stamp)}`);
    await expect(shopper.getByRole('link', { name: productName }).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await shopper.screenshot({ path: shots('03-search-results'), fullPage: true });

  await shopper.getByRole('link', { name: productName }).first().click();
  await expect(shopper.getByRole('heading', { level: 1, name: productName })).toBeVisible();
  await expect(shopper.getByText('₹849').first()).toBeVisible();
  await shopper.screenshot({ path: shots('04-product-page'), fullPage: true });

  await shopper.getByRole('button', { name: 'Increase quantity' }).click();
  await shopper.getByRole('button', { name: 'Buy now' }).click();
  await expect(shopper).toHaveURL(/\/cart$/);
  await expect(shopper.getByTestId('cart-total')).toHaveText('₹1,698'); // 2 × 849, free shipping above ₹999
  await shopper.getByRole('link', { name: 'Proceed to checkout' }).click();

  // ---------- Shopper: checkout ----------
  await expect(shopper.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await shopper.getByRole('button', { name: 'Place order' }).click();
  await expect(shopper.getByText('Enter your full name')).toBeVisible(); // client-side validation

  await shopper.getByLabel('Full name').fill('Meera Iyer');
  await shopper.getByLabel('Mobile number (WhatsApp)').fill(phone);
  await shopper.getByLabel('Email').fill('meera.iyer@example.com');
  await shopper.getByLabel('House / flat, street').fill('14, Palm Grove Road');
  await shopper.getByLabel('City').fill('Chennai');
  await shopper.getByLabel('Pincode').fill('600017');
  await shopper.getByLabel('State').selectOption('Tamil Nadu');
  await shopper.getByLabel('Gift wrap my order').check();
  await shopper.getByLabel('Gift message (optional)').fill('Congratulations on the new home!');
  await shopper.screenshot({ path: shots('05-checkout'), fullPage: true });
  await shopper.getByRole('button', { name: 'Place order' }).click();

  await expect(shopper.getByTestId('order-number')).toBeVisible();
  const orderNumber = (await shopper.getByTestId('order-number').textContent())!.trim();
  expect(orderNumber).toMatch(/^GNJ-\d{6}-\d{4}$/);
  await expect(shopper.getByTestId('whatsapp-confirm')).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/);
  await shopper.screenshot({ path: shots('06-order-confirmation'), fullPage: true });

  // Cart is emptied after ordering
  await expect(shopper.getByTestId('cart-count')).toHaveCount(0);

  await expect.poll(() => mailSubjectsFor(orderNumber), { timeout: 15_000 }).toHaveLength(2);

  // ---------- Admin: approve and ship ----------
  await admin.goto(`${URLS.admin}/orders/${orderNumber}`);
  await expect(admin.getByText('Pending approval').first()).toBeVisible();
  await expect(admin.getByText('Congratulations on the new home!')).toBeVisible();
  await admin.screenshot({ path: shots('07-admin-order-pending'), fullPage: true });

  await admin.getByRole('button', { name: 'Approve', exact: true }).click();
  await admin.getByRole('button', { name: 'Approve & notify' }).click();
  await expect(admin.getByText(/Order approved/)).toBeVisible();

  await admin.getByRole('button', { name: 'Add shipping details' }).click();
  await admin.getByLabel('Courier').fill('Delhivery');
  await admin.getByLabel('AWB / tracking number').fill(`E2E${stamp}`);
  await admin.getByRole('button', { name: 'Mark shipped & notify' }).click();
  await expect(admin.getByText(/Order shipped/)).toBeVisible();
  await expect(admin.getByRole('link', { name: 'WhatsApp update' })).toHaveAttribute('href', new RegExp(`^https://wa\\.me/91${phone}\\?text=`));
  await admin.screenshot({ path: shots('08-admin-order-shipped'), fullPage: true });

  await expect.poll(() => mailSubjectsFor(orderNumber), { timeout: 15_000 }).toHaveLength(4);

  // ---------- Shopper: track the order ----------
  await shopper.goto(`${URLS.web}/track?order=${orderNumber}`);
  await shopper.getByLabel('Mobile number').fill('9999999999');
  await shopper.getByRole('button', { name: 'Track' }).click();
  await expect(shopper.getByText(/couldn’t find an order/)).toBeVisible();

  await shopper.getByLabel('Mobile number').fill(`+91 ${phone}`);
  await shopper.getByRole('button', { name: 'Track' }).click();
  await expect(shopper.getByTestId('track-status')).toContainText('Shipped');
  await expect(shopper.getByText(`E2E${stamp}`)).toBeVisible();
  await shopper.screenshot({ path: shots('09-track-shipped'), fullPage: true });
});
