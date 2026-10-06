import crypto from 'node:crypto';

const API = 'https://api.razorpay.com/v1';

// Constant-time comparison of two hex HMAC digests.
function safeEqualHex(expected, received) {
  if (typeof received !== 'string' || !/^[0-9a-f]+$/i.test(received)) return false;
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const hmac = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

// Thin client for the three Razorpay REST calls the checkout needs.
// https://razorpay.com/docs/api/orders/ and https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
export function createRazorpay({ keyId, keySecret, webhookSecret, fetchImpl = globalThis.fetch }) {
  const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  async function call(method, path, body) {
    const res = await fetchImpl(API + path, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json?.error?.description || `Razorpay ${method} ${path} failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  return {
    keyId,
    configured: Boolean(keyId && keySecret),
    createOrder: ({ amount, currency, receipt, notes }) => call('POST', '/orders', { amount, currency, receipt, notes }),
    fetchOrder: id => call('GET', `/orders/${encodeURIComponent(id)}`),
    fetchPayment: id => call('GET', `/payments/${encodeURIComponent(id)}`),
    // Checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
    verifyPaymentSignature: ({ orderId, paymentId, signature }) =>
      Boolean(keySecret && orderId && paymentId) && safeEqualHex(hmac(keySecret, `${orderId}|${paymentId}`), signature),
    // Webhook signature: HMAC_SHA256(raw request body, webhook_secret)
    verifyWebhookSignature: (rawBody, signature) =>
      Boolean(webhookSecret) && safeEqualHex(hmac(webhookSecret, rawBody), signature),
    webhookConfigured: Boolean(webhookSecret),
  };
}
