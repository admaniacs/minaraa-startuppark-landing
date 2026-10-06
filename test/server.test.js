import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { createRazorpay } from '../lib/razorpay.js';
import { createRegistrationStore } from '../lib/registrations.js';

const SECRET = 'test_secret';
const WEBHOOK_SECRET = 'whsec_test';
const orders = new Map();
const payments = new Map();
const calls = [];

// Stands in for api.razorpay.com.
async function fakeFetch(url, init) {
  const { pathname } = new URL(url);
  calls.push(`${init.method} ${pathname}`);
  const ok = body => ({ ok: true, status: 200, json: async () => body });
  if (init.method === 'POST' && pathname === '/v1/orders') {
    const body = JSON.parse(init.body);
    const order = { id: `order_${orders.size + 1}`, status: 'created', ...body };
    orders.set(order.id, order);
    return ok(order);
  }
  const m = pathname.match(/^\/v1\/(orders|payments)\/(.+)$/);
  const found = m && (m[1] === 'orders' ? orders : payments).get(m[2]);
  return found ? ok(found) : { ok: false, status: 404, json: async () => ({ error: { description: 'not found' } }) };
}

const sign = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const valid = { name: 'Aarav Mehta', email: 'Aarav@Northwind.in', phone: '98450 12345', company: 'Northwind', role: 'Founder', qty: 2, waiver: true };

let server, base, dir;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'));
  const razorpay = createRazorpay({ keyId: 'rzp_test_key', keySecret: SECRET, webhookSecret: WEBHOOK_SECRET, fetchImpl: fakeFetch });
  const app = createApp({ razorpay, store: createRegistrationStore(dir), log: { error() {} } });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('serves the landing page', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /FOUNDERS,/);
});

test('rejects invalid registration details', async () => {
  const res = await post('/api/orders', { ...valid, email: 'nope', phone: '123', waiver: false, qty: 9 });
  assert.equal(res.status, 400);
  const { errors } = await res.json();
  assert.deepEqual(Object.keys(errors).sort(), ['email', 'phone', 'qty', 'waiver']);
});

test('creates an order priced by the server and confirms a signed payment', async () => {
  const res = await post('/api/orders', { ...valid, amount: 1 });
  assert.equal(res.status, 200);
  const order = await res.json();
  assert.equal(order.amount, 2 * 129900);
  assert.equal(order.keyId, 'rzp_test_key');
  assert.match(order.bookingId, /^MNR-1010-[0-9A-F]{6}$/);
  const stored = orders.get(order.orderId);
  assert.equal(stored.notes.email, 'aarav@northwind.in');
  assert.equal(stored.notes.phone, '9845012345');

  payments.set('pay_1', { id: 'pay_1', order_id: order.orderId, status: 'captured', method: 'upi' });

  const bad = await post('/api/payments/verify', { orderId: order.orderId, paymentId: 'pay_1', signature: sign('wrong', `${order.orderId}|pay_1`) });
  assert.equal(bad.status, 400);

  const good = await post('/api/payments/verify', { orderId: order.orderId, paymentId: 'pay_1', signature: sign(SECRET, `${order.orderId}|pay_1`) });
  assert.equal(good.status, 200);
  const booking = await good.json();
  assert.equal(booking.bookingId, order.bookingId);
  assert.equal(booking.qty, 2);
  assert.equal(booking.amount, 259800);
  assert.match(booking.qrSvg, /^<svg/);

  const lines = fs.readFileSync(path.join(dir, 'registrations.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).paymentId, 'pay_1');
});

test('webhook records a paid order once and rejects bad signatures', async () => {
  const order = await (await post('/api/orders', { ...valid, qty: 1 })).json();
  const payment = { id: 'pay_2', order_id: order.orderId, status: 'captured', method: 'card' };
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payment } } });

  assert.equal((await post('/api/razorpay/webhook', body, { 'X-Razorpay-Signature': sign('nope', body) })).status, 400);
  for (let i = 0; i < 2; i++) {
    assert.equal((await post('/api/razorpay/webhook', body, { 'X-Razorpay-Signature': sign(WEBHOOK_SECRET, body) })).status, 200);
  }
  const rows = fs.readFileSync(path.join(dir, 'registrations.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(rows.filter(r => r.orderId === order.orderId).length, 1);

  // The browser confirming afterwards returns the same booking without another API round-trip.
  payments.set('pay_2', payment);
  const before = calls.length;
  const res = await post('/api/payments/verify', { orderId: order.orderId, paymentId: 'pay_2', signature: sign(SECRET, `${order.orderId}|pay_2`) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).bookingId, order.bookingId);
  assert.equal(calls.length, before);
});

test('reports checkout as unavailable without API keys', async () => {
  const app = createApp({ razorpay: createRazorpay({}), store: createRegistrationStore(dir), log: { error() {} } });
  const s = await new Promise(r => { const x = app.listen(0, () => r(x)); });
  const res = await fetch(`http://127.0.0.1:${s.address().port}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
  s.close();
  assert.equal(res.status, 503);
});
