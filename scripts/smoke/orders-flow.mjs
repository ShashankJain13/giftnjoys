import { resolve } from 'node:path';
process.loadEnvFile(resolve(import.meta.dirname, '../../.env.local'));
const PUB = 'http://localhost:4000/v1';
const ADM = 'http://localhost:4001/admin/v1';
const MAIL = 'http://localhost:8025/api/v1';
const check = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
const j = async (url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
};

await fetch(`${MAIL}/messages`, { method: 'DELETE' });

const settings = await j(`${PUB}/settings/public`);
check('public settings', settings.status === 200 && settings.body.storeName === 'GiftNJoys', `wa=${settings.body.whatsappNumber} freeAbove=${settings.body.shipping.freeShippingThreshold}`);

const home = await j(`${PUB}/home`);
check('home payload', home.status === 200 && home.body.newArrivals.length > 0 && home.body.categories.length > 0,
  `banners=${home.body.banners.length} cats=${home.body.categories.length} new=${home.body.newArrivals.length} best=${home.body.bestsellers.length} occasions=${home.body.occasions.length} priceTiles=${home.body.priceTiles.map(t => `≤${t.max}:${t.count}`).join(',')}`);
check('cache-control on catalog', /max-age=30/.test(home.headers.get('cache-control') ?? ''));

const cat = await j(`${PUB}/products?category=gift-hampers&sort=price_asc`);
check('category listing', cat.status === 200 && cat.body.total === 3 && cat.body.items[0].price <= cat.body.items[1].price, cat.body.items.map(p => `${p.name} ₹${p.price}`).join(' | '));

const search = await j(`${PUB}/products?q=teddy`);
check('search', search.body.items[0]?.name.includes('Teddy'), `${search.body.total} hit(s)`);
const fuzzy = await j(`${PUB}/search/suggest?q=cand`);
check('suggest prefix', fuzzy.body.products.some(p => /candle/i.test(p.name)), fuzzy.body.products.map(p => p.name).join(', '));

const under500 = await j(`${PUB}/products?maxPrice=499&occasion=diwali`);
check('price + occasion filter', under500.body.items.every(p => p.price <= 499 && p.occasions.includes('diwali')), `${under500.body.total} items`);

const oos = await j(`${PUB}/products?category=stationery-desk`);
check('out of stock sorted last', oos.body.items.at(-1).inStock === false, oos.body.items.map(p => `${p.name}:${p.inStock}`).join(' | '));

const detail = await j(`${PUB}/products/${cat.body.items[0].slug}`);
check('product detail + related', detail.status === 200 && detail.body.related.length > 0, `${detail.body.product.name} discount=${detail.body.product.discountPct}% related=${detail.body.related.length}`);
check('404 unknown product', (await j(`${PUB}/products/nope-nope`)).status === 404);

const all = await j(`${PUB}/products?pageSize=60`);
const draftVisible = all.body.items.some(p => /draft/i.test(p.name));
check('drafts hidden from storefront', !draftVisible, `total published visible=${all.body.total}`);

const teddy = search.body.items[0];
// Keep the smoke test rerunnable: top up stock that earlier runs consumed.
{
  const l = await j(`${ADM}/auth/login`, { method: 'POST', body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  await j(`${ADM}/products/${teddy.id}/stock`, { method: 'PATCH', body: JSON.stringify({ set: 50 }), headers: { authorization: `Bearer ${l.body.token}` } });
}
const mugLow = all.body.items.find(p => p.lowStock);
const quote = await j(`${PUB}/cart/quote`, { method: 'POST', body: JSON.stringify({ items: [{ productId: teddy.id, qty: 1 }, { productId: mugLow.id, qty: 5 }], giftWrap: true }) });
check('quote flags low stock', quote.body.hasProblems && quote.body.lines[1].problem === 'INSUFFICIENT_STOCK', `line2 available=${quote.body.lines[1].available} total=${quote.body.total}`);

const customer = { name: 'Riya Sharma', phone: '+91 98200 12345', email: 'riya@example.com', address1: '42, Lake View Apartments', city: 'Pune', state: 'Maharashtra', pincode: '411045' };
const body = { customer, items: [{ productId: teddy.id, qty: 2, unitPrice: 1 }], giftWrap: true, giftMessage: 'Happy Birthday Aarav!', website: '' };
const key = `smoke-${Date.now()}`;
const placed = await j(`${PUB}/orders`, { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': key } });
check('place order', placed.status === 201 && placed.body.status === 'PENDING', `${placed.body.orderNumber} total=₹${placed.body.total} (2×₹${teddy.price} + wrap ${placed.body.giftWrapFee} + ship ${placed.body.shippingFee})`);
check('tampered unitPrice ignored', placed.body.subtotal === teddy.price * 2);
check('wa.me link to store', placed.body.whatsappLink.startsWith(`https://wa.me/${settings.body.whatsappNumber}?text=`));
const replay = await j(`${PUB}/orders`, { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': key } });
check('idempotent replay', replay.status === 200 && replay.body.orderNumber === placed.body.orderNumber);
const spam = await j(`${PUB}/orders`, { method: 'POST', body: JSON.stringify({ ...body, website: 'http://spam' }) });
check('honeypot blocked', spam.status === 400);
const invalid = await j(`${PUB}/orders`, { method: 'POST', body: JSON.stringify({ ...body, customer: { ...customer, pincode: '12' } }) });
check('invalid pincode → field error', invalid.status === 400 && invalid.body.error.details.some(d => d.path === 'customer.pincode'));

const order = placed.body.orderNumber;
await new Promise(r => setTimeout(r, 800));
const mails1 = await j(`${MAIL}/messages`);
const subjects1 = mails1.body.messages.map(m => `${m.To.map(t => t.Address).join(',')}: ${m.Subject}`);
check('emails for ORDER_PLACED (admin + customer)', subjects1.length === 2, subjects1.join(' || '));

const track = await j(`${PUB}/orders/track?orderNumber=${order}&phone=9820012345`);
check('track with matching phone', track.status === 200 && track.body.status === 'PENDING');
check('track hides full address', !JSON.stringify(track.body).includes('Lake View'));
check('track with wrong phone → 404', (await j(`${PUB}/orders/track?orderNumber=${order}&phone=9820099999`)).status === 404);

// Admin: approve → ship → deliver
const login = await j(`${ADM}/auth/login`, { method: 'POST', body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
const auth = { authorization: `Bearer ${login.body.token}` };
const pending = await j(`${ADM}/orders?status=PENDING`, { headers: auth });
check('admin sees pending order', pending.body.items.some(o => o.orderNumber === order));
const before = (await j(`${ADM}/products/${teddy.id}`, { headers: auth })).body.stockQty;
const approved = await j(`${ADM}/orders/${order}/approve`, { method: 'POST', body: '{}', headers: auth });
const after = (await j(`${ADM}/products/${teddy.id}`, { headers: auth })).body.stockQty;
check('approve deducts stock', approved.body.status === 'APPROVED' && after === before - 2, `stock ${before} → ${after}; actions=${approved.body.allowedActions}`);
const shipBad = await j(`${ADM}/orders/${order}/ship`, { method: 'POST', body: JSON.stringify({ courier: '', awb: '' }), headers: auth });
check('ship validation', shipBad.status === 400);
const shipped = await j(`${ADM}/orders/${order}/ship`, { method: 'POST', body: JSON.stringify({ courier: 'Delhivery', awb: 'DL123456789IN', trackingUrl: 'https://www.delhivery.com/track/package/DL123456789IN', expectedDelivery: '2026-09-21' }), headers: auth });
check('ship', shipped.body.status === 'SHIPPED' && decodeURIComponent(shipped.body.whatsappLink).includes('DL123456789IN'), `wa link to ${shipped.body.whatsappLink.slice(0, 27)}…`);
const again = await j(`${ADM}/orders/${order}/approve`, { method: 'POST', body: '{}', headers: auth });
check('invalid transition rejected', again.status === 400, again.body.error?.message);
const delivered = await j(`${ADM}/orders/${order}/deliver`, { method: 'POST', body: '{}', headers: auth });
check('deliver', delivered.body.status === 'DELIVERED');

await new Promise(r => setTimeout(r, 800));
const mails2 = await j(`${MAIL}/messages`);
const subjects2 = mails2.body.messages.map(m => m.Subject);
check('status emails (approved, shipped, delivered)', ['is confirmed', 'has shipped', 'Delivered:'].every(s => subjects2.some(x => x.includes(s))), subjects2.join(' || '));

const trackShipped = await j(`${PUB}/orders/track?orderNumber=${order}&phone=9820012345`);
check('track shows shipping + history', trackShipped.body.shipping?.awb === 'DL123456789IN' && trackShipped.body.history.length === 4, trackShipped.body.history.map(h => h.status).join(' → '));

const dash = await j(`${ADM}/dashboard/summary`, { headers: auth });
check('dashboard counts', dash.body.ordersByStatus.DELIVERED >= 1 && dash.body.ordersToday >= 1, JSON.stringify(dash.body.ordersByStatus));
