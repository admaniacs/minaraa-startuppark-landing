import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitUntil } from '@vercel/functions';
import express from 'express';
import QRCode from 'qrcode';
import { EVENT, validateRegistration } from './event.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const newBookingId = () => `${EVENT.code}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
// Lead ids are unguessable so one visitor can't overwrite another's row in the sheet.
const leadIdFrom = v => (typeof v === 'string' && /^[0-9a-f]{16}$/.test(v) ? v : crypto.randomBytes(8).toString('hex'));
const now = () => new Date().toISOString();

const leadRow = (leadId, d) => ({
  leadId, name: d.name, email: d.email, phone: d.phone, company: d.company, role: d.role, qty: d.qty,
  amount: (EVENT.pricePaise * d.qty) / 100,
});

// Build the stored registration from the order Razorpay holds (its notes were
// written by us at order creation), not from anything the browser sends back.
function registrationFromOrder(order, payment) {
  const n = order.notes || {};
  return {
    bookingId: n.booking_id,
    leadId: n.lead_id || n.booking_id,
    orderId: order.id,
    paymentId: payment.id,
    paymentStatus: payment.status,
    method: payment.method,
    amount: order.amount,
    currency: order.currency,
    qty: Number(n.qty),
    name: n.name,
    email: n.email,
    phone: n.phone,
    company: n.company || '',
    role: n.role,
  };
}

async function publicBooking(r, emailed) {
  return {
    emailed,
    bookingId: r.bookingId,
    name: r.name,
    email: r.email,
    qty: r.qty,
    amount: r.amount,
    qrSvg: await QRCode.toString(r.bookingId, { type: 'svg', margin: 0, color: { dark: '#0B1430', light: '#FBFAF7' } }),
  };
}

const noSheets = { configured: false, push: async () => false };
const noMailer = { configured: false, sendPass: async () => false };

export function createApp({ razorpay, store, sheets = noSheets, mailer = noMailer, log = console }) {
  const app = express();
  app.disable('x-powered-by');

  // Sheet and email work runs after the response; tests await app.locals.idle().
  const pending = new Set();
  const background = fn => {
    const p = Promise.resolve().then(fn).catch(err => log.error('background', err)).finally(() => pending.delete(p));
    pending.add(p);
    waitUntil(p); // on Vercel, keeps the function alive until the work finishes; a no-op elsewhere
  };
  app.locals.idle = () => Promise.all([...pending]);

  // Runs exactly once per paid order, whether the browser or the webhook reports it first.
  function recordPaid(order, payment) {
    const { row, created } = store.record(registrationFromOrder(order, payment));
    if (created) {
      background(async () => {
        await sheets.push({ leadId: row.leadId, status: 'Paid', bookingId: row.bookingId, orderId: row.orderId, paymentId: row.paymentId, method: row.method, amount: row.amount / 100, qty: row.qty, name: row.name, email: row.email, phone: row.phone, paidAt: row.recordedAt, updatedAt: now() });
        let emailStatus = 'Not configured';
        try {
          if (await mailer.sendPass(row)) emailStatus = 'Sent';
        } catch (err) {
          log.error('pass email', row.bookingId, err.message);
          emailStatus = 'Failed: ' + err.message.slice(0, 120);
        }
        await sheets.push({ leadId: row.leadId, emailStatus, updatedAt: now() });
      });
    }
    return row;
  }

  // Webhook needs the raw body for its signature, so it is mounted before express.json().
  app.post('/api/razorpay/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    if (!razorpay.verifyWebhookSignature(raw, req.get('x-razorpay-signature'))) return res.status(400).json({ error: 'Invalid signature' });
    try {
      const evt = JSON.parse(raw);
      const payment = evt.payload?.payment?.entity;
      if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && payment?.order_id && !store.get(payment.order_id)) {
        const order = await razorpay.fetchOrder(payment.order_id);
        if (order.notes?.booking_id) recordPaid(order, payment);
      }
      res.json({ ok: true });
    } catch (err) {
      log.error('webhook', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  app.use(express.json({ limit: '16kb' }));

  // Called when the visitor finishes the details step, so people who never pay are still captured.
  app.post('/api/leads', (req, res) => {
    const { data, errors } = validateRegistration(req.body);
    if (errors) return res.status(400).json({ error: 'Please check your details', errors });
    const leadId = leadIdFrom(req.body.leadId);
    background(() => sheets.push({ ...leadRow(leadId, data), status: 'Lead', createdAt: now(), updatedAt: now() }));
    res.json({ leadId });
  });

  app.post('/api/orders', async (req, res) => {
    if (!razorpay.configured) return res.status(503).json({ error: 'Payments are not configured yet. Please try again later.' });
    const { data, errors } = validateRegistration(req.body);
    if (errors) return res.status(400).json({ error: 'Please check your details', errors });
    const bookingId = newBookingId();
    const leadId = leadIdFrom(req.body.leadId);
    try {
      const order = await razorpay.createOrder({
        amount: EVENT.pricePaise * data.qty,
        currency: EVENT.currency,
        receipt: bookingId,
        notes: {
          booking_id: bookingId,
          lead_id: leadId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          company: data.company,
          role: data.role,
          qty: String(data.qty),
          health_confirmed: 'yes',
        },
      });
      background(() => sheets.push({ ...leadRow(leadId, data), status: 'Checkout started', bookingId, orderId: order.id, createdAt: now(), updatedAt: now() }));
      res.json({ keyId: razorpay.keyId, orderId: order.id, amount: order.amount, currency: order.currency, bookingId, leadId });
    } catch (err) {
      log.error('create order', err);
      res.status(502).json({ error: 'Could not start the payment. Please try again.' });
    }
  });

  app.post('/api/payments/verify', async (req, res) => {
    const { orderId, paymentId, signature } = req.body || {};
    if (!razorpay.verifyPaymentSignature({ orderId, paymentId, signature })) {
      return res.status(400).json({ error: 'We could not verify this payment. If money was deducted, it will be refunded automatically.' });
    }
    try {
      let rec = store.get(orderId);
      if (!rec) {
        const [payment, order] = await Promise.all([razorpay.fetchPayment(paymentId), razorpay.fetchOrder(orderId)]);
        if (payment.order_id !== orderId || !['captured', 'authorized'].includes(payment.status)) {
          return res.status(402).json({ error: 'Payment is not complete yet.' });
        }
        rec = recordPaid(order, payment);
      }
      res.json(await publicBooking(rec, mailer.configured));
    } catch (err) {
      log.error('verify payment', err);
      res.status(502).json({ error: 'Payment received, but we could not confirm it just now. Your pass will be emailed shortly.' });
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h' }));
  return app;
}
