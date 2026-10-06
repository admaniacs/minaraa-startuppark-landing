// Single source of truth for what is being sold. The page shows the same
// numbers, but the server never trusts an amount sent by the browser.
export const EVENT = {
  code: 'MNR-1010',
  title: 'Founders, Reset Your Energy',
  // ₹1,299 per person, GST inclusive. PRICE_PAISE overrides it, e.g. 100 (₹1, Razorpay's minimum) for a live test.
  pricePaise: Number.isInteger(Number(process.env.PRICE_PAISE)) && Number(process.env.PRICE_PAISE) >= 100 ? Number(process.env.PRICE_PAISE) : 129900,
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

const SESSION_START = new Date('2026-10-10T08:30:00+05:30');
const SESSION_END = new Date('2026-10-10T11:00:00+05:30');
const icsDate = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// Calendar invite attached to the pass email (the page builds the same file in the browser).
export function buildIcs(bookingId) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MINARAA x Startup Park//Founders Reset//EN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${bookingId}@minaraa-startuppark`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(SESSION_START)}`,
    `DTEND:${icsDate(SESSION_END)}`,
    'SUMMARY:Founders\\, Reset Your Energy — MINARAA × Startup Park',
    `DESCRIPTION:Booking ${bookingId}. Bring swimwear\\, a towel and a change of clothes.`,
    'LOCATION:iQue Startup Park\\, Hosur Road\\, near Madiwala\\, Bengaluru',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
