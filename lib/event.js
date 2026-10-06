// Single source of truth for what is being sold. The page shows the same
// numbers, but the server never trusts an amount sent by the browser.
export const EVENT = {
  code: 'MNR-1010',
  title: 'Founders, Reset Your Energy',
  pricePaise: 129900, // ₹1,299 per person, GST inclusive
  currency: 'INR',
  maxQty: 4,
  roles: ['Founder', 'Co-founder', 'Operator', 'Investor'],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Mirrors the checks the form runs in the browser. Returns { data } or { errors }.
export function validateRegistration(body = {}) {
  const data = {
    name: clean(body.name, 80),
    email: clean(body.email, 120).toLowerCase(),
    phone: String(body.phone ?? '').replace(/\D/g, ''),
    company: clean(body.company, 100),
    role: EVENT.roles.includes(body.role) ? body.role : EVENT.roles[0],
    qty: Number(body.qty),
    waiver: body.waiver === true,
  };
  const errors = {};
  if (!data.name) errors.name = 'Please enter your name';
  if (!EMAIL_RE.test(data.email)) errors.email = 'Enter a valid email';
  if (data.phone.length !== 10) errors.phone = 'Enter a 10-digit mobile number';
  if (!Number.isInteger(data.qty) || data.qty < 1 || data.qty > EVENT.maxQty) errors.qty = `Choose 1–${EVENT.maxQty} passes`;
  if (!data.waiver) errors.waiver = 'Please confirm to continue';
  return Object.keys(errors).length ? { errors } : { data };
}
