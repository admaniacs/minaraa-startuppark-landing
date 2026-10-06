import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { EVENT, validateRegistration } from './lib/event.js';
import { createRazorpay } from './lib/razorpay.js';
import { createRegistrationStore } from './lib/registrations.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const newBookingId = () => `${EVENT.code}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// Build the stored registration from the order Razorpay holds (its notes were
// written by us at order creation), not from anything the browser sends back.
function registrationFromOrder(order, payment) {
  const n = order.notes || {};
  return {
    bookingId: n.booking_id,
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

async function publicBooking(r) {
  return {
    bookingId: r.bookingId,
    name: r.name,
    email: r.email,
    qty: r.qty,
    amount: r.amount,
    qrSvg: await QRCode.toString(r.bookingId, { type: 'svg', margin: 0, color: { dark: '#0B1430', light: '#FBFAF7' } }),
  };
}

export function createApp({ razorpay, store, log = console }) {
  const app = express();
  app.disable('x-powered-by');

  // Webhook needs the raw body for its signature, so it is mounted before express.json().
  app.post('/api/razorpay/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    if (!razorpay.verifyWebhookSignature(raw, req.get('x-razorpay-signature'))) return res.status(400).json({ error: 'Invalid signature' });
    try {
      const evt = JSON.parse(raw);
      const payment = evt.payload?.payment?.entity;
      if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && payment?.order_id && !store.get(payment.order_id)) {
        const order = await razorpay.fetchOrder(payment.order_id);
        if (order.notes?.booking_id) store.record(registrationFromOrder(order, payment));
      }
      res.json({ ok: true });
    } catch (err) {
      log.error('webhook', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  app.use(express.json({ limit: '16kb' }));

  app.post('/api/orders', async (req, res) => {
    if (!razorpay.configured) return res.status(503).json({ error: 'Payments are not configured yet. Please try again later.' });
    const { data, errors } = validateRegistration(req.body);
    if (errors) return res.status(400).json({ error: 'Please check your details', errors });
    const bookingId = newBookingId();
    try {
      const order = await razorpay.createOrder({
        amount: EVENT.pricePaise * data.qty,
        currency: EVENT.currency,
        receipt: bookingId,
        notes: {
          booking_id: bookingId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          company: data.company,
          role: data.role,
          qty: String(data.qty),
          health_confirmed: 'yes',
        },
      });
      res.json({ keyId: razorpay.keyId, orderId: order.id, amount: order.amount, currency: order.currency, bookingId });
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
        rec = store.record(registrationFromOrder(order, payment));
      }
      res.json(await publicBooking(rec));
    } catch (err) {
      log.error('verify payment', err);
      res.status(502).json({ error: 'Payment received, but we could not confirm it just now. Your pass will be emailed shortly.' });
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h' }));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env file — use the real environment */ }
  const razorpay = createRazorpay({
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  });
  if (!razorpay.configured) console.warn('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set — checkout will be unavailable.');
  const store = createRegistrationStore(path.resolve(ROOT, process.env.DATA_DIR || 'data'));
  const port = Number(process.env.PORT) || 3000;
  createApp({ razorpay, store }).listen(port, () => console.log(`Listening on http://localhost:${port}`));
}
