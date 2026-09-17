import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const require = createRequire(`${root}/packages/wa-import/package.json`);
const { zipSync, strToU8 } = require('fflate');
process.loadEnvFile(`${root}/.env.local`);
// Override for AWS: SMOKE_ADMIN_API=https://…execute-api… SMOKE_ADMIN_EMAIL=… SMOKE_ADMIN_PASSWORD=…
const API = `${process.env.SMOKE_ADMIN_API ?? 'http://localhost:4001'}/admin/v1`;
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
let token = '';
const call = async (method, path, body) => {
  const res = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
const check = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);

check('401 without token', (await call('GET', '/products')).status === 401);
check('wrong password rejected', (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: 'nope' })).status === 401);
const login = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
token = login.body?.token ?? '';
check('login', login.status === 200 && !!token);

const dash = await call('GET', '/dashboard/summary');
check('dashboard summary', dash.status === 200, `published=${dash.body?.productCounts?.published} drafts=${dash.body?.productCounts?.drafts} lowStock=${dash.body?.lowStock?.length}`);

const list = await call('GET', '/products?status=PUBLISHED&pageSize=3&sort=price');
check('product list', list.status === 200 && list.body.items.length === 3, `total=${list.body.total} first=${list.body.items[0]?.name} (₹${list.body.items[0]?.price}) img=${list.body.items[0]?.images[0]?.url}`);

const cats = await call('GET', '/categories');
check('categories with counts', cats.status === 200 && cats.body.items.length >= 8, cats.body.items.map(c => `${c.slug}:${c.productCount}`).join(' '));

const bad = await call('POST', '/products', { name: 'X', price: -1 });
check('validation error shape', bad.status === 400 && bad.body.error.code === 'VALIDATION_ERROR', JSON.stringify(bad.body.error.details));

// Image upload via presigned POST
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const pre = await call('POST', '/uploads/presign', { purpose: 'product-image', filename: 'dot.png', contentType: 'image/png' });
const form = new FormData();
Object.entries(pre.body.fields).forEach(([k, v]) => form.append(k, v));
form.append('file', new Blob([png], { type: 'image/png' }), 'dot.png');
const up = await fetch(pre.body.url, { method: 'POST', body: form });
const pub = await fetch(pre.body.publicUrl);
check('image presigned POST upload + public read', up.status === 204 && pub.status === 200, `upload=${up.status} read=${pub.status}`);

const wrongType = await call('POST', '/uploads/presign', { purpose: 'product-image', filename: 'x.svg', contentType: 'image/svg+xml' });
check('svg upload refused', wrongType.status === 400);

// WhatsApp import
const fixtures = `${root}/packages/wa-import/test/fixtures`;
const jpeg = (n) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 9, 9, 9, 9, 9, 9, 9]);
// Unique product names per run so the importer's duplicate detection doesn't skip them.
const stamp = Date.now().toString(36).toUpperCase();
const chatText = ['Ceramic Couple Mug Set', 'LED Photo Frame with 12 clips', 'Scented candle jar - lavender', 'Wooden Name Plate Keychain'].reduce(
  (text, name) => text.replace(name, `${name} ${stamp}`),
  readFileSync(`${fixtures}/android-chat.txt`, 'utf8'),
);
const zip = zipSync({
  'WhatsApp Chat with Wholesale Gift Deals.txt': strToU8(chatText),
  ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`IMG-20260917-WA000${n}.jpg`, jpeg(n)])),
});
async function runImport() {
  const p = await call('POST', '/uploads/presign', { purpose: 'import', filename: 'WhatsApp Chat - Wholesale Gift Deals.zip', contentType: 'application/zip' });
  const f = new FormData();
  Object.entries(p.body.fields).forEach(([k, v]) => f.append(k, v));
  f.append('file', new Blob([zip], { type: 'application/zip' }), 'chat.zip');
  const u = await fetch(p.body.url, { method: 'POST', body: f });
  if (u.status !== 204) throw new Error('zip upload failed ' + u.status);
  const job = await call('POST', '/imports', { key: p.body.key, filename: 'WhatsApp Chat - Wholesale Gift Deals.zip' });
  // Local runs the worker in-process; on AWS it goes through SQS → Lambda (allow for cold starts).
  for (let i = 0; i < 120; i++) {
    const j = await call('GET', `/imports/${job.body.id}`);
    if (['DONE', 'FAILED'].includes(j.body.status)) return j.body;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('import timeout');
}
const first = await runImport();
check('import job DONE', first.status === 'DONE', JSON.stringify(first.stats));
const drafts = await call('GET', `/products?importJobId=${first.id}`);
check('drafts created from import', drafts.body.total === 4, drafts.body.items.map((d) => `${d.name} ₹${d.price} imgs=${d.images.length} conf=${d.parseConfidence} cat=${d.categoryId ? 'yes' : 'no'}`).join(' | '));
const second = await runImport();
check('re-import skips duplicates', second.status === 'DONE' && second.stats.created === 0 && second.stats.duplicates === 4, JSON.stringify(second.stats));

// Publish a draft
const mug = drafts.body.items.find((d) => d.name.includes('Mug'));
const pubRes = await call('POST', `/products/${mug.id}/status`, { status: 'PUBLISHED' });
check('publish imported draft', pubRes.status === 200 && pubRes.body.status === 'PUBLISHED' && !!pubRes.body.publishedAt);
const img = await fetch(mug.images[0].url);
check('imported image served from media bucket', img.status === 200, `${img.headers.get('content-type')}`);

const settings = await call('GET', '/settings');
check('settings read', settings.status === 200 && !!settings.body.store && !!settings.body.import, `keywords for ${Object.keys(settings.body.import.categoryKeywords).length} categories`);
const badSettings = await call('PUT', '/settings/store', { ...settings.body.store, whatsappNumber: 'abc' });
check('settings validation', badSettings.status === 400);
